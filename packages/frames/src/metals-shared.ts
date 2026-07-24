import { ChartTimeframe, type BarDatum } from "@zframes/charts";
import type { SeriesPoint } from "@zframes/core";
import { DOWN_COLOR, UP_COLOR, formatPrice } from "./format";

/**
 * Shared vocabulary and series maths for the metals frames.
 *
 * The metals family is unusual in zframes: every frame reads the SAME two
 * shapes (a live spot quote and a decades-deep daily fix series) and then does
 * one of a small set of transforms on it — window it, rebase it, difference it,
 * bucket it by calendar. Left to per-frame code that becomes twenty subtly
 * different definitions of "annual return". So the transforms live here once,
 * beside the formatting primitives in `./format`, and the frames stay thin.
 *
 * Two conventions worth knowing:
 *  - **Percent, not fraction.** Everything returning a "change" returns percent
 *    (1.5 = +1.5%), matching `formatChangePct` and the rest of the package.
 *  - **Windowing before maths.** `sliceYears` first, then compute — a rolling
 *    statistic over 14,000 points and then a slice is the same answer for far
 *    more work, except where the statistic needs the warm-up (rolling
 *    volatility, drawdown-from-ATH), which take the full series on purpose.
 */

/** Display name per symbol, so a frame never hard-codes "Gold". */
export const METAL_NAMES: Record<string, string> = {
  XAU: "Gold",
  XAG: "Silver",
  XPT: "Platinum",
  XPD: "Palladium",
  HG: "Copper",
};

/** What one unit of the quote actually is — copper trades per pound, the rest per troy ounce. */
export const METAL_UNIT: Record<string, string> = {
  XAU: "oz",
  XAG: "oz",
  XPT: "oz",
  XPD: "oz",
  HG: "lb",
};

/** Ticker-ish short label used on chart legends and bar categories. */
export function metalName(symbol: string): string {
  return METAL_NAMES[symbol] ?? symbol;
}

export type WeightUnit = "ounce" | "gram" | "kilogram" | "tola";

/**
 * How many of a unit make one troy ounce — divide a per-ounce price by this to
 * price the unit. A troy ounce is 31.1034768 g by definition; the tola is the
 * South Asian bar unit, 11.6638 g.
 */
const UNITS_PER_TROY_OUNCE: Record<WeightUnit, number> = {
  ounce: 1,
  gram: 31.1034768,
  kilogram: 0.0311034768,
  tola: 31.1034768 / 11.6638,
};

export const WEIGHT_UNIT_LABELS: Record<WeightUnit, string> = {
  ounce: "oz",
  gram: "g",
  kilogram: "kg",
  tola: "tola",
};

/** Convert a per-troy-ounce price into a per-unit price. */
export function pricePerUnit(pricePerOunce: number, unit: WeightUnit): number {
  return pricePerOunce / UNITS_PER_TROY_OUNCE[unit];
}

/** Convert a weight expressed in `unit` into troy ounces. */
export function toTroyOunces(weight: number, unit: WeightUnit): number {
  return weight / UNITS_PER_TROY_OUNCE[unit];
}

const DAY_MS = 86_400_000;
const YEAR_MS = 365.25 * DAY_MS;

/** The trailing `years` of a series (oldest→newest in, oldest→newest out). */
export function sliceYears(
  points: readonly SeriesPoint[],
  years: number,
): SeriesPoint[] {
  if (points.length === 0) return [];
  const cutoff = points[points.length - 1].time - years * YEAR_MS;
  return points.filter((p) => p.time >= cutoff);
}

/**
 * Thin a series to at most `max` points by even stride, always keeping the
 * first and last. A 58-year daily fix history is ~14,600 points — handing that
 * straight to a D3 path costs far more than the pixels can show.
 */
export function downsample<T>(items: readonly T[], max = 400): T[] {
  if (items.length <= max) return [...items];
  const stride = Math.ceil(items.length / max);
  const out: T[] = [];
  for (let i = 0; i < items.length; i += stride) out.push(items[i]);
  const last = items[items.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

/** Series → the `{date, value}` pairs the line charts consume. */
export function toChartData(
  points: readonly SeriesPoint[],
): { date: string; value: number }[] {
  return points.map((p) => ({
    date: new Date(p.time).toISOString(),
    value: p.value,
  }));
}

/** Pick the axis granularity that suits the window (see charts' formatChartDate). */
export function timeframeFor(years: number): ChartTimeframe {
  if (years <= 0.25) return ChartTimeframe["1M"];
  if (years <= 1) return ChartTimeframe.YTD;
  if (years <= 6) return ChartTimeframe["1Y"];
  return ChartTimeframe["5Y"];
}

/** Percent change from `from` to `to`; 0 when `from` isn't usable. */
export function pctChange(from: number, to: number): number {
  return from > 0 ? ((to - from) / from) * 100 : 0;
}

/** Compound annual growth rate over `years`, in percent. */
export function cagrPct(from: number, to: number, years: number): number {
  if (from <= 0 || to <= 0 || years <= 0) return 0;
  return (Math.pow(to / from, 1 / years) - 1) * 100;
}

/** The last value at or before `time` — for "what was it a year ago" lookups. */
export function valueAtOrBefore(
  points: readonly SeriesPoint[],
  time: number,
): number | null {
  let found: number | null = null;
  for (const p of points) {
    if (p.time > time) break;
    found = p.value;
  }
  return found;
}

/** Calendar-year percent returns (last fix of year vs last fix of prior year). */
export function annualReturns(
  points: readonly SeriesPoint[],
): { year: number; pct: number }[] {
  const lastOfYear = new Map<number, number>();
  for (const p of points) {
    lastOfYear.set(new Date(p.time).getUTCFullYear(), p.value);
  }
  const years = [...lastOfYear.keys()].sort((a, b) => a - b);
  const out: { year: number; pct: number }[] = [];
  for (let i = 1; i < years.length; i += 1) {
    const prev = lastOfYear.get(years[i - 1]);
    const curr = lastOfYear.get(years[i]);
    // Only consecutive years are a real annual return; a gap in the fix data
    // would otherwise be reported as one enormous "year".
    if (
      prev === undefined ||
      curr === undefined ||
      years[i] - years[i - 1] !== 1
    )
      continue;
    out.push({ year: years[i], pct: pctChange(prev, curr) });
  }
  return out;
}

/** Month-end to month-end percent returns, oldest→newest. `month` is 0-11. */
export function monthlyReturns(
  points: readonly SeriesPoint[],
): { year: number; month: number; pct: number }[] {
  const lastOfMonth = new Map<string, { time: number; value: number }>();
  for (const p of points) {
    const d = new Date(p.time);
    lastOfMonth.set(`${d.getUTCFullYear()}-${d.getUTCMonth()}`, {
      time: p.time,
      value: p.value,
    });
  }
  const months = [...lastOfMonth.values()].sort((a, b) => a.time - b.time);
  const out: { year: number; month: number; pct: number }[] = [];
  for (let i = 1; i < months.length; i += 1) {
    const d = new Date(months[i].time);
    out.push({
      year: d.getUTCFullYear(),
      month: d.getUTCMonth(),
      pct: pctChange(months[i - 1].value, months[i].value),
    });
  }
  return out;
}

export const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * Drawdown from the running all-time high, in percent (0 at a new high,
 * negative below it). Pass the FULL series: a windowed one would measure the
 * distance from the window's own high, which isn't a drawdown.
 */
export function drawdownSeries(points: readonly SeriesPoint[]): SeriesPoint[] {
  let peak = 0;
  return points.map((p) => {
    if (p.value > peak) peak = p.value;
    return {
      time: p.time,
      value: peak > 0 ? ((p.value - peak) / peak) * 100 : 0,
    };
  });
}

/** The all-time high in a series, with when it printed. */
export function allTimeHigh(
  points: readonly SeriesPoint[],
): SeriesPoint | null {
  let best: SeriesPoint | null = null;
  for (const p of points) if (!best || p.value > best.value) best = p;
  return best;
}

/**
 * Rolling annualised realised volatility, in percent — the standard deviation
 * of daily log returns over `window` trading days, scaled by √252. Pass the
 * full series so the first windowed point isn't lost to warm-up.
 */
export function rollingVolatility(
  points: readonly SeriesPoint[],
  window: number,
): SeriesPoint[] {
  if (points.length < window + 1) return [];
  const logReturns: { time: number; value: number }[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const prev = points[i - 1].value;
    const curr = points[i].value;
    if (prev > 0 && curr > 0)
      logReturns.push({ time: points[i].time, value: Math.log(curr / prev) });
  }
  const out: SeriesPoint[] = [];
  for (let i = window - 1; i < logReturns.length; i += 1) {
    const slice = logReturns.slice(i - window + 1, i + 1);
    const mean = slice.reduce((sum, r) => sum + r.value, 0) / slice.length;
    const variance =
      slice.reduce((sum, r) => sum + (r.value - mean) ** 2, 0) /
      (slice.length - 1);
    out.push({
      time: logReturns[i].time,
      value: Math.sqrt(variance) * Math.sqrt(252) * 100,
    });
  }
  return out;
}

/** Simple percent returns between consecutive points. */
export function simpleReturns(points: readonly SeriesPoint[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < points.length; i += 1)
    out.push(pctChange(points[i - 1].value, points[i].value));
  return out;
}

/** Where `value` ranks inside `values`, 0-100. */
export function percentileRank(
  values: readonly number[],
  value: number,
): number {
  if (values.length === 0) return 0;
  const below = values.filter((v) => v <= value).length;
  return (below / values.length) * 100;
}

/** Pearson correlation of two equal-length samples; 0 when undefined. */
export function correlation(
  a: readonly number[],
  b: readonly number[],
): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < n; i += 1) {
    sumA += a[i];
    sumB += b[i];
  }
  const meanA = sumA / n;
  const meanB = sumB / n;
  let cov = 0;
  let varA = 0;
  let varB = 0;
  for (let i = 0; i < n; i += 1) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  const denom = Math.sqrt(varA * varB);
  return denom > 0 ? cov / denom : 0;
}

/** The three currencies the LBMA publishes each fix in. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  GBP: "£",
  EUR: "€",
};

/**
 * A fix price in one of the LBMA's three currencies. The fix IS a price, so it
 * keeps `formatPrice`'s precision policy and only swaps the leading symbol.
 */
export function formatFixPrice(value: number, currency: string): string {
  return formatPrice(value).replace("$", CURRENCY_SYMBOLS[currency] ?? "$");
}

/**
 * Cut several metals down to the fix days they ALL publish.
 *
 * Two things break without it. The line chart combines its series by exact date
 * to build the hover tooltip and fills a date a series doesn't carry with **0**
 * — so hovering reads "$0" for whichever metal didn't fix that day ("$1" under
 * a log axis, since `10**0 = 1`), or a plausible-looking "0%" on a rebased
 * chart. And rebasing each series inside its own window scores gold's 58 years
 * against platinum's 36, then prints both as "the window's return".
 *
 * The metals never share a date set by default: the LBMA runs a different
 * holiday calendar per metal, platinum and palladium only start in 1990, and
 * thinning each series on its own length gives each a different stride. One
 * shared grid fixes all three. A no-op for a single metal.
 */
export function onSharedFixDays(
  windows: readonly SeriesPoint[][],
): SeriesPoint[][] {
  if (windows.length < 2) return windows.map((points) => [...points]);
  const daysSeen = new Map<number, number>();
  for (const points of windows)
    for (const p of points)
      daysSeen.set(p.time, (daysSeen.get(p.time) ?? 0) + 1);
  return windows.map((points) =>
    points.filter((p) => daysSeen.get(p.time) === windows.length),
  );
}

/** Round a timestamp down to its UTC day, so two series align on dates not clocks. */
function utcDay(time: number): number {
  return Math.floor(time / DAY_MS) * DAY_MS;
}

/**
 * Pair two series on the days they share. The LBMA files skip slightly
 * different holidays per metal, and a BTC series trades weekends, so an
 * index-wise zip would silently compare Tuesday to Thursday.
 */
export function alignSeries(
  a: readonly SeriesPoint[],
  b: readonly SeriesPoint[],
): { time: number; a: number; b: number }[] {
  const byDay = new Map<number, number>();
  for (const p of b) byDay.set(utcDay(p.time), p.value);
  const out: { time: number; a: number; b: number }[] = [];
  for (const p of a) {
    const other = byDay.get(utcDay(p.time));
    if (other !== undefined) out.push({ time: p.time, a: p.value, b: other });
  }
  return out;
}

/** `a / b` on their shared days — the ratio series behind gold/silver and friends. */
export function ratioSeries(
  a: readonly SeriesPoint[],
  b: readonly SeriesPoint[],
): SeriesPoint[] {
  return alignSeries(a, b)
    .filter((p) => p.b > 0)
    .map((p) => ({ time: p.time, value: p.a / p.b }));
}

/** Rebase a series so its first point reads 0% — for comparing unlike magnitudes. */
export function rebaseToPct(points: readonly SeriesPoint[]): SeriesPoint[] {
  if (points.length === 0) return [];
  const base = points[0].value;
  if (base === 0) return points.map((p) => ({ time: p.time, value: 0 }));
  return points.map((p) => ({
    time: p.time,
    value: ((p.value - base) / base) * 100,
  }));
}

/** Diverging bar colouring: gains green, losses red — the semantic pair, never the accent. */
export function divergingBars(
  data: readonly { label: string; value: number }[],
): BarDatum[] {
  return data.map((d) => ({
    label: d.label,
    value: d.value,
    color: d.value >= 0 ? UP_COLOR : DOWN_COLOR,
  }));
}

/** Net non-commercial ("large speculator") position for a COT week. */
export function cotNet(week: {
  noncommercialLong: number;
  noncommercialShort: number;
}): number {
  return week.noncommercialLong - week.noncommercialShort;
}

/** "3 y 2 mo" / "8 mo" / "17 d" — how long ago a dated milestone was. */
export function durationSince(time: number, now = Date.now()): string {
  const days = Math.max(0, Math.round((now - time) / DAY_MS));
  if (days < 45) return `${days}d`;
  const months = Math.round(days / 30.44);
  if (months < 24) return `${months}mo`;
  const years = Math.floor(days / 365.25);
  const rest = Math.round((days - years * 365.25) / 30.44);
  return rest > 0 ? `${years}y ${rest}mo` : `${years}y`;
}
