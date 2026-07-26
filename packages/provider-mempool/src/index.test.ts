import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MempoolProvider as MempoolProviderType } from "./index";

// What this file pins: the seven mempool.space mappings the Bitcoin-network
// frames (fees, congestion, blocks, hashrate, difficulty countdown, pool
// dominance, Lightning) render. The mistakes here are unit-shaped rather than
// crash-shaped, so nothing upstream would catch them:
//
//  - Seconds → epoch-ms conversion for the fields that ARE seconds (a block's
//    `timestamp`, a hashrate point's `timestamp`, a difficulty point's `time`)
//    AND the three fields that are ALREADY milliseconds and must pass through
//    untouched (`remainingTime`, `timeAvg`, `estimatedRetargetDate`). A missing
//    ×1000 draws a 2026 block timeline in 1970; a spurious one turns a ~10-min
//    average block time into 8 days and pushes the retarget date past the year
//    50000.
//  - Mining-pool `sharePct` and its `totalBlocks > 0` guard: without the
//    `body.blockCount || 0` + guard pair, an upstream window with no block count
//    renders every pool row as NaN% (or Infinity%).
//  - The block-extras defaults (`?? 0`, `?? "Unknown"` / `"unknown"`), so a
//    block whose pool mempool.space can't attribute renders a labelled row
//    instead of a blank pool column.
//  - Lightning's deliberate asymmetry: `latest.node_count` is required (throw),
//    while the `previous` snapshot is optional and must stay UNDEFINED when
//    absent — defaulting it to 0 would fabricate a -100% node-count change.
//  - The snake_case → camelCase renames (`total_fee` → `totalFee`,
//    `node_count` → `nodeCount`), getMempoolState's parallel two-endpoint
//    fan-out and its tolerance of a non-array projected-blocks body, the
//    per-argument cache keys (blocks by limit, hashrate/pools by window), and
//    each method's own labelled "unexpected response shape" guard.
//
// Every cache in the provider is a module-level singleton, so each test loads a
// FRESH module (`vi.resetModules()` + dynamic import) — otherwise a good value
// primed by an earlier test would be served by stale-on-error and mask every
// guard assertion below.
type Ctor = typeof MempoolProviderType;

async function loadProvider(): Promise<Ctor> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.MempoolProvider;
}

/** A minimal Response-like the shared fetchJson understands. */
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** Route by URL fragment; anything unrouted 500s so a stray call is loud. */
function routedFetch(routes: Array<[string, unknown]>) {
  return vi.fn().mockImplementation((url: string) => {
    for (const [fragment, body] of routes) {
      if (url.includes(fragment)) return Promise.resolve(jsonResponse(body));
    }
    return Promise.resolve(jsonResponse(null, 500));
  });
}

/** GET /api/v1/fees/recommended */
function feesRaw() {
  return {
    fastestFee: 12,
    halfHourFee: 9,
    hourFee: 7,
    economyFee: 3,
    minimumFee: 1,
  };
}

/** GET /api/mempool — note the snake_case `total_fee`. */
function mempoolRaw() {
  return { count: 42_000, vsize: 18_500_000, total_fee: 3_500_000 };
}

/** One entry of GET /api/v1/fees/mempool-blocks. */
function projectedRaw() {
  return {
    blockSize: 1_400_000,
    blockVSize: 998_000,
    nTx: 3_150,
    totalFees: 8_900_000,
    medianFee: 9.4,
    feeRange: [1, 4, 9.4, 22, 140],
  };
}

/** One entry of GET /api/v1/blocks — `timestamp` is SECONDS. */
function blockRaw(height: number, timestampSec: number) {
  return {
    id: `hash-${height}`,
    height,
    timestamp: timestampSec,
    tx_count: 3_000,
    size: 1_500_000,
    extras: {
      totalFees: 12_345_678,
      medianFee: 4.5,
      pool: { name: "Foundry USA", slug: "foundryusa" },
    },
  };
}

/** GET /api/v1/mining/hashrate/{window} — both series carry SECONDS. */
function hashrateRaw() {
  return {
    currentHashrate: 8.1e20,
    currentDifficulty: 1.1e14,
    hashrates: [
      { timestamp: 1_779_000_000, avgHashrate: 7.9e20 },
      { timestamp: 1_779_086_400, avgHashrate: 8.05e20 },
    ],
    difficulty: [{ time: 1_778_500_000, difficulty: 1.09e14 }],
  };
}

/**
 * GET /api/v1/difficulty-adjustment — `remainingTime`, `timeAvg` and
 * `estimatedRetargetDate` are ALREADY milliseconds upstream.
 */
function difficultyRaw() {
  return {
    progressPercent: 42.5,
    difficultyChange: 1.85,
    previousRetarget: -0.42,
    remainingBlocks: 1_159,
    remainingTime: 694_800_000,
    estimatedRetargetDate: 1_780_694_800_000,
    nextRetargetHeight: 901_152,
    timeAvg: 597_000,
  };
}

/** GET /api/v1/mining/pools/{window} */
function poolsRaw() {
  return {
    pools: [
      { name: "Foundry USA", slug: "foundryusa", blockCount: 300, rank: 1 },
      { name: "AntPool", slug: "antpool", blockCount: 150, rank: 2 },
      { name: "ViaBTC", slug: "viabtc", blockCount: 50, rank: 3 },
    ],
    blockCount: 1_000,
  };
}

/** GET /api/v1/lightning/statistics/latest */
function lightningRaw() {
  return {
    latest: {
      node_count: 12_345,
      channel_count: 48_000,
      total_capacity: 480_000_000_000,
      tor_nodes: 9_000,
      clearnet_nodes: 2_500,
      med_capacity: 4_000_000,
    },
    previous: {
      node_count: 12_300,
      channel_count: 47_800,
      total_capacity: 478_000_000_000,
    },
  };
}

describe("MempoolProvider", () => {
  let MempoolProvider: Ctor;

  beforeEach(async () => {
    // Fresh module → fresh, empty module-level caches for this test.
    MempoolProvider = await loadProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("advertises its identity and capabilities", () => {
    const provider = new MempoolProvider();
    expect(provider.name).toBe("mempool");
    expect([...provider.capabilities]).toEqual([
      "btc-fees",
      "btc-mempool",
      "btc-blocks",
      "btc-hashrate",
      "btc-difficulty",
      "mining-pools",
      "lightning-stats",
    ]);
  });

  describe("getBtcFees", () => {
    it("renames the recommended tiers and hits /v1/fees/recommended once", async () => {
      const fetchMock = routedFetch([["/v1/fees/recommended", feesRaw()]]);
      vi.stubGlobal("fetch", fetchMock);

      const provider = new MempoolProvider();
      const fees = await provider.getBtcFees();

      expect(fees).toEqual({
        fastest: 12,
        halfHour: 9,
        hour: 7,
        economy: 3,
        minimum: 1,
      });
      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
        "https://mempool.space/api/v1/fees/recommended",
      ]);
      // Second read is a cache hit (25 s TTL) — still exactly one request.
      expect(await provider.getBtcFees()).toEqual(fees);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("throws its labelled guard when fastestFee is not a number", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({ halfHourFee: 9 })),
      );

      await expect(new MempoolProvider().getBtcFees()).rejects.toThrow(
        "mempool fees: unexpected response shape",
      );
    });
  });

  describe("getMempoolState", () => {
    it("maps total_fee → totalFee and the projected blocks", async () => {
      const fetchMock = routedFetch([
        ["/v1/fees/mempool-blocks", [projectedRaw()]],
        ["/api/mempool", mempoolRaw()],
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const state = await new MempoolProvider().getMempoolState();

      expect(state).toEqual({
        count: 42_000,
        vsize: 18_500_000,
        totalFee: 3_500_000,
        projected: [
          {
            medianFee: 9.4,
            feeRange: [1, 4, 9.4, 22, 140],
            totalFees: 8_900_000,
            nTx: 3_150,
            blockVSize: 998_000,
          },
        ],
      });
      expect(fetchMock.mock.calls.map((c) => c[0]).sort()).toEqual([
        "https://mempool.space/api/mempool",
        "https://mempool.space/api/v1/fees/mempool-blocks",
      ]);
    });

    it("issues both endpoints before either response lands (parallel fan-out)", async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        await gate;
        return url.includes("mempool-blocks")
          ? jsonResponse([projectedRaw()])
          : jsonResponse(mempoolRaw());
      });
      vi.stubGlobal("fetch", fetchMock);

      // Deliberately not awaited: with a sequential `await` per endpoint only
      // the first request would be in flight while the gate is closed.
      const pending = new MempoolProvider().getMempoolState();
      expect(fetchMock).toHaveBeenCalledTimes(2);

      release();
      const state = await pending;
      expect(state.count).toBe(42_000);
      expect(state.projected).toHaveLength(1);
    });

    it("tolerates a non-array projected-blocks body, keeping the counts", async () => {
      vi.stubGlobal(
        "fetch",
        routedFetch([
          // mempool.space answers 200 with an error object under load.
          ["/v1/fees/mempool-blocks", { error: "busy" }],
          ["/api/mempool", mempoolRaw()],
        ]),
      );

      const state = await new MempoolProvider().getMempoolState();
      expect(state.projected).toEqual([]);
      expect(state.count).toBe(42_000);
      expect(state.totalFee).toBe(3_500_000);
    });

    it("defaults a projected block's feeRange to [] when it is not an array", async () => {
      const bare = { ...projectedRaw(), feeRange: null };
      vi.stubGlobal(
        "fetch",
        routedFetch([
          ["/v1/fees/mempool-blocks", [bare, { ...projectedRaw() }]],
          ["/api/mempool", mempoolRaw()],
        ]),
      );

      const state = await new MempoolProvider().getMempoolState();
      expect(state.projected.map((b) => b.feeRange)).toEqual([
        [],
        [1, 4, 9.4, 22, 140],
      ]);
      // The rest of the malformed block still maps.
      expect(state.projected[0].medianFee).toBe(9.4);
    });

    it("throws its labelled guard when the mempool count is missing", async () => {
      vi.stubGlobal(
        "fetch",
        routedFetch([
          ["/v1/fees/mempool-blocks", [projectedRaw()]],
          ["/api/mempool", { vsize: 1, total_fee: 2 }],
        ]),
      );

      await expect(new MempoolProvider().getMempoolState()).rejects.toThrow(
        "mempool state: unexpected response shape",
      );
    });
  });

  describe("getBtcBlocks", () => {
    it("converts timestamp seconds → epoch ms and defaults absent extras", async () => {
      vi.stubGlobal(
        "fetch",
        routedFetch([
          [
            "/v1/blocks",
            [
              blockRaw(900_000, 1_780_000_000),
              // No `extras` at all — an unattributed block.
              {
                id: "hash-bare",
                height: 899_999,
                timestamp: 1_779_999_400,
                tx_count: 12,
                size: 900,
              },
            ],
          ],
        ]),
      );

      const blocks = await new MempoolProvider().getBtcBlocks(2);

      expect(blocks[0]).toEqual({
        id: "hash-900000",
        height: 900_000,
        time: 1_780_000_000_000,
        txCount: 3_000,
        size: 1_500_000,
        totalFees: 12_345_678,
        medianFee: 4.5,
        poolName: "Foundry USA",
        poolSlug: "foundryusa",
      });
      expect(blocks[1]).toEqual({
        id: "hash-bare",
        height: 899_999,
        time: 1_779_999_400_000,
        txCount: 12,
        size: 900,
        // Never undefined: 0/0 render as figures and the pool column stays
        // labelled instead of blank.
        totalFees: 0,
        medianFee: 0,
        poolName: "Unknown",
        poolSlug: "unknown",
      });
      // Seconds treated as seconds: the timeline lands in 2026, not 1970.
      expect(new Date(blocks[0].time).getUTCFullYear()).toBe(2026);
    });

    it("slices to the requested limit and keys the cache by it", async () => {
      const fetchMock = routedFetch([
        [
          "/v1/blocks",
          Array.from({ length: 10 }, (_, i) =>
            blockRaw(900_000 - i, 1_780_000_000 - i * 600),
          ),
        ],
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const provider = new MempoolProvider();
      const four = await provider.getBtcBlocks(4);
      const eight = await provider.getBtcBlocks(8);

      expect(four.map((b) => b.height)).toEqual([
        900_000, 899_999, 899_998, 899_997,
      ]);
      expect(eight).toHaveLength(8);
      // Distinct cache entries → one fetch each, not one shared entry.
      expect(fetchMock).toHaveBeenCalledTimes(2);

      // Each entry is then served from cache, across instances…
      expect(await provider.getBtcBlocks(4)).toEqual(four);
      expect(await new MempoolProvider().getBtcBlocks(8)).toEqual(eight);
      // …and the default limit is 8, so it reuses the "8" entry.
      expect(await provider.getBtcBlocks()).toEqual(eight);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("throws its labelled guard when the body is not an array", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({ blocks: [] })),
      );

      await expect(new MempoolProvider().getBtcBlocks(4)).rejects.toThrow(
        "mempool blocks: unexpected response shape",
      );
    });
  });

  describe("getNetworkHashrate", () => {
    it("converts both series from seconds to epoch ms, keeping the current readings", async () => {
      vi.stubGlobal(
        "fetch",
        routedFetch([["/v1/mining/hashrate/", hashrateRaw()]]),
      );

      const out = await new MempoolProvider().getNetworkHashrate("1w");

      expect(out).toEqual({
        currentHashrate: 8.1e20,
        currentDifficulty: 1.1e14,
        hashrates: [
          { time: 1_779_000_000_000, hashrate: 7.9e20 },
          { time: 1_779_086_400_000, hashrate: 8.05e20 },
        ],
        // The difficulty series is keyed `time` upstream, not `timestamp`.
        difficulty: [{ time: 1_778_500_000_000, difficulty: 1.09e14 }],
      });
      expect(new Date(out.hashrates[0].time).getUTCFullYear()).toBe(2026);
    });

    it("defaults the difficulty series to [] when the window omits it", async () => {
      const { difficulty: _dropped, ...noDifficulty } = hashrateRaw();
      vi.stubGlobal(
        "fetch",
        routedFetch([["/v1/mining/hashrate/", noDifficulty]]),
      );

      const out = await new MempoolProvider().getNetworkHashrate("3m");
      expect(out.difficulty).toEqual([]);
      expect(out.hashrates).toHaveLength(2);
    });

    it("URL-encodes the window into the path and keys the cache by window", async () => {
      const fetchMock = routedFetch([["/v1/mining/hashrate/", hashrateRaw()]]);
      vi.stubGlobal("fetch", fetchMock);

      const provider = new MempoolProvider();
      await provider.getNetworkHashrate("1w");
      await provider.getNetworkHashrate("1w"); // same key → cache hit
      await provider.getNetworkHashrate("3m/../pools"); // distinct key, escaped

      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
        "https://mempool.space/api/v1/mining/hashrate/1w",
        "https://mempool.space/api/v1/mining/hashrate/3m%2F..%2Fpools",
      ]);
    });

    it("throws its labelled guard when hashrates is not an array", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ currentHashrate: 1, currentDifficulty: 2 }),
          ),
      );

      await expect(
        new MempoolProvider().getNetworkHashrate("1w"),
      ).rejects.toThrow("mempool hashrate: unexpected response shape");
    });
  });

  describe("getDifficultyAdjustment", () => {
    it("passes the already-millisecond fields through unconverted", async () => {
      const fetchMock = routedFetch([
        ["/v1/difficulty-adjustment", difficultyRaw()],
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const out = await new MempoolProvider().getDifficultyAdjustment();

      expect(out).toEqual({
        progressPercent: 42.5,
        difficultyChange: 1.85,
        previousRetarget: -0.42,
        remainingBlocks: 1_159,
        // remainingTime / timeAvg / estimatedRetargetDate are ms upstream and
        // are only RENAMED here — no ×1000.
        remainingTimeMs: 694_800_000,
        estimatedRetargetDate: 1_780_694_800_000,
        nextRetargetHeight: 901_152,
        avgBlockTimeMs: 597_000,
      });
      // A stray ×1000 would read as a ~166-hour average block time and a
      // retarget date ~54 000 years out.
      expect(out.avgBlockTimeMs / 60_000).toBeCloseTo(9.95, 2);
      expect(out.remainingTimeMs / 3_600_000).toBeCloseTo(193, 0);
      expect(new Date(out.estimatedRetargetDate).getUTCFullYear()).toBe(2026);
      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
        "https://mempool.space/api/v1/difficulty-adjustment",
      ]);
    });

    it("throws its labelled guard when progressPercent is missing", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({ remainingBlocks: 10 })),
      );

      await expect(
        new MempoolProvider().getDifficultyAdjustment(),
      ).rejects.toThrow("mempool difficulty: unexpected response shape");
    });
  });

  describe("getMiningPools", () => {
    it("derives sharePct from the window's block count and echoes the window", async () => {
      vi.stubGlobal("fetch", routedFetch([["/v1/mining/pools/", poolsRaw()]]));

      const out = await new MempoolProvider().getMiningPools("1w");

      expect(out.window).toBe("1w");
      expect(out.totalBlocks).toBe(1_000);
      expect(out.pools).toEqual([
        {
          name: "Foundry USA",
          slug: "foundryusa",
          blockCount: 300,
          sharePct: 30,
          rank: 1,
        },
        {
          name: "AntPool",
          slug: "antpool",
          blockCount: 150,
          sharePct: 15,
          rank: 2,
        },
        {
          name: "ViaBTC",
          slug: "viabtc",
          blockCount: 50,
          sharePct: 5,
          rank: 3,
        },
      ]);
    });

    it("yields 0% shares (never NaN/Infinity) when the block count is absent or zero", async () => {
      const { blockCount: _dropped, ...noCount } = poolsRaw();
      vi.stubGlobal("fetch", routedFetch([["/v1/mining/pools/", noCount]]));
      const provider = new MempoolProvider();

      const missing = await provider.getMiningPools("1w");
      expect(missing.totalBlocks).toBe(0);
      expect(missing.pools.map((p) => p.sharePct)).toEqual([0, 0, 0]);
      for (const pool of missing.pools) {
        expect(Number.isFinite(pool.sharePct)).toBe(true);
      }

      // An explicit 0 count takes the same guard branch.
      vi.stubGlobal(
        "fetch",
        routedFetch([["/v1/mining/pools/", { ...poolsRaw(), blockCount: 0 }]]),
      );
      const zero = await provider.getMiningPools("3m");
      expect(zero.totalBlocks).toBe(0);
      expect(zero.pools.map((p) => p.sharePct)).toEqual([0, 0, 0]);
    });

    it("URL-encodes the window into the path and keys the cache by window", async () => {
      const fetchMock = routedFetch([["/v1/mining/pools/", poolsRaw()]]);
      vi.stubGlobal("fetch", fetchMock);

      const provider = new MempoolProvider();
      const first = await provider.getMiningPools("1w");
      const cached = await provider.getMiningPools("1w");
      const other = await provider.getMiningPools("3m/../hashrate");

      expect(cached).toEqual(first);
      // Distinct windows are distinct entries, and each window is echoed back.
      expect(other.window).toBe("3m/../hashrate");
      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
        "https://mempool.space/api/v1/mining/pools/1w",
        "https://mempool.space/api/v1/mining/pools/3m%2F..%2Fhashrate",
      ]);
    });

    it("throws its labelled guard when pools is not an array", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse({ blockCount: 1_000 })),
      );

      await expect(new MempoolProvider().getMiningPools("1w")).rejects.toThrow(
        "mempool pools: unexpected response shape",
      );
    });
  });

  describe("getLightningStats", () => {
    it("renames the latest snapshot and carries the previous one for a delta", async () => {
      const fetchMock = routedFetch([
        ["/v1/lightning/statistics/latest", lightningRaw()],
      ]);
      vi.stubGlobal("fetch", fetchMock);

      const stats = await new MempoolProvider().getLightningStats();

      expect(stats).toEqual({
        nodeCount: 12_345,
        channelCount: 48_000,
        totalCapacity: 480_000_000_000,
        torNodes: 9_000,
        clearnetNodes: 2_500,
        medCapacity: 4_000_000,
        prevNodeCount: 12_300,
        prevChannelCount: 47_800,
        prevTotalCapacity: 478_000_000_000,
      });
      expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
        "https://mempool.space/api/v1/lightning/statistics/latest",
      ]);
    });

    it("leaves the prev* fields undefined when `previous` is absent", async () => {
      const { previous: _dropped, ...latestOnly } = lightningRaw();
      vi.stubGlobal(
        "fetch",
        routedFetch([["/v1/lightning/statistics/latest", latestOnly]]),
      );

      const stats = await new MempoolProvider().getLightningStats();

      expect(stats.nodeCount).toBe(12_345);
      // NOT 0: a 0 baseline would render a -100% node-count change.
      expect(stats.prevNodeCount).toBeUndefined();
      expect(stats.prevChannelCount).toBeUndefined();
      expect(stats.prevTotalCapacity).toBeUndefined();
    });

    it("throws its labelled guard when latest or latest.node_count is missing", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(jsonResponse({ previous: { node_count: 1 } })),
      );
      await expect(new MempoolProvider().getLightningStats()).rejects.toThrow(
        "mempool lightning: unexpected response shape",
      );

      const NextProvider = await loadProvider();
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse({ latest: { channel_count: 48_000 } }),
          ),
      );
      await expect(new NextProvider().getLightningStats()).rejects.toThrow(
        "mempool lightning: unexpected response shape",
      );
    });
  });
});
