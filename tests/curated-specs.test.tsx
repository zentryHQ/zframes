// @vitest-environment jsdom
/**
 * CURATED SPECS — the boards a stranger sees first.
 *
 * WHAT THIS PINS. `apps/explorer/app/lib/curated-dashboards.ts` is the public
 * showcase: the landing's sticky card-stack iframes each one live, the gallery
 * lists them, and `/d/<id>` is the shareable preview. Every board in it is
 * hand-authored TypeScript typed only as `Record<string, unknown>`, so a frame
 * rename, a dropped `lazy.ts` loader, a renamed config field or a tightened
 * enum turns a card on the FRONT PAGE into an "Unknown frame" / "Invalid
 * configuration" box with no build error and no test failure anywhere.
 * `golden-specs.test.tsx` pins the author's own store dashboards exactly this
 * way; this is the same guard for the boards we publish.
 *
 * Per board it asserts:
 *
 *   1. `DashboardSpecSchema.parse()` still accepts it       — schema tightening
 *   2. every `frame` resolves in `allFrameMetas` AND has a `lazy.ts` loader
 *   3. every `config` key is still a field of that frame's schema, and the
 *      config still passes it                               — renamed field
 *   4. geometry fits the grid and no two cards overlap       — bad placement
 *   5. every group's children fit THAT GROUP's inner grid and don't overlap
 *      each other                                           — bad nesting
 *   6. the whole spec renders through the real `DashboardRenderer` with one
 *      card per frame, every grouped child in the DOM, and zero error cards
 *      anywhere — top level or nested                       — crash regression
 *
 * #4's overlap half is specific to these boards: the coordinates are written by
 * hand, so inserting a section means re-flowing every `y` below it. Miss one
 * and two cards land in the same cells, which the CSS grid renders as one card
 * silently sitting on another — no error, no warning, just a broken showcase.
 *
 * GROUPED CARDS. Several boards nest a cluster inside a `group` frame, so checks
 * 2/3 walk `children` as well as `frames` (via `allInstances`) — a child names a
 * frame and carries a config exactly like a top-level card, and fails just as
 * silently. #5 exists because a child's coordinates are in its group's own
 * columns/rows, which the board-level geometry check says nothing about, and the
 * renderer *clamps* an oversized child rather than letting it spill — so a
 * mis-authored cluster renders plausibly-but-wrong instead of visibly broken.
 * #6's whole-container error sweep matters for the same reason: a grouped card's
 * error box sits inside its `.zf-group`, where a scan over top-level grid items
 * cannot see it.
 *
 * Unlike golden-specs there is no `knownInvalidConfigIds` escape hatch. A store
 * dashboard is the author's own and may carry a broken card for a while; a
 * curated board is marketing, so the expected count of error cards is zero and
 * stays zero.
 *
 * HERMETIC. `fetch` is stubbed to reject for the whole file (same reasoning as
 * golden-specs: a few frames fetch on mount without a provider in the way, and
 * a live response would mutate the DOM mid-assertion).
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import {
  createRegistry,
  DashboardRenderer,
  FramesProvider,
} from "../packages/core/src/index";
import { DashboardSpecSchema } from "../packages/spec/src/spec";
import { allFrameMetas } from "../packages/frames/src/schemas";
import { frameLoaders } from "../packages/frames/src/lazy";
import { allFrames } from "../packages/frames/src/index";
import { MockMarketDataProvider } from "../packages/frames/src/testing/mock-provider";
import { CURATED } from "../apps/explorer/app/lib/curated-dashboards";

const metaByName = new Map(allFrameMetas.map((meta) => [meta.name, meta]));
const loaderNames = new Set(Object.keys(frameLoaders));
const registry = createRegistry(allFrames);

/**
 * Every instance on a board, board-level frames AND the children nested inside
 * container (`group`) frames — because every check below applies just as much to
 * a grouped card, and a child that names a dead frame or a renamed config field
 * fails exactly as silently as a top-level one. Iterating only `spec.frames`
 * would have switched this guard off for the boards that use grouping most.
 *
 * `where` labels which group a child came from, so a failure names the board
 * position rather than just an id.
 */
function allInstances(frames: readonly BoardFrame[]): InstanceRef[] {
  const out: InstanceRef[] = [];
  for (const f of frames) {
    out.push({ instance: f, where: "board" });
    for (const child of f.children ?? [])
      out.push({ instance: child, where: `inside ${f.id}` });
  }
  return out;
}

type BoardFrame = {
  id: string;
  frame: string;
  position: { x: number; y: number; w: number; h: number };
  config?: Record<string, unknown>;
  children?: readonly Omit<BoardFrame, "children">[];
};

type InstanceRef = {
  instance: Omit<BoardFrame, "children">;
  where: string;
};

/**
 * The top-level config field names a frame schema accepts, unwrapping the
 * wrappers frame schemas actually use (`.default()`, `.optional()`,
 * `preprocess`/pipe, discriminated unions). Returns `null` when the shape is
 * not introspectable — the caller fails loudly rather than skipping the check,
 * so a new schema style cannot silently switch the guard off. Same walk as
 * golden-specs' copy; both are local because neither file is importable.
 */
function configFieldsOf(schema: unknown, depth = 0): Set<string> | null {
  if (!schema || typeof schema !== "object" || depth > 8) return null;
  const node = schema as {
    shape?: Record<string, unknown>;
    def?: Record<string, unknown>;
    _def?: Record<string, unknown>;
  };
  if (node.shape) return new Set(Object.keys(node.shape));
  const def = node.def ?? node._def;
  if (!def) return null;
  for (const key of ["innerType", "schema", "in", "out"] as const) {
    if (def[key]) return configFieldsOf(def[key], depth + 1);
  }
  if (Array.isArray(def.options)) {
    const union = new Set<string>();
    for (const option of def.options) {
      const fields = configFieldsOf(option, depth + 1);
      if (!fields) return null;
      for (const field of fields) union.add(field);
    }
    return union;
  }
  return null;
}

/** Restored in `afterAll` — `HTMLCanvasElement` is not a stubbable global. */
const realGetContext = HTMLCanvasElement.prototype.getContext;

// jsdom lacks the browser APIs the renderer, D3 charts and canvas frames touch;
// stub them so a missing global cannot masquerade as a broken board. Same shims
// golden-specs and the frame smoke test install.
beforeAll(() => {
  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  vi.stubGlobal("IntersectionObserver", NoopObserver);
  vi.stubGlobal("ResizeObserver", NoopObserver);
  // jsdom exposes the KEY but leaves it undefined, so this has to be a falsy
  // check — liveline calls matchMedia in a mount effect and every price-chart
  // card crashes without the shim.
  if (!(globalThis as { matchMedia?: unknown }).matchMedia) {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      media: "",
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    }));
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("network disabled in curated-specs"))),
  );
  const ctx2d = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "measureText") return () => ({ width: 0 });
        if (prop === "getImageData")
          return () => ({ data: new Uint8ClampedArray(4) });
        if (
          prop === "createLinearGradient" ||
          prop === "createRadialGradient" ||
          prop === "createPattern"
        )
          return () => ({ addColorStop() {} });
        return () => {};
      },
      set() {
        return true;
      },
    },
  );
  HTMLCanvasElement.prototype.getContext = (() =>
    ctx2d) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

afterAll(() => {
  // Leave no stubbed global (least of all `fetch`) behind for the next file.
  vi.unstubAllGlobals();
  HTMLCanvasElement.prototype.getContext = realGetContext;
});

afterEach(() => {
  cleanup();
});

it("gives every curated board a unique id", () => {
  const ids = CURATED.map((d) => d.id);
  expect(new Set(ids).size, `duplicate id in ${ids.join(", ")}`).toBe(
    ids.length,
  );
});

describe.each(CURATED.map((d) => [d.id, d] as const))(
  "curated dashboard: %s",
  (id, board) => {
    it("still parses against the current DashboardSpecSchema", () => {
      const parsed = DashboardSpecSchema.safeParse(board.spec);
      if (!parsed.success) {
        // Surface the failing paths, not just "did not throw": a schema
        // tightening is the likeliest cause and the path names the field.
        throw new Error(
          `${id} no longer satisfies DashboardSpecSchema:\n` +
            parsed.error.issues
              .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
              .join("\n"),
        );
      }
      expect(parsed.data.frames.length).toBeGreaterThan(0);
      // Ids must be unique across the WHOLE board, children included: the editor
      // keys its per-item React roots by id, so a child sharing an id with a
      // board-level card would have the two fight over one root.
      const ids = allInstances(parsed.data.frames).map((r) => r.instance.id);
      const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
      expect([...new Set(dupes)], `duplicate instance id(s)`).toEqual([]);
    });

    it("every frame name is renderable and has a lazy loader", () => {
      // Registry parity is pinned generically in packages/frames; this pins it
      // against the names a published board actually uses. A missing `lazy.ts`
      // loader is the silent half — it renders as "Unknown frame".
      const refs = allInstances(board.spec.frames);
      const unknown = refs
        .filter(({ instance }) => !metaByName.has(instance.frame))
        .map(
          ({ instance, where }) =>
            `${instance.id} -> ${instance.frame} (${where})`,
        );
      expect(unknown).toEqual([]);

      const loaderless = refs
        .filter(({ instance }) => !loaderNames.has(instance.frame))
        .map(
          ({ instance, where }) =>
            `${instance.id} -> ${instance.frame} (${where})`,
        );
      expect(loaderless).toEqual([]);
    });

    it("every config key is still a field of its frame's schema", () => {
      // The silent failure: frame schemas are not strict, so a renamed or
      // deleted field makes the authored value inert — the card keeps
      // rendering, with the frame's default series/region/window instead of
      // the curated one, and shows the WRONG number with no error anywhere.
      const orphaned: string[] = [];
      const unintrospectable: string[] = [];
      for (const { instance, where } of allInstances(board.spec.frames)) {
        const meta = metaByName.get(instance.frame);
        if (!meta) continue; // already failed the test above
        const fields = configFieldsOf(meta.schema);
        if (!fields) {
          unintrospectable.push(instance.frame);
          continue;
        }
        for (const key of Object.keys(instance.config ?? {}))
          if (!fields.has(key))
            orphaned.push(
              `${instance.id} (${instance.frame}, ${where}): config.${key}`,
            );
      }
      // Guard the guard: if a frame schema stops being introspectable this
      // check would quietly pass on nothing, so fail instead.
      expect([...new Set(unintrospectable)]).toEqual([]);
      expect(orphaned).toEqual([]);
    });

    it("every config still passes its frame's Zod schema", () => {
      const invalid: string[] = [];
      for (const { instance, where } of allInstances(board.spec.frames)) {
        const meta = metaByName.get(instance.frame);
        if (!meta) continue;
        const result = meta.schema.safeParse(instance.config ?? {});
        if (!result.success)
          invalid.push(
            `${instance.id} (${instance.frame}, ${where}): ${result.error.issues
              .map((i) => `${i.path.join(".") || "(root)"} ${i.message}`)
              .join("; ")}`,
          );
      }
      expect(invalid).toEqual([]);
    });

    it("fits the grid, with no two cards on the same cells", () => {
      const spec = DashboardSpecSchema.parse(board.spec);
      const overflow = spec.frames
        .filter((f) => f.position.x + f.position.w > spec.grid.columns)
        .map(
          (f) =>
            `${f.id} (${f.frame}): x(${f.position.x}) + w(${f.position.w}) > ${spec.grid.columns} columns`,
        );
      expect(overflow).toEqual([]);

      // Pairwise is fine at this size (tens of frames per board).
      const collisions: string[] = [];
      for (let i = 0; i < spec.frames.length; i++) {
        for (let j = i + 1; j < spec.frames.length; j++) {
          const a = spec.frames[i].position;
          const b = spec.frames[j].position;
          if (
            a.x < b.x + b.w &&
            b.x < a.x + a.w &&
            a.y < b.y + b.h &&
            b.y < a.y + a.h
          )
            collisions.push(`${spec.frames[i].id} n ${spec.frames[j].id}`);
        }
      }
      expect(collisions).toEqual([]);
    });

    it("every group's children fit that group and don't overlap each other", () => {
      // A child's coordinates are in its GROUP's columns/rows, not the board's,
      // so the board-level check above says nothing about them. The renderer
      // clamps an oversized child rather than letting it spill — which means a
      // mis-authored cluster renders *plausibly* (a child silently the wrong
      // size) instead of visibly broken. This is the check that catches it.
      const spec = DashboardSpecSchema.parse(board.spec);
      const problems: string[] = [];
      for (const f of spec.frames) {
        const children = f.children ?? [];
        if (children.length === 0) continue;
        const cfg = f.config as { columns?: number; rows?: number };
        const columns = cfg.columns ?? 2;
        const rows = cfg.rows ?? 2;
        for (const c of children) {
          const p = c.position;
          if (p.x + p.w > columns)
            problems.push(
              `${f.id}/${c.id}: x(${p.x}) + w(${p.w}) > ${columns} group columns`,
            );
          if (p.y + p.h > rows)
            problems.push(
              `${f.id}/${c.id}: y(${p.y}) + h(${p.h}) > ${rows} group rows`,
            );
        }
        for (let i = 0; i < children.length; i++)
          for (let j = i + 1; j < children.length; j++) {
            const a = children[i].position;
            const b = children[j].position;
            if (
              a.x < b.x + b.w &&
              b.x < a.x + a.w &&
              a.y < b.y + b.h &&
              b.y < a.y + a.h
            )
              problems.push(
                `${f.id}: ${children[i].id} n ${children[j].id} share cells`,
              );
          }
      }
      expect(problems).toEqual([]);
    });

    it("renders through the real DashboardRenderer with no error card", async () => {
      const spec = DashboardSpecSchema.parse(board.spec);
      const { container } = render(
        <FramesProvider providers={[new MockMarketDataProvider("normal")]}>
          <DashboardRenderer spec={spec} registry={registry} />
        </FramesProvider>,
      );
      // Flush the mock's resolved data promises + effects so cards settle.
      await act(async () => {
        await Promise.resolve();
      });

      // One top-level grid child per frame instance, in spec order — so the
      // index of an error card names the instance that produced it.
      const items = [...container.querySelectorAll(".zf-grid > *")];
      expect(items.length).toBe(spec.frames.length);

      // Error cards are identified by their HEADLINE, not by the
      // `zf-frame--error` class: a frame that THROWS is caught by
      // `FrameErrorBoundary`, which renders "Frame crashed" inside
      // `.zf-frame-body` and leaves the outer card plain `zf-frame` — so a
      // class check plus card-count parity would miss a crash entirely. The
      // headline covers all four shapes (Unknown frame / No data source /
      // Invalid configuration / Frame crashed) and only core's error paths
      // produce it, so a healthy frame cannot fake one.
      const errored = items
        .map((el, i) => ({
          headline: el.querySelector(".zf-error-headline")?.textContent ?? null,
          instance: spec.frames[i],
        }))
        .filter(({ headline }) => headline !== null)
        .map(
          ({ headline, instance }) =>
            `${instance.id} (${instance.frame}): ${headline}`,
        );
      expect(errored.sort()).toEqual([]);

      // A GROUPED card's error box lives inside its `.zf-group`, so the
      // per-top-level-item scan above cannot see it — a broken child would pass
      // this test while rendering an "Unknown frame" box on the front page.
      // Sweep the whole container and account for every headline found.
      const allHeadlines = [
        ...container.querySelectorAll(".zf-error-headline"),
      ].map((el) => el.textContent);
      expect(allHeadlines, "error card(s) somewhere on the board").toEqual([]);

      // And the groups really did render their children — otherwise "no error
      // cards" would also be true of a board that silently rendered nothing.
      const expectedChildren = spec.frames.reduce(
        (n, f) => n + (f.children?.length ?? 0),
        0,
      );
      expect(
        container.querySelectorAll(".zf-subgrid > *").length,
        "grouped children that reached the DOM",
      ).toBe(expectedChildren);
    }, 30_000);
  },
);
