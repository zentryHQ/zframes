import { quantileSorted } from "d3";

/** One histogram bar: the half-open interval `[x0, x1)` and how many fell in it. */
export interface HistogramBin {
  x0: number;
  x1: number;
  count: number;
  /**
   * Set when the bin absorbed the trimmed tail beyond it, so a label can say
   * `< -8%` / `≥ +8%` rather than pretending to be one bin wide.
   */
  openLow?: boolean;
  openHigh?: boolean;
}

/** Summary statistics of a sample, independent of how it is binned. */
export interface SampleStats {
  /** Finite observations. */
  count: number;
  mean: number;
  /** Sample standard deviation (n−1). */
  stdev: number;
  min: number;
  max: number;
  /** Share of observations strictly above zero, 0–100. */
  positivePct: number;
}

export interface BinnedSample extends SampleStats {
  bins: HistogramBin[];
  /** Bin width actually chosen. */
  width: number;
}

/** Bin widths a human reads without doing arithmetic: 0.25%, 1%, 2.5%, 5%… */
const NICE_MULTIPLES = [1, 1.5, 2, 2.5, 5];

export interface BinOptions {
  /** Bar count to aim for. Default 18. */
  targetBins?: number;
  /** Hard ceiling on bars. Default 21. */
  maxBins?: number;
  /**
   * Share of the sample trimmed off *each* tail before the axis is sized.
   * Default 0.005 (the central 99%).
   */
  tailTrim?: number;
  /**
   * Keep bin edges aligned to zero, so no single bar straddles the sign
   * boundary and a red/green split stays honest. Default true.
   */
  anchorZero?: boolean;
}

/** Linear-interpolated quantile of an ascending sample. */
export function quantile(sorted: readonly number[], q: number): number {
  // d3 types the parameter mutable but only reads it; copying a 15k-point
  // history twice per bin pass to satisfy that would be pure waste.
  return quantileSorted(sorted as number[], q) ?? Number.NaN;
}

/**
 * Mean, spread and extremes of a sample, in one pass over the finite values.
 *
 * Split out from {@link binSample} so a card's stat row and its histogram agree
 * by construction: the caption reads these, the bars are binned from the same
 * values, and neither re-derives "the mean" for itself. Non-finite values are
 * skipped rather than poisoning the mean with NaN.
 */
export function sampleStats(values: readonly number[]): SampleStats | null {
  let count = 0;
  let total = 0;
  let positive = 0;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!Number.isFinite(value)) continue;
    count += 1;
    total += value;
    if (value > 0) positive += 1;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (count < 2) return null;

  const mean = total / count;
  let sumSquares = 0;
  for (const value of values)
    if (Number.isFinite(value)) sumSquares += (value - mean) ** 2;

  return {
    count,
    mean,
    stdev: Math.sqrt(sumSquares / (count - 1)),
    min,
    max,
    positivePct: (positive / count) * 100,
  };
}

/** How many bins of `width` span `min…max` with edges anchored at zero. */
export function binCount(min: number, max: number, width: number): number {
  return Math.floor(max / width) - Math.floor(min / width) + 1;
}

/**
 * Pick a readable bin width that lands the histogram near `targetBins` bars
 * without exceeding `maxBins`.
 *
 * Widths are drawn from {@link NICE_MULTIPLES} × a power of ten so the axis
 * reads in round steps; a Freedman–Diaconis width is statistically tidier but
 * labels the axis in numbers like 0.732%, which nobody can compare at a glance.
 */
export function chooseBinWidth(
  min: number,
  max: number,
  targetBins = 18,
  maxBins = 21,
): number {
  const span = Math.max(max - min, 1e-9);
  const startExp = Math.floor(Math.log10(span / targetBins)) - 1;
  const widths: number[] = [];
  for (let exp = startExp; exp <= startExp + 4; exp += 1)
    for (const mult of NICE_MULTIPLES) widths.push(mult * 10 ** exp);
  widths.sort((a, b) => a - b);

  // Widest candidate is the safe fallback: it yields the fewest bars, so a
  // pathological sample degrades to a coarse histogram rather than 500 slivers.
  let best = widths[widths.length - 1];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const width of widths) {
    const count = binCount(min, max, width);
    if (count > maxBins || count < 2) continue;
    const score = Math.abs(count - targetBins);
    if (score < bestScore) {
      bestScore = score;
      best = width;
    }
  }
  return best;
}

/**
 * Bin a sample into a readable histogram, with the fat tails folded rather than
 * allowed to set the axis.
 *
 * Financial returns are fat-tailed: one 1987- or 2020-style day stretches a
 * min→max axis so far that every other observation piles into two bars, which
 * is a histogram of nothing. Binning the central `1 − 2·tailTrim` of the sample
 * and clamping the excluded tails into the end bars (flagged `openLow` /
 * `openHigh`) shows the actual shape while still counting every observation —
 * `min`/`max` come back untrimmed so the caller can report the true extremes.
 *
 * Zero is always kept inside the axis, so the sign split is on screen even for
 * a window that only ever went one way.
 */
export function binSample(
  values: readonly number[],
  options: BinOptions = {},
): BinnedSample | null {
  const {
    targetBins = 18,
    maxBins = 21,
    tailTrim = 0.005,
    anchorZero = true,
  } = options;

  const sample = values.filter((v) => Number.isFinite(v));
  const stats = sampleStats(sample);
  if (!stats) return null;
  const { min, max } = stats;

  // Sorted once for the trimmed axis. (`Math.min(...sample)` would spread the
  // whole sample onto the stack — a 58-year daily history is ~15k values.)
  const sorted = [...sample].sort((a, b) => a - b);

  const lowEdge = anchorZero
    ? Math.min(quantile(sorted, tailTrim), 0)
    : quantile(sorted, tailTrim);
  const highEdge = anchorZero
    ? Math.max(quantile(sorted, 1 - tailTrim), 0)
    : quantile(sorted, 1 - tailTrim);

  const width = chooseBinWidth(lowEdge, highEdge, targetBins, maxBins);
  const lo = Math.floor(lowEdge / width);
  const hi = Math.floor(highEdge / width);
  const counts = new Array<number>(hi - lo + 1).fill(0);

  for (const value of sample) {
    // Clamped, so a trimmed tail lands in the end bar rather than falling out
    // of the sample the histogram claims to show.
    const index = Math.min(
      Math.max(Math.floor(value / width) - lo, 0),
      counts.length - 1,
    );
    counts[index] += 1;
  }

  const bins: HistogramBin[] = counts.map((count, i) => {
    const x0 = (lo + i) * width;
    return {
      x0,
      x1: x0 + width,
      count,
      openLow: i === 0 && min < x0 ? true : undefined,
      openHigh: i === counts.length - 1 && max >= x0 + width ? true : undefined,
    };
  });

  return { ...stats, bins, width };
}

/**
 * The normal curve implied by `mean`/`stdev`, sampled across `[from, to]` and
 * scaled to the same axis as the bars.
 *
 * Overlaying it is the whole point of a return histogram: the gap between the
 * bars and this curve *is* the fat tail — the risk a model assuming normality
 * would price at nearly zero. `binWidth × count` converts the unit-area density
 * into expected observations per bin, so the curve is directly comparable to
 * bar height rather than sharing an axis by coincidence.
 */
export function normalCurve(
  mean: number,
  stdev: number,
  binWidth: number,
  count: number,
  from: number,
  to: number,
  samples = 96,
): { x: number; y: number }[] {
  if (!(stdev > 0) || !(binWidth > 0) || count <= 0 || !(to > from)) return [];
  const scale = (count * binWidth) / (stdev * Math.sqrt(2 * Math.PI));
  const out: { x: number; y: number }[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const x = from + ((to - from) * i) / samples;
    const z = (x - mean) / stdev;
    out.push({ x, y: scale * Math.exp(-0.5 * z * z) });
  }
  return out;
}
