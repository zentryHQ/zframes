import { CURRENCY_CODES, type CurrencyCode } from "@zframes/spec";

/**
 * The money-formatting kernel. React-free, and deliberately the ONE home for
 * "how do we render an amount of money": both the plain USD helpers every frame
 * has always used (`@zframes/frames`'s `formatPrice`/`formatCompact*` delegate
 * here) and the currency-aware `useMoney()` layer read these, so a baht board
 * and a dollar board can never drift into two different roundings.
 *
 * Providers always report USD — the canonical unit of every capability — and
 * conversion happens here at display time.
 *
 * Both halves of a currency's presentation — its SYMBOL and its number of MINOR
 * UNITS — are derived from `Intl.NumberFormat` rather than hand-maintained, so
 * the kernel is correct for any ISO-4217 code the spec's enum grows to hold (a
 * hand-typed table silently rendered every unlisted currency as "$", and every
 * currency at two decimals — a fake ".00" on yen, a lost third digit on dinar).
 */

/** What Intl emits for a code it has no currency data for (U+00A4). */
const GENERIC_CURRENCY_GLYPH = "¤";

/**
 * The only symbols we do NOT take from Intl.
 *
 * A dashboard can show two currencies side by side (a per-frame `currency`
 * override), so ambiguous glyphs are disambiguated the way the surrounding
 * market data expects. `en-US` Intl already does this for CNY ("CN¥"), AUD,
 * HKD, MXN and BRL; it disagrees only where it falls back to the bare ISO code
 * for a currency that has a well-known glyph in market data, or where it uses a
 * longer country prefix than the tickers do (CAD: Intl says "CA$").
 *
 * Everything absent from this map — including every code the enum may grow —
 * comes from Intl, with a code-shaped symbol getting a trailing space so
 * "CHF 20.66" still reads as money.
 *
 * Keyed by ISO string, not by `CurrencyCode`: the overrides are facts about
 * currencies, and must not need editing when the spec's enum grows or shrinks.
 */
const SYMBOL_OVERRIDES: Record<string, string> = {
  THB: "฿",
  SGD: "S$",
  CAD: "C$",
  IDR: "Rp",
  MYR: "RM",
  ZAR: "R",
};

/**
 * Minor units where published market practice differs from CLDR's ISO-4217
 * exponent. Rupiah and riel are quoted as whole units — nobody prices in sen or
 * in 1/100 riel — but CLDR reports 2 digits for both. Every other currency's
 * digit count comes from Intl (0 for JPY/KRW/VND/LAK/MMK, 3 for the Gulf
 * dinars, 2 for the rest).
 */
const DIGIT_OVERRIDES: Record<string, number> = {
  IDR: 0,
  KHR: 0,
};

interface CurrencyFormat {
  /** Prefix shown in front of an amount, trailing space included if needed. */
  symbol: string;
  /** Minor units — decimals a price of this currency may carry. */
  digits: number;
}

/** Last-resort presentation for a code Intl cannot resolve at all. */
const FALLBACK: CurrencyFormat = { symbol: "$", digits: 2 };

/**
 * Per-code memo. `currencySymbol` runs on every money figure of every card on
 * every render, and constructing an `Intl.NumberFormat` is the expensive part —
 * measured here at ~75 µs per construction against ~7 ns for the map lookup it
 * feeds, so a formatter per call would cost tens of milliseconds per repaint on
 * a busy board. Each code is resolved exactly once per process.
 */
const formatCache = new Map<string, CurrencyFormat>();

function resolveCurrencyFormat(code: string): CurrencyFormat {
  let fmt: Intl.NumberFormat;
  try {
    fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: code });
  } catch {
    // Intl throws RangeError on a malformed code, and a hand-edited
    // dashboard.json can carry anything. Degrade, never crash a whole board.
    return FALLBACK;
  }
  const resolved = fmt.resolvedOptions();
  const digits =
    DIGIT_OVERRIDES[code] ?? resolved.maximumFractionDigits ?? FALLBACK.digits;

  const override = SYMBOL_OVERRIDES[code];
  if (override !== undefined) return { symbol: override, digits };

  const part = fmt.formatToParts(1).find((p) => p.type === "currency")?.value;
  if (!part || part === GENERIC_CURRENCY_GLYPH) {
    // Well-formed but not a currency Intl knows (e.g. "XXX", the ISO "no
    // currency" code): keep the historical dollar fallback.
    return { symbol: FALLBACK.symbol, digits };
  }
  // A code-shaped symbol ("CHF", "SEK") needs a separator, since callers
  // concatenate symbol + amount. A real glyph never does.
  return { symbol: part === code ? `${part} ` : part, digits };
}

function currencyFormat(code: CurrencyCode): CurrencyFormat {
  const hit = formatCache.get(code);
  if (hit) return hit;
  const fmt = resolveCurrencyFormat(code);
  formatCache.set(code, fmt);
  return fmt;
}

/**
 * Symbol shown in front of an amount, e.g. "$", "฿", "CHF ". Derived from Intl
 * (see `SYMBOL_OVERRIDES` for the deliberate disambiguations) and memoized.
 */
export function currencySymbol(code: CurrencyCode): string {
  return currencyFormat(code).symbol;
}

/**
 * Minor units of a currency: 0 for yen/won/dong, 3 for the Gulf dinars, 2 for
 * most. What keeps a yen price from wearing a fake ".00" and a dinar price from
 * losing its third digit.
 */
export function currencyDigits(code: CurrencyCode): number {
  return currencyFormat(code).digits;
}

/**
 * Symbol per currency code. Derived, not hand-maintained: each entry is a lazy
 * getter over the same memo `currencySymbol` uses, so the table is exhaustive
 * over `CURRENCY_CODES` by construction however long that list grows, and no
 * `Intl.NumberFormat` is built for a code nobody asks about.
 */
export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> =
  Object.defineProperties(
    {} as Record<CurrencyCode, string>,
    Object.fromEntries(
      CURRENCY_CODES.map((code) => [
        code,
        { enumerable: true, get: () => currencySymbol(code) },
      ]),
    ),
  );

/**
 * Grouped number formatters, memoized by decimal count. `Number#toLocaleString`
 * with an options object is defined as constructing a formatter per call, which
 * measures ~52 µs here against ~0.5 µs for `format()` on a cached one — the same
 * per-render tax the currency memo above avoids, on the hotter of the two paths.
 * Output is identical by definition.
 */
const groupedFormatters = new Map<number, Intl.NumberFormat>();

function groupedFormatter(maximumFractionDigits: number): Intl.NumberFormat {
  const hit = groupedFormatters.get(maximumFractionDigits);
  if (hit) return hit;
  const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits });
  groupedFormatters.set(maximumFractionDigits, fmt);
  return fmt;
}

/**
 * Abbreviated magnitude, no currency symbol: "1.23T", "340.00M", "-5.00B".
 * The shared scale behind every aggregate figure (market cap, TVL, volume).
 *
 * Deliberately currency-BLIND: this is a scale, not a price. A "1.23T" reads
 * the same in every currency, and giving it per-currency decimals would make
 * one board's aggregates disagree with another's for no reader benefit.
 */
export function formatMagnitude(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
}

/**
 * A single price/level at price-like precision, no currency symbol: "2,160,387",
 * "20.66", "0.6145". Precision steps with magnitude so a sub-dollar altcoin and
 * a six-figure BTC print both read sensibly.
 *
 * `code` supplies the minor units of the unit-scale band (a yen price rounds to
 * whole yen, a dinar price may keep three decimals); it defaults to USD, so the
 * historical one-argument call is unchanged. The other two bands are unaffected
 * on purpose: above 1,000 every currency already rounds to whole units, and
 * below 1 the four-significant-digit floor is what makes a sub-unit price
 * legible at all — rounding 0.6145 to "1" because yen has no sen would destroy
 * the number.
 */
export function formatAmount(
  value: number,
  code: CurrencyCode = "USD",
): string {
  if (value >= 1000) return groupedFormatter(0).format(value);
  if (value >= 1) return groupedFormatter(currencyDigits(code)).format(value);
  return value.toPrecision(4);
}

/** A price with its currency symbol: "$20.66", "฿2,160,387", "¥1,235". */
export function formatMoney(value: number, code: CurrencyCode): string {
  return `${currencySymbol(code)}${formatAmount(value, code)}`;
}

/**
 * An aggregate with its currency symbol: "$1.23B", "-฿5.00B". The minus sign
 * leads the symbol so negatives read naturally.
 */
export function formatMoneyCompact(value: number, code: CurrencyCode): string {
  const symbol = currencySymbol(code);
  return value < 0
    ? `-${symbol}${formatMagnitude(-value)}`
    : `${symbol}${formatMagnitude(value)}`;
}
