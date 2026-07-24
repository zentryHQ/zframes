import { describe, expect, it } from "vitest";
import type { SeriesPoint } from "@zframes/core";
import {
  alignSeries,
  allTimeHigh,
  annualReturns,
  cagrPct,
  correlation,
  cotNet,
  downsample,
  drawdownSeries,
  durationSince,
  monthlyReturns,
  pctChange,
  percentileRank,
  pricePerUnit,
  ratioSeries,
  rebaseToPct,
  rollingVolatility,
  simpleReturns,
  sliceYears,
  timeframeFor,
  toTroyOunces,
  valueAtOrBefore,
} from "./metals-shared";

const DAY = 86_400_000;

/** A daily series starting at `start`, one point per day. */
function series(start: string, values: number[]): SeriesPoint[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return values.map((value, i) => ({ time: t0 + i * DAY, value }));
}

/** A series with one point on the last day of each listed month. */
function monthEnds(entries: [string, number][]): SeriesPoint[] {
  return entries.map(([date, value]) => ({
    time: Date.parse(`${date}T00:00:00Z`),
    value,
  }));
}

describe("unit conversion", () => {
  it("prices a troy ounce into other weight units", () => {
    // A troy ounce is 31.1034768 g by definition.
    expect(pricePerUnit(3110.34768, "gram")).toBeCloseTo(100, 6);
    expect(pricePerUnit(4000, "ounce")).toBe(4000);
    // A kilogram is 32.1507 troy ounces, so it costs ~32x an ounce.
    expect(pricePerUnit(4000, "kilogram")).toBeCloseTo(128_602.99, 2);
    // A tola is 11.6638 g — a little over a third of an ounce.
    expect(pricePerUnit(4000, "tola")).toBeCloseTo(1500, 2);
  });

  it("converts a holding back into troy ounces", () => {
    expect(toTroyOunces(31.1034768, "gram")).toBeCloseTo(1, 9);
    expect(toTroyOunces(1, "kilogram")).toBeCloseTo(32.1507466, 6);
    expect(toTroyOunces(2, "ounce")).toBe(2);
  });
});

describe("windowing", () => {
  it("keeps only the trailing window, measured from the newest point", () => {
    const points = series(
      "2020-01-01",
      Array.from({ length: 800 }, (_, i) => i),
    );
    const year = sliceYears(points, 1);
    expect(year.length).toBeLessThan(points.length);
    expect(year[year.length - 1]).toEqual(points[points.length - 1]);
    // Everything kept is inside a year of the last point.
    const cutoff = points[points.length - 1].time - 365.25 * DAY;
    expect(year.every((p) => p.time >= cutoff)).toBe(true);
  });

  it("returns an empty window for an empty series", () => {
    expect(sliceYears([], 5)).toEqual([]);
  });

  it("downsamples by even stride and always keeps the last point", () => {
    const items = Array.from({ length: 1000 }, (_, i) => i);
    const thinned = downsample(items, 100);
    expect(thinned.length).toBeLessThanOrEqual(101);
    expect(thinned[0]).toBe(0);
    expect(thinned[thinned.length - 1]).toBe(999);
    // Short series pass through untouched.
    expect(downsample([1, 2, 3], 100)).toEqual([1, 2, 3]);
  });

  it("picks an axis granularity that matches the window", () => {
    expect(timeframeFor(0.2)).toBe("1M");
    expect(timeframeFor(1)).toBe("YTD");
    expect(timeframeFor(5)).toBe("1Y");
    expect(timeframeFor(30)).toBe("5Y");
  });
});

describe("returns", () => {
  it("computes percent change and guards a zero base", () => {
    expect(pctChange(100, 110)).toBeCloseTo(10, 9);
    expect(pctChange(100, 90)).toBeCloseTo(-10, 9);
    expect(pctChange(0, 90)).toBe(0);
  });

  it("computes a compound annual rate", () => {
    // Doubling over 10 years is ~7.18%/yr.
    expect(cagrPct(100, 200, 10)).toBeCloseTo(7.177, 3);
    expect(cagrPct(100, 100, 5)).toBeCloseTo(0, 9);
    expect(cagrPct(0, 100, 5)).toBe(0);
  });

  it("pairs calendar years and skips a gap in the data", () => {
    const points = monthEnds([
      ["2020-12-31", 100],
      ["2021-12-31", 120],
      // 2022 missing entirely — 2023 is not a one-year return off 2021.
      ["2023-12-31", 180],
      ["2024-12-31", 90],
    ]);
    expect(annualReturns(points)).toEqual([
      { year: 2021, pct: 20 },
      { year: 2024, pct: -50 },
    ]);
  });

  it("takes the last observation of each month", () => {
    const points = [
      ...series("2024-01-29", [100, 101, 102]), // Jan 29-31
      ...series("2024-02-27", [110, 111]), // Feb 27-28
      ...series("2024-03-30", [99]), // Mar 30
    ];
    const months = monthlyReturns(points);
    expect(months).toHaveLength(2);
    expect(months[0]).toMatchObject({ year: 2024, month: 1 });
    expect(months[0].pct).toBeCloseTo(pctChange(102, 111), 9);
    expect(months[1].pct).toBeCloseTo(pctChange(111, 99), 9);
  });

  it("differences consecutive points", () => {
    expect(simpleReturns(series("2024-01-01", [100, 110, 99]))).toEqual([
      10, -10,
    ]);
  });
});

describe("drawdown and records", () => {
  it("measures distance from the running peak, not the window high", () => {
    const dd = drawdownSeries(series("2024-01-01", [100, 120, 60, 90, 130]));
    expect(dd.map((p) => Math.round(p.value))).toEqual([0, 0, -50, -25, 0]);
  });

  it("finds the all-time high with its date", () => {
    const points = series("2024-01-01", [100, 500, 200]);
    expect(allTimeHigh(points)).toEqual(points[1]);
    expect(allTimeHigh([])).toBeNull();
  });
});

describe("volatility", () => {
  it("returns nothing until the window is warm", () => {
    expect(rollingVolatility(series("2024-01-01", [1, 2, 3]), 30)).toEqual([]);
  });

  it("reads zero for a flat series and rises with dispersion", () => {
    const flat = series("2024-01-01", Array(40).fill(100));
    const flatVol = rollingVolatility(flat, 20);
    expect(flatVol.length).toBeGreaterThan(0);
    expect(flatVol[flatVol.length - 1].value).toBeCloseTo(0, 9);

    // A ±2%/day sawtooth annualises to a large number; the point is that it is
    // both finite and far above the flat case.
    const choppy = series(
      "2024-01-01",
      Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 100 : 102)),
    );
    const choppyVol = rollingVolatility(choppy, 20);
    expect(choppyVol[choppyVol.length - 1].value).toBeGreaterThan(20);
  });
});

describe("ranking and correlation", () => {
  it("ranks a value inside its own sample", () => {
    const values = [1, 2, 3, 4, 5];
    expect(percentileRank(values, 5)).toBe(100);
    expect(percentileRank(values, 3)).toBe(60);
    expect(percentileRank(values, 0)).toBe(0);
    expect(percentileRank([], 1)).toBe(0);
  });

  it("correlates perfectly, inversely, and not at all", () => {
    expect(correlation([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1, 9);
    expect(correlation([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1, 9);
    // A constant leg has no variance, so the coefficient is undefined → 0.
    expect(correlation([1, 2, 3], [5, 5, 5])).toBe(0);
    expect(correlation([1], [1])).toBe(0);
  });
});

describe("pairing two series", () => {
  it("aligns on shared UTC days and drops the rest", () => {
    const gold = series("2024-01-01", [2000, 2100, 2200]);
    // Silver skips the middle day — a naive zip would compare the wrong dates.
    const silver = [
      { time: Date.parse("2024-01-01T00:00:00Z"), value: 25 },
      { time: Date.parse("2024-01-03T12:00:00Z"), value: 27.5 },
    ];
    const aligned = alignSeries(gold, silver);
    expect(aligned).toHaveLength(2);
    expect(aligned[1]).toMatchObject({ a: 2200, b: 27.5 });
  });

  it("builds a ratio on the shared days and skips a zero denominator", () => {
    const gold = series("2024-01-01", [2000, 2100]);
    const silver = series("2024-01-01", [25, 0]);
    const ratio = ratioSeries(gold, silver);
    expect(ratio).toHaveLength(1);
    expect(ratio[0].value).toBe(80);
  });

  it("rebases a series to 0% at its first point", () => {
    const rebased = rebaseToPct(series("2024-01-01", [200, 220, 180]));
    expect(rebased.map((p) => p.value)).toEqual([0, 10, -10]);
    expect(rebaseToPct([])).toEqual([]);
  });

  it("looks up the last value at or before a time", () => {
    const points = series("2024-01-01", [10, 20, 30]);
    expect(valueAtOrBefore(points, points[1].time)).toBe(20);
    expect(valueAtOrBefore(points, points[1].time + DAY / 2)).toBe(20);
    expect(valueAtOrBefore(points, points[0].time - DAY)).toBeNull();
  });
});

describe("COT helpers", () => {
  it("nets the non-commercial legs", () => {
    expect(
      cotNet({ noncommercialLong: 224_785, noncommercialShort: 40_875 }),
    ).toBe(183_910);
  });
});

describe("durationSince", () => {
  const now = Date.parse("2026-07-24T00:00:00Z");

  it("scales the unit to the distance", () => {
    expect(durationSince(now - 10 * DAY, now)).toBe("10d");
    expect(durationSince(now - 200 * DAY, now)).toBe("7mo");
    expect(durationSince(now - 800 * DAY, now)).toBe("2y 2mo");
    expect(durationSince(now - 365 * 20 * DAY, now)).toBe("19y 12mo");
    // A future timestamp clamps at zero instead of reporting negative days.
    expect(durationSince(now + 5 * DAY, now)).toBe("0d");
  });
});
