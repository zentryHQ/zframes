import type {
  Capability,
  DexVolumeEntry,
  MarketDataProvider,
  ProtocolFeesEntry,
  ProtocolTvlEntry,
  SeriesPoint,
  TvlEntry,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";

const CHAINS_URL = "https://api.llama.fi/v2/chains";
const DEXS_URL = "https://api.llama.fi/overview/dexs";
const FEES_URL = "https://api.llama.fi/overview/fees";
const PROTOCOLS_URL = "https://api.llama.fi/protocols";

// Every DeFiLlama endpoint is a slow-moving snapshot (TVL / volume / fees refresh
// on the order of hours), so each goes through the shared cache: a fresh value is
// served without a network call, concurrent loads (and extra frames on the same
// data) are deduped, and the last good value is served on a transient error.
// Overviews use an 8-min TTL (just under the ~10-min poll); per-slug history
// barely moves intra-day, so it uses 30 min. Not persisted — the protocol lists
// and history series can be large, and the data lands often enough that session-
// scoped caching is the win.
const SNAPSHOT_TTL_MS = 8 * 60_000;
const HISTORY_TTL_MS = 30 * 60_000;

const tvlCache = new TtlCache<TvlEntry[]>({
  namespace: "zframes:defillama:tvl",
  ttlMs: SNAPSHOT_TTL_MS,
});
const dexVolumeCache = new TtlCache<DexVolumeEntry[]>({
  namespace: "zframes:defillama:dex-volume",
  ttlMs: SNAPSHOT_TTL_MS,
});
const protocolTvlCache = new TtlCache<ProtocolTvlEntry[]>({
  namespace: "zframes:defillama:protocol-tvl",
  ttlMs: SNAPSHOT_TTL_MS,
});
const protocolFeesCache = new TtlCache<ProtocolFeesEntry[]>({
  namespace: "zframes:defillama:protocol-fees",
  ttlMs: SNAPSHOT_TTL_MS,
});
const dexHistoryCache = new TtlCache<Record<string, SeriesPoint[]>>({
  namespace: "zframes:defillama:dex-history",
  ttlMs: HISTORY_TTL_MS,
});
const protocolHistoryCache = new TtlCache<Record<string, SeriesPoint[]>>({
  namespace: "zframes:defillama:protocol-history",
  ttlMs: HISTORY_TTL_MS,
});

/** Stable cache key for a set of slugs, order-independent. */
const slugKey = (slugs: string[]): string => [...slugs].sort().join(",");

interface LlamaChain {
  name: string;
  tvl: number;
}

/** Shared shape of the `/overview/{dexs,fees}` dimension endpoints. */
interface LlamaOverview {
  protocols?: LlamaOverviewProtocol[];
}
interface LlamaOverviewProtocol {
  name: string;
  total24h: number | null;
  change_1d?: number | null;
}

interface LlamaProtocol {
  name: string;
  tvl: number | null;
  category?: string;
  change_1d?: number | null;
}

interface LlamaSummary {
  /** [unixSeconds, value] pairs. */
  totalDataChart?: [number, number][];
}

interface LlamaProtocolDetail {
  tvl?: { date: number; totalLiquidityUSD: number }[];
}

/** [unixSeconds, value] → SeriesPoint[] (epoch ms), dropping non-finite rows. */
function toSeries(chart: [number, number][] | undefined): SeriesPoint[] {
  if (!Array.isArray(chart)) return [];
  return chart
    .map(([ts, value]) => ({ time: ts * 1000, value: Number(value) }))
    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value));
}

const changeOf = (v: number | null | undefined): number | undefined =>
  Number.isFinite(v) ? (v as number) : undefined;

/**
 * Free, no-API-key provider backed by DeFiLlama's public API (CORS-open, so no
 * runtime proxy needed). All endpoints live under api.llama.fi.
 * - tvl: total value locked per chain, descending.
 * - dex-volume: trailing-24h DEX volume per protocol (+ per-protocol history).
 * - protocol-tvl: current TVL per DeFi protocol (+ per-protocol history).
 * - protocol-fees: trailing-24h fees per protocol.
 */
export class DefiLlamaProvider implements MarketDataProvider {
  readonly name = "defillama";
  readonly capabilities: readonly Capability[] = [
    "tvl",
    "dex-volume",
    "protocol-tvl",
    "protocol-fees",
  ];

  async getTvlByChain(): Promise<TvlEntry[]> {
    return tvlCache.get("chains", async () => {
      const chains = await fetchJson<LlamaChain[]>(CHAINS_URL);
      if (!Array.isArray(chains))
        throw new Error("defillama chains: unexpected response shape");
      return chains
        .filter((chain) => Number.isFinite(chain.tvl) && chain.tvl > 0)
        .sort((a, b) => b.tvl - a.tvl)
        .map((chain) => ({ name: chain.name, tvl: chain.tvl }));
    });
  }

  async getDexVolume(): Promise<DexVolumeEntry[]> {
    return dexVolumeCache.get("overview", async () => {
      const body = await fetchJson<LlamaOverview>(DEXS_URL);
      const protocols = body?.protocols;
      if (!Array.isArray(protocols))
        throw new Error("defillama dexs: unexpected response shape");
      return protocols
        .filter((p) => Number.isFinite(p.total24h) && (p.total24h ?? 0) > 0)
        .map((p) => ({
          name: p.name,
          volume24h: p.total24h as number,
          changePct: changeOf(p.change_1d),
        }))
        .sort((a, b) => b.volume24h - a.volume24h);
    });
  }

  async getDexVolumeHistory(
    slugs: string[],
  ): Promise<Record<string, SeriesPoint[]>> {
    return dexHistoryCache.get(slugKey(slugs), async () => {
      const pairs = await Promise.all(
        slugs.map((slug) =>
          fetchJson<LlamaSummary>(
            `https://api.llama.fi/summary/dexs/${encodeURIComponent(
              slug,
            )}?excludeTotalDataChartBreakdown=true`,
          )
            .then((body) => [slug, toSeries(body.totalDataChart)] as const)
            .catch(() => [slug, [] as SeriesPoint[]] as const),
        ),
      );
      return Object.fromEntries(pairs);
    });
  }

  async getProtocolTvl(): Promise<ProtocolTvlEntry[]> {
    return protocolTvlCache.get("overview", async () => {
      const protocols = await fetchJson<LlamaProtocol[]>(PROTOCOLS_URL);
      if (!Array.isArray(protocols))
        throw new Error("defillama protocols: unexpected response shape");
      return protocols
        .filter((p) => Number.isFinite(p.tvl) && (p.tvl ?? 0) > 0)
        .map((p) => ({
          name: p.name,
          tvl: p.tvl as number,
          category: p.category,
          changePct: changeOf(p.change_1d),
        }))
        .sort((a, b) => b.tvl - a.tvl);
    });
  }

  async getProtocolTvlHistory(
    slugs: string[],
  ): Promise<Record<string, SeriesPoint[]>> {
    return protocolHistoryCache.get(slugKey(slugs), async () => {
      const pairs = await Promise.all(
        slugs.map((slug) =>
          fetchJson<LlamaProtocolDetail>(
            `https://api.llama.fi/protocol/${encodeURIComponent(slug)}`,
          )
            .then(
              (body) =>
                [
                  slug,
                  (body.tvl ?? [])
                    .map((p) => ({
                      time: p.date * 1000,
                      value: Number(p.totalLiquidityUSD),
                    }))
                    .filter(
                      (p) =>
                        Number.isFinite(p.time) && Number.isFinite(p.value),
                    ),
                ] as const,
            )
            .catch(() => [slug, [] as SeriesPoint[]] as const),
        ),
      );
      return Object.fromEntries(pairs);
    });
  }

  async getProtocolFees(): Promise<ProtocolFeesEntry[]> {
    return protocolFeesCache.get("overview", async () => {
      const body = await fetchJson<LlamaOverview>(FEES_URL);
      const protocols = body?.protocols;
      if (!Array.isArray(protocols))
        throw new Error("defillama fees: unexpected response shape");
      return protocols
        .filter((p) => Number.isFinite(p.total24h) && (p.total24h ?? 0) > 0)
        .map((p) => ({
          name: p.name,
          fees24h: p.total24h as number,
          changePct: changeOf(p.change_1d),
        }))
        .sort((a, b) => b.fees24h - a.fees24h);
    });
  }
}
