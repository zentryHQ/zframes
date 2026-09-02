import type { CurrencyCode } from "@zframes/spec";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useFxRates } from "./hooks";
import {
  currencySymbol,
  formatMoney,
  formatMoneyCompact,
  formatMagnitude,
} from "./money";

/**
 * The display-currency layer.
 *
 * Providers report USD — the canonical unit of every capability — and this
 * converts at the live ECB reference rate (the keyless `fx-rates` capability)
 * for display only. The dashboard declares `currency.code`; a single card may
 * override it (`FrameInstance.currency`), so two cards can quote two currencies
 * side by side.
 *
 * Deliberately NOT applied to US-macro series (Treasury yields, CPI, the
 * national debt): those frames keep their USD helpers, because a baht-converted
 * national debt figure would be a number nobody quotes.
 */

interface CurrencyState {
  /** The code actually being QUOTED — "USD" until a non-USD rate resolves. */
  code: CurrencyCode;
  /**
   * The code the enclosing scope was CONFIGURED with, resolved or not. What
   * "does this card's override repeat what it would inherit anyway?" has to be
   * asked against: `code` is still "USD" while the board's rate is in flight,
   * so comparing against it made a THB card on a THB board look like a genuine
   * third-currency override — a second poll for the same code, and a full
   * remount of the card's subtree once the board's rate landed.
   */
  configured: CurrencyCode;
  /** USD → display-currency multiplier. 1 while USD, or until the rate lands. */
  rate: number;
  /** True once a non-USD rate has actually resolved. */
  converted: boolean;
}

const USD_STATE: CurrencyState = {
  code: "USD",
  configured: "USD",
  rate: 1,
  converted: true,
};

const CurrencyContext = createContext<CurrencyState>(USD_STATE);

/**
 * Resolves the dashboard's display currency once, at the board level, and
 * publishes it to every card. One FX poll for the whole dashboard — the rate is
 * an ECB daily reference rate, so it is fetched hourly and shared, never per
 * frame.
 */
export function DashboardCurrencyProvider({
  code = "USD",
  children,
}: {
  code?: CurrencyCode;
  children: ReactNode;
}) {
  const needsRate = code !== "USD";
  // Hooks can't be called conditionally: on a USD board this still runs, but an
  // empty symbol list short-circuits INSIDE `useFxRates` — no loader, so no
  // fetch and no poll timer, whatever the mounted provider does with `[]`.
  const { rates } = useFxRates("USD", needsRate ? [code] : []);
  const rate = needsRate
    ? (rates.find((r) => r.symbol === code)?.rate ?? 0)
    : 1;

  const value = useMemo<CurrencyState>(() => {
    if (!needsRate) return USD_STATE;
    // Until the rate resolves, keep quoting USD. Showing a baht symbol against
    // an unconverted dollar amount would be a wrong number, not a slow one —
    // the label and the value must always agree. `converted` stays FALSE here
    // (unlike the genuine USD board above): it is the one signal a frame has
    // for "this figure is still dollars", so reporting true in the fallback
    // would make it a trap rather than a flag. `configured` still carries the
    // board's chosen code, so a per-card override can recognise a repeat of it.
    if (rate <= 0)
      return { code: "USD", configured: code, rate: 1, converted: false };
    return { code, configured: code, rate, converted: true };
  }, [code, needsRate, rate]);

  return (
    <CurrencyContext.Provider value={value}>
      {children}
    </CurrencyContext.Provider>
  );
}

/**
 * Overrides the display currency for one card (`FrameInstance.currency`).
 * Rendered by FrameContent inside the dashboard-level provider, so an override
 * to a *third* currency still resolves its own rate.
 *
 * An override equal to what the card would inherit is a pass-through: it is
 * compared against the inherited `configured` code, NOT the code currently
 * being quoted. A THB card on a THB board is the shape a generating agent
 * writes easily, and against the quoted code it read as a third currency for
 * as long as the board's rate was in flight — a duplicate poll, and then a
 * remount (element type swaps from a Fragment to a provider) that threw away
 * whatever state the frame was holding: a scroll offset, a timeframe pick, a
 * half-finished interaction.
 */
export function FrameCurrencyOverride({
  code,
  children,
}: {
  code?: CurrencyCode;
  children: ReactNode;
}) {
  const inherited = useContext(CurrencyContext);
  if (!code || code === inherited.configured) return <>{children}</>;
  return (
    <DashboardCurrencyProvider code={code}>
      {children}
    </DashboardCurrencyProvider>
  );
}

/** Money formatters bound to the card's display currency. */
export interface Money {
  /** The currency actually being displayed (USD until a rate resolves). */
  code: CurrencyCode;
  /** Symbol for `code`, e.g. "฿". */
  symbol: string;
  /** USD → `code` multiplier. */
  rate: number;
  /** False while a requested non-USD rate is still unresolved. */
  converted: boolean;
  /** Convert a USD amount into the display currency. */
  convert(usd: number): number;
  /** A price/level from a USD value: "$20.66" / "฿694.18". */
  price(usd: number): string;
  /** An aggregate from a USD value: "$1.23B" / "฿41.35B". */
  compact(usd: number): string;
  /** An aggregate with no symbol, for axis ticks: "1.23B". */
  magnitude(usd: number): string;
}

/**
 * The money primitive for frames. Takes USD in, renders the card's currency —
 * use it anywhere a frame would otherwise call `formatPrice`/`formatCompactUsd`
 * on market data. Values that are not money (percentages, counts, rates) and
 * US-macro dollar series stay on the plain helpers.
 */
export function useMoney(): Money {
  const { code, rate, converted } = useContext(CurrencyContext);
  return useMemo(
    () => ({
      code,
      symbol: currencySymbol(code),
      rate,
      converted,
      convert: (usd: number) => usd * rate,
      price: (usd: number) => formatMoney(usd * rate, code),
      compact: (usd: number) => formatMoneyCompact(usd * rate, code),
      magnitude: (usd: number) => formatMagnitude(usd * rate),
    }),
    [code, rate, converted],
  );
}
