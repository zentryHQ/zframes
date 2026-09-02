// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { z } from "zod";
import { DashboardRenderer } from "./renderer";
import { FRAME_CSS } from "./frame-content";
import { createRegistry, defineFrame } from "@zframes/spec/frame";
import { DashboardSpecSchema } from "@zframes/spec/spec";
import { FramesProvider } from "./hooks";
import type { Capability, MarketDataProvider } from "@zframes/spec/types";

// The renderer's *placement* contract — the half nothing else covers, because
// renderer.test.tsx and frame-smoke both render flow-vertical boards only.
// `positionStyle` (renderer.tsx) is module-private, so every assertion here goes
// through the real DashboardRenderer and reads the inline --zf-* vars off each
// rendered card, on a spec parsed by DashboardSpecSchema.
//
// What it pins, and why each one matters:
//   * flow-horizontal chrome: the `zf-flow-horizontal` class (FRAME_CSS keys its
//     side-scroller AND its `:not()` tablet exclusion off it) + --zf-h-rows (the
//     band count the horizontal grid-template-rows reads).
//   * horizontal placement comes from `layouts["flow-horizontal"]`, NOT from
//     `position` — the two layout modes are independently arranged.
//   * a frame with no horizontal layout must OMIT --zf-col-start/--zf-row-start
//     so FRAME_CSS's `auto` var-fallback lets `grid-auto-flow: column dense`
//     pack it. This is the entire reason an un-edited / agent-generated spec
//     lays out at all in horizontal mode: emitting the start lines here (the
//     tempting "collapse the two returns" refactor) would stack every frame onto
//     the same grid line.
//   * the row-span clamp to the band count, in BOTH horizontal sub-branches, and
//     its absence in flow-vertical (whose board is unbounded downward).
//   * --zf-col-span-sm, the only var the 641–1023px tablet query reads: a frame
//     spanning at least half the design grid takes both tablet columns. A wrong
//     threshold silently makes every card full- or half-width on a tablet.
//   * --zf-enter-i, the entrance-stagger index, in both modes.

// A minimal provider: the interface's data methods are optional, so a name + a
// capability list is enough to satisfy the renderer's coverage check.
const provider: MarketDataProvider = {
  name: "test-provider",
  capabilities: ["day-stats"] as Capability[],
};

// One trivial frame — this file is about the wrapper's placement vars, not card
// content, so a single registered frame carries every instance.
const boxFrame = defineFrame({
  name: "box",
  label: "Box",
  category: "tools",
  description: "a positioned box",
  capabilities: ["day-stats"],
  schema: z.object({}),
  component: () => <div data-testid="box" />,
});

const registry = createRegistry([boxFrame]);

interface Pos {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One `box` instance; `layouts` passes through to the spec verbatim. */
function inst(id: string, position: Pos, layouts?: Record<string, Pos>) {
  return {
    id,
    frame: "box",
    position,
    config: {},
    ...(layouts ? { layouts } : {}),
  };
}

const HORIZONTAL = {
  mode: "flow-horizontal",
  columns: 6,
  rowHeight: 80,
  gap: 10,
  rows: 4,
};
const VERTICAL = { ...HORIZONTAL, mode: "flow-vertical" };

function renderBoard(
  frames: Array<Record<string, unknown>>,
  grid: Record<string, unknown> = HORIZONTAL,
) {
  const spec = DashboardSpecSchema.parse({ title: "t", grid, frames });
  return render(
    <FramesProvider providers={[provider]}>
      <DashboardRenderer spec={spec} registry={registry} />
    </FramesProvider>,
  );
}

/** The card wrappers in spec order — `positionStyle` lands on `.zf-frame`. */
function cards(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(".zf-frame")];
}

/** Read one custom property off a card / the grid host. */
const v = (el: HTMLElement, name: string) => el.style.getPropertyValue(name);

const gridHost = (container: HTMLElement) =>
  container.querySelector(".zf-grid") as HTMLElement;

afterEach(() => cleanup());

describe("flow-horizontal grid host", () => {
  it("carries both grid classes and publishes the band count as --zf-h-rows", () => {
    const { container } = renderBoard([inst("a", { x: 0, y: 0, w: 2, h: 2 })], {
      ...HORIZONTAL,
      rows: 5,
    });

    const grid = gridHost(container);
    // Both classes, in one className: FRAME_CSS's side-scroller rule is
    // `.zf-grid.zf-flow-horizontal`, so dropping either kills the layout.
    expect(grid.className).toBe("zf-grid zf-flow-horizontal");
    expect(grid.classList.contains("zf-grid")).toBe(true);
    expect(grid.classList.contains("zf-flow-horizontal")).toBe(true);
    // grid-template-rows: repeat(var(--zf-h-rows), …) — the bounded band count.
    expect(v(grid, "--zf-h-rows")).toBe("5");
    // The vertical geometry still ships (column tracks reuse --zf-row-h).
    expect(v(grid, "--zf-cols")).toBe("6");
    expect(v(grid, "--zf-row-h")).toBe("80px");
  });

  it("withholds the horizontal class in flow-vertical (the tablet query's :not() hinges on it)", () => {
    const { container } = renderBoard(
      [inst("a", { x: 0, y: 0, w: 2, h: 2 })],
      VERTICAL,
    );

    const grid = gridHost(container);
    expect(grid.className).toBe("zf-grid");
    expect(grid.classList.contains("zf-flow-horizontal")).toBe(false);
    // --zf-h-rows is emitted unconditionally; only the horizontal rule reads it.
    expect(v(grid, "--zf-h-rows")).toBe("4");
  });

  it("reserves the host's bottom chrome in the bounded board's height floor", () => {
    // The horizontal board is bounded to the viewport, and the host that serves
    // it pins a 36px ticker tape to the bottom of that viewport. The floor used
    // to yield only 120px, so between roughly 390px and 600px of viewport height
    // the lowest band ran underneath the tape — while the editor's own band
    // arithmetic subtracted 56px for it, leaving the two paths disagreeing about
    // the same layout. jsdom resolves no `calc()`, so the rule itself is what is
    // pinned: a bottom reserve, defaulted to the editor's constant, inside the
    // floor.
    const rule = FRAME_CSS.slice(
      FRAME_CSS.indexOf(".zf-grid.zf-flow-horizontal"),
    ).split("}")[0];
    expect(rule).toContain("min-height");
    expect(rule).toContain("var(--zf-tape-reserve, 56px)");
    // Inside the FLOOR, not the height: the height term already clears the tape.
    expect(
      /min-height:\s*min\(\s*420px,\s*calc\(100dvh - 120px - var\(--zf-tape-reserve, 56px\)\)\s*\)/.test(
        rule,
      ),
    ).toBe(true);
  });
});

describe("flow-horizontal frame placement", () => {
  it("places a frame from its flow-horizontal layout, not its vertical position", () => {
    // The vertical position is deliberately somewhere else entirely: if the
    // renderer read `position` here the lines would be 6/10 with 1×1 spans.
    const { container } = renderBoard([
      inst(
        "a",
        { x: 5, y: 9, w: 1, h: 1 },
        { "flow-horizontal": { x: 2, y: 1, w: 3, h: 2 } },
      ),
    ]);

    const [card] = cards(container);
    // 1-based grid lines from the LAYOUT: col-start = x+1, row-start = y+1.
    expect(v(card, "--zf-col-start")).toBe("3");
    expect(v(card, "--zf-col-span")).toBe("3");
    expect(v(card, "--zf-row-start")).toBe("2");
    expect(v(card, "--zf-row-span")).toBe("2");
  });

  it("omits both start lines for a frame with no horizontal layout so the grid auto-packs it", () => {
    const position = { x: 4, y: 7, w: 2, h: 3 };
    const { container } = renderBoard([inst("a", position)]);

    const [card] = cards(container);
    // Absent, NOT 5 / 8: FRAME_CSS falls back to `auto` and column-dense flow
    // packs the card. Emitting a start line here would pin every unlaid-out
    // frame to the same line.
    expect(v(card, "--zf-col-start")).toBe("");
    expect(v(card, "--zf-row-start")).toBe("");
    // The vertical w×h stays the footprint.
    expect(v(card, "--zf-col-span")).toBe("2");
    expect(v(card, "--zf-row-span")).toBe("3");

    // Same instance, flow-vertical: there the start lines ARE emitted, so the
    // omission above is mode-specific behaviour and not just a missing field.
    cleanup();
    const vertical = renderBoard([inst("a", position)], VERTICAL);
    const [verticalCard] = cards(vertical.container);
    expect(v(verticalCard, "--zf-col-start")).toBe("5");
    expect(v(verticalCard, "--zf-row-start")).toBe("8");
  });

  it("auto-packs when the stored layout is keyed to a different mode", () => {
    // `layouts` is keyed by grid.mode, so a canvas-only entry must not leak into
    // the horizontal board.
    const { container } = renderBoard([
      inst(
        "a",
        { x: 1, y: 2, w: 2, h: 2 },
        { canvas: { x: 8, y: 8, w: 4, h: 4 } },
      ),
    ]);

    const [card] = cards(container);
    expect(v(card, "--zf-col-start")).toBe("");
    expect(v(card, "--zf-row-start")).toBe("");
    expect(v(card, "--zf-col-span")).toBe("2");
    expect(v(card, "--zf-row-span")).toBe("2");
  });
});

describe("row-span clamp to the band count", () => {
  it("clamps a too-tall layout height, and passes a fitting one through", () => {
    const { container } = renderBoard(
      [
        inst(
          "tall",
          { x: 0, y: 0, w: 1, h: 1 },
          {
            "flow-horizontal": { x: 0, y: 0, w: 2, h: 6 },
          },
        ),
        inst(
          "fits",
          { x: 0, y: 0, w: 1, h: 1 },
          {
            "flow-horizontal": { x: 2, y: 0, w: 2, h: 3 },
          },
        ),
      ],
      { ...HORIZONTAL, rows: 4 },
    );

    const [tall, fits] = cards(container);
    // h 6 > rows 4 → clamped to the bounded board's height.
    expect(v(tall, "--zf-row-span")).toBe("4");
    // h 3 < rows 4 → untouched.
    expect(v(fits, "--zf-row-span")).toBe("3");
  });

  it("clamps in the auto-pack branch too, where the height comes from position", () => {
    const { container } = renderBoard(
      [
        inst("tall", { x: 0, y: 0, w: 2, h: 6 }),
        inst("fits", { x: 0, y: 0, w: 2, h: 2 }),
      ],
      { ...HORIZONTAL, rows: 4 },
    );

    const [tall, fits] = cards(container);
    expect(v(tall, "--zf-row-span")).toBe("4");
    expect(v(fits, "--zf-row-span")).toBe("2");
    // Still auto-packed: clamping the span must not start emitting a row line.
    expect(v(tall, "--zf-row-start")).toBe("");
  });

  it("does NOT clamp in flow-vertical, whose board is unbounded downward", () => {
    const { container } = renderBoard(
      [inst("tall", { x: 0, y: 0, w: 2, h: 6 })],
      { ...VERTICAL, rows: 4 },
    );

    const [tall] = cards(container);
    expect(v(tall, "--zf-row-span")).toBe("6");
  });
});

describe("--zf-col-span-sm (the 641-1023px tablet threshold)", () => {
  it("is 2 at or above half the design grid and 1 below it", () => {
    // 6 design columns → the threshold sits exactly at w = 3.
    const { container } = renderBoard(
      [
        inst("w1", { x: 0, y: 0, w: 1, h: 1 }),
        inst("w2", { x: 1, y: 0, w: 2, h: 1 }),
        inst("w3", { x: 3, y: 0, w: 3, h: 1 }),
        inst("w6", { x: 0, y: 1, w: 6, h: 1 }),
      ],
      VERTICAL,
    );

    const [w1, w2, w3, w6] = cards(container);
    expect(v(w1, "--zf-col-span-sm")).toBe("1");
    expect(v(w2, "--zf-col-span-sm")).toBe("1");
    // w >= cols / 2 is inclusive: the boundary frame takes both columns.
    expect(v(w3, "--zf-col-span-sm")).toBe("2");
    expect(v(w6, "--zf-col-span-sm")).toBe("2");
  });

  it("tracks the column count, not a fixed width", () => {
    // Same w = 3 frame on a 12-column grid is now a quarter of the board → 1.
    const { container } = renderBoard(
      [inst("w3", { x: 0, y: 0, w: 3, h: 1 })],
      { ...VERTICAL, columns: 12 },
    );

    expect(v(cards(container)[0], "--zf-col-span-sm")).toBe("1");
  });

  it("is emitted in flow-horizontal too, computed from position.w rather than the layout w", () => {
    const { container } = renderBoard([
      inst(
        "a",
        { x: 0, y: 0, w: 3, h: 1 },
        { "flow-horizontal": { x: 0, y: 0, w: 1, h: 2 } },
      ),
    ]);

    const [card] = cards(container);
    // The horizontal span comes from the layout …
    expect(v(card, "--zf-col-span")).toBe("1");
    // … while the tablet span stays keyed to the vertical footprint. Inert here
    // (FRAME_CSS's tablet rule excludes .zf-flow-horizontal), but it must still
    // be present so the same spec reflows correctly once the mode flips.
    expect(v(card, "--zf-col-span-sm")).toBe("2");
  });
});

describe("--zf-enter-i entrance stagger", () => {
  it("carries each frame's zero-based index in spec.frames (flow-vertical)", () => {
    const { container } = renderBoard(
      [
        inst("first", { x: 0, y: 0, w: 2, h: 1 }),
        inst("second", { x: 2, y: 0, w: 2, h: 1 }),
        inst("third", { x: 4, y: 0, w: 2, h: 1 }),
      ],
      VERTICAL,
    );

    const [first, second, third] = cards(container);
    expect(v(first, "--zf-enter-i")).toBe("0");
    expect(v(second, "--zf-enter-i")).toBe("1");
    expect(v(third, "--zf-enter-i")).toBe("2");
  });

  it("carries the same index in flow-horizontal, through both placement branches", () => {
    const { container } = renderBoard([
      // Laid-out branch …
      inst(
        "first",
        { x: 0, y: 0, w: 2, h: 1 },
        { "flow-horizontal": { x: 0, y: 0, w: 2, h: 2 } },
      ),
      // … and auto-pack branch.
      inst("second", { x: 2, y: 0, w: 2, h: 1 }),
      inst("third", { x: 4, y: 0, w: 2, h: 1 }),
    ]);

    const [first, second, third] = cards(container);
    expect(v(first, "--zf-enter-i")).toBe("0");
    expect(v(second, "--zf-enter-i")).toBe("1");
    expect(v(third, "--zf-enter-i")).toBe("2");
  });
});
