import { describe, expect, it } from "vitest";
import type { SeriesPoint } from "@zframes/spec";
import {
  ema,
  normalize,
  rsi,
  sma,
  tail,
  toSparkline,
  windowDays,
} from "./indicators";
import { zoneOf, type Zone } from "./cycle-shared";

/**
 * Pins the pure indicator kernel behind the cycle family — Mayer Multiple,
 * Pi Cycle, MA-multiplier, RSI momentum, cycle-signals — plus `zoneOf`, the
 * band picker that chooses the valuation-zone LABEL on nine gauges.
 *
 * Why this file exists: every failure mode in here is silent. An off-by-one
 * warm-up window (`mayer-multiple` waits on a 200-day SMA), a wrong Wilder
 * seed index, a `1/period` instead of `2/(period+1)` smoothing factor, or a
 * flipped band strictness all still render a perfectly laid-out card — just
 * with a confidently wrong trading signal on it. `frame-smoke` only checks
 * that a frame renders, so it cannot see any of that. Hence: hand-computed
 * expectations, boundary values on both sides of every band edge, and the
 * degenerate inputs (empty, flat, too-short, non-positive period) that the
 * guards inside these functions exist to survive.
 */

const DAY = 86_400_000;

/** A daily series starting at `start`, one point per day. */
function series(start: string, values: number[]): SeriesPoint[] {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  return values.map((value, i) => ({ time: t0 + i * DAY, value }));
}

describe("sma", () => {
  it("stays null through the warm-up, then reports the trailing mean", () => {
    // period 3 over 1..6: out[2] is the first mean, (1+2+3)/3 = 2.
    expect(sma([1, 2, 3, 4, 5, 6], 3)).toEqual([null, null, 2, 3, 4, 5]);
  });

  it("puts the first non-null at exactly index period-1", () => {
    // The load-bearing off-by-one: mayer-multiple needs a 200-day SMA, so a
    // one-index slip changes which day the gauge first reports.
    const out = sma([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4);
    expect(out.findIndex((v) => v !== null)).toBe(3);
    expect(out[2]).toBeNull();
    expect(out[3]).toBe(2.5); // (1+2+3+4)/4
  });

  it("evicts the value that leaves the window", () => {
    // Hand-computed with a spike so a missing `sum -= values[i - period]`
    // would show: without eviction out[5] would be 170/3, not 110/3.
    const out = sma([10, 20, 30, 100, 5, 5], 3);
    expect(out.slice(0, 2)).toEqual([null, null]);
    expect(out[2]).toBeCloseTo(20, 9); // (10 + 20 + 30) / 3
    expect(out[3]).toBeCloseTo(50, 9); // (20 + 30 + 100) / 3 — 10 dropped
    expect(out[4]).toBeCloseTo(45, 9); // (30 + 100 + 5) / 3
    expect(out[5]).toBeCloseTo(110 / 3, 9); // (100 + 5 + 5) / 3
  });

  it("is the identity at period 1", () => {
    expect(sma([5, 7, 11], 1)).toEqual([5, 7, 11]);
  });

  it("returns all nulls when the period outruns the series", () => {
    expect(sma([1, 2], 5)).toEqual([null, null]);
  });

  it("returns an all-null array of input length for a non-positive period", () => {
    // The `period <= 0` guard returns early: same length, no NaN, no 1/0.
    expect(sma([1, 2, 3], 0)).toEqual([null, null, null]);
    expect(sma([1, 2, 3], -4)).toEqual([null, null, null]);
  });

  it("returns [] for an empty series", () => {
    expect(sma([], 3)).toEqual([]);
  });
});

describe("ema", () => {
  it("seeds out[0] from the first value, not from zero", () => {
    expect(ema([10, 20, 30], 3)[0]).toBe(10);
    expect(ema([250, 1, 1], 5)[0]).toBe(250);
  });

  it("smooths with 2/(period+1)", () => {
    // period 3 → k = 0.5. out[1] = 20*0.5 + 10*0.5 = 15;
    // out[2] = 30*0.5 + 15*0.5 = 22.5.
    // A 1/period factor (0.333…) would put out[1] at 13.33, not 15.
    expect(ema([10, 20, 30], 3)).toEqual([10, 15, 22.5]);
  });

  it("uses k = 0.4 at period 4", () => {
    // out[1] = 200*0.4 + 100*0.6 = 140.
    expect(ema([100, 200], 4)[1]).toBeCloseTo(140, 9);
  });

  it("reports a value at every index — no null prefix, unlike sma", () => {
    const out = ema([1, 2, 3, 4, 5], 10);
    expect(out).toHaveLength(5);
    expect(out[0]).toBe(1);
    // A long period lags a rising series: still climbing, still short of 5.
    expect(out[4]).toBeGreaterThan(out[3]);
    expect(out[4]).toBeLessThan(5);
  });

  it("stays flat on a flat series", () => {
    expect(ema([7, 7, 7, 7], 3)).toEqual([7, 7, 7, 7]);
  });

  it("handles the empty and single-point series", () => {
    expect(ema([], 5)).toEqual([]);
    expect(ema([42], 5)).toEqual([42]);
  });
});

describe("rsi", () => {
  const rising = Array.from({ length: 21 }, (_, i) => 100 + i);
  const falling = Array.from({ length: 21 }, (_, i) => 100 - i);

  it("leaves the warm-up null and seeds at exactly index `period`", () => {
    const out = rsi(rising); // default period 14
    expect(out).toHaveLength(21);
    expect(out.slice(0, 14).every((v) => v === null)).toBe(true);
    expect(out.findIndex((v) => v !== null)).toBe(14);
  });

  it("reads 100 for an unbroken advance and holds it", () => {
    // The avgLoss === 0 guard: no losses in the window → RS is infinite.
    const out = rsi(rising);
    expect(out[14]).toBe(100);
    expect(out.slice(14).every((v) => v === 100)).toBe(true);
  });

  it("reads 0 for an unbroken decline", () => {
    const out = rsi(falling);
    expect(out[14]).toBe(0);
    expect(out[20]).toBe(0);
  });

  it("returns all nulls when there are not MORE than `period` values", () => {
    // The boundary is `values.length <= period`: 14 values is still too few.
    const fifteen = Array.from({ length: 15 }, (_, i) => 100 + i);
    const short = rsi(fifteen.slice(0, 14), 14);
    expect(short).toHaveLength(14);
    expect(short.every((v) => v === null)).toBe(true);
    // One more value and the seed lands.
    expect(rsi(fifteen, 14)[14]).toBe(100);
    expect(rsi([1, 2, 3], 14)).toEqual([null, null, null]);
  });

  it("matches a hand-computed Wilder sequence", () => {
    // period 2 over [100, 110, 105, 115].
    // Seed from the first 2 deltas (+10, -5): avgGain 5, avgLoss 2.5,
    // RS 2 → 100 - 100/3 = 66.67 at index 2 (= period).
    // Next delta +10: avgGain (5*1 + 10)/2 = 7.5, avgLoss (2.5*1 + 0)/2 =
    // 1.25, RS 6 → 100 - 100/7 = 85.71.
    const out = rsi([100, 110, 105, 115], 2);
    expect(out[0]).toBeNull();
    expect(out[1]).toBeNull();
    expect(out[2]).toBeCloseTo(200 / 3, 9);
    expect(out[3]).toBeCloseTo(600 / 7, 9);
  });

  it("smooths forward with (avg*(period-1) + x)/period", () => {
    // period 3: three +1 days seed avgGain 1 / avgLoss 0 → 100 at index 3.
    // Then a -13 crash: avgGain (1*2 + 0)/3 = 2/3, avgLoss (0*2 + 13)/3 =
    // 13/3, RS = 2/13 → 100 - 100/(15/13) = 40/3 ≈ 13.33.
    const out = rsi([100, 101, 102, 103, 90], 3);
    expect(out.slice(0, 3)).toEqual([null, null, null]);
    expect(out[3]).toBe(100);
    expect(out[4]).toBeCloseTo(40 / 3, 9);
    // A single-period drop is enough to read deeply oversold.
    expect(out[4] as number).toBeLessThan(30);
  });

  it("reads 100 for a perfectly flat series", () => {
    // Neither gains nor losses, so avgLoss === 0 and the same guard that
    // handles an unbroken advance fires. Wilder leaves 0/0 undefined; this
    // module resolves it as maximally overbought rather than neutral 50.
    expect(rsi(Array(20).fill(100), 14)[14]).toBe(100);
  });

  it("stays inside 0..100 on a mixed series, and actually moves", () => {
    const mixed = Array.from(
      { length: 60 },
      (_, i) => 100 + Math.sin(i / 3) * 10 + i * 0.2,
    );
    const out = rsi(mixed, 14);
    expect(out.slice(0, 14).every((v) => v === null)).toBe(true);
    const values = out.slice(14) as number[];
    expect(values).toHaveLength(46);
    expect(values.every((v) => v >= 0 && v <= 100)).toBe(true);
    // A sign flip in the gain/loss split would pin it to a constant.
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(10);
  });
});

describe("windowDays", () => {
  it("maps each window token to its trailing day count", () => {
    expect(windowDays("90D")).toBe(90);
    expect(windowDays("180D")).toBe(180);
    expect(windowDays("1Y")).toBe(365);
    expect(windowDays("2Y")).toBe(730);
    expect(windowDays("4Y")).toBe(1460);
  });

  it("falls back to Infinity — keep everything — for an unknown token", () => {
    expect(windowDays("MAX")).toBe(Infinity);
    expect(windowDays("")).toBe(Infinity);
    expect(windowDays("5Y")).toBe(Infinity);
    // Case-sensitive: the switch matches the schema's exact enum tokens.
    expect(windowDays("90d")).toBe(Infinity);
  });
});

describe("tail", () => {
  const points = series("2024-01-01", [1, 2, 3, 4, 5]);

  it("keeps the trailing count, newest last", () => {
    expect(tail(points, 2)).toEqual([points[3], points[4]]);
    expect(tail(points, 1)).toEqual([points[4]]);
    expect(tail(points, 4)).toEqual(points.slice(1));
  });

  it("passes the series straight through for Infinity, NaN or an oversized count", () => {
    // Same array reference — no copy — for every "keep it all" case.
    expect(tail(points, Infinity)).toBe(points);
    expect(tail(points, NaN)).toBe(points);
    expect(tail(points, points.length)).toBe(points);
    expect(tail(points, 99)).toBe(points);
    expect(tail([], 3)).toEqual([]);
  });

  it("composes with windowDays the way the gauges call it", () => {
    // `tail(series, windowDays(config.window))` — an unknown/MAX window and a
    // window wider than the history both keep the whole series.
    expect(tail(points, windowDays("MAX"))).toBe(points);
    expect(tail(points, windowDays("90D"))).toBe(points);
  });

  it("yields nothing for a negative count", () => {
    // series.slice(length - (-2)) slices past the end.
    expect(tail(points, -2)).toEqual([]);
  });
});

describe("normalize", () => {
  it("maps min to 0, max to 1 and the midpoint to 0.5", () => {
    const out = normalize(series("2024-01-01", [10, 20, 30]));
    expect(out.map((p) => p.value)).toEqual([0, 0.5, 1]);
  });

  it("handles an off-centre distribution and negative values", () => {
    // min -1, max 3, range 4 → 0, 0.25, 1.
    const out = normalize(series("2024-01-01", [-1, 0, 3]));
    expect(out.map((p) => p.value)).toEqual([0, 0.25, 1]);
  });

  it("puts unrelated native scales on one comparable axis", () => {
    // The whole reason it exists: a 0-100 oscillator and a tiny ratio must
    // both land in [0, 1] so they can share an overlay chart.
    const osc = normalize(series("2024-01-01", [10, 55, 100]));
    const ratio = normalize(series("2024-01-01", [0.02, 0.04, 0.06]));
    expect(osc.map((p) => p.value)).toEqual([0, 0.5, 1]);
    expect(ratio[0].value).toBeCloseTo(0, 12);
    expect(ratio[1].value).toBeCloseTo(0.5, 12);
    expect(ratio[2].value).toBeCloseTo(1, 12);
  });

  it("returns a constant 0.5 for a flat series rather than dividing by zero", () => {
    const out = normalize(series("2024-01-01", [7, 7, 7]));
    expect(out.map((p) => p.value)).toEqual([0.5, 0.5, 0.5]);
    expect(out.every((p) => Number.isFinite(p.value))).toBe(true);
  });

  it("preserves every timestamp, on both branches", () => {
    const varied = series("2024-01-01", [5, 1, 9, 9]);
    expect(normalize(varied).map((p) => p.time)).toEqual(
      varied.map((p) => p.time),
    );
    const flat = series("2024-06-01", [2, 2]);
    expect(normalize(flat).map((p) => p.time)).toEqual(flat.map((p) => p.time));
  });

  it("returns [] for an empty series", () => {
    expect(normalize([])).toEqual([]);
  });
});

describe("toSparkline", () => {
  it("restates epoch-ms points as ISO dates for MiniLineChart", () => {
    const points: SeriesPoint[] = [
      { time: Date.parse("2024-03-01T00:00:00Z"), value: 1.5 },
      { time: Date.parse("2024-03-02T12:30:00Z"), value: -2 },
    ];
    expect(toSparkline(points)).toEqual([
      { date: "2024-03-01T00:00:00.000Z", value: 1.5 },
      { date: "2024-03-02T12:30:00.000Z", value: -2 },
    ]);
  });

  it("keeps order and length and emits exactly {date,value}", () => {
    const points = series("2024-01-01", [1, 2, 3]);
    const out = toSparkline(points);
    expect(out).toHaveLength(3);
    expect(out.map((p) => p.value)).toEqual([1, 2, 3]);
    expect(Object.keys(out[0])).toEqual(["date", "value"]);
    // `time` is gone — MiniLineChart reads `date`.
    expect(out[0]).not.toHaveProperty("time");
  });

  it("returns [] for an empty series", () => {
    expect(toSparkline([])).toEqual([]);
  });
});

describe("zoneOf", () => {
  const VALUE: Zone = { label: "Value", color: "#3fd08f" };
  const ACCUMULATION: Zone = { label: "Accumulation", color: "#cbd5e1" };
  const NEUTRAL: Zone = { label: "Neutral", color: "#cbd5e1" };
  const OVERHEATED: Zone = { label: "Overheated", color: "#ff6b81" };

  // The real Mayer Multiple ladder from mayer-multiple.tsx.
  const mayerBands = [
    { upTo: 0.8, zone: VALUE },
    { upTo: 1, zone: ACCUMULATION },
    { upTo: 2.4, zone: NEUTRAL },
  ];

  it("treats `upTo` as exclusive, so a boundary value falls to the next band", () => {
    expect(zoneOf(0.79, mayerBands, OVERHEATED)).toBe(VALUE);
    expect(zoneOf(0.8, mayerBands, OVERHEATED)).toBe(ACCUMULATION);
    expect(zoneOf(0.999, mayerBands, OVERHEATED)).toBe(ACCUMULATION);
    expect(zoneOf(1, mayerBands, OVERHEATED)).toBe(NEUTRAL);
    expect(zoneOf(2.399, mayerBands, OVERHEATED)).toBe(NEUTRAL);
    // Past the last band there is no `from`-only catch-all → fallback.
    expect(zoneOf(2.4, mayerBands, OVERHEATED)).toBe(OVERHEATED);
  });

  it("treats `from` as inclusive", () => {
    const bands = [
      { from: 70, zone: OVERHEATED },
      { from: 30, zone: NEUTRAL },
    ];
    expect(zoneOf(70, bands, VALUE)).toBe(OVERHEATED);
    expect(zoneOf(69.999, bands, VALUE)).toBe(NEUTRAL);
    expect(zoneOf(30, bands, VALUE)).toBe(NEUTRAL);
    expect(zoneOf(29.999, bands, VALUE)).toBe(VALUE);
  });

  it("requires BOTH bounds when a band declares both", () => {
    const bands = [{ from: 1, upTo: 2, zone: NEUTRAL }];
    expect(zoneOf(1, bands, VALUE)).toBe(NEUTRAL); // from inclusive
    expect(zoneOf(1.999, bands, VALUE)).toBe(NEUTRAL);
    expect(zoneOf(2, bands, VALUE)).toBe(VALUE); // upTo exclusive
    expect(zoneOf(0.999, bands, VALUE)).toBe(VALUE);
  });

  it("returns the FIRST matching band when bands overlap", () => {
    const bands = [
      { from: 0, zone: NEUTRAL },
      { from: 0, zone: OVERHEATED },
    ];
    expect(zoneOf(5, bands, VALUE)).toBe(NEUTRAL);
    // Order is the whole contract: reversed, the same bands pick the other.
    expect(zoneOf(5, [...bands].reverse(), VALUE)).toBe(OVERHEATED);
  });

  it("matches a band with neither bound unconditionally", () => {
    const bands = [{ zone: NEUTRAL }];
    expect(zoneOf(-1e9, bands, VALUE)).toBe(NEUTRAL);
    expect(zoneOf(0, bands, VALUE)).toBe(NEUTRAL);
    expect(zoneOf(1e9, bands, VALUE)).toBe(NEUTRAL);
    // Such a band shadows everything after it.
    expect(zoneOf(1e9, [...bands, { from: 0, zone: OVERHEATED }], VALUE)).toBe(
      NEUTRAL,
    );
  });

  it("returns the fallback only when nothing matches", () => {
    expect(zoneOf(5, [{ upTo: 0, zone: NEUTRAL }], VALUE)).toBe(VALUE);
    expect(zoneOf(5, [], VALUE)).toBe(VALUE);
    // NaN fails every comparison, so a broken metric lands on the fallback
    // label (for Mayer that is "Overheated") rather than throwing.
    expect(zoneOf(NaN, mayerBands, OVERHEATED)).toBe(OVERHEATED);
  });
});

describe("module hygiene", () => {
  it("imports and runs with no DOM present", () => {
    // indicators.ts promises to stay React-free so schemas.ts-adjacent (CLI,
    // catalogue) tooling can import it, and cycle-shared.tsx must at least be
    // import-safe outside a browser. This file deliberately carries NO jsdom
    // environment docblock (the annotation is spelled out nowhere here on
    // purpose — vitest scans the whole file for it), so the top-level imports
    // above already executed in a bare Node process; a module-scope `document`
    // touch would have thrown before any test ran. The guard below fails if
    // someone later switches this file to jsdom to paper over a new DOM
    // dependency instead of keeping the layer clean.
    expect(typeof globalThis.document).toBe("undefined");
    expect(sma([1, 2], 2)[1]).toBe(1.5);
    expect(
      zoneOf(1, [{ upTo: 2, zone: { label: "ok", color: "#fff" } }], {
        label: "no",
        color: "#000",
      }).label,
    ).toBe("ok");
  });
});
