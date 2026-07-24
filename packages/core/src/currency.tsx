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
  code: CurrencyCode;
  /** USD → display-currency multiplier. 1 while USD, or until the rate lands. */
  rate: number;
  /** True once a non-USD rate has actually resolved. */
  converted: boolean;
}

const USD_STATE: CurrencyState = { code: "USD", rate: 1, converted: true };

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
  // Hooks can't be called conditionally: on a USD board this still runs, but
  // with an empty symbol list it never asks a provider for anything.
  const { rates } = useFxRates("USD", needsRate ? [code] : []);
  const rate = needsRate
    ? (rates.find((r) => r.symbol === code)?.rate ?? 0)
    : 1;

  const value = useMemo<CurrencyState>(() => {
    // Until the rate resolves, keep quoting USD. Showing a baht symbol against
    // an unconverted dollar amount would be a wrong number, not a slow one —
    // the label and the value must always agree.
    if (!needsRate || rate <= 0) return USD_STATE;
    return { code, rate, converted: true };
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
 */
export function FrameCurrencyOverride({
  code,
  children,
}: {
  code?: CurrencyCode;
  children: ReactNode;
}) {
  const inherited = useContext(CurrencyContext);
  if (!code || code === inherited.code) return <>{children}</>;
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
