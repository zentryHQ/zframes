import type {
  Capability,
  DexVolumeEntry,
  FeesOverview,
  MarketDataProvider,
  ProtocolFeesEntry,
  ProtocolTvlEntry,
  SeriesPoint,
  StablecoinSupply,
  TvlEntry,
  YieldPool,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";

const CHAINS_URL = "https://api.llama.fi/v2/chains";
const DEXS_URL = "https://api.llama.fi/overview/dexs";
const FEES_URL = "https://api.llama.fi/overview/fees";
const PROTOCOLS_URL = "https://api.llama.fi/protocols";
const STABLES_URL =
  "https://stablecoins.llama.fi/stablecoins?includePrices=true";
const STABLECHAINS_URL = "https://stablecoins.llama.fi/stablecoinchains";
const YIELDS_URL = "https://yields.llama.fi/pools";

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
// Stablecoin supply + yields move on a daily cadence; slightly longer TTLs, and
// persisted since the derived aggregates are small and useful across reloads.
const stablecoinsCache = new TtlCache<StablecoinSupply>({
  namespace: "zframes:defillama:stablecoins",
  ttlMs: 30 * 60_000,
  persist: true,
});
const yieldsCache = new TtlCache<YieldPool[]>({
  namespace: "zframes:defillama:yields",
  ttlMs: 12 * 60_000,
});
const feesOverviewCache = new TtlCache<FeesOverview>({
  namespace: "zframes:defillama:fees-overview",
  ttlMs: SNAPSHOT_TTL_MS,
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
  /** Top-level aggregate fields (present on `/overview/fees`). */
  total24h?: number | null;
  total7d?: number | null;
  change_1d?: number | null;
  totalDataChart?: [number, number][];
}

interface LlamaPeggedSnapshot {
  peggedUSD?: number;
}
interface LlamaPeggedAsset {
  symbol: string;
  pegType?: string;
  circulating?: LlamaPeggedSnapshot;
  circulatingPrevDay?: LlamaPeggedSnapshot;
  circulatingPrevWeek?: LlamaPeggedSnapshot;
  circulatingPrevMonth?: LlamaPeggedSnapshot;
}
interface LlamaStablecoinsResp {
  peggedAssets?: LlamaPeggedAsset[];
}
interface LlamaStablecoinChain {
  name: string;
  totalCirculatingUSD?: { peggedUSD?: number };
}
interface LlamaYieldPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number | null;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  apyPct7D: number | null;
  stablecoin?: boolean;
  ilRisk?: string;
}
interface LlamaYieldsResp {
  status?: string;
  data?: LlamaYieldPool[];
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
    "stablecoins",
    "yields",
    "fees-overview",
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

  async getStablecoinSupply(): Promise<StablecoinSupply> {
    return stablecoinsCache.get("supply", async () => {
      const [assetsBody, chains] = await Promise.all([
        fetchJson<LlamaStablecoinsResp>(STABLES_URL),
        fetchJson<LlamaStablecoinChain[]>(STABLECHAINS_URL).catch(() => []),
      ]);
      const assets = assetsBody?.peggedAssets;
      if (!Array.isArray(assets))
        throw new Error("defillama stablecoins: unexpected response shape");
      // USD-pegged aggregate: DeFiLlama exposes no top-level total, so sum
      // peggedUSD across USD stablecoins for each snapshot and diff for deltas.
      let now = 0;
      let d1 = 0;
      let d7 = 0;
      let d30 = 0;
      for (const a of assets) {
        if (a.pegType && a.pegType !== "peggedUSD") continue;
        now += a.circulating?.peggedUSD ?? 0;
        d1 += a.circulatingPrevDay?.peggedUSD ?? 0;
        d7 += a.circulatingPrevWeek?.peggedUSD ?? 0;
        d30 += a.circulatingPrevMonth?.peggedUSD ?? 0;
      }
      if (now <= 0) throw new Error("defillama stablecoins: empty aggregate");
      const pct = (prev: number) =>
        prev > 0 ? ((now - prev) / prev) * 100 : 0;
      const nowMs = Date.now();
      const history: SeriesPoint[] = [
        { time: nowMs - 30 * 86_400_000, value: d30 },
        { time: nowMs - 7 * 86_400_000, value: d7 },
        { time: nowMs - 86_400_000, value: d1 },
        { time: nowMs, value: now },
      ].filter((p) => p.value > 0);
      const topChains = (Array.isArray(chains) ? chains : [])
        .map((c) => ({
          name: c.name,
          usd: c.totalCirculatingUSD?.peggedUSD ?? 0,
        }))
        .filter((c) => c.usd > 0)
        .sort((a, b) => b.usd - a.usd)
        .slice(0, 12);
      return {
        totalUsd: now,
        changePct1d: pct(d1),
        changePct7d: pct(d7),
        changePct30d: pct(d30),
        history,
        topChains,
      };
    });
  }

  async getYieldPools(): Promise<YieldPool[]> {
    return yieldsCache.get("pools", async () => {
      const body = await fetchJson<LlamaYieldsResp>(YIELDS_URL);
      const data = body?.data;
      if (!Array.isArray(data))
        throw new Error("defillama yields: unexpected response shape");
      return data
        .filter(
          (p) =>
            Number.isFinite(p.tvlUsd) &&
            (p.tvlUsd ?? 0) > 0 &&
            Number.isFinite(p.apy),
        )
        .map((p) => ({
          pool: p.pool,
          chain: p.chain,
          project: p.project,
          symbol: p.symbol,
          tvlUsd: p.tvlUsd as number,
          apy: p.apy as number,
          apyBase: Number.isFinite(p.apyBase) ? p.apyBase : null,
          apyReward: Number.isFinite(p.apyReward) ? p.apyReward : null,
          apyPct7D: Number.isFinite(p.apyPct7D) ? p.apyPct7D : null,
          stablecoin: !!p.stablecoin,
          ilRisk: p.ilRisk ?? "unknown",
        }))
        .sort((a, b) => b.tvlUsd - a.tvlUsd)
        .slice(0, 250);
    });
  }

  async getFeesOverview(): Promise<FeesOverview> {
    return feesOverviewCache.get("overview", async () => {
      const body = await fetchJson<LlamaOverview>(FEES_URL);
      if (!body || !Number.isFinite(body.total24h))
        throw new Error("defillama fees-overview: unexpected response shape");
      return {
        total24h: body.total24h as number,
        total7d: Number.isFinite(body.total7d)
          ? (body.total7d as number)
          : null,
        changePct: Number.isFinite(body.change_1d)
          ? (body.change_1d as number)
          : null,
        history: toSeries(body.totalDataChart),
      };
    });
  }
}
