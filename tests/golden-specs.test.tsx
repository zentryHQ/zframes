// @vitest-environment jsdom
/**
 * GOLDEN SPECS — the five dashboards a real user actually runs.
 *
 * WHAT THIS PINS. Every other CLI/store test builds a throwaway 1–3 frame spec
 * in a tmpdir, so the suite has never once parsed, linted or rendered a *real*
 * board. These fixtures are verbatim copies (identical JSON, re-indented by
 * Prettier so `format:check` passes) of the specs living in the author's store
 * at `$XDG_CONFIG_HOME/zframes/dashboards/<name>/dashboard.json`, vendored so
 * the check runs on CI, which has none of those files. For each one
 * this file asserts the five things that have to hold for the board to come up:
 *
 *   1. `DashboardSpecSchema.parse()` still accepts it       — schema tightening
 *   2. every `frame` name resolves in `allFrameMetas` AND has a `lazy.ts`
 *      loader                                               — frame rename
 *   3. every `config` key is still a field of that frame's schema, and the
 *      config still passes the schema                       — removed field
 *   4. every instance's geometry fits the board's grid       — bad placement
 *   5. the whole spec renders through the real `DashboardRenderer` with exactly
 *      one card per frame and no unexpected error card      — render regression
 *
 * REAL FAILURES CAUGHT. Renaming a frame, dropping a frame from `lazy.ts`,
 * renaming/removing a config field, adding a required config field, tightening
 * an enum, or making a frame throw on real (not seeded-default) config — each
 * of those silently breaks a live dashboard today. #2 and #3 catch the silent
 * ones: an unknown frame renders as an "Unknown frame" card and a renamed
 * config key is dropped on the floor, so the user's pinned symbol/venue
 * quietly reverts to the frame's default and the card shows the WRONG number
 * with no error anywhere. A frame that THROWS is the third silent one — the
 * crash lands inside the card body and leaves the card chrome intact, so #5
 * matches on the error HEADLINE rather than the `zf-frame--error` class or the
 * card count (both of which a crash leaves untouched). That is not theoretical:
 * writing this the `matchMedia` shim below was momentarily mis-guarded and the
 * headline check caught 7 crashed cards (five price-charts and a liveline on
 * micky, two on bitkub) that a class check reported as a fully green board.
 *
 * HERMETIC. `fetch` is stubbed to reject for the whole file. Several frames
 * fetch on mount *without* a provider — `custom-data` hits the URL in its own
 * config, `daily-analysis` reads its log, the portfolio frames poll the
 * credential route — so `MockMarketDataProvider` cannot intercept them and an
 * unstubbed run made 14 real requests (CoinGecko, Bitkub, open-meteo, plus
 * whatever answers on the jsdom-implied :3000). That put CoinGecko/Bitkub
 * uptime and rate-limit headroom on the PR gate and let live responses mutate
 * the DOM mid-assertion. Rejecting leaves those cards in the same non-error
 * "fetch failed" body state the assertions already expected, and each fixture
 * pins the targets its frames try to reach (`outboundFetchTargets`) so the
 * stub can't silently stop intercepting.
 *
 * REFRESHING A FIXTURE. When the user intentionally changes a board (adds
 * frames, re-themes, fixes a bad card), re-vendor it and update the per-fixture
 * expectations below:
 *
 *   cp "$HOME/.config/zframes/dashboards/<name>/dashboard.json" \
 *      tests/fixtures/<name>.dashboard.json
 *   npx prettier@3 --write tests/fixtures/<name>.dashboard.json
 *
 * Then run this file: the `knownInvalidConfigIds` /
 * `lintSpuriousUnknownFrames` / `outboundFetchTargets` lists are the only
 * things that should need editing, and shrinking either of the first two is a
 * fix, not a regression.
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
import {
  DashboardSpecSchema,
  type DashboardSpec,
} from "../packages/spec/src/spec";
import { lintSpec } from "../packages/cli/src/lint";
import { allFrameMetas } from "../packages/frames/src/schemas";
import { frameLoaders } from "../packages/frames/src/lazy";
import { allFrames } from "../packages/frames/src/index";
import { MockMarketDataProvider } from "../packages/frames/src/testing/mock-provider";
import bitkubSpec from "./fixtures/bitkub.dashboard.json";
import cryptoCommandSpec from "./fixtures/crypto-command.dashboard.json";
import macroWatchSpec from "./fixtures/macro-watch.dashboard.json";
import mickySpec from "./fixtures/micky.dashboard.json";
import quantTerminalSpec from "./fixtures/quant-terminal.dashboard.json";

interface Fixture {
  /** Store folder name under `dashboards/` — how the user serves it. */
  name: string;
  /** The vendored `dashboard.json`, exactly as it sits on disk. */
  raw: unknown;
  /**
   * Frame instance ids whose saved `config` does NOT satisfy the frame's schema
   * today. Each renders as an "Invalid configuration" card on the live board —
   * a defect in the saved spec, not in the code. Growing this list is a
   * regression; shrinking it means someone fixed a card.
   */
  knownInvalidConfigIds: string[];
  /**
   * Frame names on this board that `lintSpec` mis-reports as "unknown frame".
   * See the KNOWN BUG note in the lint test below.
   */
  lintSpuriousUnknownFrames: string[];
  /**
   * Every target this board's frames try to `fetch` *directly* (i.e. not
   * through a provider), deduped: an absolute URL as its hostname, a relative
   * one as its path. The render test stubs `fetch` and asserts this exact set,
   * which both proves the stub is intercepting and pins the board's outbound
   * surface — a new frame that starts fetching a host on its own shows up here
   * instead of quietly re-adding a network dependency to the PR gate.
   */
  outboundFetchTargets: string[];
}

const FIXTURES: Fixture[] = [
  {
    name: "micky",
    raw: mickySpec,
    // `ab-heading` stores its heading text as the frame-level `title` and has
    // no `config` at all, but the `heading` frame requires `config.title` —
    // so this card is an error card on the live board right now.
    knownInvalidConfigIds: ["ab-heading"],
    lintSpuriousUnknownFrames: [
      "breakeven",
      "breathing",
      "checklist",
      "day-meter",
      "dice",
      "holiday-calendar",
      "journal-log",
      "journal-open",
      "journal-results",
      "journal-score",
      "marquee",
      "pomodoro",
      "returns-projector",
      "risk-reward",
      "rules-card",
      "session-progress",
      "spotify-embed",
      "stopwatch",
    ],
    // `daily-analysis` reads its brief log; the portfolio cards whose source is
    // a keyed account poll the loopback credential route.
    outboundFetchTargets: [
      "/__zframes/account/credentials",
      "/daily-analysis.json",
    ],
  },
  {
    name: "crypto-command",
    raw: cryptoCommandSpec,
    knownInvalidConfigIds: [],
    lintSpuriousUnknownFrames: [],
    // One `custom-data` card (Bangkok temperature).
    outboundFetchTargets: ["api.open-meteo.com"],
  },
  {
    name: "macro-watch",
    raw: macroWatchSpec,
    knownInvalidConfigIds: [],
    lintSpuriousUnknownFrames: [],
    // Every card on this board reads through a provider.
    outboundFetchTargets: [],
  },
  {
    name: "quant-terminal",
    raw: quantTerminalSpec,
    knownInvalidConfigIds: [],
    lintSpuriousUnknownFrames: [],
    outboundFetchTargets: [],
  },
  {
    name: "bitkub",
    raw: bitkubSpec,
    knownInvalidConfigIds: [],
    lintSpuriousUnknownFrames: [],
    // This board has no provider of its own — its ten `custom-data` cards are
    // the Bitkub/CoinGecko REST calls.
    outboundFetchTargets: ["api.bitkub.com", "api.coingecko.com"],
  },
];

const metaByName = new Map(allFrameMetas.map((meta) => [meta.name, meta]));
const loaderNames = new Set(Object.keys(frameLoaders));
const registry = createRegistry(allFrames);

/**
 * The top-level config field names a frame schema accepts, unwrapping the
 * wrappers frame schemas actually use (`.default()`, `.optional()`,
 * `preprocess`/pipe, discriminated unions). Returns `null` when the shape is
 * not introspectable — the caller fails loudly rather than skipping the check,
 * so a new schema style can't silently switch the guard off.
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

/**
 * Every target the stubbed `fetch` was asked for since the last reset, deduped
 * and normalized: an absolute URL to its hostname, a relative one (which jsdom
 * would resolve against http://localhost:3000) to its path without the query.
 * How MANY times a card retries is render-timing noise; WHICH target it reaches
 * is the thing worth pinning.
 */
const fetchTargets = new Set<string>();

function recordFetchTarget(input: unknown): void {
  const raw = String(
    (input as { url?: string } | null)?.url ?? (input as string | null) ?? "",
  );
  try {
    fetchTargets.add(new URL(raw).hostname);
  } catch {
    fetchTargets.add(raw.split("?")[0]);
  }
}

/** Restored in `afterAll` — `HTMLCanvasElement` is not a stubbable global. */
const realGetContext = HTMLCanvasElement.prototype.getContext;

/**
 * jsdom lacks the browser APIs the renderer, D3 charts and canvas frames touch;
 * stub them so a missing global can't masquerade as a broken board. Same shims
 * `packages/frames/src/frame-smoke.test.tsx` installs, registered through
 * `vi.stubGlobal` so `afterAll` puts the environment back.
 */
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
  // check, not `"matchMedia" in globalThis` — liveline calls it in a mount
  // effect and every price-chart/liveline card crashes without the shim.
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

  // HERMETIC (see the file header): a handful of frames fetch on mount without
  // a provider in the way, so with the real `fetch` in place this file talked
  // to CoinGecko, Bitkub, open-meteo and :3000 on every run and settled its
  // cards from live responses mid-assertion. Reject instead — `custom-data`,
  // `daily-analysis` and the portfolio cards all catch their own rejection and
  // render a body-level "fetch failed"/empty state, which is exactly the
  // non-error state the render assertion already expects.
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown) => {
      recordFetchTarget(input);
      return Promise.reject(new Error("network disabled in golden-specs"));
    }),
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

describe.each(FIXTURES)(
  "golden dashboard: $name",
  ({
    name,
    raw,
    knownInvalidConfigIds,
    lintSpuriousUnknownFrames,
    outboundFetchTargets,
  }) => {
    /** Parsed once per fixture — every later test needs the parse to have held. */
    let spec: DashboardSpec;

    beforeAll(() => {
      const parsed = DashboardSpecSchema.safeParse(raw);
      if (!parsed.success) {
        // Surface the failing paths, not just "did not throw": a schema
        // tightening is the likeliest cause and the path names the field.
        throw new Error(
          `${name}.dashboard.json no longer satisfies DashboardSpecSchema:\n` +
            parsed.error.issues
              .map((i) => `  ${i.path.join(".") || "(root)"}: ${i.message}`)
              .join("\n"),
        );
      }
      spec = parsed.data;
    });

    it("still parses against the current DashboardSpecSchema", () => {
      // The parse itself happened in beforeAll (everything below depends on it);
      // assert it produced a real board rather than an empty shell.
      expect(spec.frames.length).toBeGreaterThan(0);
      expect(spec.grid.columns).toBeGreaterThan(0);
      expect(new Set(spec.frames.map((f) => f.id)).size).toBe(
        spec.frames.length,
      );
    });

    it("every frame name is a renderable frame with a lazy loader", () => {
      // Registry parity is pinned generically in packages/frames; this pins it
      // against the names a live board actually uses. A rename that updates all
      // four registry lists in lockstep passes there — and still breaks here,
      // because the saved spec keeps the old name and renders "Unknown frame".
      const unknown = spec.frames
        .filter((f) => !metaByName.has(f.frame))
        .map((f) => `${f.id} -> ${f.frame}`);
      expect(unknown).toEqual([]);

      const loaderless = spec.frames
        .filter((f) => !loaderNames.has(f.frame))
        .map((f) => `${f.id} -> ${f.frame}`);
      expect(loaderless).toEqual([]);
    });

    it("every saved config key is still a field of its frame's schema", () => {
      // The silent failure: frame schemas are not strict, so a renamed or
      // deleted field makes the saved value inert — the card keeps rendering,
      // with the frame's default symbol/venue/window instead of the user's.
      const orphaned: string[] = [];
      const unintrospectable: string[] = [];
      for (const instance of spec.frames) {
        const meta = metaByName.get(instance.frame);
        if (!meta) continue; // already failed the test above
        const fields = configFieldsOf(meta.schema);
        if (!fields) {
          unintrospectable.push(instance.frame);
          continue;
        }
        const config = (instance.config ?? {}) as Record<string, unknown>;
        for (const key of Object.keys(config))
          if (!fields.has(key))
            orphaned.push(`${instance.id} (${instance.frame}): config.${key}`);
      }
      // Guard the guard: if a frame schema stops being introspectable this
      // check would quietly pass on nothing, so fail instead.
      expect([...new Set(unintrospectable)]).toEqual([]);
      expect(orphaned).toEqual([]);
    });

    it("every saved config still passes its frame's Zod schema", () => {
      const invalid: string[] = [];
      for (const instance of spec.frames) {
        const meta = metaByName.get(instance.frame);
        if (!meta) continue;
        if (!meta.schema.safeParse(instance.config).success)
          invalid.push(instance.id);
      }
      expect(invalid.sort()).toEqual([...knownInvalidConfigIds].sort());
    });

    it("lintSpec reports nothing beyond the known frameMetas false alarm", () => {
      const issues = lintSpec(spec);
      const frameOf = new Map(spec.frames.map((f) => [f.id, f.frame]));
      const isUnknownFrame = (message: string) =>
        /^unknown frame/.test(message);

      // Real lint findings: geometry overflow, overlap, duplicate id, invalid
      // config. Everything here is a genuine defect in the saved board.
      const real = issues
        .filter((i) => !isUnknownFrame(i.message))
        .map((i) => `${i.frameId}: ${i.message}`)
        .sort();
      const expectedReal = knownInvalidConfigIds
        .map((id) => `${id}: config.`)
        .sort();
      expect(real.length).toBe(expectedReal.length);
      for (let i = 0; i < real.length; i++)
        expect(real[i].startsWith(expectedReal[i])).toBe(true);

      // KNOWN BUG: lintSpec resolves frame names against `frameMetas` (the
      // curated agent-pickable subset) instead of `allFrameMetas` (everything
      // renderable), so `zframes lint` reports "unknown frame" for 18 frames
      // that render perfectly on this board — should be resolved against
      // allFrameMetas so only genuinely unregistered names are flagged. Pinned
      // so the suite stays green; fixing the source must flip this assertion.
      // Knock-on effect: lint.ts `continue`s right after the unknown-frame
      // issue, so its config, grid-overflow and horizontal-overflow checks are
      // ALSO skipped for those instances (19 of micky's 207). That is why the
      // geometry test below checks the grid directly instead of leaning on
      // lintSpec, and why `knownInvalidConfigIds` is asserted against the
      // frames' own schemas in a separate test above.
      const spurious = [
        ...new Set(
          issues
            .filter((i) => isUnknownFrame(i.message))
            .map((i) => frameOf.get(i.frameId ?? "") ?? "?"),
        ),
      ].sort();
      expect(spurious).toEqual([...lintSpuriousUnknownFrames].sort());
      // Every one of them IS renderable — that is what makes it a false alarm.
      for (const frame of spurious) expect(metaByName.has(frame)).toBe(true);
    });

    it("every instance's geometry fits the grid", () => {
      // Checked here rather than through lintSpec on purpose: lint bails out of
      // the per-instance loop at the unknown-frame issue (see the KNOWN BUG
      // above), so its own overflow checks never run for 19 of micky's
      // instances — pushing `marquee` or `journal-log` off the right edge left
      // the whole suite green. This loop covers all 323 instances across the
      // five boards. An out-of-grid card is clipped or silently reflowed by the
      // CSS grid, so it is a real defect in a saved board, not a lint nicety.
      const columnOverflow = spec.frames
        .filter((f) => f.position.x + f.position.w > spec.grid.columns)
        .map(
          (f) =>
            `${f.id} (${f.frame}): x(${f.position.x}) + w(${f.position.w}) > ${spec.grid.columns} columns`,
        );
      expect(columnOverflow).toEqual([]);

      // The horizontal layout is height-bounded to grid.rows bands (x grows
      // freely — that board scrolls sideways), so only y+h is constrained.
      const rowOverflow = spec.frames
        .flatMap((f) => {
          const horizontal = f.layouts?.["flow-horizontal"];
          if (!horizontal) return [];
          if (horizontal.y + horizontal.h <= spec.grid.rows) return [];
          return [
            `${f.id} (${f.frame}): y(${horizontal.y}) + h(${horizontal.h}) > ${spec.grid.rows} rows`,
          ];
        })
        .sort();
      expect(rowOverflow).toEqual([]);
    });

    it("renders through the real DashboardRenderer with no unexpected error card", async () => {
      fetchTargets.clear();
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
      // `.zf-frame-body` and leaves the outer card plain `zf-frame` (pinned as
      // a KNOWN BUG in packages/core/src/frame-content.test.tsx), and the card
      // chrome still counts, so a class check plus card-count parity would miss
      // a crash on real config entirely — the exact regression this test is
      // here for. The headline covers all four shapes uniformly (Unknown frame
      // / No data source / Invalid configuration / Frame crashed), reads the
      // same on a chrome-less `.zf-bare` slot, and keeps working once that core
      // bug is fixed. `.zf-error-headline` is produced only by core's error
      // paths, so a healthy frame can never fake one.
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
      expect(errored.sort()).toEqual(
        knownInvalidConfigIds
          .map((id) => {
            const instance = spec.frames.find((f) => f.id === id);
            return `${id} (${instance?.frame}): Invalid configuration`;
          })
          .sort(),
      );

      // The board's whole outbound surface, through the rejecting stub: proves
      // the stub actually intercepted (nothing escaped to the network) and
      // pins which frames fetch on their own instead of through a provider.
      expect([...fetchTargets].sort()).toEqual(
        [...outboundFetchTargets].sort(),
      );
    });
  },
);
