import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoinGeckoProvider as CoinGeckoProviderType } from "./index";

// The two caches backing this provider (globalCache / marketsCache) are
// module-level singletons: a plain `new CoinGeckoProvider()` reuses them, and
// their in-memory `entries` map never resets between tests. With staleOnError on
// (the default), a good value primed by any earlier test would be served on a
// later failure — masking every error path. So each test gets a genuinely FRESH
// module (and therefore fresh, empty caches) via `vi.resetModules()` + a dynamic
// import. `loadProvider()` returns that fresh class; tests construct from it.
type Ctor = typeof CoinGeckoProviderType;

async function loadProvider(): Promise<Ctor> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.CoinGeckoProvider;
}

/** A minimal Response-like the stubbed global fetch resolves to. */
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** A canned CoinGecko /global body. */
function globalBody() {
  return {
    data: {
      total_market_cap: { usd: 2_500_000_000_000, btc: 40_000_000 },
      market_cap_percentage: { btc: 52.5, eth: 17.25 },
      market_cap_change_percentage_24h_usd: 1.75,
    },
  };
}

/** A canned CoinGecko /coins/markets body. */
function marketsBody() {
  return [
    {
      symbol: "btc",
      name: "Bitcoin",
      market_cap: 1_300_000_000_000,
      price_change_percentage_24h: 2.5,
    },
    {
      symbol: "eth",
      name: "Ethereum",
      market_cap: 400_000_000_000,
      price_change_percentage_24h: -1.2,
    },
  ];
}

describe("CoinGeckoProvider", () => {
  let CoinGeckoProvider: Ctor;

  beforeEach(async () => {
    // Fresh module → fresh empty module-level caches for this test.
    CoinGeckoProvider = await loadProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("advertises its identity and capabilities", () => {
    const provider = new CoinGeckoProvider();
    expect(provider.name).toBe("coingecko");
    expect(provider.capabilities).toEqual(["global-market", "coin-markets"]);
  });

  describe("getGlobalMarket", () => {
    it("maps the CoinGecko global body to a GlobalMarket", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(globalBody()));
      vi.stubGlobal("fetch", fetchMock);

      const result = await new CoinGeckoProvider().getGlobalMarket();

      expect(result).toEqual({
        totalMarketCapUsd: 2_500_000_000_000,
        marketCapChangePct24h: 1.75,
        dominance: { btc: 52.5, eth: 17.25 },
      });
      // Hits the real /global endpoint (not markets).
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe(
        "https://api.coingecko.com/api/v3/global",
      );
    });

    it("defaults totalMarketCapUsd to 0 when usd is absent", async () => {
      const body = globalBody();
      // Drop the usd figure but keep the required shape.
      body.data.total_market_cap = {
        btc: 40_000_000,
      } as unknown as typeof body.data.total_market_cap;
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
      vi.stubGlobal("fetch", fetchMock);

      const result = await new CoinGeckoProvider().getGlobalMarket();
      expect(result.totalMarketCapUsd).toBe(0);
      expect(result.marketCapChangePct24h).toBe(1.75);
    });

    it("coerces a non-finite 24h change to 0", async () => {
      const body = globalBody();
      body.data.market_cap_change_percentage_24h_usd =
        "n/a" as unknown as number;
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
      vi.stubGlobal("fetch", fetchMock);

      const result = await new CoinGeckoProvider().getGlobalMarket();
      expect(result.marketCapChangePct24h).toBe(0);
    });

    it("throws a labelled error on a malformed body (missing data.total_market_cap)", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ data: { market_cap_percentage: {} } }),
        );
      vi.stubGlobal("fetch", fetchMock);

      await expect(new CoinGeckoProvider().getGlobalMarket()).rejects.toThrow(
        "coingecko global: unexpected response shape",
      );
    });

    it("throws a labelled error when data is entirely absent", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}));
      vi.stubGlobal("fetch", fetchMock);

      await expect(new CoinGeckoProvider().getGlobalMarket()).rejects.toThrow(
        "coingecko global: unexpected response shape",
      );
    });

    it("throws the fetch transport error on a non-2xx response (e.g. 429)", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null, 429));
      vi.stubGlobal("fetch", fetchMock);

      await expect(new CoinGeckoProvider().getGlobalMarket()).rejects.toThrow(
        /failed: 429/,
      );
    });

    it("serves a fresh cached value on the second call without re-fetching", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(globalBody()));
      vi.stubGlobal("fetch", fetchMock);

      const provider = new CoinGeckoProvider();
      const first = await provider.getGlobalMarket();
      // A brand-new instance shares the module-level cache — still one fetch.
      const second = await new CoinGeckoProvider().getGlobalMarket();

      expect(second).toEqual(first);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("serves the last good value when a later fetch fails (stale-on-error)", async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(globalBody()));
        vi.stubGlobal("fetch", fetchMock);
        const provider = new CoinGeckoProvider();
        const good = await provider.getGlobalMarket();

        // Let the 12-min TTL lapse, then make the next fetch fail with a 429.
        vi.advanceTimersByTime(13 * 60_000);
        fetchMock.mockResolvedValueOnce(jsonResponse(null, 429));

        const stale = await provider.getGlobalMarket();
        expect(stale).toEqual(good);
        // The stale read still attempted a fresh fetch (which failed).
        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("getCoinMarkets", () => {
    it("maps, upper-cases symbols, and filters to positive market caps", async () => {
      const body = marketsBody();
      body.push({
        symbol: "zero",
        name: "Zerocoin",
        market_cap: 0, // filtered out (not > 0)
        price_change_percentage_24h: 5,
      });
      body.push({
        symbol: "nan",
        name: "NaNcoin",
        market_cap: Number.NaN, // filtered out (not finite)
        price_change_percentage_24h: 5,
      });
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(body));
      vi.stubGlobal("fetch", fetchMock);

      const result = await new CoinGeckoProvider().getCoinMarkets();

      expect(result).toEqual([
        {
          symbol: "BTC",
          name: "Bitcoin",
          marketCapUsd: 1_300_000_000_000,
          changePct24h: 2.5,
        },
        {
          symbol: "ETH",
          name: "Ethereum",
          marketCapUsd: 400_000_000_000,
          changePct24h: -1.2,
        },
      ]);
      expect(fetchMock.mock.calls[0][0]).toContain(
        "https://api.coingecko.com/api/v3/coins/markets",
      );
    });

    it("leaves changePct24h undefined when the source reports null", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse([
          {
            symbol: "sol",
            name: "Solana",
            market_cap: 90_000_000_000,
            price_change_percentage_24h: null,
          },
        ]),
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await new CoinGeckoProvider().getCoinMarkets();
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe("SOL");
      expect(result[0].changePct24h).toBeUndefined();
    });

    it("upper-cases a defensively-defaulted empty symbol to empty string", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse([
          {
            // symbol absent → provider defaults to "" then upper-cases
            name: "Mystery",
            market_cap: 1_000,
            price_change_percentage_24h: 1,
          },
        ]),
      );
      vi.stubGlobal("fetch", fetchMock);

      const result = await new CoinGeckoProvider().getCoinMarkets();
      expect(result).toHaveLength(1);
      expect(result[0].symbol).toBe("");
      expect(result[0].name).toBe("Mystery");
    });

    it("throws a labelled error when the body is not an array", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ error: "throttled" }));
      vi.stubGlobal("fetch", fetchMock);

      await expect(new CoinGeckoProvider().getCoinMarkets()).rejects.toThrow(
        "coingecko markets: unexpected response shape",
      );
    });

    it("throws the fetch transport error on a non-2xx response (e.g. 429)", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(null, 429));
      vi.stubGlobal("fetch", fetchMock);

      await expect(new CoinGeckoProvider().getCoinMarkets()).rejects.toThrow(
        /failed: 429/,
      );
    });

    it("returns an empty array for an empty markets body (no crash)", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]));
      vi.stubGlobal("fetch", fetchMock);

      await expect(new CoinGeckoProvider().getCoinMarkets()).resolves.toEqual(
        [],
      );
    });

    it("serves a fresh cached value on the second call without re-fetching", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonResponse(marketsBody()));
      vi.stubGlobal("fetch", fetchMock);

      const provider = new CoinGeckoProvider();
      const first = await provider.getCoinMarkets();
      const second = await new CoinGeckoProvider().getCoinMarkets();

      expect(second).toEqual(first);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("serves the last good value when a later fetch fails (stale-on-error)", async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = vi
          .fn()
          .mockResolvedValue(jsonResponse(marketsBody()));
        vi.stubGlobal("fetch", fetchMock);
        const provider = new CoinGeckoProvider();
        const good = await provider.getCoinMarkets();

        vi.advanceTimersByTime(11 * 60_000); // past the 10-min markets TTL
        fetchMock.mockRejectedValueOnce(new Error("network"));

        const stale = await provider.getCoinMarkets();
        expect(stale).toEqual(good);
        expect(fetchMock).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
