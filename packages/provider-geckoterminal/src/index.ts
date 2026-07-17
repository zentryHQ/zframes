import type { Capability, DexPool, MarketDataProvider } from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";

const BASE_URL = "https://api.geckoterminal.com/api/v2";
const DEFAULT_NETWORK = "eth";
/** Trending pools returns 20; a dashboard card shows a top slice. */
const MAX_POOLS = 15;

// GeckoTerminal's keyless public tier is capped at ~30 requests/min. Trending
// pools rotate over minutes, so a ~100s TTL (under useDexPools' ~2 min poll)
// keeps the list fresh while a reload or a second pool frame reuses the cache
// instead of spending another request. Not persisted: a hot-pools list is too
// short-lived to be worth reviving stale across a reload. Keyed by network so
// an ETH card and a Solana card don't collide. staleOnError (default) rides out
// a transient 429 by serving the last good in-memory list.
const poolsCache = new TtlCache<DexPool[]>({
  namespace: "zframes:geckoterminal:pools",
  ttlMs: 100_000,
});

/** GeckoTerminal serves every numeric field as a string; parse defensively. */
function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

interface GeckoTerminalPool {
  attributes?: {
    name?: string;
    base_token_price_usd?: string;
    volume_usd?: Record<string, string>;
    price_change_percentage?: Record<string, string>;
    reserve_in_usd?: string;
    fdv_usd?: string;
    transactions?: Record<string, { buys?: number; sells?: number }>;
  };
}

interface GeckoTerminalResponse {
  data?: GeckoTerminalPool[];
}

/**
 * Free, no-API-key provider backed by GeckoTerminal's public API (~30 req/min).
 * - dex-pools: trending/hot DEX pools for a network, each with base-token price,
 *   24h volume/change, pool liquidity and trade count. Sorted by 24h volume.
 */
export class GeckoTerminalProvider implements MarketDataProvider {
  readonly name = "geckoterminal";
  readonly capabilities: readonly Capability[] = ["dex-pools"];

  async getDexPools(network = DEFAULT_NETWORK): Promise<DexPool[]> {
    const net = network || DEFAULT_NETWORK;
    return poolsCache.get(net, async () => {
      const body = await fetchJson<GeckoTerminalResponse>(
        `${BASE_URL}/networks/${net}/trending_pools?page=1`,
      );
      if (!Array.isArray(body?.data))
        throw new Error("geckoterminal pools: unexpected response shape");
      return body.data
        .map((pool): DexPool => {
          const a = pool.attributes ?? {};
          const tx = a.transactions?.h24 ?? {};
          return {
            name: a.name ?? "—",
            network: net,
            priceUsd: num(a.base_token_price_usd),
            volume24hUsd: num(a.volume_usd?.h24),
            changePct24h: num(a.price_change_percentage?.h24),
            reserveUsd: num(a.reserve_in_usd),
            fdvUsd: num(a.fdv_usd),
            txns24h: num(tx.buys) + num(tx.sells),
          };
        })
        .sort((x, y) => y.volume24hUsd - x.volume24hUsd)
        .slice(0, MAX_POOLS);
    });
  }
}
