import type {
  Capability,
  GlobalMarket,
  MarketDataProvider,
} from "@zframes/core";
import { fetchJson } from "@zframes/core/fetch";

const GLOBAL_URL = "https://api.coingecko.com/api/v3/global";

// CoinGecko's keyless public tier is the most rate-limited of our providers — a
// burst of requests (notably the editor reloading on every Save, or several
// dashboards on one IP) earns an HTTP 429. The global snapshot barely moves
// (CoinGecko itself only refreshes it ~every 10 min, and dominance drifts over
// hours), so we cache it: serve a fresh value without hitting the network, and
// on a 429 / transient error fall back to the last value we got (even past its
// TTL) instead of surfacing an error card. Kept just under useGlobalMarket's
// ~15-min poll (its low jitter bound is ~12.75 min) so background polls still
// refresh, while rapid reloads reuse the cache.
const CACHE_KEY = "zframes:coingecko:global";
const TTL_MS = 12 * 60_000;

interface CachedGlobal {
  at: number;
  value: GlobalMarket;
}

// In-memory for the session; localStorage (when present) carries it across page
// reloads so a cold start shows the last known value immediately. Absent in
// Node/CLI (the one-shot snapshot path), where memo alone suffices.
let memo: CachedGlobal | null = null;

function readCache(): CachedGlobal | null {
  if (memo) return memo;
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        memo = JSON.parse(raw) as CachedGlobal;
        return memo;
      }
    }
  } catch {
    // ignore parse / access errors — treat as a cache miss
  }
  return null;
}

function writeCache(value: GlobalMarket): void {
  memo = { at: Date.now(), value };
  try {
    if (typeof localStorage !== "undefined")
      localStorage.setItem(CACHE_KEY, JSON.stringify(memo));
  } catch {
    // ignore quota / access errors — the in-memory memo still helps this session
  }
}

interface CoinGeckoGlobal {
  data: {
    total_market_cap: Record<string, number>;
    market_cap_percentage: Record<string, number>;
    market_cap_change_percentage_24h_usd: number;
  };
}

/**
 * Free-tier CoinGecko provider (no API key). Its keyless tier is aggressively
 * rate-limited, so {@link getGlobalMarket} caches with a short TTL and serves
 * stale data on error (see the cache notes above).
 * - global-market: total marketcap + per-asset dominance.
 */
export class CoinGeckoProvider implements MarketDataProvider {
  readonly name = "coingecko";
  readonly capabilities: readonly Capability[] = ["global-market"];

  async getGlobalMarket(): Promise<GlobalMarket> {
    const cached = readCache();
    // Fresh enough → skip the network entirely (saves us a rate-limit token).
    if (cached && Date.now() - cached.at < TTL_MS) return cached.value;
    try {
      const body = await fetchJson<CoinGeckoGlobal>(GLOBAL_URL);
      // The free tier can answer a throttle/error with an unexpected body; guard
      // the shape so it throws a clear error instead of a deep `undefined` access.
      if (!body?.data?.total_market_cap || !body.data.market_cap_percentage)
        throw new Error("coingecko global: unexpected response shape");
      const change = Number(body.data.market_cap_change_percentage_24h_usd);
      const value: GlobalMarket = {
        totalMarketCapUsd: body.data.total_market_cap.usd ?? 0,
        marketCapChangePct24h: Number.isFinite(change) ? change : 0,
        dominance: body.data.market_cap_percentage,
      };
      writeCache(value);
      return value;
    } catch (err) {
      // Rate-limited or transient: a few-minutes-old snapshot beats an error
      // card, so serve stale if we have anything. Only throw when truly empty.
      if (cached) return cached.value;
      throw err;
    }
  }
}
