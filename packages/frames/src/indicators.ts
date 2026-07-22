// Client-side technical indicators over a daily close series. Pure math, no
// dependencies — the cycle-multiple frames (Mayer, Pi Cycle, MA-multiplier, RSI)
// and the cycle-signal checklist derive their moving averages and oscillators
// from the long price history rather than pulling a precomputed provider metric.
// React-free so schemas.ts-adjacent tooling can import it freely.
import type { SeriesPoint } from "@zframes/spec";

/**
 * Trailing simple moving average. `out[i]` is the mean of the last `period`
 * values ending at `i`, or `null` until there are `period` values.
 */
export function sma(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0) return out;
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/**
 * Exponential moving average with the standard 2/(period+1) smoothing, seeded
 * from the first value. Returns a value at every index.
 */
export function ema(values: number[], period: number): number[] {
  const out: number[] = [];
  if (values.length === 0) return out;
  const k = 2 / (period + 1);
  let prev = values[0];
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

/**
 * Wilder's RSI over `period` (default 14). `out[i]` is `null` until the average
 * gain/loss is seeded (`i < period`).
 */
export function rsi(values: number[], period = 14): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    if (delta >= 0) gain += delta;
    else loss -= delta;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    const g = delta > 0 ? delta : 0;
    const l = delta < 0 ? -delta : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** The number of trailing daily points a `window` token keeps (Infinity = all). */
export function windowDays(window: string): number {
  switch (window) {
    case "90D":
      return 90;
    case "180D":
      return 180;
    case "1Y":
      return 365;
    case "2Y":
      return 730;
    case "4Y":
      return 1460;
    default:
      return Infinity;
  }
}

/** Keep the trailing `count` points of a series (all of it when count is Infinity). */
export function tail(series: SeriesPoint[], count: number): SeriesPoint[] {
  if (!Number.isFinite(count) || count >= series.length) return series;
  return series.slice(series.length - count);
}

/** SeriesPoint[] → the {date,value} shape MiniLineChart wants. */
export function toSparkline(
  series: SeriesPoint[],
): Array<{ date: string; value: number }> {
  return series.map((p) => ({
    date: new Date(p.time).toISOString(),
    value: p.value,
  }));
}

/**
 * Min-max normalize a series to the [0, 1] range using ITS OWN min/max — puts
 * signals with unrelated native scales (a Z-score, a −1…1 fraction, a 0–100
 * oscillator, a tiny Reserve Risk ratio) on one comparable axis for an overlay
 * chart. A flat series (max === min) normalizes to a constant 0.5 rather than
 * dividing by zero. Normalize AFTER windowing (e.g. via {@link tail}) so the
 * 0–1 range reflects the visible window, not the full multi-year history.
 */
export function normalize(series: SeriesPoint[]): SeriesPoint[] {
  if (series.length === 0) return [];
  const values = series.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  if (range === 0) return series.map((p) => ({ time: p.time, value: 0.5 }));
  return series.map((p) => ({ time: p.time, value: (p.value - min) / range }));
}
