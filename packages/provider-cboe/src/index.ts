import type {
  Capability,
  MarketDataProvider,
  OptionContract,
  OptionsChain,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";
import { parseOccSymbol } from "./occ";

/**
 * Keyless provider for Cboe's delayed listed-equity option chains — the
 * `options-chain` capability, and the equity counterpart to provider-deribit's
 * crypto `options-summary`.
 *
 * The endpoint (`cdn.cboe.com/api/global/delayed_quotes/options/<SYMBOL>.json`)
 * is the one Cboe's own public quote pages read: no key, no token, no signup.
 * It answers the WHOLE chain for an underlying in one document — every listed
 * expiry, both sides, with IV, greeks, open interest and volume per contract.
 *
 * **Delayed by 15 minutes.** That's stated in the returned
 * {@link OptionsChain.delayMinutes} rather than buried here, so a frame can
 * label it honestly. It also sets the cache policy below: re-downloading
 * megabytes at a one-minute cadence buys nothing when the feed itself only
 * moves every fifteen.
 *
 * **CORS:** the CDN sends no `Access-Control-Allow-Origin`, so browser fetches
 * relay through the runtime's same-origin proxy (`cdn.cboe.com` is on the serve
 * allowlist); Node fetches direct. On a static host with no runtime these
 * frames degrade to empty, like every other proxied provider.
 *
 * **Size, and why this is NEVER persisted.** One chain is ~1.7 MB of JSON
 * (~3,900 contracts) for a name like NVDA. The shared `TtlCache` can round-trip
 * values through localStorage, and doing that here would be actively
 * destructive: two or three underlyings would exhaust the ~5 MB origin quota,
 * at which point `setItem` throws, the cache swallows it, and persistence stops
 * working silently for EVERY other provider on the board. So `persist: false`
 * (the default, spelled out anyway) and a small `maxEntries` — the in-memory
 * copies are large enough that a handful is the right ceiling.
 */

const CHAIN_URL = (ticker: string) =>
  `https://cdn.cboe.com/api/global/delayed_quotes/options/${ticker}.json`;

/** Quotes lag real time by 15 minutes on this feed. Reported, not hidden. */
const DELAY_MINUTES = 15;

/**
 * 5 minutes: comfortably under the 15-minute publication lag, so a background
 * poll still lands on genuinely new quotes, while reloads and a second card on
 * the same underlying reuse one download instead of pulling 1.7 MB again.
 *
 * `persist: false` and a tight `maxEntries` for the reason in the file header —
 * a persisted chain would blow the origin's localStorage quota and take every
 * other provider's persistence down with it.
 */
const chainCache = new TtlCache<OptionsChain>({
  namespace: "zframes:cboe:chain",
  ttlMs: 5 * 60_000,
  persist: false,
  maxEntries: 4,
});

/** Chains run to several MB through the relay; the 10s default is not enough. */
const FETCH_TIMEOUT_MS = 25_000;

/** One row of `data.options` — everything but `option` is already numeric. */
interface CboeOptionRow {
  option: string;
  bid: number;
  ask: number;
  iv: number;
  open_interest: number;
  volume: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
  last_trade_price: number;
  /** `null` on a contract that has never traded — see {@link lastTraded}. */
  last_trade_time: string | null;
}

interface CboeChainResponse {
  data?: {
    options?: CboeOptionRow[];
    current_price?: number;
    /** 30-day IV for the underlying, in PERCENT — unlike the per-row `iv`. */
    iv30?: number;
  };
}

/** Strip a HIP-3 dex prefix to the bare ticker: "xyz:NVDA" → "NVDA". */
function tickerOf(symbol: string): string {
  const i = symbol.indexOf(":");
  return i === -1 ? symbol : symbol.slice(i + 1);
}

/** Keep a published number, drop anything non-finite. */
function finite(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

/**
 * `iv: 0` means "Cboe published no implied volatility for this contract", not
 * "this contract has zero volatility" — 583 of NVDA's 3,952 rows print it,
 * including deep-ITM series that quote normally. A frame averaging the raw
 * field would drag its smile toward zero.
 *
 * **Deliberately asymmetric with the greeks.** Those same rows also carry
 * `gamma: 0` / `vega: 0`, but a genuinely near-zero gamma exists on every deep
 * OTM contract in the chain, so there is no value that reliably means "absent"
 * — zeroing them out would be guessing. Greeks pass through as published; only
 * `iv` gets the missing-value treatment, because only `iv` has an impossible
 * sentinel.
 */
function ivOrUndefined(iv: number | undefined): number | undefined {
  const value = finite(iv);
  return value === 0 ? undefined : value;
}

/**
 * Last traded price, or undefined on a contract that has never traded.
 *
 * `last_trade_time: null` is the honest signal (it tracks `last_trade_price: 0`
 * exactly — 549/3,952 rows on the sampled NVDA chain), so read the timestamp
 * rather than treating a 0 price as a sentinel: for a bid/ask this feed
 * publishes, 0 is a real quote and not an absence.
 */
function lastTraded(row: CboeOptionRow): number | undefined {
  return row.last_trade_time === null
    ? undefined
    : finite(row.last_trade_price);
}

/** Build the public contract shape, or null when the row's id doesn't parse. */
function toContract(row: CboeOptionRow): OptionContract | null {
  const parsed = parseOccSymbol(row.option);
  if (!parsed) return null;
  return {
    contract: row.option,
    expiry: parsed.expiry,
    strike: parsed.strike,
    side: parsed.side,
    iv: ivOrUndefined(row.iv),
    openInterest: finite(row.open_interest) ?? 0,
    volume: finite(row.volume) ?? 0,
    bid: finite(row.bid),
    ask: finite(row.ask),
    lastPrice: lastTraded(row),
    delta: finite(row.delta),
    gamma: finite(row.gamma),
    vega: finite(row.vega),
    theta: finite(row.theta),
    rho: finite(row.rho),
  };
}

/**
 * Expiry ascending, then strike ascending, then calls before puts. Sorted here
 * once so no frame has to: a strike ladder, a term-structure table and an OI
 * histogram all want the same order, and the upstream file isn't in it.
 * Expiries are ISO dates, so a lexicographic compare is also chronological.
 */
function byExpiryStrikeSide(a: OptionContract, b: OptionContract): number {
  if (a.expiry !== b.expiry) return a.expiry < b.expiry ? -1 : 1;
  if (a.strike !== b.strike) return a.strike - b.strike;
  if (a.side === b.side) return 0;
  return a.side === "call" ? -1 : 1;
}

/** HTTP status out of the transport's `"<url> failed: <status>"` error. */
function statusOf(error: unknown): number | null {
  const match = /failed: (\d{3})$/.exec(
    error instanceof Error ? error.message : String(error),
  );
  return match ? Number(match[1]) : null;
}

export class CboeProvider implements MarketDataProvider {
  readonly name = "cboe";
  readonly capabilities: readonly Capability[] = ["options-chain"];

  async getOptionsChain(symbol: string): Promise<OptionsChain> {
    // The CDN keys are case-sensitive object names: `nvda.json` is a 403, not a
    // redirect to the uppercase one.
    const ticker = tickerOf(symbol).trim().toUpperCase();
    if (!ticker) throw new Error("cboe: no symbol given");
    return chainCache.get(ticker, () => this.fetchChain(ticker));
  }

  private async fetchChain(ticker: string): Promise<OptionsChain> {
    let body: CboeChainResponse;
    try {
      body = await fetchJson<CboeChainResponse>(CHAIN_URL(ticker), undefined, {
        proxied: true,
        timeoutMs: FETCH_TIMEOUT_MS,
      });
    } catch (error) {
      // The CDN is an S3 bucket, so an underlying with no published chain (or a
      // typo'd ticker) answers **403 AccessDenied**, not 404 — the object
      // simply isn't there. Both mean the same thing to a reader, and neither
      // is worth surfacing as a raw transport failure.
      const status = statusOf(error);
      if (status === 403 || status === 404)
        throw new Error(`cboe: no listed options for "${ticker}"`, {
          cause: error,
        });
      throw error;
    }

    const rows = body?.data?.options;
    if (!Array.isArray(rows))
      throw new Error("cboe: unexpected options-chain response shape");

    const contracts: OptionContract[] = [];
    for (const row of rows) {
      const contract = toContract(row);
      // A row whose id doesn't parse tells us nothing — no expiry, no strike,
      // no side — so it's dropped rather than rendered as a mystery line.
      if (contract) contracts.push(contract);
    }
    if (contracts.length === 0)
      throw new Error(`cboe: no parseable contracts for "${ticker}"`);
    contracts.sort(byExpiryStrikeSide);

    // The two IV fields in this ONE response use different scales: per-contract
    // `iv` is a decimal (0.3531 = 35.31%) while the underlying's `iv30` is a
    // percent (42.682 = 42.68%). The spec's OptionsChain.iv30 is a decimal, so
    // it's normalised here — passing it through would report 4268% vol.
    const iv30 = finite(body.data?.iv30);

    return {
      symbol: ticker,
      underlyingPrice: finite(body.data?.current_price),
      iv30: iv30 === undefined ? undefined : iv30 / 100,
      delayMinutes: DELAY_MINUTES,
      contracts,
    };
  }
}

export { parseOccSymbol } from "./occ";
export type { ParsedOccSymbol } from "./occ";
