import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { AnyFrameDefinition } from "@zframes/spec/frame";
import type { FrameInstance, GridPosition } from "@zframes/spec/spec";
import {
  colsForHorizontal,
  containerGeometry,
  posFor,
  seedHorizontal,
  subCellPx,
} from "./editor-grid";

// The pure grid math behind flow-horizontal boards. All three functions are
// exported, side-effect-free, and DOM-free (Node env, no GridStack) — so the
// contract is pinnable exactly, and it matters:
//
//   • `posFor` is the mode → placement selector every read/write path goes
//     through. In flow-horizontal it must return ONLY
//     `layouts["flow-horizontal"]`, with `undefined` meaning "auto-position
//     me". If it ever fell back to the canonical vertical `position` there,
//     Save would copy horizontal coordinates over the vertical layout.
//   • `seedHorizontal` runs on every load of a flow-horizontal spec and on
//     every mode switch. The grid is initialised with `float:true`, so
//     GridStack does NOT repair overlaps: if the `taken` bookkeeping or the
//     bounds check regresses, un-arranged frames drop into the `{x:0,y:0}`
//     fallback and the whole board becomes one pile at the origin. Hence the
//     non-overlap, in-bounds, scan-order and pre-placed-blocking pins below.
//   • `colsForHorizontal` sizes the forced-wide grid element. A frame taller
//     than `rows` must not inflate the budget (its cost is capped at `rows`),
//     and the result never drops below the module-private H_COLS_MIN — pinned
//     here as the literal 24.

function frame(
  id: string,
  position: GridPosition,
  layouts?: Record<string, GridPosition>,
): FrameInstance {
  return {
    id,
    frame: "clock",
    position,
    config: {},
    ...(layouts ? { layouts } : {}),
  };
}

// Reads the seeded horizontal placement, failing loudly if the frame was left
// un-arranged (which would otherwise silently weaken every assertion below).
function hOf(f: FrameInstance): GridPosition {
  const h = f.layouts?.["flow-horizontal"];
  if (!h) throw new Error(`frame ${f.id} has no flow-horizontal layout`);
  return h;
}

function cellsOf(p: GridPosition): string[] {
  const out: string[] = [];
  for (let i = 0; i < p.w; i++)
    for (let j = 0; j < p.h; j++) out.push(`${p.x + i},${p.y + j}`);
  return out;
}

describe("posFor", () => {
  const hl: GridPosition = { x: 4, y: 1, w: 3, h: 2 };
  const withLayout = frame(
    "a",
    { x: 0, y: 0, w: 2, h: 2 },
    {
      "flow-horizontal": hl,
    },
  );
  const withoutLayout = frame("b", { x: 1, y: 5, w: 6, h: 3 });
  // `layouts` is a record keyed by mode name, so a spec written against an older
  // schema can carry a key for a mode that no longer exists (the retired
  // "canvas" was one). Such a key must be inert, not mistaken for a placement.
  const staleModeOnly = frame(
    "c",
    { x: 1, y: 5, w: 6, h: 3 },
    {
      canvas: { x: 9, y: 9, w: 1, h: 1 },
    },
  );

  it("returns the flow-horizontal override in flow-horizontal mode", () => {
    expect(posFor(withLayout, "flow-horizontal")).toBe(hl);
  });

  it("returns undefined in flow-horizontal mode when there is no override", () => {
    // undefined is the caller's "seed/pack this one" signal.
    expect(posFor(withoutLayout, "flow-horizontal")).toBeUndefined();
    expect(posFor(staleModeOnly, "flow-horizontal")).toBeUndefined();
  });

  it("never falls back to the canonical position in flow-horizontal mode", () => {
    // Leaking `position` here would let Save write horizontal coords over the
    // vertical layout.
    expect(posFor(withoutLayout, "flow-horizontal")).not.toEqual(
      withoutLayout.position,
    );
    expect(posFor(staleModeOnly, "flow-horizontal")).not.toEqual(
      staleModeOnly.position,
    );
  });

  it("returns the canonical position in flow-vertical", () => {
    expect(posFor(withoutLayout, "flow-vertical")).toBe(withoutLayout.position);
    // …even when a flow-horizontal override exists (modes stay independent).
    expect(posFor(withLayout, "flow-vertical")).toBe(withLayout.position);
    // …and even when a stale key for a retired mode is still in `layouts`:
    // only flow-horizontal is layout-aware.
    expect(posFor(staleModeOnly, "flow-vertical")).toBe(staleModeOnly.position);
  });
});

describe("seedHorizontal packing", () => {
  it("packs assorted frames without a single shared cell, all in bounds", () => {
    const cols = 12;
    const rows = 4;
    const frames = [
      frame("a", { x: 0, y: 0, w: 2, h: 2 }),
      frame("b", { x: 0, y: 0, w: 1, h: 3 }),
      frame("c", { x: 0, y: 0, w: 3, h: 1 }),
      frame("d", { x: 0, y: 0, w: 1, h: 1 }),
      frame("e", { x: 0, y: 0, w: 2, h: 4 }),
      frame("f", { x: 0, y: 0, w: 4, h: 2 }),
      frame("g", { x: 0, y: 0, w: 1, h: 2 }),
    ];
    const out = seedHorizontal(frames, cols, rows);
    const placed = out.map(hOf);

    const union = new Set(placed.flatMap(cellsOf));
    const area = placed.reduce((s, p) => s + p.w * p.h, 0);
    expect(area).toBe(29); // 4+3+3+1+8+8+2 — nothing was clamped away
    expect(union.size).toBe(area); // ⇒ no two rectangles share a cell

    for (const p of placed) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.x + p.w).toBeLessThanOrEqual(cols);
      expect(p.y + p.h).toBeLessThanOrEqual(rows);
    }

    // Hand-computed dense first-fit result (column-major scan, see below).
    expect(placed).toEqual([
      { x: 0, y: 0, w: 2, h: 2 },
      { x: 2, y: 0, w: 1, h: 3 },
      { x: 0, y: 3, w: 3, h: 1 },
      { x: 0, y: 2, w: 1, h: 1 },
      { x: 3, y: 0, w: 2, h: 4 },
      { x: 5, y: 0, w: 4, h: 2 },
      { x: 5, y: 2, w: 1, h: 2 },
    ]);
  });

  it("scans columns left→right, rows top→bottom (column-major)", () => {
    // Four 1×1 frames on a 3×2 grid. Column-major fills (0,0) then (0,1)
    // before moving to column 1; a row-major scan would emit (1,0) second.
    const out = seedHorizontal(
      [
        frame("a", { x: 0, y: 0, w: 1, h: 1 }),
        frame("b", { x: 0, y: 0, w: 1, h: 1 }),
        frame("c", { x: 0, y: 0, w: 1, h: 1 }),
        frame("d", { x: 0, y: 0, w: 1, h: 1 }),
      ],
      3,
      2,
    );
    expect(out.map(hOf)).toEqual([
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 0, y: 1, w: 1, h: 1 },
      { x: 1, y: 0, w: 1, h: 1 },
      { x: 1, y: 1, w: 1, h: 1 },
    ]);
  });

  it("finds the single remaining slot on an otherwise-full grid", () => {
    // 3×2 grid; pre-placed frames block columns 0–1 entirely plus (2,1), so
    // (2,0) is the one free cell.
    const frames = [
      frame("new", { x: 0, y: 0, w: 1, h: 1 }),
      frame(
        "blockA",
        { x: 0, y: 0, w: 2, h: 2 },
        {
          "flow-horizontal": { x: 0, y: 0, w: 2, h: 2 },
        },
      ),
      frame(
        "blockB",
        { x: 0, y: 0, w: 1, h: 1 },
        {
          "flow-horizontal": { x: 2, y: 1, w: 1, h: 1 },
        },
      ),
    ];
    const out = seedHorizontal(frames, 3, 2);
    expect(hOf(out[0])).toEqual({ x: 2, y: 0, w: 1, h: 1 });
  });

  it("clamps an oversized frame to the grid instead of overflowing it", () => {
    const out = seedHorizontal(
      [frame("big", { x: 0, y: 0, w: 10, h: 5 })],
      4,
      2,
    );
    expect(hOf(out[0])).toEqual({ x: 0, y: 0, w: 4, h: 2 });
  });

  it("floors a degenerate zero-size frame at 1×1", () => {
    // The schema forbids w/h < 1, but the Math.max(1, …) guard is real code and
    // keeps a hand-edited spec from producing a zero-area placement.
    const out = seedHorizontal(
      [frame("zero", { x: 0, y: 0, w: 0, h: 0 })],
      4,
      2,
    );
    expect(hOf(out[0])).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it("falls back to the origin — overlapping — when nothing fits", () => {
    // Two 1×1 slots, three frames: the third has nowhere legal to go. It lands
    // at 0,0 (piling onto the first) rather than throwing or going negative.
    const out = seedHorizontal(
      [
        frame("a", { x: 0, y: 0, w: 1, h: 1 }),
        frame("b", { x: 0, y: 0, w: 1, h: 1 }),
        frame("c", { x: 0, y: 0, w: 1, h: 1 }),
      ],
      2,
      1,
    );
    expect(out.map(hOf)).toEqual([
      { x: 0, y: 0, w: 1, h: 1 },
      { x: 1, y: 0, w: 1, h: 1 },
      { x: 0, y: 0, w: 1, h: 1 }, // fallback: overlaps "a"
    ]);
  });

  it("falls back with the CLAMPED size when the grid is already full", () => {
    const out = seedHorizontal(
      [
        frame("filler", { x: 0, y: 0, w: 2, h: 2 }),
        frame("late", { x: 0, y: 0, w: 5, h: 5 }),
      ],
      2,
      2,
    );
    expect(hOf(out[1])).toEqual({ x: 0, y: 0, w: 2, h: 2 });
  });
});

describe("seedHorizontal and pre-placed frames", () => {
  it("keeps an existing layout untouched and blocks its cells for everyone else", () => {
    // The pre-placed frame is LAST in the array, so this also proves the
    // occupancy pass runs before any placement (order-independent blocking).
    const preplaced: GridPosition = { x: 0, y: 0, w: 2, h: 9 };
    const frames = [
      frame("seed-me", { x: 0, y: 0, w: 1, h: 1 }),
      frame(
        "fixed",
        { x: 7, y: 7, w: 4, h: 4 },
        {
          "flow-horizontal": preplaced,
        },
      ),
    ];
    const out = seedHorizontal(frames, 6, 3);

    // Untouched: same object, same (unclamped) layout — the seed never rewrites
    // a placement the human already made.
    expect(out[1]).toBe(frames[1]);
    expect(hOf(out[1])).toBe(preplaced);
    expect(hOf(out[1]).h).toBe(9);

    // h is clamped to `rows` only for occupancy, so columns 0–1 are blocked
    // across all 3 rows and the seeded frame starts at column 2.
    expect(hOf(out[0])).toEqual({ x: 2, y: 0, w: 1, h: 1 });
  });

  it("blocks only rows 0..rows-1 of a pre-placed frame that starts mid-grid", () => {
    // Occupancy fills min(h, rows) rows from y, i.e. rows 1..4 here — rows 3–4
    // are off-grid and harmless, row 0 stays free for the seeded frame.
    const frames = [
      frame("seed-me", { x: 0, y: 0, w: 1, h: 1 }),
      frame(
        "fixed",
        { x: 0, y: 0, w: 1, h: 1 },
        {
          "flow-horizontal": { x: 0, y: 1, w: 1, h: 8 },
        },
      ),
    ];
    const out = seedHorizontal(frames, 4, 3);
    expect(hOf(out[0])).toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it("preserves other modes' layouts and the canonical position when seeding", () => {
    const canvas: GridPosition = { x: 9, y: 9, w: 1, h: 1 };
    const position: GridPosition = { x: 3, y: 4, w: 2, h: 2 };
    const out = seedHorizontal([frame("a", position, { canvas })], 6, 3);
    expect(out[0].position).toBe(position); // vertical layout untouched
    expect(out[0].layouts?.canvas).toBe(canvas); // sibling mode untouched
    expect(hOf(out[0])).toEqual({ x: 0, y: 0, w: 2, h: 2 });
  });

  it("does not mutate the input frames", () => {
    const frames = [
      frame("a", { x: 0, y: 0, w: 2, h: 2 }),
      frame("b", { x: 0, y: 0, w: 1, h: 1 }),
    ];
    const out = seedHorizontal(frames, 6, 3);
    expect(frames[0].layouts).toBeUndefined();
    expect(frames[1].layouts).toBeUndefined();
    expect(out[0]).not.toBe(frames[0]);
  });

  it("returns an empty list unchanged", () => {
    expect(seedHorizontal([], 24, 6)).toEqual([]);
  });
});

describe("colsForHorizontal", () => {
  const many = (n: number, w: number, h: number) =>
    Array.from({ length: n }, (_, i) => frame(`f${i}`, { x: 0, y: 0, w, h }));

  it("never returns fewer than the 24-column floor", () => {
    expect(colsForHorizontal([], 6)).toBe(24);
    expect(colsForHorizontal([frame("a", { x: 0, y: 0, w: 3, h: 2 })], 6)).toBe(
      24,
    );
  });

  it("sizes a large board to ceil(cells / rows * 1.25) + 8", () => {
    // 20 frames × 4w × 3h = 240 cells; 240/6 = 40; ×1.25 = 50; +8 = 58.
    expect(colsForHorizontal(many(20, 4, 3), 6)).toBe(58);
  });

  it("caps a frame taller than `rows` at `rows` so it cannot inflate the budget", () => {
    const base = many(20, 4, 3); // 240 cells
    // The tall frame costs 2 × min(100, 6) = 12, not 2 × 100 = 200:
    // 252/6 = 42; ×1.25 = 52.5 → 53; +8 = 61. Uncapped it would be 100.
    const withTall = [...base, frame("tall", { x: 0, y: 0, w: 2, h: 100 })];
    expect(colsForHorizontal(withTall, 6)).toBe(61);
    // Exactly as expensive as the same frame clipped to the row count.
    expect(colsForHorizontal(withTall, 6)).toBe(
      colsForHorizontal([...base, frame("t", { x: 0, y: 0, w: 2, h: 6 })], 6),
    );
  });

  it("counts a degenerate zero-size frame as one cell", () => {
    // 100 cells / 4 rows = 25; ×1.25 = 31.25 → 32; +8 = 40, either way.
    expect(colsForHorizontal(many(100, 0, 0), 4)).toBe(40);
    expect(colsForHorizontal(many(100, 1, 1), 4)).toBe(40);
  });

  it("adds the fragmentation headroom on a mixed-size board", () => {
    // 10 × (6×4) = 240, plus 4 × min(7,5) = 20 → 260 cells; 260/5 = 52;
    // ×1.25 = 65; +8 = 73.
    const frames = [
      ...many(10, 6, 4),
      frame("tall", { x: 0, y: 0, w: 4, h: 7 }),
    ];
    expect(colsForHorizontal(frames, 5)).toBe(73);
  });

  it("shrinks as `rows` grows — the same cells spread over more bands", () => {
    const frames = many(30, 4, 3); // 360 cells at any rows ≥ 3
    expect(colsForHorizontal(frames, 3)).toBe(158); // 360/3=120 → 150 + 8
    expect(colsForHorizontal(frames, 6)).toBe(83); // 360/6=60 → 75 + 8
    expect(colsForHorizontal(frames, 12)).toBe(46); // 360/12=30 → 37.5→38 + 8
  });
});

// ── container (group) geometry ──────────────────────────────────────────────
//
// The two pure pieces behind nested grids. `subCellPx` in particular is the one
// bit of the editor's nesting jsdom can NEVER exercise through the DOM
// (clientHeight is always 0 there), so its arithmetic is pinned directly: a wrong
// margin term is invisible in a test of the caller and shows up only as children
// overflowing their group in a real browser.

describe("containerGeometry", () => {
  const containerDef = {
    container: true,
    schema: z.object({
      columns: z.number().int().min(1).default(2),
      rows: z.number().int().min(1).default(2),
      gap: z.number().min(0).default(8),
    }),
  } as unknown as AnyFrameDefinition;

  const plainDef = {
    schema: z.object({}),
  } as unknown as AnyFrameDefinition;

  it("returns null for a frame that is not a container", () => {
    // This is the editor's ONE test for "does this item hold a subgrid", so a
    // truthy answer here would build a nested grid inside an ordinary card.
    expect(containerGeometry(plainDef, {})).toBeNull();
    expect(containerGeometry(undefined, {})).toBeNull();
  });

  it("reads the declared geometry off the config", () => {
    expect(
      containerGeometry(containerDef, { columns: 4, rows: 3, gap: 0 }),
    ).toEqual({ columns: 4, rows: 3, gap: 0 });
  });

  it("applies the schema's own defaults for an empty config", () => {
    expect(containerGeometry(containerDef, {})).toEqual({
      columns: 2,
      rows: 2,
      gap: 8,
    });
    expect(containerGeometry(containerDef, undefined)).toEqual({
      columns: 2,
      rows: 2,
      gap: 8,
    });
  });

  it("falls back to a usable grid when the config is invalid", () => {
    // The group still renders its own error card through the normal path, but the
    // editor needs numbers either way — NaN columns would break GridStack itself
    // rather than showing the user a bad config.
    expect(
      containerGeometry(containerDef, { columns: "lots", rows: -4 }),
    ).toEqual({ columns: 2, rows: 2, gap: 8 });
  });
});

describe("subCellPx", () => {
  it("divides the measured height into rows, net of each row's margin", () => {
    // GridStack's margin is gap/2 per side, so every row carries a full `gap`.
    // 200px, 2 rows, gap 8 → (200 - 16) / 2 = 92.
    expect(subCellPx(200, 2, 8)).toBe(92);
    // No gap → a clean division.
    expect(subCellPx(200, 4, 0)).toBe(50);
  });

  it("forgetting the margin term would overflow the group", () => {
    // The regression this exists to catch: a plain `height / rows` (100 instead of
    // 88 at 4 rows) puts the bottom row `gap * rows` past the group's own box.
    const rows = 4;
    const gap = 12;
    const height = 400;
    const cell = subCellPx(height, rows, gap);
    expect(cell * rows + gap * rows).toBeLessThanOrEqual(height);
    // …and it isn't merely conservative — it uses the room it has.
    expect((cell + 1) * rows + gap * rows).toBeGreaterThan(height);
  });

  it("returns whole pixels, never a fraction", () => {
    expect(Number.isInteger(subCellPx(199, 3, 7))).toBe(true);
  });

  it("floors at a visible size for a group too small to divide", () => {
    // A group dragged down to a few pixels would otherwise compute a zero or
    // negative cell height, which GridStack turns into items of no height at all.
    expect(subCellPx(10, 6, 12)).toBe(24);
    expect(subCellPx(0, 2, 8)).toBe(24);
  });
});
