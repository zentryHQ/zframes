import type { OptionContract, OptionsChain } from "@zframes/core";
import { DOWN_COLOR, UP_COLOR } from "./format";

/**
 * Shared plumbing for the four listed-equity option-chain frames
 * (`equity-options-oi` / `-smile` / `-max-pain` / `-greeks`).
 *
 * The equity feed delivers a RAW per-contract chain — thousands of contracts
 * across every listed expiry — where the Deribit-backed crypto frames receive a
 * pre-aggregated summary. Everything those frames read straight off that summary
 * (which expiry to show, where spot is, one row per strike) has to be derived
 * here, and all four cards must derive it identically: the same ticker on the
 * same board reading a different expiry card to card is the failure this module
 * exists to prevent.
 */

/** Calls take the up tint and puts the down tint — the pairing the Deribit
 *  options frames already use, so a crypto and an equity board read alike. */
export const CALL = UP_COLOR;
export const PUT = DOWN_COLOR;

/** Absolute open-interest floor for "this expiry is worth charting". */
const MIN_EXPIRY_OI = 250;
/** …and a scale-free one, so a thin small-cap chain isn't held to a mega-cap's
 *  bar. An expiry qualifies on whichever floor is higher. */
const RELATIVE_OI_FLOOR = 0.1;

/** US listed equity options deliver 100 shares, so a payout expressed per share
 *  is not yet money. Crypto options are 1:1, which is why the Deribit max-pain
 *  frame has no such factor. */
export const CONTRACT_MULTIPLIER = 100;

export interface ExpiryView {
  /** ISO expiry date, "YYYY-MM-DD". */
  expiry: string;
  /** Every contract at that expiry, in the order the chain delivered them. */
  contracts: OptionContract[];
  /** Whole days from today to expiry; 0 on expiry day, negative once past. */
  dte: number;
  /** Open interest summed across the expiry — what the liquidity floor tests. */
  totalOi: number;
}

/** One strike's call and put leg at a single expiry. Either can be absent: a
 *  chain routinely lists a strike on one side only. */
export interface StrikeRow {
  strike: number;
  call?: OptionContract;
  put?: OptionContract;
}

export type GreekKey = "delta" | "gamma" | "vega" | "theta";

/** Open interest as a usable number — a missing or malformed count is zero, not
 *  a `NaN` that poisons every sum downstream. */
export function oiOf(contract?: OptionContract): number {
  const oi = contract?.openInterest;
  return typeof oi === "number" && Number.isFinite(oi) && oi > 0 ? oi : 0;
}

/** Implied vol, or undefined when the contract has no market. A raw 0 means "no
 *  quote", never "zero volatility" — plotted, it drags the whole smile onto the
 *  floor, so it is dropped here once for all four cards. */
export function ivOf(contract?: OptionContract): number | undefined {
  const iv = contract?.iv;
  return typeof iv === "number" && Number.isFinite(iv) && iv > 0
    ? iv
    : undefined;
}

/** A published greek, or undefined when the feed didn't carry one. Unlike IV, a
 *  near-zero greek is legitimate — it is what a deep-OTM contract genuinely has
 *  — so only a missing or non-finite value counts as absent. */
export function greekOf(
  contract: OptionContract | undefined,
  greek: GreekKey,
): number | undefined {
  const value = contract?.[greek];
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/** Midnight LOCAL for an ISO date. A bare "YYYY-MM-DD" parsed by `Date` is read
 *  as UTC, which puts expiry a day early everywhere west of Greenwich — the
 *  same footgun the card event markers hit. */
function localMidnight(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return NaN;
  return new Date(y, m - 1, d).getTime();
}

/** Whole days from today to `expiry`; `NaN` if the date is unparseable. */
export function daysToExpiry(expiry: string, now = Date.now()): number {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((localMidnight(expiry) - today.getTime()) / 86_400_000);
}

/**
 * Which expiry the card shows. An explicit `requested` wins outright (absent
 * from the chain → no view, so the card can say so by name).
 *
 * Otherwise: the NEAREST expiry that clears the liquidity floor — not simply the
 * nearest, because the front weekly is often nearly empty and renders as a
 * garbage-looking card that reads like a bug. When nothing clears the floor the
 * busiest expiry is the fallback, so a thin chain still shows its best row.
 */
export function selectExpiry(
  chain: OptionsChain,
  requested?: string,
): ExpiryView | null {
  const byExpiry = new Map<string, OptionContract[]>();
  for (const contract of chain.contracts) {
    const list = byExpiry.get(contract.expiry);
    if (list) list.push(contract);
    else byExpiry.set(contract.expiry, [contract]);
  }

  const toView = (expiry: string, contracts: OptionContract[]): ExpiryView => ({
    expiry,
    contracts,
    dte: daysToExpiry(expiry),
    totalOi: contracts.reduce((sum, c) => sum + oiOf(c), 0),
  });

  if (requested) {
    const contracts = byExpiry.get(requested);
    return contracts && contracts.length > 0
      ? toView(requested, contracts)
      : null;
  }

  // ISO dates sort lexicographically, so this is date order.
  const views = [...byExpiry.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([expiry, contracts]) => toView(expiry, contracts));
  if (views.length === 0) return null;

  const busiest = views.reduce((a, b) => (b.totalOi > a.totalOi ? b : a));
  const floor = Math.max(MIN_EXPIRY_OI, busiest.totalOi * RELATIVE_OI_FLOOR);
  const liquid = views.filter((v) => v.totalOi >= floor && v.dte >= 0);
  return liquid[0] ?? busiest;
}

/**
 * Where the underlying trades. `underlyingPrice` when the feed carries it,
 * otherwise the strike holding the most open interest — a decent proxy, since
 * positioning clusters at the money, but an estimate, and the caller is told so
 * rather than quietly printing a strike as if it were a price.
 */
export function resolveSpot(
  chain: OptionsChain,
  contracts: OptionContract[],
): { spot: number; estimated: boolean } | null {
  const px = chain.underlyingPrice;
  if (typeof px === "number" && Number.isFinite(px) && px > 0)
    return { spot: px, estimated: false };

  const oiByStrike = new Map<number, number>();
  for (const contract of contracts) {
    if (!Number.isFinite(contract.strike)) continue;
    oiByStrike.set(
      contract.strike,
      (oiByStrike.get(contract.strike) ?? 0) + oiOf(contract),
    );
  }
  let best: number | null = null;
  let bestOi = -1;
  for (const [strike, oi] of oiByStrike) {
    if (oi > bestOi) {
      bestOi = oi;
      best = strike;
    }
  }
  return best !== null && best > 0 ? { spot: best, estimated: true } : null;
}

/** Collapse an expiry's contracts into one ascending row per strike. */
export function strikeRows(contracts: OptionContract[]): StrikeRow[] {
  const byStrike = new Map<number, StrikeRow>();
  for (const contract of contracts) {
    if (!Number.isFinite(contract.strike) || contract.strike <= 0) continue;
    let row = byStrike.get(contract.strike);
    if (!row) {
      row = { strike: contract.strike };
      byStrike.set(contract.strike, row);
    }
    if (contract.side === "call") row.call = contract;
    else row.put = contract;
  }
  return [...byStrike.values()].sort((a, b) => a.strike - b.strike);
}

/** The `count` strikes nearest spot — nearest on BOTH sides, then back to
 *  ascending order for the axis. Taking the first `count` of the sorted ladder
 *  instead would show the cheapest strikes on the board, not the traded ones. */
export function nearestStrikes(
  rows: StrikeRow[],
  spot: number,
  count: number,
): StrikeRow[] {
  return [...rows]
    .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))
    .slice(0, count)
    .sort((a, b) => a.strike - b.strike);
}

/**
 * Where spot falls on a categorical strike axis, as a FRACTIONAL band index
 * (3.4 = 40% of the way from band 3 to band 4) — spot almost never sits exactly
 * on a listed strike, and snapping it to the nearest one moves the marker by up
 * to half a strike increment. Returns null for an empty ladder.
 */
export function spotBandIndex(strikes: number[], spot: number): number | null {
  const n = strikes.length;
  if (n === 0 || !Number.isFinite(spot)) return null;
  if (spot <= strikes[0]) return 0;
  if (spot >= strikes[n - 1]) return n - 1;
  for (let i = 0; i < n - 1; i++) {
    if (spot >= strikes[i] && spot <= strikes[i + 1]) {
      const span = strikes[i + 1] - strikes[i] || 1;
      return i + (spot - strikes[i]) / span;
    }
  }
  return null;
}

/** Put OI over call OI across whatever contracts are passed; null when there is
 *  no call OI to divide by. Above 1 = more downside than upside open. */
export function putCallOiRatio(contracts: OptionContract[]): number | null {
  let calls = 0;
  let puts = 0;
  for (const contract of contracts) {
    if (contract.side === "call") calls += oiOf(contract);
    else puts += oiOf(contract);
  }
  return calls > 0 ? puts / calls : null;
}

/** "2026-08-21 · 12d". The days-to-expiry half is dropped rather than printed
 *  as `NaNd` if the feed hands over a date we can't parse. */
export function expiryLabel(expiry: string, dte: number): string {
  if (!Number.isFinite(dte)) return expiry;
  if (dte < 0) return `${expiry} · expired`;
  if (dte === 0) return `${expiry} · today`;
  return `${expiry} · ${dte}d`;
}

/** Quote-freshness disclosure. Every one of these cards shows it: the equity
 *  feed is 15 minutes behind, and a live-looking option chain that isn't is
 *  worse than no chain. */
export function delayLabel(delayMinutes: number): string {
  if (!Number.isFinite(delayMinutes) || delayMinutes <= 0) return "live quotes";
  return `quotes delayed ${Math.round(delayMinutes)}m`;
}

/** Calm empty state naming the ticker — a symbol with no listed options is a
 *  fact about the symbol, not an error. */
export function emptyChainLabel(ticker: string, expiry?: string): string {
  const name = ticker || "this symbol";
  return expiry
    ? `no ${expiry} contracts listed for ${name}`
    : `no listed options for ${name}`;
}
