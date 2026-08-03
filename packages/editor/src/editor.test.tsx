// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  waitFor,
  type RenderResult,
} from "@testing-library/react";
import { useEffect } from "react";
import { z } from "zod";
import { DashboardEditor } from "./editor";
import { createRegistry, defineFrame } from "@zframes/spec/frame";
import { DashboardSpecSchema } from "@zframes/spec/spec";
import type { DashboardSpec, GridPosition } from "@zframes/spec/spec";
import { FramesProvider, useMoney, useProviders } from "@zframes/core";
import type { FxRate, MarketDataProvider } from "@zframes/spec/types";

// The two DashboardEditor contracts nothing covered before this file — no test
// rendered the editor at all.
//
// 1. The per-item React root. GridStack owns each grid item's DOM, so every
//    frame is mounted in its OWN `createRoot` (editor.tsx renderInstance) and
//    context from the editor's tree CANNOT reach it. Everything a frame reads
//    therefore has to be re-provided inside each item root: the shared provider
//    instances (FramesProvider — one WS / TTL cache per provider *object*, not
//    per card) and the display currency (DashboardCurrencyProvider). And because
//    the currency code is read from a ref, a change also needs the explicit
//    re-render effect keyed on `spec.currency.code`, or already-mounted cards
//    keep quoting the old currency forever. A probe frame reporting
//    `useMoney()` + `useProviders()` from inside the item root pins all three:
//    drop the per-item DashboardCurrencyProvider and every card silently falls
//    back to USD on a baht board; drop the effect and a currency switch is a
//    no-op on a live board.
//
// 2. Save → collectSpec. This is the ONLY path by which a human edit reaches
//    `dashboard.json`, and a wrong-slot write is destructive: the live GridStack
//    position must land in the ACTIVE mode's slot only — `position` in
//    flow-vertical, `layouts["flow-horizontal"]` in flow-horizontal — leaving
//    the other mode's arrangement byte-identical. collectSpec/captureLayout are
//    module-private, so every assertion here goes through the real Save button.
//    Also pinned: the y-then-x sort that keeps the written file diff-friendly
//    (it is NOT DOM order — asserted against it), the always-defined `position`
//    (an undefined coordinate saves a spec-invalid dashboard that reloads as
//    error cards), and the skip of a grid item with no id / no live instance.

/** The exact array the host hands to FramesProvider, for an identity check
 *  inside the item roots (a copy would mean per-card provider instances). */
const hostProviders: { current: MarketDataProvider[] } = { current: [] };

/** Bumped once per Probe mount, so a re-render can be told from a remount. */
const mounts = { count: 0 };

/** Renders the currency + providers visible from inside a GridStack item root. */
function Probe() {
  const money = useMoney();
  const providers = useProviders();
  useEffect(() => {
    mounts.count += 1;
  }, []);
  return (
    <span
      data-testid="probe"
      data-code={money.code}
      data-rate={String(money.rate)}
      data-price={money.price(100)}
      data-count={String(providers.length)}
      data-providers={providers.map((p) => p.name).join(",")}
      // True only if the item root received the host's own provider array, not
      // a per-card copy.
      data-shared={String(providers === hostProviders.current)}
    />
  );
}

const probeFrame = defineFrame({
  name: "probe",
  label: "Probe",
  category: "tools",
  description: "reports the currency + providers reaching its own React root",
  capabilities: [],
  schema: z.object({}),
  component: Probe,
});

const registry = createRegistry([probeFrame]);

/** An fx provider answering from a fixed table (an unknown symbol is omitted,
 *  like the real Frankfurter-backed one). */
function fxProvider(table: Record<string, number>) {
  const getFxRates = vi.fn(async (base: string, symbols: string[]) =>
    symbols
      .filter((s) => s in table)
      .map((s): FxRate => ({
        symbol: s,
        base,
        rate: table[s],
        changePct: 0,
        history: [],
      })),
  );
  const provider: MarketDataProvider = {
    name: "fx",
    capabilities: ["fx-rates"],
    getFxRates,
  };
  return { provider, getFxRates };
}

interface FrameInput {
  id: string;
  position: GridPosition;
  layouts?: Record<string, GridPosition>;
  events?: { date: string; label: string }[];
}

function parseSpec(
  frames: FrameInput[],
  grid: Record<string, unknown> = {},
  currency = "USD",
): DashboardSpec {
  return DashboardSpecSchema.parse({
    title: "editor-test",
    currency: { code: currency },
    grid: { columns: 12, rowHeight: 90, rows: 3, gap: 12, ...grid },
    frames: frames.map((f) => ({ ...f, frame: "probe", config: {} })),
  });
}

function mount(spec: DashboardSpec, providers: MarketDataProvider[]) {
  hostProviders.current = providers;
  const onSave = vi.fn();
  const view = render(
    <FramesProvider providers={hostProviders.current}>
      <DashboardEditor spec={spec} registry={registry} onSave={onSave} />
    </FramesProvider>,
  );
  return { ...view, onSave };
}

/** The item-root probe for one grid item, keyed by the instance id GridStack
 *  carries on the item element. */
function probeOf(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(
    `.grid-stack-item[gs-id="${id}"] [data-testid="probe"]`,
  );
  if (!el) throw new Error(`no probe rendered inside item "${id}"`);
  return el;
}

/** GridStack's own root element. */
function gridEl(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>(".grid-stack");
  if (!el) throw new Error("GridStack never initialised");
  return el;
}

/** The grid items in DOM order — the order collectSpec walks before sorting. */
function domOrder(container: HTMLElement): (string | null)[] {
  return [...gridEl(container).querySelectorAll(".grid-stack-item")].map((el) =>
    el.getAttribute("gs-id"),
  );
}

/** Enter customise mode, then Save — the only reachable route to collectSpec. */
async function clickSave(view: ReturnType<typeof mount>) {
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Customise" }));
  });
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Save" }));
  });
}

/** The one spec Save emitted. */
function savedSpec(onSave: ReturnType<typeof vi.fn>): DashboardSpec {
  expect(onSave).toHaveBeenCalledTimes(1);
  return onSave.mock.calls[0][0] as DashboardSpec;
}

beforeEach(() => {
  mounts.count = 0;
});

afterEach(() => cleanup());

describe("GridStack harness (feasibility gate)", () => {
  it("initialises a live grid whose items carry the spec's placements", () => {
    const { provider } = fxProvider({ THB: 36.5 });
    const spec = parseSpec([
      { id: "a", position: { x: 0, y: 0, w: 3, h: 2 } },
      { id: "b", position: { x: 3, y: 0, w: 3, h: 2 } },
    ]);
    const { container } = mount(spec, [provider]);

    const items = [...gridEl(container).querySelectorAll(".grid-stack-item")];
    expect(items.map((el) => el.getAttribute("gs-id"))).toEqual(["a", "b"]);
    // GridStack's engine (not the spec markup) owns these — a live grid.
    expect(items.map((el) => el.getAttribute("gs-x"))).toEqual(["0", "3"]);
    expect(items.map((el) => el.getAttribute("gs-w"))).toEqual(["3", "3"]);
    // Each item renders its frame into its own root inside the item content.
    expect(probeOf(container, "a").dataset.providers).toBe("fx");
    expect(probeOf(container, "b").dataset.providers).toBe("fx");
  });
});

describe("per-item React root: the double-mount footgun", () => {
  it("re-provides the display currency inside EVERY item root", async () => {
    const { provider, getFxRates } = fxProvider({ THB: 36.5 });
    const spec = parseSpec(
      [
        { id: "a", position: { x: 0, y: 0, w: 3, h: 2 } },
        { id: "b", position: { x: 3, y: 0, w: 3, h: 2 } },
      ],
      {},
      "THB",
    );
    const { container } = mount(spec, [provider]);

    // The board quotes USD until the rate lands (a wrong number is worse than a
    // slow one), so both cards start on the fallback …
    expect(probeOf(container, "a").dataset.code).toBe("USD");
    // … and only the DashboardCurrencyProvider renderInstance mounts INSIDE each
    // item can flip them: editor-tree context cannot cross into a GridStack root.
    await waitFor(() => {
      expect(probeOf(container, "a").dataset.code).toBe("THB");
      expect(probeOf(container, "b").dataset.code).toBe("THB");
    });
    for (const id of ["a", "b"]) {
      const probe = probeOf(container, id);
      expect(probe.dataset.rate).toBe("36.5");
      // Converted money, not a symbol swap: 100 USD × 36.5.
      expect(probe.dataset.price).toContain("3,650");
      expect(probe.dataset.price).not.toContain("$");
    }

    // Every rate ask went through the ONE shared provider object — the editor
    // root's board-level poll plus one per item root. The per-card cost is a
    // poll, never a second provider instance (and so never a second socket).
    expect(getFxRates).toHaveBeenCalledTimes(3);
    for (const call of getFxRates.mock.calls) {
      expect(call).toEqual(["USD", ["THB"]]);
    }
  });

  it("hands each item root the host's shared provider instances", () => {
    const { provider } = fxProvider({ THB: 36.5 });
    const quotes: MarketDataProvider = {
      name: "quotes",
      capabilities: ["day-stats"],
    };
    const spec = parseSpec([
      { id: "a", position: { x: 0, y: 0, w: 3, h: 2 } },
      { id: "b", position: { x: 3, y: 0, w: 3, h: 2 } },
    ]);
    const { container } = mount(spec, [provider, quotes]);

    for (const id of ["a", "b"]) {
      const probe = probeOf(container, id);
      // Same array object the host passed in ⇒ same provider objects ⇒ the WS /
      // TTL cache living on each instance is shared, not duplicated per card.
      expect(probe.dataset.shared).toBe("true");
      expect(probe.dataset.count).toBe("2");
      expect(probe.dataset.providers).toBe("fx,quotes");
    }
  });

  it("re-renders every live item root when the dashboard currency changes", async () => {
    const { provider } = fxProvider({ THB: 36.5, EUR: 0.92 });
    const frames: FrameInput[] = [
      { id: "a", position: { x: 0, y: 0, w: 3, h: 2 } },
      { id: "b", position: { x: 3, y: 0, w: 3, h: 2 } },
    ];
    const { container, rerender } = mount(parseSpec(frames, {}, "THB"), [
      provider,
    ]);

    await waitFor(() =>
      expect(probeOf(container, "a").dataset.code).toBe("THB"),
    );
    expect(mounts.count).toBe(2);
    const before = [probeOf(container, "a"), probeOf(container, "b")];

    rerender(
      <FramesProvider providers={hostProviders.current}>
        <DashboardEditor
          spec={parseSpec(frames, {}, "EUR")}
          registry={registry}
        />
      </FramesProvider>,
    );

    // The currency is read from a ref, so React has no dependency that would
    // notice the change: only the explicit effect keyed on spec.currency.code
    // pushes it into the already-mounted item roots.
    await waitFor(() => {
      expect(probeOf(container, "a").dataset.code).toBe("EUR");
      expect(probeOf(container, "b").dataset.code).toBe("EUR");
    });
    expect(probeOf(container, "a").dataset.rate).toBe("0.92");

    // A re-render, NOT a rebuild: the same DOM nodes, and no extra Probe mount
    // (a restore()/remount would re-subscribe every frame's data hooks).
    expect(probeOf(container, "a")).toBe(before[0]);
    expect(probeOf(container, "b")).toBe(before[1]);
    expect(mounts.count).toBe(2);
  });
});

describe("Save in flow-vertical mode", () => {
  const canvas: GridPosition = { x: 9, y: 9, w: 1, h: 1 };

  function verticalBoard() {
    const { provider } = fxProvider({});
    // Deliberately scrambled input order, and `wide` sits at x:10 with w:4 on a
    // 12-column grid — out of bounds, so GridStack clamps it live to x:8. The
    // saved value therefore proves collectSpec read `gridstackNode` rather than
    // echoing the instance's stored position.
    const spec = parseSpec([
      { id: "low", position: { x: 0, y: 3, w: 3, h: 2 } },
      {
        id: "high",
        position: { x: 0, y: 0, w: 3, h: 2 },
        layouts: { "flow-horizontal": { x: 5, y: 1, w: 2, h: 1 }, canvas },
      },
      { id: "wide", position: { x: 10, y: 0, w: 4, h: 2 } },
    ]);
    return { spec, ...mount(spec, [provider]) };
  }

  it("writes live positions into `position` and leaves `layouts` untouched", async () => {
    const board = verticalBoard();
    await clickSave(board);
    const byId = new Map(savedSpec(board.onSave).frames.map((f) => [f.id, f]));

    expect(byId.get("high")!.position).toEqual({ x: 0, y: 0, w: 3, h: 2 });
    expect(byId.get("low")!.position).toEqual({ x: 0, y: 3, w: 3, h: 2 });
    // The live, clamped x — not the 10 the spec asked for.
    expect(byId.get("wide")!.position).toEqual({ x: 8, y: 0, w: 4, h: 2 });

    // The other modes' arrangements come back as the same object that went in: a
    // vertical Save must never touch, rewrite or drop them.
    expect(byId.get("high")!.layouts).toBe(
      board.spec.frames.find((f) => f.id === "high")!.layouts,
    );
    expect(byId.get("high")!.layouts).toEqual({
      "flow-horizontal": { x: 5, y: 1, w: 2, h: 1 },
      canvas,
    });
    // Frames that had none don't gain an empty layouts map either.
    expect(byId.get("low")!.layouts).toBeUndefined();
    expect(byId.get("wide")!.layouts).toBeUndefined();
    // The active mode rides along, so a reload re-opens the same board.
    expect(savedSpec(board.onSave).grid.mode).toBe("flow-vertical");
  });

  it("emits frames sorted by position.y then x, each with a defined position", async () => {
    const board = verticalBoard();
    // GridStack itself normalizes the DOM: it lays the scrambled spec order
    // (low, high, wide) out by position, so the grid children already read
    // high (0,0), wide (8,0), low (0,3) before any Save.
    expect(domOrder(board.container)).toEqual(["high", "wide", "low"]);
    await clickSave(board);
    const frames = savedSpec(board.onSave).frames;

    // collectSpec walks that order and sorts by y then x — the same reading
    // order, which is what keeps the written dashboard.json diff-friendly.
    expect(frames.map((f) => f.id)).toEqual(["high", "wide", "low"]);
    for (const f of frames) {
      for (const k of ["x", "y", "w", "h"] as const) {
        // A non-finite coordinate saves a spec-invalid dashboard that reloads as
        // an error card, so this is a hard requirement, not a formality. Finite
        // subsumes "defined", and unlike a bare `toBeDefined()` it also catches
        // NaN — which collectSpec's y-then-x sort would pass through happily.
        expect(Number.isFinite(f.position[k])).toBe(true);
      }
    }
    // And the saved spec is genuinely re-loadable.
    expect(() =>
      DashboardSpecSchema.parse(savedSpec(board.onSave)),
    ).not.toThrow();
  });

  it("skips a grid item with no id and one whose instance is gone", async () => {
    const board = verticalBoard();
    const stray = document.createElement("div");
    stray.className = "grid-stack-item";
    const ghost = document.createElement("div");
    ghost.className = "grid-stack-item";
    ghost.setAttribute("gs-id", "ghost"); // never registered in instancesRef
    gridEl(board.container).append(stray, ghost);

    await act(async () => {
      fireEvent.click(board.getByRole("button", { name: "Customise" }));
    });
    // Both strays ARE grid items as far as GridStack is concerned — customise
    // mode decorated them — so the skip below is a real branch, not a vacuous
    // pass on a list that never contained them.
    expect(domOrder(board.container)).toEqual([
      "high",
      "wide",
      "low",
      null,
      "ghost",
    ]);
    expect(stray.querySelector(".zf-del-btn")).not.toBeNull();
    expect(ghost.querySelector(".zf-del-btn")).not.toBeNull();

    await act(async () => {
      fireEvent.click(board.getByRole("button", { name: "Save" }));
    });
    const frames = savedSpec(board.onSave).frames;
    expect(frames.map((f) => f.id)).toEqual(["high", "wide", "low"]);
    // The real frames' live placements are unaffected by the foreign children —
    // walking past a stray / a ghost must not shift what the survivors save.
    // (Asserted as values: `position !== undefined` cannot fail here, because
    // collectSpec sorts on `a.position.y` before returning, so an undefined
    // position throws inside Save and never reaches onSave at all.)
    expect(frames.map((f) => f.position)).toEqual([
      { x: 0, y: 0, w: 3, h: 2 },
      { x: 8, y: 0, w: 4, h: 2 },
      { x: 0, y: 3, w: 3, h: 2 },
    ]);
  });
});

describe("Save in flow-horizontal mode", () => {
  it("writes live positions into layouts['flow-horizontal'] only", async () => {
    const { provider } = fxProvider({});
    const canvas: GridPosition = { x: 4, y: 4, w: 4, h: 4 };
    // Neither frame has a horizontal layout, so seedHorizontal packs both on
    // mount: the saved coordinates cannot have been copied from `position`.
    const spec = parseSpec(
      [
        { id: "a", position: { x: 5, y: 4, w: 2, h: 2 } },
        { id: "b", position: { x: 7, y: 9, w: 3, h: 1 }, layouts: { canvas } },
      ],
      { mode: "flow-horizontal", rows: 3 },
    );
    const board = mount(spec, [provider]);
    await clickSave(board);
    const byId = new Map(savedSpec(board.onSave).frames.map((f) => [f.id, f]));

    // The dense first-fit seed, read back off the live grid.
    expect(byId.get("a")!.layouts?.["flow-horizontal"]).toEqual({
      x: 0,
      y: 0,
      w: 2,
      h: 2,
    });
    expect(byId.get("b")!.layouts?.["flow-horizontal"]).toEqual({
      x: 0,
      y: 2,
      w: 3,
      h: 1,
    });
    // The canonical vertical layout is BYTE-IDENTICAL — the same object,
    // untouched. A horizontal Save that wrote here would permanently destroy the
    // vertical arrangement of a board the human only rearranged sideways.
    for (const id of ["a", "b"]) {
      const input = spec.frames.find((f) => f.id === id)!;
      expect(byId.get(id)!.position).toBe(input.position);
    }
    expect(byId.get("a")!.position).toEqual({ x: 5, y: 4, w: 2, h: 2 });
    expect(byId.get("b")!.position).toEqual({ x: 7, y: 9, w: 3, h: 1 });
    // A sibling mode's layout survives the merge.
    expect(byId.get("b")!.layouts?.canvas).toEqual(canvas);
    expect(savedSpec(board.onSave).grid.mode).toBe("flow-horizontal");
  });

  it("still sorts by the vertical position, not the horizontal layout", async () => {
    const { provider } = fxProvider({});
    // Input (= DOM, = horizontal reading) order is c, a, b; the vertical y order
    // is a, b, c. The sort follows `position`, so the emitted order is a, b, c.
    const spec = parseSpec(
      [
        { id: "c", position: { x: 0, y: 2, w: 2, h: 1 } },
        { id: "a", position: { x: 0, y: 0, w: 2, h: 1 } },
        { id: "b", position: { x: 0, y: 1, w: 2, h: 1 } },
      ],
      { mode: "flow-horizontal", rows: 3 },
    );
    const board = mount(spec, [provider]);
    expect(domOrder(board.container)).toEqual(["c", "a", "b"]);
    await clickSave(board);
    const frames = savedSpec(board.onSave).frames;

    expect(frames.map((f) => f.id)).toEqual(["a", "b", "c"]);
    // Whole objects, not just `.y`: a horizontal Save leaves every vertical
    // coordinate exactly as authored. (`toBeDefined()` on position would be
    // unfalsifiable — collectSpec sorts on `a.position.y` before returning, so
    // an undefined position throws in Save and onSave is never reached.)
    expect(frames.map((f) => f.position)).toEqual([
      { x: 0, y: 0, w: 2, h: 1 },
      { x: 0, y: 1, w: 2, h: 1 },
      { x: 0, y: 2, w: 2, h: 1 },
    ]);
    // Every frame got a horizontal placement, packed in the input order (c
    // first) — i.e. the emitted order really is a re-sort of the live grid.
    expect(frames.map((f) => f.layouts?.["flow-horizontal"]?.y)).toEqual([
      1, 2, 0,
    ]);
  });
});

/**
 * Event markers ride the INSTANCE, not `config`, and Save is the only path by
 * which they reach `dashboard.json`. collectSpec rebuilds each frame object
 * from `instancesRef` + the live GridStack node, so a field it forgets to carry
 * is silently dropped on every save — the user's markers would survive the
 * session and vanish the moment they pressed Save.
 */
describe("Save carries a card's event markers", () => {
  const MARKERS = [
    { date: "2026-03-18", label: "FOMC +25bp" },
    { date: "2026-06-01", label: "Q2 earnings" },
  ];

  it("round-trips the markers of the card that has them", async () => {
    const view = mount(
      parseSpec([
        { id: "a", position: { x: 0, y: 0, w: 4, h: 2 }, events: MARKERS },
        { id: "b", position: { x: 4, y: 0, w: 4, h: 2 } },
      ]),
      [],
    );
    await clickSave(view);
    const saved = savedSpec(view.onSave);
    const a = saved.frames.find((f) => f.id === "a")!;
    expect(a.events).toEqual(MARKERS);
  });

  it("does not invent an empty `events` on a card that never had any", async () => {
    // An empty array on every card would churn the diff of a human-readable
    // file the user owns, on every single save.
    const view = mount(
      parseSpec([
        { id: "a", position: { x: 0, y: 0, w: 4, h: 2 }, events: MARKERS },
        { id: "b", position: { x: 4, y: 0, w: 4, h: 2 } },
      ]),
      [],
    );
    await clickSave(view);
    const b = savedSpec(view.onSave).frames.find((f) => f.id === "b")!;
    expect(b.events).toBeUndefined();
    expect("events" in b).toBe(false);
  });

  it("keeps markers on a card whose geometry the grid rewrites under it", async () => {
    // collectSpec merges the LIVE gridstackNode onto the stored instance, and
    // that merge is where a per-instance field gets dropped. x:10 w:4 on a
    // 12-column grid is out of bounds, so GridStack clamps it to x:8 — the
    // saved card therefore went through the merge, not a straight echo.
    const view = mount(
      parseSpec([
        { id: "a", position: { x: 10, y: 0, w: 4, h: 2 }, events: MARKERS },
      ]),
      [],
    );
    await clickSave(view);
    const a = savedSpec(view.onSave).frames.find((f) => f.id === "a")!;
    expect(a.position).toEqual({ x: 8, y: 0, w: 4, h: 2 });
    expect(a.events).toEqual(MARKERS);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The safety net: undo/redo, recoverable delete, honest save.
//
// Every case below was a way to lose work in the editor before this suite:
// deleting a configured card was one unconfirmed, unrecoverable click; there was
// no undo at any granularity, so the only rollback was Cancel's all-or-nothing
// revert; and `save()` left customise mode BEFORE awaiting `onSave`, which made
// a rejected write (the host failing to put dashboard.json on disk) look exactly
// like a successful one. The user walked away believing the board was saved.
//
// These pin behaviour through the real DOM the user actually drives — the
// injected per-item × button, the toolbar, the keyboard — not the history kernel,
// which editor-history.test.ts covers on its own.
// ─────────────────────────────────────────────────────────────────────────────

/** Mount with an explicit `onSave`, so a test can control when (or whether) the
 *  host's write resolves. */
function mountWith(
  spec: DashboardSpec,
  onSave: ((next: DashboardSpec) => void | Promise<void>) | undefined,
) {
  hostProviders.current = [];
  const view = render(
    <FramesProvider providers={hostProviders.current}>
      <DashboardEditor spec={spec} registry={registry} onSave={onSave} />
    </FramesProvider>,
  );
  return view;
}

async function enterCustomise(view: Pick<RenderResult, "getByRole">) {
  await act(async () => {
    fireEvent.click(view.getByRole("button", { name: "Customise" }));
  });
}

/** The per-item delete affordance the editor injects imperatively in customise
 *  mode (not React-rendered, so it has to be found in the DOM). */
function deleteBtn(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector<HTMLElement>(
    `.grid-stack-item[gs-id="${id}"] .zf-del-btn`,
  );
  if (!el) throw new Error(`no delete button on item "${id}"`);
  return el;
}

function itemIds(container: HTMLElement): (string | null)[] {
  return domOrder(container);
}

describe("recoverable delete", () => {
  it("offers an undo toast naming what was removed", async () => {
    const view = mount(
      parseSpec([
        { id: "a", position: { x: 0, y: 0, w: 3, h: 2 } },
        { id: "b", position: { x: 3, y: 0, w: 3, h: 2 } },
      ]),
      [],
    );
    await enterCustomise(view);
    await act(async () => {
      fireEvent.click(deleteBtn(view.container, "a"));
    });

    expect(itemIds(view.container)).toEqual(["b"]);
    // Named, so it's clear WHICH card went — the label comes from the registry
    // when the instance has no explicit title.
    expect(view.getByRole("status").textContent).toContain("Removed “Probe”");
    // The toast's action is named distinctly from the toolbar's Undo, which is
    // on screen at the same time.
    expect(
      view.getByRole("button", { name: "Undo removing Probe" }),
    ).toBeTruthy();
  });

  it("restores the deleted frame — with its config — from the toast", async () => {
    // The point of undo over a confirm dialog: a delete takes the card's config,
    // tickers, events and style overrides with it, none of which re-adding the
    // frame from the palette would bring back.
    const spec = DashboardSpecSchema.parse({
      title: "editor-test",
      currency: { code: "USD" },
      grid: { columns: 12, rowHeight: 90, rows: 3, gap: 12 },
      frames: [
        {
          id: "a",
          frame: "probe",
          title: "My tuned card",
          position: { x: 0, y: 0, w: 3, h: 2 },
          config: {},
          events: [{ date: "2026-01-02", label: "halving" }],
        },
      ],
    });
    const onSave = vi.fn();
    const view = mountWith(spec, onSave);
    await enterCustomise(view);

    await act(async () => {
      fireEvent.click(deleteBtn(view.container, "a"));
    });
    expect(itemIds(view.container)).toEqual([]);
    // The toast names the instance's own title, not the frame's generic label.
    expect(view.getByRole("status").textContent).toContain(
      "Removed “My tuned card”",
    );

    await act(async () => {
      fireEvent.click(
        view.getByRole("button", { name: "Undo removing My tuned card" }),
      );
    });
    expect(itemIds(view.container)).toEqual(["a"]);

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Save" }));
    });
    const saved = onSave.mock.calls[0][0] as DashboardSpec;
    const a = saved.frames.find((f) => f.id === "a")!;
    expect(a.title).toBe("My tuned card");
    expect(a.events).toEqual([{ date: "2026-01-02", label: "halving" }]);
  });

  it("dismisses the toast without restoring anything", async () => {
    const view = mount(
      parseSpec([{ id: "a", position: { x: 0, y: 0, w: 3, h: 2 } }]),
      [],
    );
    await enterCustomise(view);
    await act(async () => {
      fireEvent.click(deleteBtn(view.container, "a"));
    });
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Dismiss" }));
    });
    expect(view.queryByRole("status")).toBeNull();
    expect(itemIds(view.container)).toEqual([]);
  });
});

describe("undo / redo", () => {
  it("starts with nothing to undo and reports a clean board", async () => {
    const view = mount(
      parseSpec([{ id: "a", position: { x: 0, y: 0, w: 3, h: 2 } }]),
      [],
    );
    await enterCustomise(view);
    // Disabled rather than absent: a greyed Undo says "you're at the start",
    // where a missing button reads as a missing feature.
    expect(
      view.getByRole("button", { name: "Undo" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(
      view.getByRole("button", { name: "Redo" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(view.container.textContent).toContain("No changes");
  });

  it("walks a delete back and forward again", async () => {
    const view = mount(
      parseSpec([
        { id: "a", position: { x: 0, y: 0, w: 3, h: 2 } },
        { id: "b", position: { x: 3, y: 0, w: 3, h: 2 } },
      ]),
      [],
    );
    await enterCustomise(view);
    await act(async () => {
      fireEvent.click(deleteBtn(view.container, "a"));
    });
    expect(itemIds(view.container)).toEqual(["b"]);
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Dismiss" }));
    });

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Undo" }));
    });
    expect(itemIds(view.container).sort()).toEqual(["a", "b"]);
    expect(view.container.textContent).toContain("No changes");

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Redo" }));
    });
    expect(itemIds(view.container)).toEqual(["b"]);
    expect(view.container.textContent).toContain("Unsaved changes");
  });

  it("undoes via ⌘Z, and leaves undo inside a text field to the browser", async () => {
    const view = mount(
      parseSpec([
        { id: "a", position: { x: 0, y: 0, w: 3, h: 2 } },
        { id: "b", position: { x: 3, y: 0, w: 3, h: 2 } },
      ]),
      [],
    );
    await enterCustomise(view);
    await act(async () => {
      fireEvent.click(deleteBtn(view.container, "a"));
    });

    // With focus in the palette's search box, ⌘Z must keep its native
    // text-editing meaning rather than rewinding the board under the user.
    const search = view.container.querySelector<HTMLInputElement>(
      ".zf-rail input[type='search'], .zf-rail input",
    );
    if (search) {
      search.focus();
      await act(async () => {
        fireEvent.keyDown(document, { key: "z", metaKey: true });
      });
      expect(itemIds(view.container)).toEqual(["b"]);
      search.blur();
    }

    await act(async () => {
      fireEvent.keyDown(document, { key: "z", metaKey: true });
    });
    expect(itemIds(view.container).sort()).toEqual(["a", "b"]);

    await act(async () => {
      fireEvent.keyDown(document, { key: "z", metaKey: true, shiftKey: true });
    });
    expect(itemIds(view.container)).toEqual(["b"]);
  });

  it("keeps every card configurable after an undo rebuilds the grid", async () => {
    // Undoing a frame-level change runs restore(), which throws away the grid
    // items and builds new elements. The `editing` effect that attaches the
    // per-item gear + × does NOT re-run (its deps are unchanged), so without
    // re-decorating inside restore the whole board came back undeletable and
    // unconfigurable — mid-customise, with no visible cause.
    const view = mount(
      parseSpec([
        { id: "a", position: { x: 0, y: 0, w: 3, h: 2 } },
        { id: "b", position: { x: 3, y: 0, w: 3, h: 2 } },
      ]),
      [],
    );
    await enterCustomise(view);
    await act(async () => {
      fireEvent.click(deleteBtn(view.container, "a"));
    });
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Dismiss" }));
    });
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Undo" }));
    });

    // Both cards are back AND still carry their affordances, so the board is
    // still editable — including the one the undo re-created.
    for (const id of ["a", "b"]) {
      expect(deleteBtn(view.container, id)).toBeTruthy();
      expect(
        view.container.querySelector(
          `.grid-stack-item[gs-id="${id}"] .zf-cfg-btn`,
        ),
      ).toBeTruthy();
    }
    // And the restored card can actually be deleted again.
    await act(async () => {
      fireEvent.click(deleteBtn(view.container, "a"));
    });
    expect(itemIds(view.container)).toEqual(["b"]);
  });

  it("reverts a delete on Cancel", async () => {
    const view = mount(
      parseSpec([
        { id: "a", position: { x: 0, y: 0, w: 3, h: 2 } },
        { id: "b", position: { x: 3, y: 0, w: 3, h: 2 } },
      ]),
      [],
    );
    await enterCustomise(view);
    await act(async () => {
      fireEvent.click(deleteBtn(view.container, "a"));
    });
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Cancel" }));
    });
    expect(itemIds(view.container).sort()).toEqual(["a", "b"]);
    // Cancel left customise mode, so the collapsed entry point is back.
    expect(view.getByRole("button", { name: "Customise" })).toBeTruthy();
  });
});

describe("honest save", () => {
  it("stays in customise mode until the host's write resolves", async () => {
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    const onSave = vi.fn(() => pending);
    const view = mountWith(
      parseSpec([{ id: "a", position: { x: 0, y: 0, w: 3, h: 2 } }]),
      onSave,
    );
    await enterCustomise(view);

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Save" }));
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    // Still editing, and saying so — the write hasn't landed yet.
    expect(view.container.textContent).toContain("Saving…");
    expect(view.queryByRole("button", { name: "Customise" })).toBeNull();
    // The same spec can't be submitted twice mid-flight.
    expect(
      view.getByRole("button", { name: "Saving…" }).hasAttribute("disabled"),
    ).toBe(true);

    await act(async () => {
      release();
      await pending;
    });
    expect(view.getByRole("button", { name: "Customise" })).toBeTruthy();
  });

  it("keeps the edits and shows why when the host rejects the write", async () => {
    const onSave = vi.fn(async () => {
      throw new Error("EACCES: dashboard.json is read-only");
    });
    const view = mountWith(
      parseSpec([
        { id: "a", position: { x: 0, y: 0, w: 3, h: 2 } },
        { id: "b", position: { x: 3, y: 0, w: 3, h: 2 } },
      ]),
      onSave,
    );
    await enterCustomise(view);
    await act(async () => {
      fireEvent.click(deleteBtn(view.container, "a"));
    });
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Save" }));
    });

    // The failure is stated, not swallowed.
    expect(view.getByRole("alert").textContent).toContain("read-only");
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Dismiss" }));
    });
    // And the work survives: still in customise mode, still one frame deleted,
    // still undoable.
    expect(view.queryByRole("button", { name: "Customise" })).toBeNull();
    expect(itemIds(view.container)).toEqual(["b"]);
    expect(
      view.getByRole("button", { name: "Undo" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("marks the saved state clean, so re-entering has nothing to revert", async () => {
    const onSave = vi.fn();
    const view = mountWith(
      parseSpec([
        { id: "a", position: { x: 0, y: 0, w: 3, h: 2 } },
        { id: "b", position: { x: 3, y: 0, w: 3, h: 2 } },
      ]),
      onSave,
    );
    await enterCustomise(view);
    await act(async () => {
      fireEvent.click(deleteBtn(view.container, "a"));
    });
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Save" }));
    });
    await enterCustomise(view);

    expect(view.container.textContent).toContain("No changes");
    expect(
      view.getByRole("button", { name: "Undo" }).hasAttribute("disabled"),
    ).toBe(true);
    // Cancel now can't resurrect the frame the user deliberately saved away.
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Cancel" }));
    });
    expect(itemIds(view.container)).toEqual(["b"]);
  });

  it("says Download when there is no host to save to", async () => {
    // Without onSave the button writes a file to the user's disk. Labelling it
    // "Save" made that look like a persist that went somewhere.
    const view = mountWith(
      parseSpec([{ id: "a", position: { x: 0, y: 0, w: 3, h: 2 } }]),
      undefined,
    );
    await enterCustomise(view);
    expect(view.getByRole("button", { name: "Download" })).toBeTruthy();
    expect(view.queryByRole("button", { name: "Save" })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// The rail.
//
// The Cosmetics rail was nine non-collapsible sections — ~35 controls stacked in
// one 320px scroll column with no search — so reaching "elevation" meant
// scrolling past every background control. Two settings weren't in the editor at
// all: grid geometry, and display CURRENCY, which converts every money figure on
// the board and so could only be changed by hand-editing dashboard.json.
// ─────────────────────────────────────────────────────────────────────────────

function railSections(container: HTMLElement) {
  return [...container.querySelectorAll(".zf-rail .zf-theme")].map((el) => ({
    label:
      el.querySelector(".zf-theme-header-label")?.textContent?.trim() ?? "?",
    open: el.classList.contains("is-open"),
  }));
}

async function openCosmetics(view: RenderResult) {
  await act(async () => {
    fireEvent.click(view.getByRole("tab", { name: "Cosmetics" }));
  });
}

async function searchSettings(view: RenderResult, query: string) {
  await act(async () => {
    fireEvent.change(view.getByLabelText("Search settings"), {
      target: { value: query },
    });
  });
}

describe("cosmetics rail: collapsible sections", () => {
  it("collapses every section but Presets, so the rail is a scannable list", async () => {
    const view = mount(
      parseSpec([{ id: "a", position: { x: 0, y: 0, w: 3, h: 2 } }]),
      [],
    );
    await enterCustomise(view);
    await openCosmetics(view);

    const sections = railSections(view.container);
    expect(sections.map((s) => s.label)).toEqual([
      "Presets",
      "Mode",
      "Accent",
      "Surface",
      "Gain / Loss",
      "Background",
      "Layout",
      "Appearance",
      "Typography",
      "Currency",
    ]);
    // Presets is the one-click route to a whole look, so it's the thing offered
    // first; everything else is opened deliberately.
    expect(sections.filter((s) => s.open).map((s) => s.label)).toEqual([
      "Presets",
    ]);
  });

  it("toggles a section open and shut", async () => {
    const view = mount(
      parseSpec([{ id: "a", position: { x: 0, y: 0, w: 3, h: 2 } }]),
      [],
    );
    await enterCustomise(view);
    await openCosmetics(view);
    const header = view.getByRole("button", { name: "Appearance" });
    expect(header.getAttribute("aria-expanded")).toBe("false");

    await act(async () => fireEvent.click(header));
    expect(
      view
        .getByRole("button", { name: "Appearance" })
        .getAttribute("aria-expanded"),
    ).toBe("true");

    await act(async () => fireEvent.click(header));
    expect(
      view
        .getByRole("button", { name: "Appearance" })
        .getAttribute("aria-expanded"),
    ).toBe("false");
  });
});

describe("cosmetics rail: search", () => {
  it("narrows to the matching section and opens it", async () => {
    // The whole point of the query is to reveal the control, not to reveal a
    // header you then have to click.
    const view = mount(
      parseSpec([{ id: "a", position: { x: 0, y: 0, w: 3, h: 2 } }]),
      [],
    );
    await enterCustomise(view);
    await openCosmetics(view);
    await searchSettings(view, "elevation");

    expect(railSections(view.container)).toEqual([
      { label: "Appearance", open: true },
    ]);
  });

  it("matches the words a user would type, not only the visible labels", async () => {
    const view = mount(
      parseSpec([{ id: "a", position: { x: 0, y: 0, w: 3, h: 2 } }]),
      [],
    );
    await enterCustomise(view);
    await openCosmetics(view);

    // "shadow" is what the elevation slider does; "font" and "green" name no
    // section at all.
    for (const [query, expected] of [
      ["shadow", "Appearance"],
      ["font", "Typography"],
      ["green", "Gain / Loss"],
      ["scene", "Background"],
    ] as const) {
      await searchSettings(view, query);
      expect(
        railSections(view.container).map((s) => s.label),
        `"${query}" should find ${expected}`,
      ).toContain(expected);
    }
  });

  it("says so when nothing matches, rather than showing a blank rail", async () => {
    const view = mount(
      parseSpec([{ id: "a", position: { x: 0, y: 0, w: 3, h: 2 } }]),
      [],
    );
    await enterCustomise(view);
    await openCosmetics(view);
    await searchSettings(view, "qqqq");

    expect(railSections(view.container)).toEqual([]);
    expect(view.container.textContent).toContain("No settings match");
  });

  it("restores every section when the query is cleared", async () => {
    const view = mount(
      parseSpec([{ id: "a", position: { x: 0, y: 0, w: 3, h: 2 } }]),
      [],
    );
    await enterCustomise(view);
    await openCosmetics(view);
    await searchSettings(view, "elevation");
    expect(railSections(view.container)).toHaveLength(1);

    await searchSettings(view, "");
    expect(railSections(view.container)).toHaveLength(10);
    // And back to the pre-search open/shut state, not all-open.
    expect(
      railSections(view.container)
        .filter((s) => s.open)
        .map((s) => s.label),
    ).toEqual(["Presets"]);
  });
});

describe("display currency is editable", () => {
  it("reprices every live card and lands in the saved spec", async () => {
    // Currency converts every money figure on the board, which made it the
    // highest-impact setting the editor didn't expose at all.
    const { provider } = fxProvider({ THB: 36.5 });
    const onSave = vi.fn();
    hostProviders.current = [provider];
    const view = render(
      <FramesProvider providers={hostProviders.current}>
        <DashboardEditor
          spec={parseSpec([{ id: "a", position: { x: 0, y: 0, w: 3, h: 2 } }])}
          registry={registry}
          onSave={onSave}
        />
      </FramesProvider>,
    );

    expect(probeOf(view.container, "a").dataset.code).toBe("USD");
    await enterCustomise(view);
    await openCosmetics(view);
    await searchSettings(view, "currency");

    await act(async () => {
      fireEvent.change(view.getByLabelText("Display currency"), {
        target: { value: "THB" },
      });
    });

    // The already-mounted item root follows — the code is read from a ref, so
    // only the explicit re-render effect can push it in.
    await waitFor(() =>
      expect(probeOf(view.container, "a").dataset.code).toBe("THB"),
    );
    expect(probeOf(view.container, "a").dataset.rate).toBe("36.5");

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Save" }));
    });
    expect((onSave.mock.calls[0][0] as DashboardSpec).currency.code).toBe(
      "THB",
    );
  });

  it("is undoable like any other cosmetic", async () => {
    const { provider } = fxProvider({ THB: 36.5 });
    const view = mount(
      parseSpec([{ id: "a", position: { x: 0, y: 0, w: 3, h: 2 } }]),
      [provider],
    );
    await enterCustomise(view);
    await openCosmetics(view);
    await searchSettings(view, "currency");
    await act(async () => {
      fireEvent.change(view.getByLabelText("Display currency"), {
        target: { value: "THB" },
      });
    });
    await waitFor(() =>
      expect(probeOf(view.container, "a").dataset.code).toBe("THB"),
    );

    // The debounced cosmetics watcher records it, so ⌘Z reverses it.
    await waitFor(() =>
      expect(
        view.getByRole("button", { name: "Undo" }).hasAttribute("disabled"),
      ).toBe(false),
    );
    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Undo" }));
    });
    await waitFor(() =>
      expect(probeOf(view.container, "a").dataset.code).toBe("USD"),
    );
  });
});

describe("empty board", () => {
  it("explains itself and points at the Frames panel", async () => {
    // A frameless board rendered as a blank page: no explanation, no next step.
    const view = mount(parseSpec([]), []);
    expect(view.container.textContent).toContain("This board is empty");
    expect(view.container.textContent).toContain("Open Customise");

    await enterCustomise(view);
    expect(view.container.textContent).toContain("Frames");
    // The prompt's link switches the rail to the panel that can fix it.
    await act(async () => {
      fireEvent.click(
        view.container.querySelector(".zf-board-empty-link") as HTMLElement,
      );
    });
    expect(
      view.getByRole("tab", { name: "Frames" }).getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("disappears once the board has a frame", async () => {
    const view = mount(
      parseSpec([{ id: "a", position: { x: 0, y: 0, w: 3, h: 2 } }]),
      [],
    );
    expect(view.container.textContent).not.toContain("This board is empty");
  });
});

describe("keyboard and tab semantics", () => {
  it("saves on ⌘S", async () => {
    const onSave = vi.fn();
    const view = mountWith(
      parseSpec([
        { id: "a", position: { x: 0, y: 0, w: 3, h: 2 } },
        { id: "b", position: { x: 3, y: 0, w: 3, h: 2 } },
      ]),
      onSave,
    );
    await enterCustomise(view);
    await act(async () => {
      fireEvent.click(deleteBtn(view.container, "a"));
    });
    await act(async () => {
      fireEvent.keyDown(document, { key: "s", metaKey: true });
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(
      (onSave.mock.calls[0][0] as DashboardSpec).frames.map((f) => f.id),
    ).toEqual(["b"]);
  });

  it("gives each tab its panel, and moves between them with arrow keys", async () => {
    // role="tab" was already there, but with no aria-controls, no tabpanel, and
    // no arrow-key handling — a tablist in name only.
    const view = mount(
      parseSpec([{ id: "a", position: { x: 0, y: 0, w: 3, h: 2 } }]),
      [],
    );
    await enterCustomise(view);

    const frames = view.getByRole("tab", { name: "Frames" });
    expect(frames.getAttribute("aria-controls")).toBe("zf-rail-panel-frames");
    expect(frames.getAttribute("tabindex")).toBe("0");
    // Only the selected tab is in the tab order.
    expect(
      view.getByRole("tab", { name: "Cosmetics" }).getAttribute("tabindex"),
    ).toBe("-1");
    expect(
      view.container
        .querySelector("#zf-rail-panel-frames")
        ?.getAttribute("role"),
    ).toBe("tabpanel");

    await act(async () => fireEvent.keyDown(frames, { key: "ArrowRight" }));
    expect(
      view
        .getByRole("tab", { name: "Cosmetics" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      view.container
        .querySelector("#zf-rail-panel-cosmetics")
        ?.getAttribute("aria-labelledby"),
    ).toBe("zf-rail-tab-cosmetics");
  });
});

describe("grid geometry is editable", () => {
  it("reflows the live grid and saves the new shape", async () => {
    const view = mount(
      parseSpec([{ id: "a", position: { x: 0, y: 0, w: 3, h: 2 } }]),
      [],
    );
    await enterCustomise(view);
    await openCosmetics(view);
    await searchSettings(view, "columns");

    const before = gridEl(view.container).getAttribute("gs-current-row");
    await act(async () => {
      fireEvent.change(view.getByLabelText("Grid columns"), {
        target: { value: "6" },
      });
    });

    // Applied in place through GridStack's own column() — NOT a re-init, which
    // would remount every frame's React root and re-subscribe its data hooks.
    expect(gridEl(view.container).classList.contains("gs-6")).toBe(true);
    expect(mounts.count).toBe(1);
    expect(before).not.toBeNull();

    await act(async () => {
      fireEvent.change(view.getByLabelText("Grid row height"), {
        target: { value: "120" },
      });
    });

    await act(async () => {
      fireEvent.click(view.getByRole("button", { name: "Save" }));
    });
    const saved = savedSpec(view.onSave);
    expect(saved.grid.columns).toBe(6);
    expect(saved.grid.rowHeight).toBe(120);
  });

  it("hides geometry in flow-horizontal, where both are derived", async () => {
    // There the column count comes from the frames and the cell height from the
    // viewport, so offering a control would imply a choice the user doesn't have.
    const view = mount(
      parseSpec([{ id: "a", position: { x: 0, y: 0, w: 3, h: 2 } }], {
        mode: "flow-horizontal",
      }),
      [],
    );
    await enterCustomise(view);
    await openCosmetics(view);
    await searchSettings(view, "columns");
    expect(view.queryByLabelText("Grid columns")).toBeNull();
    expect(view.queryByLabelText("Grid row height")).toBeNull();
  });
});

describe("Reset links track the schema, not hand-copied literals", () => {
  it("offers no Reset anywhere on a board that is entirely at its defaults", async () => {
    // Every Reset link decides whether to appear by comparing the live value to a
    // default, and each of those used to be an inline literal repeated at ~20 call
    // sites. One had already drifted: the schema's rowHeight default is 96, and a
    // hand-written `!== 90` offered "Reset" on an untouched board — then reset it
    // to a value the schema never chose. Deriving the comparisons from the schema
    // makes that class of drift impossible, and this is the assertion that keeps
    // it that way: a default board has nothing to reset, by definition.
    // NOT parseSpec: that fixture pins grid values (rowHeight 90) which are
    // legitimately off-default, so a Reset there would be correct. This board
    // takes every cosmetic straight from the schema.
    const view = mount(
      DashboardSpecSchema.parse({
        title: "defaults",
        frames: [
          {
            id: "a",
            frame: "probe",
            position: { x: 0, y: 0, w: 3, h: 2 },
            config: {},
          },
        ],
      }),
      [],
    );
    await enterCustomise(view);
    await openCosmetics(view);

    // Open every section so no Reset is merely hidden behind a collapsed header.
    for (const { label } of railSections(view.container)) {
      const header = view.getByRole("button", { name: label });
      if (header.getAttribute("aria-expanded") === "false") {
        await act(async () => fireEvent.click(header));
      }
    }
    expect(
      railSections(view.container).every((s) => s.open),
      "every section should be open for this assertion to mean anything",
    ).toBe(true);

    const stray = view.queryAllByRole("button", { name: "Reset" }).map((b) => {
      const sec = b.closest(".zf-theme");
      const row = b.closest(".zf-theme-row");
      return `${sec?.querySelector(".zf-theme-header-label")?.textContent} / ${row?.textContent}`;
    });
    expect(stray).toEqual([]);
  });

  it("offers Reset once a value moves off its default, and it restores it", async () => {
    const view = mount(
      parseSpec([{ id: "a", position: { x: 0, y: 0, w: 3, h: 2 } }]),
      [],
    );
    await enterCustomise(view);
    await openCosmetics(view);
    await searchSettings(view, "appearance");

    const slider = view.getByLabelText("Corner radius");
    expect((slider as HTMLInputElement).value).toBe("18"); // the schema default
    await act(async () => {
      fireEvent.change(slider, { target: { value: "4" } });
    });

    const reset = view.getByRole("button", { name: "Reset" });
    await act(async () => fireEvent.click(reset));
    expect(
      (view.getByLabelText("Corner radius") as HTMLInputElement).value,
    ).toBe("18");
    expect(view.queryAllByRole("button", { name: "Reset" })).toEqual([]);
  });
});
