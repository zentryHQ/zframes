import {
  formatMagnitude,
  formatMoney,
  formatMoneyCompact,
} from "@zframes/core";

/**
 * The placeholder for a figure that does not exist — the package-wide
 * convention for an absent reading (see `CardHeader.Value`'s `absent`, which
 * also greys it so it can't be mistaken for data).
 *
 * WHY EVERY FORMATTER HERE GUARDS ON IT. A non-finite input means the
 * computation behind the figure failed — a divide-by-zero on a missing supply,
 * a ratio against a zero denominator — and left unguarded each formatter
 * printed the failure as a confident numeral: `NaN`, `$NaN`, `InfinityT`, and
 * `NaN%` in the LOSS colour, because a `>= 0` test is false for `NaN`. A
 * made-up number is worse than no number, so a non-finite value renders as
 * this and tints neutral.
 */
export const ABSENT = "—";

/** A USD price/level: "$20.66", "$2,160,387". Delegates to the money kernel in
 *  `@zframes/core` so a dollar board and a converted board round identically.
 *  For market data on a card that may be denominated in another currency, use
 *  the `useMoney()` primitive instead — it takes USD in and renders the card's
 *  display currency. */
export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return ABSENT;
  return formatMoney(value, "USD");
}

export function formatChangePct(changePct: number): string {
  if (!Number.isFinite(changePct)) return ABSENT;
  return `${changePct >= 0 ? "+" : ""}${changePct.toFixed(2)}%`;
}

/** A bare exchange rate at FX precision (no currency symbol): "162.44",
 *  "0.8776". Use for unit-less ratios like an FX cross where a "$" would be
 *  wrong; for a dollar *price* use {@link formatPrice}. */
export function formatRate(value: number): string {
  if (!Number.isFinite(value)) return ABSENT;
  const dp = value >= 100 ? 2 : 4;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

/** A unit-less INDEX level at a readable fixed precision: "7,489.72", "17.09",
 *  "335.10". Use for published index numbers that are neither money nor a
 *  percentage — an equity index level, a house-price index, any "base year =
 *  100" series. Grouped thousands (an index in the tens of thousands is
 *  unreadable without them) and always two decimals, so a column of levels lines
 *  up. Never wrap it in a currency symbol: an index level has no currency, which
 *  is exactly why it doesn't go through {@link formatPrice} or `useMoney()`. */
export function formatLevel(value: number): string {
  if (!Number.isFinite(value)) return ABSENT;
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Unsigned percentage at a fixed precision: "3.42%". Use for *levels* — rates,
 *  yields, ratios, shares — where there's no positive/negative semantics. For a
 *  signed delta use {@link formatChangePct}; for funding use {@link formatFundingPct}. */
export function formatPct(value: number, dp = 2): string {
  if (!Number.isFinite(value)) return ABSENT;
  return `${value.toFixed(dp)}%`;
}

/** Funding rate as a signed, high-precision percentage: "+0.0125%", "-0.0030%".
 *  Pass a value already expressed in percent (multiply raw rates by 100 first). */
export function formatFundingPct(percent: number): string {
  if (!Number.isFinite(percent)) return ABSENT;
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

/** Gain/loss tint for a change figure — and NEUTRAL for a non-finite one.
 *  `NaN >= 0` is false, so the plain comparison painted every failed
 *  computation loss-red: a confident red number saying nothing. `currentColor`
 *  leaves the figure in whatever ink it inherits, which is what an unknown
 *  direction should look like. */
export function changeColor(changePct: number): string {
  if (!Number.isFinite(changePct)) return "currentColor";
  return changePct >= 0 ? UP_COLOR : DOWN_COLOR;
}

/** Abbreviate a large number with a T/B/M/K suffix and one fixed precision
 *  policy: "1.23T", "12.30B", "340.00M", "12.3K", "950". The single compact-number
 *  formatter for the whole frame layer — replaces every hand-rolled $T/$B/$M and
 *  the charts-layer `parseMarketData` in frame code. For a currency value, wrap
 *  with {@link formatCompactUsd}; for an exact price use {@link formatPrice}. */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return ABSENT;
  return formatMagnitude(value);
}

/** Abbreviated USD magnitude: "$1.23B", "$340.00M", "$2.10T", "-$5.00B". The one
 *  helper for aggregate dollar figures (market cap, TVL, volume, open interest,
 *  debt). The minus sign leads the `$` so negatives read naturally. */
export function formatCompactUsd(value: number): string {
  if (!Number.isFinite(value)) return ABSENT;
  return formatMoneyCompact(value, "USD");
}

/** Turn a provider slug into a readable series/legend label: "lido" → "Lido",
 *  "rocket-pool" → "Rocket Pool". Keeps chart legends in step with the treemaps,
 *  which get already-pretty names from their providers. */
/**
 * Human name for a GeckoTerminal network id ("eth" → "Ethereum"). Falls back
 * to prettySlug for ids outside the known set, so an enum addition never
 * renders a blank.
 */
const NETWORK_LABELS: Record<string, string> = {
  eth: "Ethereum",
  solana: "Solana",
  base: "Base",
  arbitrum: "Arbitrum",
  bsc: "BNB Chain",
  polygon_pos: "Polygon",
};

export function networkLabel(network: string): string {
  return NETWORK_LABELS[network] ?? prettySlug(network);
}

export function prettySlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Format sats as BTC with sensible precision: "1.23 BTC", "0.0042 BTC". */
export function formatBtc(sats: number): string {
  if (!Number.isFinite(sats)) return ABSENT;
  const btc = sats / 1e8;
  if (btc >= 100) return `${btc.toFixed(0)} BTC`;
  if (btc >= 1) return `${btc.toFixed(2)} BTC`;
  if (btc >= 0.001) return `${btc.toFixed(4)} BTC`;
  return `${Math.round(sats).toLocaleString("en-US")} sats`;
}

/** Format a hashrate in H/s with a binary-ish SI suffix, e.g. "612 EH/s". */
export function formatHashrate(hs: number): string {
  if (!Number.isFinite(hs)) return ABSENT;
  const units = ["H/s", "kH/s", "MH/s", "GH/s", "TH/s", "PH/s", "EH/s", "ZH/s"];
  let v = hs;
  let i = 0;
  while (v >= 1000 && i < units.length - 1) {
    v /= 1000;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2)} ${units[i]}`;
}

/**
 * Compact "time since" label for feeds: "now", "5m", "3h", "2d", "4w", then a
 * date — and "in 5m" / "in 2d" for a timestamp that hasn't happened yet.
 *
 * Three things it deliberately does NOT do, each having been a slip:
 *
 * - It does not clamp the future to `now`. A headline or filing dated ahead of
 *   the reader's clock (a scheduled release, a skewed provider timestamp) read
 *   as "now", which is a claim about the present rather than a missing sign.
 * - It does not drop the year on the date fallback. Past ~5 weeks the label is
 *   an absolute date, and without the year a 2019 filing read exactly like a
 *   this-year one. The year is added only when it differs from the current
 *   one, so an in-year feed stays as short as it was.
 * - It never prints `Invalid Date`. An unparseable timestamp is an absent
 *   figure, not a date-shaped string, so it renders as {@link ABSENT}.
 */
export function timeAgo(ms: number): string {
  if (!Number.isFinite(ms)) return ABSENT;
  const delta = Date.now() - ms;
  const ahead = delta < 0;
  const sec = Math.round(Math.abs(delta) / 1000);
  if (sec < 60) return "now";
  const relative = (label: string) => (ahead ? `in ${label}` : label);
  const min = Math.round(sec / 60);
  if (min < 60) return relative(`${min}m`);
  const hr = Math.round(min / 60);
  if (hr < 24) return relative(`${hr}h`);
  const day = Math.round(hr / 24);
  if (day < 7) return relative(`${day}d`);
  const wk = Math.round(day / 7);
  if (wk < 5) return relative(`${wk}w`);
  const date = new Date(ms);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (date.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return date.toLocaleDateString("en-US", opts);
}
