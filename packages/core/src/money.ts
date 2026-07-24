import type { CurrencyCode } from "@zframes/spec";

/**
 * The money-formatting kernel. React-free, and deliberately the ONE home for
 * "how do we render an amount of money": both the plain USD helpers every frame
 * has always used (`@zframes/frames`'s `formatPrice`/`formatCompact*` delegate
 * here) and the currency-aware `useMoney()` layer read these, so a baht board
 * and a dollar board can never drift into two different roundings.
 *
 * Providers always report USD — the canonical unit of every capability — and
 * conversion happens here at display time.
 */

/**
 * Symbol shown in front of an amount. Ambiguous glyphs are disambiguated the
 * way the surrounding market data expects (CN¥ vs ¥, HK$/S$/A$/C$ vs $), since
 * a dashboard can show two currencies side by side via a per-frame override.
 */
export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: "$",
  THB: "฿",
  EUR: "€",
  GBP: "£",
  JPY: "¥",
  CNY: "CN¥",
  KRW: "₩",
  SGD: "S$",
  AUD: "A$",
  CAD: "C$",
  CHF: "CHF ",
  INR: "₹",
  IDR: "Rp",
  MYR: "RM",
  PHP: "₱",
  HKD: "HK$",
  BRL: "R$",
  MXN: "MX$",
  ZAR: "R",
};

export function currencySymbol(code: CurrencyCode): string {
  return CURRENCY_SYMBOLS[code] ?? "$";
}

/**
 * Abbreviated magnitude, no currency symbol: "1.23T", "340.00M", "-5.00B".
 * The shared scale behind every aggregate figure (market cap, TVL, volume).
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
 */
export function formatAmount(value: number): string {
  if (value >= 1000)
    return value.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (value >= 1)
    return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return value.toPrecision(4);
}

/** A price with its currency symbol: "$20.66", "฿2,160,387". */
export function formatMoney(value: number, code: CurrencyCode): string {
  return `${currencySymbol(code)}${formatAmount(value)}`;
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
