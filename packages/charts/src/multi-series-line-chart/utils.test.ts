import { describe, expect, it, vi } from "vitest";
import * as d3 from "d3";
import {
  combineDateValues,
  getAllDates,
  resolveYDomain,
  sortSeriesByLastValue,
} from "./utils";
import { calculateLegendPositions } from "./d3-rendering/calculate-legend-positions";
import { LEGEND } from "./constants";
import type { ChartScales, LegendItem, MultiSeriesData } from "./types";

/**
 * The multi-series line chart's pure input-shaping and legend-layout kernel:
 * `getAllDates` / `combineDateValues` (how N series become one aligned table)
 * and `calculateLegendPositions` (where the trailing value labels land).
 *
 * Nothing else in the suite can reach any of this. Every chart in this package
 * gates its d3 effect on a container width read from `getBoundingClientRect()`,
 * which is 0 under jsdom — so no SVG is ever built and "all frames render"
 * proves nothing about chart internals. The nightly Chromium smoke only flags
 * error cards and thrown exceptions, and a legend whose labels sit on top of
 * each other, or off the top of the canvas, renders "successfully". Meanwhile
 * two or more series ending at near-identical values is the COMMON case
 * (price-compare, funding comparison, metal-compare, DXY overlays), so the
 * collision pass runs on nearly every real board.
 *
 * Everything here is a pure function over plain data: no jsdom, no render, no
 * SVG snapshot. The scales are real d3 scales, configured so the pixel
 * arithmetic stays readable — the y scale is deliberately an identity map
 * (domain === range), so "a series ending at 151" sits at y = 151.
 *
 * PRODUCTION ORDER IS LOAD-BEARING. `createScales` builds the y scale
 * INVERTED (`.range([innerHeight, 0])`, create-scales.ts:15) and
 * `MultiSeriesLineChart` sorts the series DESCENDING by last value before
 * handing them over as `filteredSeries` (index.tsx:61-71, the same comparator
 * `utils.ts` exports as `sortSeriesByLastValue`). Those two facts are not
 * incidental to the collision algorithm — they are what makes it correct:
 * together they guarantee the forward pass sees `rectY` in NON-DECREASING
 * order, and only while `usedPositions` stays sorted does
 * `usedPositions.findLast(...)` mean "the lowest box placed so far" (the thing
 * the code clearly intends) instead of "whichever overlapper happened to be
 * pushed last". An identity y scale reproduces that pixel order whenever the
 * values arrive ASCENDING, which is what every test below does — except the
 * one that deliberately scrambles the order to pin the exported function's
 * behaviour on input the component cannot emit. Each test says which of the
 * two it is, and one test rebuilds a genuinely inverted range so the mimicry
 * is not taken on faith.
 *
 * The legend layout is asserted as a PROPERTY (no two label boxes overlap; a
 * box stays on the canvas) rather than as a snapshot, because the exact
 * pixel stack is an implementation detail while "labels are legible" is the
 * actual contract. Two of those properties do not currently hold — see the
 * KNOWN BUG markers. Only ONE of the two ships: the off-canvas label is
 * reachable from production order, the same-pixel stack is latent.
 */

const DAY = 86_400_000;
const D0 = Date.parse("2024-01-01T00:00:00Z");

/** Width of the plot area in px; the x scale spans exactly 10 days across it. */
const X_RANGE = 300;
/** 300px / 10 days ⇒ 30px per day, so every expected `left` is a round number. */
const PX_PER_DAY = X_RANGE / 10;

const MARGIN_TOP = 20;
const LEFT_MARGIN = 50;

const RECT_H = LEGEND.rectHeight;

const scales: ChartScales = {
  xScale: d3
    .scaleTime()
    .domain([new Date(D0), new Date(D0 + 10 * DAY)])
    .range([0, X_RANGE]),
  // Identity: yScale(v) === v, so a series' last value IS its label anchor.
  // Unit domain and range on purpose — a [0, height] identity normalises
  // through a division and comes back 1e-14 off for most integers.
  yScale: d3.scaleLinear().domain([0, 1]).range([0, 1]),
};

const COLORS: Record<string, string> = {
  a: "#111111",
  b: "#222222",
  c: "#333333",
  d: "#444444",
  e: "#555555",
};

/** An ISO date-only string (UTC), exactly the shape every consumer frame emits. */
function isoDay(dayIndex: number): string {
  return new Date(D0 + dayIndex * DAY).toISOString().slice(0, 10);
}

/**
 * A series of `days` daily points ending at `lastValue`. Earlier points are
 * parked well below the anchor so they never influence the legend, which only
 * ever reads `data.at(-1)`.
 */
function seriesEndingAt(
  id: string,
  lastValue: number,
  days = 11,
): MultiSeriesData {
  return {
    id,
    name: id.toUpperCase(),
    color: "#000000",
    data: Array.from({ length: days }, (_, i) => ({
      date: isoDay(i),
      value: i === days - 1 ? lastValue : 1,
    })),
  };
}

function layout(
  series: MultiSeriesData[],
  formatValue?: (value: number) => string,
): LegendItem[] {
  return calculateLegendPositions(
    series,
    COLORS,
    scales,
    LEFT_MARGIN,
    MARGIN_TOP,
    formatValue,
  );
}

/**
 * Every pair of labels whose `rectHeight`-tall boxes intersect. Boxes that
 * merely touch (one's bottom === the next one's top) are not overlapping —
 * that is precisely the stacked-flush result the algorithm aims for.
 */
function overlappingPairs(items: LegendItem[]): string[] {
  const pairs: string[] = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.top < b.top + RECT_H && b.top < a.top + RECT_H) {
        pairs.push(`${a.id}/${b.id}`);
      }
    }
  }
  return pairs;
}

describe("getAllDates", () => {
  it("unions and dedupes dates across series", () => {
    const a: MultiSeriesData = {
      id: "a",
      name: "A",
      color: "#000",
      data: [
        { date: "2024-01-03", value: 1 },
        { date: "2024-01-01", value: 2 },
      ],
    };
    const b: MultiSeriesData = {
      id: "b",
      name: "B",
      color: "#000",
      data: [
        { date: "2024-01-02", value: 3 },
        // Shared with `a` — must appear once, not twice.
        { date: "2024-01-01", value: 4 },
      ],
    };

    expect(getAllDates([a, b])).toEqual([
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
    ]);
    expect(getAllDates([])).toEqual([]);
    expect(getAllDates([{ ...a, data: [] }])).toEqual([]);
  });

  it("sorts full ISO-8601 timestamps chronologically", () => {
    // The shape every consumer actually passes: new Date(t).toISOString().
    const stamps = [
      new Date(D0 + 2 * DAY).toISOString(),
      new Date(D0).toISOString(),
      new Date(D0 + 1 * DAY).toISOString(),
    ];
    const series: MultiSeriesData = {
      id: "a",
      name: "A",
      color: "#000",
      data: stamps.map((date) => ({ date, value: 1 })),
    };

    const sorted = getAllDates([series]);
    expect(sorted).toEqual([stamps[1], stamps[2], stamps[0]]);
    expect(sorted.map((d) => Date.parse(d))).toEqual([
      D0,
      D0 + DAY,
      D0 + 2 * DAY,
    ]);
  });

  it("sorts LEXICOGRAPHICALLY, so a non-ISO date string scrambles the axis", () => {
    // UNDOCUMENTED PRECONDITION: the sort is Array#sort's default string
    // comparison, not a date sort. ISO-8601 is the one format where the two
    // agree; a localised or M/D/YYYY string silently reorders the x axis. All
    // consumer frames satisfy this by discipline (new Date(t).toISOString()) —
    // nothing in the type (`date: string`) or the function enforces it.
    const series: MultiSeriesData = {
      id: "a",
      name: "A",
      color: "#000",
      data: [
        { date: "12/31/2023", value: 1 },
        { date: "1/1/2024", value: 2 },
        { date: "2/1/2024", value: 3 },
      ],
    };

    const sorted = getAllDates([series]);
    // December 2023 lands in the MIDDLE, after January 2024.
    expect(sorted).toEqual(["1/1/2024", "12/31/2023", "2/1/2024"]);
    const times = sorted.map((d) => Date.parse(d));
    expect(times[1]).toBeLessThan(times[0]);
  });
});

describe("combineDateValues", () => {
  const long = seriesEndingAt("a", 12, 3); // 2024-01-01..03
  const short: MultiSeriesData = {
    id: "b",
    name: "B",
    color: "#000",
    // Only the last of the three shared days.
    data: [{ date: isoDay(2), value: 99 }],
  };

  it("fills a series' missing date with 0, not a skip and not NaN", () => {
    // This zero-fill is why `metals-shared`'s alignSeries/onSharedFixDays
    // exist: without an intersection the shorter series draws a hard cliff
    // from 0 across every date it does not carry, and reads "$0" on hover.
    const combined = combineDateValues(getAllDates([long, short]), [
      long,
      short,
    ]);

    expect(combined).toHaveLength(3);
    expect(combined.map((p) => p.values.b)).toEqual([0, 0, 99]);
    // Explicitly: present as a key, exactly 0, not undefined and not NaN.
    for (const point of combined.slice(0, 2)) {
      expect(Object.keys(point.values).sort()).toEqual(["a", "b"]);
      expect(point.values.b).toBe(0);
      expect(Number.isNaN(point.values.b)).toBe(false);
    }
    expect(combined.map((p) => p.values.a)).toEqual([1, 1, 12]);
  });

  it("parses each date string into a Date and keeps the caller's order", () => {
    // It maps over `allDates` verbatim — it neither sorts nor validates, so a
    // caller that skips getAllDates gets exactly the order it asked for.
    const combined = combineDateValues([isoDay(2), isoDay(0)], [long, short]);

    expect(combined.map((p) => p.date.getTime())).toEqual([D0 + 2 * DAY, D0]);
    expect(combined[0].date).toBeInstanceOf(Date);
    expect(combined.map((p) => p.values.b)).toEqual([99, 0]);
  });

  it("zero-fills every series for a date no series carries", () => {
    const combined = combineDateValues(["2024-06-01"], [long, short]);
    expect(combined).toEqual([
      { date: new Date("2024-06-01"), values: { a: 0, b: 0 } },
    ]);
  });
});

describe("calculateLegendPositions", () => {
  it("stacks flush, 22px apart, when several series end on the same value", () => {
    const items = layout([
      seriesEndingAt("a", 150),
      seriesEndingAt("b", 150),
      seriesEndingAt("c", 150),
    ]);

    // The anchor is yScale(150) - rectHeight/2 = 139, then +22 per collision;
    // marginTop (20) is added on the way out. All three values are equal, so
    // input order is moot — this is production order whichever way it is read.
    expect(items.map((i) => i.top)).toEqual([203, 181, 159]);
    // The output order is the INPUT order reversed: the second pass calls
    // `.reverse()` on the position array in place and the item mapping runs
    // over that reversed array afterwards.
    expect(items.map((i) => i.id)).toEqual(["c", "b", "a"]);
    expect(overlappingPairs(items)).toEqual([]);
  });

  it("keeps a tight cluster of near-identical values legible", () => {
    // The realistic case: four series a few px apart, fed ASCENDING, i.e. in
    // production's pixel order. The whole cluster is shifted UP so the labels
    // come out flush — "a" anchors at y=89 and ends up at 67 (+20 marginTop
    // = 87).
    const items = layout([
      seriesEndingAt("a", 100),
      seriesEndingAt("b", 103),
      seriesEndingAt("c", 106),
      seriesEndingAt("d", 109),
    ]);

    expect(items.map((i) => i.id)).toEqual(["d", "c", "b", "a"]);
    expect(items.map((i) => i.top)).toEqual([153, 131, 109, 87]);
    expect(overlappingPairs(items)).toEqual([]);
    // Property, not snapshot: every gap is at least a full label height.
    const tops = items.map((i) => i.top).sort((x, y) => x - y);
    for (let i = 1; i < tops.length; i++) {
      expect(tops[i] - tops[i - 1]).toBeGreaterThanOrEqual(RECT_H);
    }
  });

  it("stacks a colliding trio collision-free in the order the component feeds it", () => {
    // The production path for the exact value set the next test scrambles,
    // built without any of this file's identity-scale shorthand: series sorted
    // descending by last value (`sortSeriesByLastValue`, the comparator
    // index.tsx:61-71 inlines) against a y range inverted the way
    // `createScales` inverts it. This is the counterpart that makes the next
    // test's "latent, not shipping" claim checkable rather than asserted.
    const inverted: ChartScales = {
      xScale: scales.xScale,
      // A 256px-tall plot, range inverted like production's [innerHeight, 0].
      // 256 is a power of two, so the normalisation round-trips exactly and
      // yScale(v) === 256 - v for every value here.
      yScale: d3.scaleLinear().domain([0, 256]).range([256, 0]),
    };
    const series = sortSeriesByLastValue([
      seriesEndingAt("a", 151),
      seriesEndingAt("b", 111),
      seriesEndingAt("c", 129),
    ]);

    // Highest value first — and because the range is inverted, that is also
    // LOWEST pixel first, i.e. ascending `rectY` into the forward pass.
    expect(series.map((s) => s.id)).toEqual(["a", "c", "b"]);
    const items = calculateLegendPositions(
      series,
      COLORS,
      inverted,
      LEFT_MARGIN,
      MARGIN_TOP,
    );

    // a=151 anchors highest (y=105), b=111 lowest (y=145); the trio comes out
    // flush, 22px apart, with nothing sharing a pixel.
    expect(items.map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(items.map((i) => i.top)).toEqual([158, 136, 114]);
    expect(overlappingPairs(items)).toEqual([]);
  });

  it("resolves collisions ORDER-DEPENDENTLY: a non-production order stacks two labels on one pixel", () => {
    // Identical value set, two series orders. The forward pass picks its
    // reference box with `findLast` — the most recently PLACED overlapper, not
    // the lowest one — and the backward pass then rewrites `top` without
    // updating the matching `bottom`, so which arrangement survives depends on
    // the order the series arrive in.
    //
    // REACHABILITY: only `good` is production-shaped. 111/129/151 is ascending,
    // which under this file's identity scale is the same pixel order the
    // component always produces (descending values against an inverted range —
    // see the test above, which builds that literally). While `usedPositions`
    // stays sorted, `findLast` genuinely is "the lowest placed box" and the two
    // passes cannot disagree. `bad`'s 151/111/129 is non-monotonic, so
    // `MultiSeriesLineChart` cannot emit it: the pin below guards the exported
    // function's own contract (it accepts any array) and records a hazard that
    // is LATENT, not one that ships today.
    const values: Record<string, number> = { a: 151, b: 111, c: 129 };
    const build = (ids: string[]) =>
      layout(ids.map((id) => seriesEndingAt(id, values[id])));

    const good = build(["b", "c", "a"]);
    expect(good.map((i) => i.id)).toEqual(["a", "c", "b"]);
    expect(good.map((i) => i.top)).toEqual([164, 142, 120]);
    expect(overlappingPairs(good)).toEqual([]);

    const bad = build(["a", "b", "c"]);
    expect(bad.map((i) => i.id)).toEqual(["c", "b", "a"]);
    // KNOWN BUG: the same three values in a non-production order put "b" and
    // "a" on the identical top (120), so the two trailing labels render exactly
    // on top of each other — should be a collision-free stack for ANY input
    // order. Latent while the only caller pre-sorts descending (see
    // REACHABILITY above); it turns into a live rendering bug the moment a
    // caller drops that sort, sorts ascending, or reaches the function through
    // its module path. Pinned so the suite stays green; fixing the source must
    // flip this assertion.
    expect(bad.map((i) => i.top)).toEqual([142, 120, 120]);
    expect(overlappingPairs(bad)).toEqual(["b/a"]);
  });

  it("pushes labels off the top of the canvas instead of clamping to the plot", () => {
    // Five series clustered just under the plot's top edge. The backward pass
    // relieves the pile-up by walking upward — with no notion of where the plot
    // starts, because the function is never told the plot height.
    //
    // REACHABILITY: unlike the same-pixel hazard above, this one SHIPS. The
    // input is ascending (12/15/18/21/24), i.e. production's own pixel order,
    // and the mechanism needs nothing exotic: the FOURTH series inside one
    // label height is the first whose anchor clears the last placed box while
    // still overlapping the one before it, so the forward pass starts emitting
    // duplicate tops, and every series after that walks the top of the stack
    // another rectHeight up. Production leaves very little headroom for that —
    // `calculateYDomain` pads the domain by 10 % of the data range, so on a
    // default 400px chart the highest series anchors roughly one label height
    // below the plot's top edge, and a five-series cluster is already enough to
    // put the topmost label above the SVG origin.
    const items = layout([
      seriesEndingAt("a", 12),
      seriesEndingAt("b", 15),
      seriesEndingAt("c", 18),
      seriesEndingAt("d", 21),
      seriesEndingAt("e", 24),
    ]);

    expect(items.map((i) => i.id)).toEqual(["e", "d", "c", "b", "a"]);
    // Collision-free, but two of the five have escaped the canvas.
    expect(overlappingPairs(items)).toEqual([]);
    // KNOWN BUG: labels are pushed to a negative `top` (above the SVG's own
    // origin, so clipped away entirely) — should be clamped to stay inside the
    // plot bounds. Reachable from the only production caller (see REACHABILITY
    // above), so this is shipping behaviour, not a latent edge. Pinned so the
    // suite stays green; fixing the source must flip this assertion.
    expect(items.map((i) => i.top)).toEqual([65, 43, 21, -1, -23]);
    expect(items.filter((i) => i.top < 0).map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("anchors `left` on each series' own last date", () => {
    // legendX = xScale(lastDate) + 8, minus paddingX (4), plus the dynamic left
    // margin: a series ending on day 10 sits at 300 + 4 + 50 = 354, one ending
    // on day 5 at 150 + 4 + 50 = 204.
    const items = layout([
      seriesEndingAt("a", 300),
      seriesEndingAt("b", 100, 6),
    ]);

    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get("a")!.left).toBe(354);
    expect(byId.get("b")!.left).toBe(204);
    // The gap between the two is exactly the five days they differ by.
    expect(byId.get("a")!.left - byId.get("b")!.left).toBe(5 * PX_PER_DAY);
  });

  it("formats the trailing value with parseMarketData by default", () => {
    const items = layout([
      seriesEndingAt("a", 1234.5),
      seriesEndingAt("b", 2_500_000_000_000),
    ]);

    const byId = new Map(items.map((i) => [i.id, i]));
    expect(byId.get("a")!.value).toBe("1,234.5");
    expect(byId.get("b")!.value).toBe("2.50T");
  });

  it("hands the raw last value to formatValue when one is supplied", () => {
    const formatValue = vi.fn((value: number) => `฿${value.toFixed(1)}`);
    const items = layout([seriesEndingAt("a", 1234.5)], formatValue);

    expect(formatValue).toHaveBeenCalledTimes(1);
    // The USD number, unformatted — the callback owns symbol and rounding.
    expect(formatValue).toHaveBeenCalledWith(1234.5);
    expect(items[0].value).toBe("฿1234.5");
  });

  it("takes the colour from the seriesColors map, not the series' own colour", () => {
    // The chart re-assigns palette colours by id; the series object's `color`
    // is the caller's hint and must not win.
    const series = { ...seriesEndingAt("a", 150), color: "#ff0000" };
    const items = layout([series]);

    expect(items).toHaveLength(1);
    expect(items[0].color).toBe(COLORS.a);
    expect(items[0].displayText).toBe("A");
    expect(items[0].seriesData).toBe(series);
  });

  it("drops a series with no data points and returns nothing for no series", () => {
    const empty: MultiSeriesData = {
      id: "b",
      name: "B",
      color: "#000",
      data: [],
    };
    const items = layout([seriesEndingAt("a", 150), empty]);

    expect(items.map((i) => i.id)).toEqual(["a"]);
    expect(layout([])).toEqual([]);
  });
});

describe("resolveYDomain", () => {
  const corr: MultiSeriesData[] = [
    {
      id: "corr",
      name: "Correlation",
      color: "#000",
      data: [
        { date: "2026-01-01", value: 0.1 },
        { date: "2026-01-02", value: 0.3 },
      ],
    },
  ];

  it("honours a pinned domain instead of fitting to the data", () => {
    // The regression this guards: `yDomain` was declared as a prop and then
    // shadowed by the fitted domain, so five frames asked for a scale and
    // silently got another one. A pinned [-1, 1] must survive data spanning
    // only 0.1-0.3, or the chart flatters a weak correlation into a strong one.
    expect(resolveYDomain(corr, [-1, 1])).toEqual([-1, 1]);
  });

  it("fits the data when no domain is pinned", () => {
    const [min, max] = resolveYDomain(corr);
    expect(min).toBeLessThanOrEqual(0.1);
    expect(max).toBeGreaterThanOrEqual(0.3);
  });

  it("keeps a pinned domain narrower than the data", () => {
    // Clamping is the caller's stated intent, not a mistake to correct.
    expect(resolveYDomain(corr, [0, 0.2])).toEqual([0, 0.2]);
  });
});
