import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DefiLlamaProvider as DefiLlamaProviderType } from "./index";

// The provider's TtlCaches are MODULE-LEVEL singletons keyed per source
// ("chains"/"overview" for snapshots, a sorted-slug string for histories), so a
// bare `new DefiLlamaProvider()` shares them across tests — and stale-on-error
// would leak an earlier test's value into a later "throws" test. To guarantee
// isolation, each test re-imports the module through `vi.resetModules()`, so its
// caches start empty; `freshProvider()` returns an instance of that fresh module.
async function freshProvider(): Promise<DefiLlamaProviderType> {
  vi.resetModules();
  const mod = await import("./index");
  return new mod.DefiLlamaProvider();
}

/** A minimal Response-like the shared fetchJson understands (ok + json()). */
function jsonOk(obj: unknown) {
  return { ok: true, status: 200, json: async () => obj, text: async () => "" };
}

/**
 * A 200 with an EMPTY body, so `res.json()` throws — what `/tvl/{slug}` really
 * does when the slug names a chain rather than a protocol.
 */
function emptyBody() {
  return {
    ok: true,
    status: 200,
    json: async () => {
      throw new SyntaxError("Unexpected end of JSON input");
    },
    text: async () => "",
  };
}

/** A non-2xx Response-like → fetchJson throws on the status check. */
function httpError(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => "",
  };
}

describe("DefiLlamaProvider", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe("capabilities", () => {
    it("advertises exactly its DeFiLlama capabilities", async () => {
      const provider = await freshProvider();
      expect(provider.name).toBe("defillama");
      expect([...provider.capabilities]).toEqual([
        "tvl",
        "dex-volume",
        "protocol-tvl",
        "protocol-fees",
        "protocol-fundamentals",
        "token-unlocks",
        "stablecoins",
        "yields",
        "fees-overview",
      ]);
    });
  });

  describe("getTvlByChain", () => {
    it("drops non-positive/non-finite chains and sorts by TVL descending", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonOk([
          { name: "Ethereum", tvl: 50 },
          { name: "Zero", tvl: 0 },
          { name: "Negative", tvl: -5 },
          { name: "Nan", tvl: Number.NaN },
          { name: "Solana", tvl: 200 },
          { name: "Base", tvl: 10 },
        ]),
      );
      vi.stubGlobal("fetch", fetchMock);
      const out = await (await freshProvider()).getTvlByChain();
      expect(out).toEqual([
        { name: "Solana", tvl: 200 },
        { name: "Ethereum", tvl: 50 },
        { name: "Base", tvl: 10 },
      ]);
      expect(fetchMock.mock.calls[0][0]).toBe("https://api.llama.fi/v2/chains");
    });

    it("throws when the response is not an array", async () => {
      const provider = await freshProvider();
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonOk({ notAnArray: true })),
      );
      await expect(provider.getTvlByChain()).rejects.toThrow(
        /unexpected response shape/,
      );
    });

    it("propagates a non-2xx status as a thrown error", async () => {
      const provider = await freshProvider();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(httpError(429)));
      await expect(provider.getTvlByChain()).rejects.toThrow(/429/);
    });

    it("serves a fresh cached value without a second fetch (cache hit)", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonOk([{ name: "Ethereum", tvl: 1 }]));
      vi.stubGlobal("fetch", fetchMock);
      const provider = await freshProvider();
      const first = await provider.getTvlByChain();
      const second = await provider.getTvlByChain();
      expect(second).toEqual(first);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("serves the last good value when a later load fails (stale-on-error)", async () => {
      const provider = await freshProvider();
      // Prime a good value.
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonOk([{ name: "Ethereum", tvl: 7 }])),
      );
      const primed = await provider.getTvlByChain();
      expect(primed).toEqual([{ name: "Ethereum", tvl: 7 }]);

      // Expire the cached entry (TTL is 8 min), then make the refetch reject:
      // the stale-on-error path returns the last good value instead of throwing.
      vi.advanceTimersByTime(10 * 60_000);
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
      const stale = await provider.getTvlByChain();
      expect(stale).toEqual([{ name: "Ethereum", tvl: 7 }]);
    });
  });

  describe("getDexVolume", () => {
    it("maps total24h→volume24h, keeps only positive rows, and sorts descending", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonOk({
          protocols: [
            { name: "Uniswap", total24h: 100, change_1d: 3.5 },
            { name: "Curve", total24h: 500, change_1d: null },
            { name: "Dead", total24h: 0, change_1d: 1 },
            { name: "Missing", total24h: null, change_1d: 2 },
          ],
        }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const out = await (await freshProvider()).getDexVolume();
      expect(out).toEqual([
        { name: "Curve", volume24h: 500, changePct: undefined },
        { name: "Uniswap", volume24h: 100, changePct: 3.5 },
      ]);
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://api.llama.fi/overview/dexs",
      );
    });

    it("throws when the body has no protocols array", async () => {
      const provider = await freshProvider();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonOk({})));
      await expect(provider.getDexVolume()).rejects.toThrow(
        /unexpected response shape/,
      );
    });
  });

  describe("getProtocolTvl", () => {
    it("keeps category, coerces change_1d, filters non-positive tvl, sorts descending", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonOk([
          { name: "Aave", tvl: 20, category: "Lending", change_1d: -1.2 },
          { name: "Lido", tvl: 90, category: "Liquid Staking" },
          { name: "Empty", tvl: null, category: "Dexes", change_1d: 5 },
          { name: "Zero", tvl: 0, category: "Dexes" },
        ]),
      );
      vi.stubGlobal("fetch", fetchMock);
      const out = await (await freshProvider()).getProtocolTvl();
      expect(out).toEqual([
        {
          name: "Lido",
          tvl: 90,
          category: "Liquid Staking",
          changePct: undefined,
        },
        { name: "Aave", tvl: 20, category: "Lending", changePct: -1.2 },
      ]);
      expect(fetchMock.mock.calls[0][0]).toBe("https://api.llama.fi/protocols");
    });

    it("throws when the response is not an array", async () => {
      const provider = await freshProvider();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonOk({})));
      await expect(provider.getProtocolTvl()).rejects.toThrow(
        /unexpected response shape/,
      );
    });
  });

  describe("getProtocolFees", () => {
    it("maps total24h→fees24h, filters non-positive, and sorts descending", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonOk({
          protocols: [
            { name: "Ethereum", total24h: 3, change_1d: 10 },
            { name: "Tron", total24h: 8, change_1d: null },
            { name: "Zero", total24h: 0, change_1d: 1 },
          ],
        }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const out = await (await freshProvider()).getProtocolFees();
      expect(out).toEqual([
        { name: "Tron", fees24h: 8, changePct: undefined },
        { name: "Ethereum", fees24h: 3, changePct: 10 },
      ]);
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://api.llama.fi/overview/fees",
      );
    });

    it("throws when the body has no protocols array", async () => {
      const provider = await freshProvider();
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonOk(null)));
      await expect(provider.getProtocolFees()).rejects.toThrow(
        /unexpected response shape/,
      );
    });
  });

  describe("getProtocolFundamentals", () => {
    /** Routes the three calls the method makes: fees, revenue, TVL. */
    function mockFundamentals(opts: {
      fees?: unknown;
      revenue?: unknown;
      tvl?: unknown;
      revenueFails?: boolean;
      tvlEmptyBody?: boolean;
    }) {
      return vi.fn().mockImplementation((url: string) => {
        if (url.includes("/tvl/")) {
          return Promise.resolve(
            opts.tvlEmptyBody ? emptyBody() : jsonOk(opts.tvl),
          );
        }
        if (url.includes("dataType=dailyRevenue")) {
          return opts.revenueFails
            ? Promise.reject(new Error("no revenue adapter"))
            : Promise.resolve(jsonOk(opts.revenue));
        }
        return Promise.resolve(jsonOk(opts.fees));
      });
    }

    it("reads both dataTypes plus TVL, converts seconds→ms, and prefers the publisher's aggregates", async () => {
      const fetchMock = mockFundamentals({
        fees: {
          name: "Uniswap",
          slug: "uniswap",
          totalDataChart: [
            [1_700_000_000, 10],
            [1_700_086_400, 20],
          ],
          total30d: 999,
          total1y: 8888,
        },
        // Deliberately a SHORTER series starting later, as Uniswap's really is:
        // the two dimensions keep their own timestamps and are never index-zipped.
        revenue: {
          name: "Uniswap",
          slug: "uniswap",
          totalDataChart: [[1_700_086_400, 2]],
          total30d: 99,
          total1y: 888,
        },
        tvl: 3_035_402_544.58,
      });
      vi.stubGlobal("fetch", fetchMock);
      const out = await (
        await freshProvider()
      ).getProtocolFundamentals("uniswap");
      expect(out).toEqual({
        protocol: "uniswap",
        name: "Uniswap",
        fees: [
          { time: 1_700_000_000_000, value: 10 },
          { time: 1_700_086_400_000, value: 20 },
        ],
        revenue: [{ time: 1_700_086_400_000, value: 2 }],
        fees30d: 999,
        fees365d: 8888,
        revenue30d: 99,
        revenue365d: 888,
        tvl: 3_035_402_544.58,
      });
      const urls = fetchMock.mock.calls.map((c) => c[0] as string);
      expect(urls).toContain(
        "https://api.llama.fi/summary/fees/uniswap?dataType=dailyFees&excludeTotalDataChartBreakdown=true",
      );
      expect(urls).toContain(
        "https://api.llama.fi/summary/fees/uniswap?dataType=dailyRevenue&excludeTotalDataChartBreakdown=true",
      );
      expect(urls).toContain("https://api.llama.fi/tvl/uniswap");
    });

    it("sums trailing totals from the series when unpublished, over closed days only", async () => {
      // Pin the clock so 2026-08-06 is TODAY — a partial print the publisher's
      // own aggregates exclude, so the local fallback must exclude it too.
      vi.setSystemTime(new Date("2026-08-06T12:00:00Z"));
      const fetchMock = mockFundamentals({
        fees: {
          name: "Aave",
          slug: "aave",
          totalDataChart: [
            [1_785_801_600, 100], // 2026-08-04, closed
            [1_785_888_000, 200], // 2026-08-05, closed
            [1_785_974_400, 7], // 2026-08-06, today → excluded
          ],
        },
        revenue: { totalDataChart: [] },
        tvl: 0,
      });
      vi.stubGlobal("fetch", fetchMock);
      const out = await (await freshProvider()).getProtocolFundamentals("aave");
      expect(out.fees30d).toBe(300);
      expect(out.fees365d).toBe(300);
      // An empty series has no total to invent, and a non-positive TVL is dropped.
      expect(out.revenue30d).toBeUndefined();
      expect(out.tvl).toBeUndefined();
    });

    it("keeps the fees half when the revenue dimension fails", async () => {
      const fetchMock = mockFundamentals({
        fees: {
          name: "Lido",
          slug: "lido",
          totalDataChart: [[1_700_000_000, 5]],
          total30d: 5,
          total1y: 5,
        },
        revenueFails: true,
        tvl: 18_046_614_049.22,
      });
      vi.stubGlobal("fetch", fetchMock);
      const out = await (await freshProvider()).getProtocolFundamentals("lido");
      expect(out.fees).toEqual([{ time: 1_700_000_000_000, value: 5 }]);
      expect(out.fees30d).toBe(5);
      expect(out.revenue).toEqual([]);
      expect(out.revenue30d).toBeUndefined();
      expect(out.revenue365d).toBeUndefined();
      expect(out.tvl).toBe(18_046_614_049.22);
    });

    it("drops TVL when /tvl/{slug} answers 200 with an empty body", async () => {
      const fetchMock = mockFundamentals({
        fees: {
          name: "Ethereum",
          slug: "ethereum",
          totalDataChart: [[1_700_000_000, 1]],
          total30d: 1,
          total1y: 1,
        },
        revenue: { totalDataChart: [[1_700_000_000, 1]], total30d: 1 },
        tvlEmptyBody: true,
      });
      vi.stubGlobal("fetch", fetchMock);
      const out = await (
        await freshProvider()
      ).getProtocolFundamentals("ethereum");
      expect(out.tvl).toBeUndefined();
      expect(out.fees).toHaveLength(1);
      expect(out.revenue30d).toBe(1);
    });

    it("canonicalises the slug, so a case/whitespace variant hits the cache", async () => {
      const fetchMock = mockFundamentals({
        fees: {
          name: "Aave",
          slug: "aave",
          totalDataChart: [[1_700_000_000, 1]],
          total30d: 1,
          total1y: 1,
        },
        revenue: { totalDataChart: [] },
        tvl: 1,
      });
      vi.stubGlobal("fetch", fetchMock);
      const provider = await freshProvider();
      const first = await provider.getProtocolFundamentals("aave");
      // Exactly three upstream calls: fees + revenue + tvl.
      expect(fetchMock.mock.calls.length).toBe(3);
      const second = await provider.getProtocolFundamentals("  AAVE  ");
      expect(second).toEqual(first);
      expect(fetchMock.mock.calls.length).toBe(3);
    });

    it("rejects an empty slug, and throws when the fees body has no chart", async () => {
      const provider = await freshProvider();
      await expect(provider.getProtocolFundamentals("   ")).rejects.toThrow(
        /empty protocol slug/,
      );
      vi.stubGlobal(
        "fetch",
        mockFundamentals({ fees: {}, revenue: {}, tvl: 1 }),
      );
      await expect(provider.getProtocolFundamentals("curve")).rejects.toThrow(
        /unexpected response shape/,
      );
    });
  });

  describe("getTokenUnlocks", () => {
    // Unix SECONDS, against a clock pinned to 2026-08-06T12:00Z below.
    const D_AUG_04 = 1_785_801_600;
    const D_AUG_05 = 1_785_888_000;
    const D_AUG_11 = 1_786_464_000; // future
    const D_AUG_15 = 1_786_813_347; // future, from the live payload
    const D_SEP_15 = 1_789_443_090; // future, from the live payload

    /** Two allocation sections on one grid, mirroring the real payload. */
    function emissionsBody(over: Record<string, unknown> = {}) {
      return {
        supplyMetrics: { maxSupply: 1000, adjustedSupply: 1000 },
        documentedData: {
          data: [
            {
              label: "Airdrop",
              data: [
                { timestamp: D_AUG_04, unlocked: 100 },
                { timestamp: D_AUG_05, unlocked: 100 },
                { timestamp: D_AUG_11, unlocked: 100 },
              ],
            },
            {
              label: "Investors",
              data: [
                { timestamp: D_AUG_04, unlocked: 40 },
                { timestamp: D_AUG_05, unlocked: 50 },
                { timestamp: D_AUG_11, unlocked: 100 },
              ],
            },
          ],
          tokenAllocation: {
            current: { airdrop: 63.5, insiders: 36.5 },
            final: { airdrop: 60.6, insiders: 39.4 },
            // Per-SECTION, which is why progressPct is derived instead.
            progress: { airdrop: 100, insiders: 81.3 },
          },
        },
        metadata: { total: null, events: [] },
        ...over,
      };
    }

    beforeEach(() => {
      vi.setSystemTime(new Date("2026-08-06T12:00:00Z"));
    });

    it("sums the allocation sections, converts seconds→ms, and marks the observed/projected boundary", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonOk(emissionsBody()));
      vi.stubGlobal("fetch", fetchMock);
      const out = await (await freshProvider()).getTokenUnlocks("arbitrum");
      // 100+40, 100+50, 100+100 — a single section would plot half the supply.
      expect(out.schedule).toEqual([
        { time: D_AUG_04 * 1000, value: 140 },
        { time: D_AUG_05 * 1000, value: 150 },
        { time: D_AUG_11 * 1000, value: 200 },
      ]);
      expect(out.protocol).toBe("arbitrum");
      expect(out.observedThrough).toBe(D_AUG_05 * 1000);
      expect(out.maxSupply).toBe(1000);
      expect(out.insiderPctNow).toBe(36.5);
      expect(out.insiderPctFinal).toBe(39.4);
      // Derived 150/200, NOT one key out of the publisher's per-section dict.
      expect(out.progressPct).toBe(75);
      expect(out.upcoming).toEqual([]);
      // The dataset host, not api.llama.fi — and no membership-list request.
      expect(fetchMock.mock.calls.length).toBe(1);
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://defillama-datasets.llama.fi/emissions/arbitrum",
      );
    });

    it("keeps only future events, soonest first, summing noOfTokens and rendering the description template", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonOk(
          emissionsBody({
            metadata: {
              total: null,
              events: [
                {
                  description:
                    "A cliff of {tokens[0]} tokens was unlocked from Airdrop on {timestamp}",
                  timestamp: D_AUG_04,
                  noOfTokens: [10],
                  category: "airdrop",
                  unlockType: "cliff",
                },
                {
                  description:
                    "On {timestamp} {tokens[0]} of Team tokens will be unlocked",
                  timestamp: D_SEP_15,
                  noOfTokens: [56_125_000],
                  category: "insiders",
                  unlockType: "cliff",
                },
                {
                  description:
                    "On {timestamp} {tokens[0]} of Investors tokens will be unlocked",
                  timestamp: D_AUG_15,
                  noOfTokens: [1000, 234],
                  unlockType: "linear_start",
                },
              ],
            },
          }),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);
      const out = await (await freshProvider()).getTokenUnlocks("arbitrum");
      expect(out.upcoming).toEqual([
        {
          time: D_AUG_15 * 1000,
          // Absent category → the publisher's own placeholder.
          category: "Uncategorized",
          description:
            "On 2026-08-15 1,000 of Investors tokens will be unlocked",
          // Both array entries, not just the first.
          tokens: 1234,
          unlockType: "linear_start",
        },
        {
          time: D_SEP_15 * 1000,
          category: "insiders",
          description:
            "On 2026-09-15 56,125,000 of Team tokens will be unlocked",
          tokens: 56_125_000,
          unlockType: "cliff",
        },
      ]);
      // No unrendered braces survive into a card.
      for (const e of out.upcoming) expect(e.description).not.toMatch(/[{}]/);
    });

    it("handles a fully-vested token whose schedule ends in the past", async () => {
      const body = emissionsBody();
      // Drop the future point: every section now ends before today.
      for (const s of body.documentedData.data) s.data = s.data.slice(0, 2);
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonOk(body)));
      const out = await (await freshProvider()).getTokenUnlocks("uniswap");
      expect(out.schedule).toHaveLength(2);
      // Nothing to project: the boundary is the final point.
      expect(out.observedThrough).toBe(D_AUG_05 * 1000);
      expect(out.progressPct).toBe(100);
      expect(out.upcoming).toEqual([]);
    });

    it("falls back to metadata.total for maxSupply, and can't report progress past 100%", async () => {
      const body = emissionsBody({
        supplyMetrics: { maxSupply: null },
        metadata: { total: 777, events: [] },
      });
      // A tail that dips below an already-observed peak would compute >100%.
      body.documentedData.data[1].data[2].unlocked = 0;
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonOk(body)));
      const out = await (await freshProvider()).getTokenUnlocks("aave");
      expect(out.maxSupply).toBe(777);
      expect(out.progressPct).toBe(100);
    });

    it("canonicalises the slug, so a case/whitespace variant hits the cache", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonOk(emissionsBody()));
      vi.stubGlobal("fetch", fetchMock);
      const provider = await freshProvider();
      const first = await provider.getTokenUnlocks("arbitrum");
      const second = await provider.getTokenUnlocks("  ARBITRUM  ");
      expect(second).toEqual(first);
      expect(fetchMock.mock.calls.length).toBe(1);
    });

    it("rejects an empty slug, throws on a shapeless body, and propagates a 404", async () => {
      const provider = await freshProvider();
      await expect(provider.getTokenUnlocks("  ")).rejects.toThrow(
        /empty protocol slug/,
      );
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonOk({})));
      await expect(
        provider.getTokenUnlocks("no-documented-data"),
      ).rejects.toThrow(/unexpected response shape/);
      // An unsupported slug 404s — the authoritative membership answer.
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(httpError(404)));
      await expect(provider.getTokenUnlocks("not-a-protocol")).rejects.toThrow(
        /404/,
      );
    });
  });

  describe("getDexVolumeHistory", () => {
    it("converts unix-seconds to epoch-ms and drops non-finite points", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonOk({
          totalDataChart: [
            [1_700_000_000, 111],
            [1_700_086_400, "222"], // numeric string → Number("222") = 222
            [1_700_172_800, "nope"], // NaN value → dropped
            [1_700_259_200, 444],
          ],
        }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const out = await (
        await freshProvider()
      ).getDexVolumeHistory(["uniswap-history-a"]);
      expect(out).toEqual({
        "uniswap-history-a": [
          { time: 1_700_000_000_000, value: 111 },
          { time: 1_700_086_400_000, value: 222 },
          { time: 1_700_259_200_000, value: 444 },
        ],
      });
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://api.llama.fi/summary/dexs/uniswap-history-a?excludeTotalDataChartBreakdown=true",
      );
    });

    it("returns an empty series for a slug whose endpoint fails, keeping the good one", async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.includes("good-dex")) {
          return Promise.resolve(
            jsonOk({ totalDataChart: [[1_600_000_000, 5]] }),
          );
        }
        // The failing slug rejects — the provider swallows it into [].
        return Promise.reject(new Error("boom"));
      });
      vi.stubGlobal("fetch", fetchMock);
      const out = await (
        await freshProvider()
      ).getDexVolumeHistory(["good-dex", "bad-dex"]);
      expect(out).toEqual({
        "good-dex": [{ time: 1_600_000_000_000, value: 5 }],
        "bad-dex": [],
      });
    });

    it("returns an empty series when totalDataChart is absent", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonOk({})));
      const out = await (
        await freshProvider()
      ).getDexVolumeHistory(["no-chart-dex"]);
      expect(out).toEqual({ "no-chart-dex": [] });
    });

    it("uses an order-independent cache key: [a,b] then [b,a] hits the cache", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonOk({ totalDataChart: [[1_500_000_000, 9]] }));
      vi.stubGlobal("fetch", fetchMock);
      const provider = await freshProvider();
      const first = await provider.getDexVolumeHistory([
        "alpha-dex",
        "beta-dex",
      ]);
      const callsAfterFirst = fetchMock.mock.calls.length;
      // Reversed arg order must resolve to the same sorted key → pure cache hit.
      const second = await provider.getDexVolumeHistory([
        "beta-dex",
        "alpha-dex",
      ]);
      expect(second).toEqual(first);
      expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
      // Two slugs on a fresh key → exactly two upstream fetches, not more.
      expect(callsAfterFirst).toBe(2);
    });
  });

  describe("getProtocolTvlHistory", () => {
    it("maps date→ms and totalLiquidityUSD→value, dropping non-finite rows", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonOk({
          tvl: [
            { date: 1_650_000_000, totalLiquidityUSD: 1000 },
            { date: 1_650_086_400, totalLiquidityUSD: "2000" },
            { date: 1_650_172_800, totalLiquidityUSD: "bad" }, // NaN → dropped
          ],
        }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const out = await (
        await freshProvider()
      ).getProtocolTvlHistory(["aave-history"]);
      expect(out).toEqual({
        "aave-history": [
          { time: 1_650_000_000_000, value: 1000 },
          { time: 1_650_086_400_000, value: 2000 },
        ],
      });
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://api.llama.fi/protocol/aave-history",
      );
    });

    it("returns an empty series for a failing slug while keeping the good one", async () => {
      const fetchMock = vi.fn().mockImplementation((url: string) => {
        if (url.includes("lido-ok")) {
          return Promise.resolve(
            jsonOk({ tvl: [{ date: 1_620_000_000, totalLiquidityUSD: 42 }] }),
          );
        }
        return Promise.reject(new Error("upstream 500"));
      });
      vi.stubGlobal("fetch", fetchMock);
      const out = await (
        await freshProvider()
      ).getProtocolTvlHistory(["lido-ok", "curve-fail"]);
      expect(out).toEqual({
        "lido-ok": [{ time: 1_620_000_000_000, value: 42 }],
        "curve-fail": [],
      });
    });

    it("returns an empty series when the tvl array is missing", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonOk({})));
      const out = await (
        await freshProvider()
      ).getProtocolTvlHistory(["no-tvl-protocol"]);
      expect(out).toEqual({ "no-tvl-protocol": [] });
    });

    it("keys are order-independent: reversed slugs hit the same cached value", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonOk({ tvl: [{ date: 1_610_000_000, totalLiquidityUSD: 3 }] }),
        );
      vi.stubGlobal("fetch", fetchMock);
      const provider = await freshProvider();
      const first = await provider.getProtocolTvlHistory([
        "gamma-proto",
        "delta-proto",
      ]);
      const callsAfterFirst = fetchMock.mock.calls.length;
      const second = await provider.getProtocolTvlHistory([
        "delta-proto",
        "gamma-proto",
      ]);
      expect(second).toEqual(first);
      expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
    });
  });
});
