import type { Capability, CoinMover, MarketDataProvider } from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";

// 300 coins (~245 KB) covers far past anything a movers list needs while staying
// well inside the 2000-coin free cap and the 10 req/s limit.
const MOVERS_LIMIT = 300;
const moversUrl = (limit: number) =>
  `https://api.coinpaprika.com/v1/tickers?quotes=USD&limit=${limit}`;

// Coinpaprika's free tier (~20–25k calls/month, 10 req/s hard cap) is CORS-open,
// so fetches are unproxied. The movers snapshot drifts over minutes, so the
// shared cache serves a fresh value without a network call, dedups concurrent
// loads, persists across reloads, and on error serves the last good value. TTL
// (12 min) sits just under the hook's 15-min poll — the conservative CoinGecko
// cadence — so background polls refresh while reloads/extra frames reuse it.
const moversCache = new TtlCache<CoinMover[]>({
  namespace: "zframes:coinpaprika:movers",
  ttlMs: 12 * 60_000,
  persist: true,
});

interface CpTicker {
  symbol: string;
  name: string;
  rank: number;
  quotes?: {
    USD?: {
      price: number;
      market_cap: number;
      volume_24h: number;
      percent_change_1h: number;
      percent_change_24h: number;
      percent_change_7d: number;
      percent_change_30d: number;
    };
  };
}

const num = (v: number) => (Number.isFinite(v) ? v : 0);

/**
 * Free-tier Coinpaprika provider (no API key, CORS-open). Surfaces the
 * `coin-movers` capability: broad multi-window price-change snapshots across the
 * top ~300 coins by market cap — net-new vs CoinGecko's top-50 + 24h-only table.
 */
export class CoinpaprikaProvider implements MarketDataProvider {
  readonly name = "coinpaprika";
  readonly capabilities: readonly Capability[] = ["coin-movers"];

  async getCoinMovers(limit = MOVERS_LIMIT): Promise<CoinMover[]> {
    return moversCache.get(`movers:${limit}`, async () => {
      const body = await fetchJson<CpTicker[]>(moversUrl(limit));
      if (!Array.isArray(body))
        throw new Error("coinpaprika tickers: unexpected response shape");
      return body
        .filter((c) => c?.quotes?.USD && Number.isFinite(c.quotes.USD.price))
        .map((c) => {
          const q = c.quotes!.USD!;
          return {
            symbol: (c.symbol ?? "").toUpperCase(),
            name: c.name,
            rank: c.rank,
            priceUsd: q.price,
            marketCapUsd: q.market_cap,
            volume24hUsd: q.volume_24h,
            changePct: {
              "1h": num(q.percent_change_1h),
              "24h": num(q.percent_change_24h),
              "7d": num(q.percent_change_7d),
              "30d": num(q.percent_change_30d),
            },
          };
        });
    });
  }
}
