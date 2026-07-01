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
    it("advertises exactly the four DeFiLlama capabilities", async () => {
      const provider = await freshProvider();
      expect(provider.name).toBe("defillama");
      expect([...provider.capabilities]).toEqual([
        "tvl",
        "dex-volume",
        "protocol-tvl",
        "protocol-fees",
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
