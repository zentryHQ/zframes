export function formatPrice(value: number): string {
  if (value >= 1000)
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (value >= 1)
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `$${value.toPrecision(4)}`;
}

export function formatChangePct(changePct: number): string {
  return `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`;
}

/** A bare exchange rate at FX precision (no currency symbol): "162.44",
 *  "0.8776". Use for unit-less ratios like an FX cross where a "$" would be
 *  wrong; for a dollar *price* use {@link formatPrice}. */
export function formatRate(value: number): string {
  const dp = value >= 100 ? 2 : 4;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

/** Unsigned percentage at a fixed precision: "3.42%". Use for *levels* — rates,
 *  yields, ratios, shares — where there's no positive/negative semantics. For a
 *  signed delta use {@link formatChangePct}; for funding use {@link formatFundingPct}. */
export function formatPct(value: number, dp = 2): string {
  return `${value.toFixed(dp)}%`;
}

/** Funding rate as a signed, high-precision percentage: "+0.0125%", "-0.0030%".
 *  Pass a value already expressed in percent (multiply raw rates by 100 first). */
export function formatFundingPct(percent: number): string {
  return `${percent >= 0 ? "+" : ""}${percent.toFixed(4)}%`;
}

/** The semantic up/down colors — the single source of truth for gain/loss tint.
 *  Import these (or {@link changeColor}) instead of re-typing the literals; they
 *  carry meaning, so they intentionally do NOT rotate with the accent hue.
 *
 *  They resolve `--zf-up`/`--zf-down` (spec.theme.upColor/downColor, set on the
 *  dashboard container by the renderer/editor) with the original green/red as
 *  the fallback — so the user can recolour gain/loss (e.g. a colourblind-safe
 *  blue/orange). Use ONLY in CSS contexts (inline `style`, SVG `style`) where
 *  `var()` resolves; for canvas (`fillStyle`) or D3 `.attr()` consumers, which
 *  can't resolve a CSS var, use {@link UP_COLOR_HEX} / {@link DOWN_COLOR_HEX}. */
export const UP_COLOR = "var(--zf-up, #3fd08f)";
export const DOWN_COLOR = "var(--zf-down, #ff6b81)";

/** Literal hex of the *default* up/down colors, for canvas / D3 `.attr()`
 *  consumers where a `var()` string wouldn't resolve. These do NOT follow a
 *  custom upColor/downColor — a known v2 gap (canvas games, the mini-line
 *  sparkline, the heatmap/tree magnitude ramps). */
export const UP_COLOR_HEX = "#3fd08f";
export const DOWN_COLOR_HEX = "#ff6b81";

export function changeColor(changePct: number): string {
  return changePct >= 0 ? UP_COLOR : DOWN_COLOR;
}

/** Abbreviate a large number with a T/B/M/K suffix and one fixed precision
 *  policy: "1.23T", "12.30B", "340.00M", "12.3K", "950". The single compact-number
 *  formatter for the whole frame layer — replaces every hand-rolled $T/$B/$M and
 *  the charts-layer `parseMarketData` in frame code. For a currency value, wrap
 *  with {@link formatCompactUsd}; for an exact price use {@link formatPrice}. */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

/** Abbreviated USD magnitude: "$1.23B", "$340.00M", "$2.10T", "-$5.00B". The one
 *  helper for aggregate dollar figures (market cap, TVL, volume, open interest,
 *  debt). The minus sign leads the `$` so negatives read naturally. */
export function formatCompactUsd(value: number): string {
  return value < 0 ? `-$${formatCompact(-value)}` : `$${formatCompact(value)}`;
}

/** Turn a provider slug into a readable series/legend label: "lido" → "Lido",
 *  "rocket-pool" → "Rocket Pool". Keeps chart legends in step with the treemaps,
 *  which get already-pretty names from their providers. */
export function prettySlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Format sats as BTC with sensible precision: "1.23 BTC", "0.0042 BTC". */
export function formatBtc(sats: number): string {
  const btc = sats / 1e8;
  if (btc >= 100) return `${btc.toFixed(0)} BTC`;
  if (btc >= 1) return `${btc.toFixed(2)} BTC`;
  if (btc >= 0.001) return `${btc.toFixed(4)} BTC`;
  return `${Math.round(sats).toLocaleString("en-US")} sats`;
}

/** Format a hashrate in H/s with a binary-ish SI suffix, e.g. "612 EH/s". */
export function formatHashrate(hs: number): string {
  const units = ["H/s", "kH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s", "ZH/s"];
  let v = hs;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

/** Compact "time since" label for feeds: "now", "5m", "3h", "2d", "4w", then a date. */
export function timeAgo(ms: number): string {
  const sec = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (sec < 60) return "now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  const wk = Math.round(day / 7);
  if (wk < 5) return `${wk}w`;
  return new Date(ms).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
