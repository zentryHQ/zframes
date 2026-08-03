import { describe, expect, it } from "vitest";
import { binCount, binSample, chooseBinWidth, normalCurve } from "./utils";

/** Deterministic even spread over [from, to] — no Math.random in tests. */
const spread = (n: number, from: number, to: number): number[] =>
  Array.from({ length: n }, (_, i) => from + ((to - from) * i) / (n - 1));

describe("binCount", () => {
  it("counts zero-anchored bins across the span", () => {
    expect(binCount(0, 10, 1)).toBe(11);
    expect(binCount(-5, 5, 1)).toBe(11);
    expect(binCount(-0.5, 0.5, 0.25)).toBe(5);
  });
});

describe("chooseBinWidth", () => {
  it("returns a width a human reads, not a Freedman–Diaconis decimal", () => {
    const width = chooseBinWidth(-5, 5);
    const mantissa = width / 10 ** Math.floor(Math.log10(width));
    expect([1, 1.5, 2, 2.5, 5]).toContain(Number(mantissa.toFixed(6)));
  });

  it("respects the bar ceiling", () => {
    for (const [min, max] of [
      [-5, 5],
      [-0.02, 0.03],
      [0, 1_000_000],
      [-1e-6, 1e-6],
    ] as const)
      expect(binCount(min, max, chooseBinWidth(min, max))).toBeLessThanOrEqual(
        21,
      );
  });

  it("lands near the target bar count", () => {
    const width = chooseBinWidth(-5, 5, 18, 21);
    const count = binCount(-5, 5, width);
    expect(count).toBeGreaterThanOrEqual(8);
    expect(count).toBeLessThanOrEqual(21);
  });

  it("degrades to a coarse histogram rather than slivers on a pathological span", () => {
    // Span so tiny that no candidate lands in range — the fallback must still
    // be the widest (fewest bars), not the narrowest.
    const width = chooseBinWidth(0, 0, 18, 21);
    expect(width).toBeGreaterThan(0);
    expect(Number.isFinite(width)).toBe(true);
  });
});

describe("binSample", () => {
  it("returns null for a sample too small to have a shape", () => {
    expect(binSample([])).toBeNull();
    expect(binSample([1])).toBeNull();
    expect(binSample([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull();
  });

  it("counts every observation — the trimmed tails are folded, not dropped", () => {
    const values = [...spread(200, -2, 2), -50, 50];
    const binned = binSample(values);
    expect(binned).not.toBeNull();
    const total = binned!.bins.reduce((sum, b) => sum + b.count, 0);
    expect(total).toBe(202);
    expect(binned!.count).toBe(202);
  });

  it("flags the end bars as open and keeps the true extremes", () => {
    const binned = binSample([...spread(200, -2, 2), -50, 50])!;
    const first = binned.bins[0];
    const last = binned.bins[binned.bins.length - 1];
    expect(first.openLow).toBe(true);
    expect(last.openHigh).toBe(true);
    // The axis is trimmed, but the caller can still report the real worst/best.
    expect(binned.min).toBe(-50);
    expect(binned.max).toBe(50);
    // …and the outliers are inside the end bars.
    expect(first.count).toBeGreaterThanOrEqual(1);
    expect(last.count).toBeGreaterThanOrEqual(1);
    expect(first.x0).toBeGreaterThan(-50);
    expect(last.x1).toBeLessThan(50);
  });

  it("keeps the middle legible when one outlier dwarfs the sample", () => {
    // The whole reason for trimming: a min→max axis would put all 200 ordinary
    // observations in a single bar next to one empty-looking spike.
    const binned = binSample([...spread(200, -2, 2), 5000])!;
    const occupied = binned.bins.filter((b) => b.count > 0);
    expect(occupied.length).toBeGreaterThan(5);
  });

  it("never lets a bar straddle zero, so a sign split stays honest", () => {
    const binned = binSample(spread(300, -7, 4))!;
    for (const bin of binned.bins) expect(bin.x0 < 0 && bin.x1 > 0).toBe(false);
    // Bin edges land on multiples of the width.
    for (const bin of binned.bins)
      expect(
        Math.abs(bin.x0 / binned.width - Math.round(bin.x0 / binned.width)),
      ).toBeLessThan(1e-9);
  });

  it("keeps zero on the axis even when the sample only went one way", () => {
    const binned = binSample(spread(200, 10, 20))!;
    expect(binned.bins[0].x0).toBe(0);
  });

  it("does not force zero onto the axis when anchoring is off", () => {
    const binned = binSample(spread(200, 10, 20), { anchorZero: false })!;
    expect(binned.bins[0].x0).toBeGreaterThan(0);
  });

  it("bins are contiguous and equal width", () => {
    const binned = binSample(spread(300, -7, 4))!;
    for (let i = 1; i < binned.bins.length; i += 1) {
      expect(binned.bins[i].x0).toBeCloseTo(binned.bins[i - 1].x1, 9);
      expect(binned.bins[i].x1 - binned.bins[i].x0).toBeCloseTo(
        binned.width,
        9,
      );
    }
  });

  it("reports the sample mean and n−1 standard deviation", () => {
    const binned = binSample([1, 2, 3, 4, 5])!;
    expect(binned.mean).toBeCloseTo(3, 9);
    expect(binned.stdev).toBeCloseTo(Math.sqrt(2.5), 9);
  });

  it("ignores non-finite values without shifting the statistics", () => {
    const clean = binSample([1, 2, 3, 4, 5])!;
    const dirty = binSample([
      1,
      2,
      Number.NaN,
      3,
      Number.POSITIVE_INFINITY,
      4,
      5,
    ])!;
    expect(dirty.count).toBe(clean.count);
    expect(dirty.mean).toBeCloseTo(clean.mean, 9);
  });

  it("respects an explicit bar ceiling", () => {
    const binned = binSample(spread(500, -50, 50), { maxBins: 10 })!;
    expect(binned.bins.length).toBeLessThanOrEqual(10);
  });
});

describe("normalCurve", () => {
  it("is empty when there is no spread to draw", () => {
    expect(normalCurve(0, 0, 1, 100, -1, 1)).toEqual([]);
    expect(normalCurve(0, 1, 1, 0, -1, 1)).toEqual([]);
    expect(normalCurve(0, 1, 1, 100, 1, -1)).toEqual([]);
  });

  it("peaks at the mean and is symmetric about it", () => {
    const curve = normalCurve(2, 1, 0.5, 100, -3, 7, 100);
    const peak = curve.reduce((a, b) => (b.y > a.y ? b : a));
    expect(peak.x).toBeCloseTo(2, 1);
    const at = (x: number) => curve.find((p) => Math.abs(p.x - x) < 0.06)?.y;
    expect(at(1)).toBeCloseTo(at(3)!, 6);
  });

  it("is scaled to bar height — it integrates to the observation count", () => {
    // y = count · binWidth · pdf, so ∫y dx = count · binWidth.
    const [mean, stdev, binWidth, count] = [0, 2, 0.5, 400];
    const [from, to, samples] = [-12, 12, 2400];
    const curve = normalCurve(mean, stdev, binWidth, count, from, to, samples);
    const dx = (to - from) / samples;
    const area = curve.reduce((sum, p) => sum + p.y * dx, 0);
    expect(area / binWidth).toBeCloseTo(count, 0);
  });
});
