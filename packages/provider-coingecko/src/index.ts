import type {
  Capability,
  CoinMarketEntry,
  GlobalMarket,
  MarketDataProvider,
  MarketSector,
  TrendingCoin,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";

const GLOBAL_URL = "https://api.coingecko.com/api/v3/global";
const MARKETS_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h";
const TRENDING_URL = "https://api.coingecko.com/api/v3/search/trending";
const CATEGORIES_URL = "https://api.coingecko.com/api/v3/coins/categories";

// CoinGecko's keyless public tier is the most rate-limited of our providers — a
// burst of requests (the editor reloading on every Save, or several dashboards
// on one IP) earns an HTTP 429. Both endpoints barely move (CoinGecko refreshes
// the global snapshot ~every 10 min; dominance and the top-50 marketcap table
// drift over hours), so the shared cache serves a fresh value without a network
// call, dedups concurrent loads, persists across reloads, and on a 429 /
// transient error serves the last good value (even past its TTL) instead of an
// error card. Each TTL sits just under its hook's poll interval (global ~15 min,
// markets ~12 min) so background polls still refresh while rapid reloads reuse it.
const globalCache = new TtlCache<GlobalMarket>({
  namespace: "zframes:coingecko:global",
  ttlMs: 12 * 60_000,
  persist: true,
});
const marketsCache = new TtlCache<CoinMarketEntry[]>({
  namespace: "zframes:coingecko:markets",
  ttlMs: 10 * 60_000,
  persist: true,
});
const trendingCache = new TtlCache<TrendingCoin[]>({
  namespace: "zframes:coingecko:trending",
  ttlMs: 10 * 60_000,
  persist: true,
});
const categoriesCache = new TtlCache<MarketSector[]>({
  namespace: "zframes:coingecko:categories",
  ttlMs: 12 * 60_000,
  persist: true,
});

interface CoinGeckoTrending {
  coins?: {
    item: {
      id: string;
      name: string;
      symbol: string;
      market_cap_rank: number | null;
      data?: {
        price?: number | string;
        price_change_percentage_24h?: { usd?: number };
      };
    };
  }[];
}

interface CoinGeckoCategory {
  name: string;
  market_cap: number | null;
  market_cap_change_24h: number | null;
}

interface CoinGeckoGlobal {
  data: {
    total_market_cap: Record<string, number>;
    market_cap_percentage: Record<string, number>;
    market_cap_change_percentage_24h_usd: number;
  };
}

interface CoinGeckoMarket {
  symbol: string;
  name: string;
  market_cap: number;
  price_change_percentage_24h: number | null;
}

/**
 * Free-tier CoinGecko provider (no API key). Its keyless tier is aggressively
 * rate-limited, so both endpoints go through the shared cache — short TTL, in-
 * flight dedup, stale-on-error (see the cache notes above).
 * - global-market: total marketcap + per-asset dominance.
 * - coin-markets: top-50 coins by marketcap with 24h change.
 */
export class CoinGeckoProvider implements MarketDataProvider {
  readonly name = "coingecko";
  readonly capabilities: readonly Capability[] = [
    "global-market",
    "coin-markets",
    "trending-coins",
    "sector-performance",
  ];

  async getTrendingCoins(): Promise<TrendingCoin[]> {
    return trendingCache.get("trending", async () => {
      const body = await fetchJson<CoinGeckoTrending>(TRENDING_URL);
      if (!Array.isArray(body?.coins))
        throw new Error("coingecko trending: unexpected response shape");
      return body.coins.map(({ item }) => {
        const price = Number(item.data?.price);
        const chg = Number(item.data?.price_change_percentage_24h?.usd);
        return {
          id: item.id,
          name: item.name,
          symbol: (item.symbol ?? "").toUpperCase(),
          rank: Number.isFinite(item.market_cap_rank)
            ? item.market_cap_rank
            : null,
          price: Number.isFinite(price) ? price : null,
          changePct24h: Number.isFinite(chg) ? chg : null,
        };
      });
    });
  }

  async getSectorPerformance(): Promise<MarketSector[]> {
    return categoriesCache.get("categories", async () => {
      const body = await fetchJson<CoinGeckoCategory[]>(CATEGORIES_URL);
      if (!Array.isArray(body))
        throw new Error("coingecko categories: unexpected response shape");
      return body
        .filter((c) => Number.isFinite(c.market_cap) && (c.market_cap ?? 0) > 0)
        .map((c) => ({
          name: c.name,
          marketCap: c.market_cap as number,
          changePct24h: Number.isFinite(c.market_cap_change_24h)
            ? (c.market_cap_change_24h as number)
            : 0,
        }))
        .sort((a, b) => b.marketCap - a.marketCap)
        .slice(0, 30);
    });
  }

  async getGlobalMarket(): Promise<GlobalMarket> {
    return globalCache.get("global", async () => {
      const body = await fetchJson<CoinGeckoGlobal>(GLOBAL_URL);
      // The free tier can answer a throttle/error with an unexpected body; guard
      // the shape so it throws a clear error instead of a deep `undefined` access.
      if (!body?.data?.total_market_cap || !body.data.market_cap_percentage)
        throw new Error("coingecko global: unexpected response shape");
      const change = Number(body.data.market_cap_change_percentage_24h_usd);
      return {
        totalMarketCapUsd: body.data.total_market_cap.usd ?? 0,
        marketCapChangePct24h: Number.isFinite(change) ? change : 0,
        dominance: body.data.market_cap_percentage,
      };
    });
  }

  async getCoinMarkets(): Promise<CoinMarketEntry[]> {
    return marketsCache.get("markets", async () => {
      const body = await fetchJson<CoinGeckoMarket[]>(MARKETS_URL);
      if (!Array.isArray(body))
        throw new Error("coingecko markets: unexpected response shape");
      return body
        .filter((c) => Number.isFinite(c.market_cap) && c.market_cap > 0)
        .map((c) => ({
          symbol: (c.symbol ?? "").toUpperCase(),
          name: c.name,
          marketCapUsd: c.market_cap,
          changePct24h: Number.isFinite(c.price_change_percentage_24h)
            ? (c.price_change_percentage_24h as number)
            : undefined,
        }));
    });
  }
}
