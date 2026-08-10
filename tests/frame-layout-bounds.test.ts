/**
 * FRAME SIZE ENVELOPE — every frame declares how small and how large it reads.
 *
 * WHAT THIS PINS. `FrameLayout` is the only thing standing between a frame and
 * being dragged to a span its UI cannot survive: `minW`/`minH` are the resize
 * floor the editor writes as GridStack's `gs-min-w`/`gs-min-h`, `maxW`/`maxH`
 * the ceiling, and `w`/`h` the span a frame lands at when it is added. Nothing
 * about a bad value fails loudly — a chart squeezed under its axis, or a
 * one-number card stretched across the whole board, renders perfectly and simply
 * looks wrong — so the invariants have to be asserted rather than noticed.
 *
 *   1. every frame declares a floor at all             — a frame added without one
 *   2. the envelope is internally coherent
 *      (1 <= min <= default <= max)                    — a typo'd bound
 *   3. no shipped board is outside its frames' bounds  — a floor raised past a
 *                                                        board that already uses it
 *
 * #3 is the one that matters most. The CSS-grid renderer ignores `layout`
 * entirely, so raising a floor above a size a curated board or golden fixture
 * already uses breaks NOTHING at render time — the board keeps working, and the
 * contradiction only surfaces months later when someone drags that card in the
 * editor and it jumps to a size they never chose. The bounds were derived by
 * measuring frames at every span (`.github/scripts/frame-size-probe.ts`); the
 * boards are the evidence that outranks the measurement.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { allFrameMetas } from "../packages/frames/src/schemas";
import bitkubSpec from "./fixtures/bitkub.dashboard.json";
import cryptoCommandSpec from "./fixtures/crypto-command.dashboard.json";
import macroWatchSpec from "./fixtures/macro-watch.dashboard.json";
import mickySpec from "./fixtures/micky.dashboard.json";
import nvdaDeepDiveSpec from "./fixtures/nvda-deepdive.dashboard.json";
import quantTerminalSpec from "./fixtures/quant-terminal.dashboard.json";

interface Placement {
  frame: string;
  position: { x: number; y: number; w: number; h: number };
  children?: Placement[];
}
interface BoardLike {
  title?: string;
  frames?: Placement[];
}

const byName = new Map(allFrameMetas.map((m) => [m.name, m]));

/**
 * Cards on boards that predate the measured envelope and sit outside it — the
 * debt this audit found rather than created. Every one of these is a card that
 * renders today with something clipped, truncated or marooned: `rates-board` at
 * three rows slices its third rate row in half, `funding-rate-chart` at three
 * rows cuts its x-axis labels off, `breathing` at 12x2 overflows its own circle
 * by 242px.
 *
 * They are listed rather than fixed because fixing them is a different change
 * with different consequences: the golden fixtures are verbatim copies of boards
 * a real person runs (editing one makes it a fiction), and editing the curated
 * seed re-seeds production on merge, overwriting any board edited in the
 * database since. So the list is the deliverable, and shrinking it is a
 * deliberate follow-up.
 *
 * A NEW violation still fails: this is an exact-match allowlist, not a filter.
 */
const KNOWN_UNDERSIZED = [
  "bitkub: clock w=2 < minW 3",
  "crypto-command: funding-rate-chart h=3 < minH 4",
  "crypto-command: funding-heatmap w=4 < minW 5",
  "macro-watch: rates-board h=3 < minH 4",
  "macro-watch: fx-board h=3 < minH 4",
  "macro-watch: news-feed w=3 < minW 4",
  "micky: clock w=2 < minW 3",
  "micky: calculator h=3 < minH 4",
  "micky: journal-score h=2 < minH 3",
  "micky: breathing h=2 < minH 3",
  "micky: breathing w=12 > maxW 5",
  "micky: options-max-pain w=4 < minW 5",
  "micky: options-oi-skew w=4 < minW 5",
  "micky: fx-trend-chart w=4 < minW 5",
  "quant-terminal: top-movers w=3 < minW 4",
  "quant-terminal: top-movers h=4 > maxH 3",
  "quant-terminal: rates-board h=3 < minH 4",
  "curated/derivatives-desk: funding-rate-chart h=3 < minH 4",
  "curated/gold-desk: metal-seasonality w=5 < minW 6",
  "curated/gold-desk: metal-cot-concentration h=5 < minH 6",
  "curated/fx-desk: fx-trend-chart w=4 < minW 5",
];

describe("frame layout envelope", () => {
  it("every frame declares a resize floor", () => {
    const missing = allFrameMetas
      .filter(
        (m) => !m.layout || m.layout.minW == null || m.layout.minH == null,
      )
      .map((m) => m.name);
    expect(missing, "frames missing layout.minW/minH").toEqual([]);
  });

  it("every envelope is coherent: 1 <= min <= default <= max", () => {
    const bad: string[] = [];
    for (const meta of allFrameMetas) {
      const l = meta.layout;
      if (!l) continue;
      const minW = l.minW ?? 1;
      const minH = l.minH ?? 1;
      if (minW < 1 || minH < 1) bad.push(`${meta.name}: min below 1`);
      if (l.w < minW) bad.push(`${meta.name}: w ${l.w} < minW ${minW}`);
      if (l.h < minH) bad.push(`${meta.name}: h ${l.h} < minH ${minH}`);
      if (l.maxW != null) {
        if (l.maxW < minW)
          bad.push(`${meta.name}: maxW ${l.maxW} < minW ${minW}`);
        if (l.maxW < l.w) bad.push(`${meta.name}: maxW ${l.maxW} < w ${l.w}`);
      }
      if (l.maxH != null) {
        if (l.maxH < minH)
          bad.push(`${meta.name}: maxH ${l.maxH} < minH ${minH}`);
        if (l.maxH < l.h) bad.push(`${meta.name}: maxH ${l.maxH} < h ${l.h}`);
      }
    }
    expect(bad).toEqual([]);
  });

  /**
   * A frame's floor must fit the standard board. `grid.columns` has no schema
   * maximum, but 12 is what every shipped board and the editor's palette use, so
   * a frame with minW 13 could never be placed on one.
   */
  it("no floor is wider than the standard 12-column board", () => {
    const tooWide = allFrameMetas
      .filter((m) => (m.layout?.minW ?? 1) > 12)
      .map((m) => `${m.name}: minW ${m.layout?.minW}`);
    expect(tooWide).toEqual([]);
  });

  it("every shipped board fits inside its frames' bounds", () => {
    const boards: { name: string; board: BoardLike }[] = [
      { name: "bitkub", board: bitkubSpec as BoardLike },
      { name: "crypto-command", board: cryptoCommandSpec as BoardLike },
      { name: "macro-watch", board: macroWatchSpec as BoardLike },
      { name: "micky", board: mickySpec as BoardLike },
      { name: "nvda-deepdive", board: nvdaDeepDiveSpec as BoardLike },
      { name: "quant-terminal", board: quantTerminalSpec as BoardLike },
    ];
    // The curated showcase is read from the seed file rather than imported: it
    // is a large generated export, and this test only needs its geometry.
    const seedPath = resolve(
      __dirname,
      "../apps/explorer/scripts/curated-seed.json",
    );
    const seed = JSON.parse(readFileSync(seedPath, "utf8")) as unknown;
    const seedRows = (Array.isArray(seed) ? seed : []) as {
      id?: string;
      spec?: BoardLike;
    }[];
    for (const row of seedRows)
      if (row.spec) boards.push({ name: `curated/${row.id}`, board: row.spec });

    const violations: string[] = [];
    for (const { name, board } of boards) {
      // Board-level placements only. A container's children are positioned in
      // the GROUP's own column/row units, which are unrelated to the board's —
      // a 2x1 child of a 3-column group is not "2 board columns wide".
      for (const item of board.frames ?? []) {
        const l = byName.get(item.frame)?.layout;
        if (!l) continue;
        const { w, h } = item.position;
        if (w < (l.minW ?? 1))
          violations.push(`${name}: ${item.frame} w=${w} < minW ${l.minW}`);
        if (h < (l.minH ?? 1))
          violations.push(`${name}: ${item.frame} h=${h} < minH ${l.minH}`);
        if (l.maxW != null && w > l.maxW)
          violations.push(`${name}: ${item.frame} w=${w} > maxW ${l.maxW}`);
        if (l.maxH != null && h > l.maxH)
          violations.push(`${name}: ${item.frame} h=${h} > maxH ${l.maxH}`);
      }
    }
    expect(violations.sort()).toEqual([...KNOWN_UNDERSIZED].sort());
  });
});
