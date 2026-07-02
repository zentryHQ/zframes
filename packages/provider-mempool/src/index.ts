import type {
  BtcBlock,
  BtcFees,
  Capability,
  DifficultyAdjustment,
  LightningStats,
  MarketDataProvider,
  MempoolState,
  MiningPools,
  NetworkHashrate,
  ProjectedBlock,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";

const API = "https://mempool.space/api";

// mempool.space's public instance is keyless and CORS-open (every endpoint
// sends `access-control-allow-origin: *`), so all fetches are unproxied. The
// instance is generous but not unlimited, so each method goes through the shared
// cache — short TTL just under its hook's poll interval, in-flight dedup, and
// stale-on-error so a blip serves the last good value instead of an error card.
// One TtlCache per logical source; parameterized methods key by their argument.
const feesCache = new TtlCache<BtcFees>({
  namespace: "zframes:mempool:fees",
  ttlMs: 25_000,
  persist: true,
});
const stateCache = new TtlCache<MempoolState>({
  namespace: "zframes:mempool:state",
  ttlMs: 12_000,
  persist: true,
});
const blocksCache = new TtlCache<BtcBlock[]>({
  namespace: "zframes:mempool:blocks",
  ttlMs: 25_000,
  persist: true,
});
const hashrateCache = new TtlCache<NetworkHashrate>({
  namespace: "zframes:mempool:hashrate",
  ttlMs: 25 * 60_000,
  persist: true,
});
const difficultyCache = new TtlCache<DifficultyAdjustment>({
  namespace: "zframes:mempool:difficulty",
  ttlMs: 50_000,
  persist: true,
});
const poolsCache = new TtlCache<MiningPools>({
  namespace: "zframes:mempool:pools",
  ttlMs: 4 * 60_000,
  persist: true,
});
const lightningCache = new TtlCache<LightningStats>({
  namespace: "zframes:mempool:lightning",
  ttlMs: 25 * 60_000,
  persist: true,
});

interface FeesRaw {
  fastestFee: number;
  halfHourFee: number;
  hourFee: number;
  economyFee: number;
  minimumFee: number;
}

interface MempoolRaw {
  count: number;
  vsize: number;
  total_fee: number;
}

interface ProjectedBlockRaw {
  blockSize: number;
  blockVSize: number;
  nTx: number;
  totalFees: number;
  medianFee: number;
  feeRange: number[];
}

interface BlockRaw {
  id: string;
  height: number;
  /** Seconds. */
  timestamp: number;
  tx_count: number;
  size: number;
  extras?: {
    totalFees?: number;
    medianFee?: number;
    pool?: { name?: string; slug?: string };
  };
}

interface HashrateRaw {
  hashrates: { timestamp: number; avgHashrate: number }[];
  difficulty: { time: number; difficulty: number }[];
  currentHashrate: number;
  currentDifficulty: number;
}

interface DifficultyRaw {
  progressPercent: number;
  difficultyChange: number;
  previousRetarget: number;
  remainingBlocks: number;
  /** Milliseconds. */
  remainingTime: number;
  /** Epoch milliseconds. */
  estimatedRetargetDate: number;
  nextRetargetHeight: number;
  /** Milliseconds. */
  timeAvg: number;
}

interface PoolsRaw {
  pools: {
    name: string;
    slug: string;
    blockCount: number;
    rank: number;
  }[];
  blockCount: number;
}

interface LightningRaw {
  latest?: {
    node_count: number;
    channel_count: number;
    total_capacity: number;
    tor_nodes: number;
    clearnet_nodes: number;
    med_capacity: number;
  };
  previous?: {
    node_count: number;
    channel_count: number;
    total_capacity: number;
  };
}

/**
 * Keyless mempool.space provider (no API key, CORS-open). Surfaces the
 * Bitcoin-network frames: fees, mempool congestion, recent blocks, hashrate +
 * difficulty, difficulty-adjustment countdown, mining-pool dominance, and
 * Lightning stats. All timestamps are normalised to epoch-milliseconds.
 */
export class MempoolProvider implements MarketDataProvider {
  readonly name = "mempool";
  readonly capabilities: readonly Capability[] = [
    "btc-fees",
    "btc-mempool",
    "btc-blocks",
    "btc-hashrate",
    "btc-difficulty",
    "mining-pools",
    "lightning-stats",
  ];

  async getBtcFees(): Promise<BtcFees> {
    return feesCache.get("latest", async () => {
      const body = await fetchJson<FeesRaw>(`${API}/v1/fees/recommended`);
      if (!body || typeof body.fastestFee !== "number")
        throw new Error("mempool fees: unexpected response shape");
      return {
        fastest: body.fastestFee,
        halfHour: body.halfHourFee,
        hour: body.hourFee,
        economy: body.economyFee,
        minimum: body.minimumFee,
      };
    });
  }

  async getMempoolState(): Promise<MempoolState> {
    return stateCache.get("latest", async () => {
      const [mempool, blocks] = await Promise.all([
        fetchJson<MempoolRaw>(`${API}/mempool`),
        fetchJson<ProjectedBlockRaw[]>(`${API}/v1/fees/mempool-blocks`),
      ]);
      if (!mempool || typeof mempool.count !== "number")
        throw new Error("mempool state: unexpected response shape");
      const projected: ProjectedBlock[] = (
        Array.isArray(blocks) ? blocks : []
      ).map((b) => ({
        medianFee: b.medianFee,
        feeRange: Array.isArray(b.feeRange) ? b.feeRange : [],
        totalFees: b.totalFees,
        nTx: b.nTx,
        blockVSize: b.blockVSize,
      }));
      return {
        count: mempool.count,
        vsize: mempool.vsize,
        totalFee: mempool.total_fee,
        projected,
      };
    });
  }

  async getBtcBlocks(limit = 8): Promise<BtcBlock[]> {
    return blocksCache.get(String(limit), async () => {
      const body = await fetchJson<BlockRaw[]>(`${API}/v1/blocks`);
      if (!Array.isArray(body))
        throw new Error("mempool blocks: unexpected response shape");
      return body.slice(0, limit).map((b) => ({
        id: b.id,
        height: b.height,
        time: b.timestamp * 1000,
        txCount: b.tx_count,
        size: b.size,
        totalFees: b.extras?.totalFees ?? 0,
        medianFee: b.extras?.medianFee ?? 0,
        poolName: b.extras?.pool?.name ?? "Unknown",
        poolSlug: b.extras?.pool?.slug ?? "unknown",
      }));
    });
  }

  async getNetworkHashrate(window: string): Promise<NetworkHashrate> {
    return hashrateCache.get(window, async () => {
      const body = await fetchJson<HashrateRaw>(
        `${API}/v1/mining/hashrate/${encodeURIComponent(window)}`,
      );
      if (!body || !Array.isArray(body.hashrates))
        throw new Error("mempool hashrate: unexpected response shape");
      return {
        currentHashrate: body.currentHashrate,
        currentDifficulty: body.currentDifficulty,
        hashrates: body.hashrates.map((h) => ({
          time: h.timestamp * 1000,
          hashrate: h.avgHashrate,
        })),
        difficulty: (body.difficulty ?? []).map((d) => ({
          time: d.time * 1000,
          difficulty: d.difficulty,
        })),
      };
    });
  }

  async getDifficultyAdjustment(): Promise<DifficultyAdjustment> {
    return difficultyCache.get("latest", async () => {
      const body = await fetchJson<DifficultyRaw>(
        `${API}/v1/difficulty-adjustment`,
      );
      if (!body || typeof body.progressPercent !== "number")
        throw new Error("mempool difficulty: unexpected response shape");
      return {
        progressPercent: body.progressPercent,
        difficultyChange: body.difficultyChange,
        previousRetarget: body.previousRetarget,
        remainingBlocks: body.remainingBlocks,
        remainingTimeMs: body.remainingTime,
        estimatedRetargetDate: body.estimatedRetargetDate,
        nextRetargetHeight: body.nextRetargetHeight,
        avgBlockTimeMs: body.timeAvg,
      };
    });
  }

  async getMiningPools(window: string): Promise<MiningPools> {
    return poolsCache.get(window, async () => {
      const body = await fetchJson<PoolsRaw>(
        `${API}/v1/mining/pools/${encodeURIComponent(window)}`,
      );
      if (!body || !Array.isArray(body.pools))
        throw new Error("mempool pools: unexpected response shape");
      const totalBlocks = body.blockCount || 0;
      return {
        window,
        totalBlocks,
        pools: body.pools.map((p) => ({
          name: p.name,
          slug: p.slug,
          blockCount: p.blockCount,
          sharePct: totalBlocks > 0 ? (p.blockCount / totalBlocks) * 100 : 0,
          rank: p.rank,
        })),
      };
    });
  }

  async getLightningStats(): Promise<LightningStats> {
    return lightningCache.get("latest", async () => {
      const body = await fetchJson<LightningRaw>(
        `${API}/v1/lightning/statistics/latest`,
      );
      const latest = body?.latest;
      if (!latest || typeof latest.node_count !== "number")
        throw new Error("mempool lightning: unexpected response shape");
      return {
        nodeCount: latest.node_count,
        channelCount: latest.channel_count,
        totalCapacity: latest.total_capacity,
        torNodes: latest.tor_nodes,
        clearnetNodes: latest.clearnet_nodes,
        medCapacity: latest.med_capacity,
        prevNodeCount: body.previous?.node_count,
        prevChannelCount: body.previous?.channel_count,
        prevTotalCapacity: body.previous?.total_capacity,
      };
    });
  }
}
