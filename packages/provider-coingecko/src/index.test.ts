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
    expect(provider.capabilities).toEqual([
      "global-market",
      "coin-markets",
      "trending-coins",
      "sector-performance",
      "nft-market",
      "crypto-profile",
    ]);
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

  describe("getNftMarket", () => {
    /** A canned CoinGecko /nfts/{id} body. */
    function nftBody(id: string, floorUsd: number, volumeUsd: number) {
      return {
        id,
        name: id.replace(/-/g, " "),
        floor_price: { native_currency: floorUsd / 2000, usd: floorUsd },
        floor_price_24h_percentage_change: { usd: -3.5 },
        market_cap: { usd: floorUsd * 10000 },
        volume_24h: { usd: volumeUsd },
        one_day_sales: 12,
      };
    }

    /**
     * Route each /nfts/{id} call to a per-id body via the trailing slug. Any id
     * NOT in `bodies` (or mapped to null) resolves to a 429 — the real provider
     * fetches all ~10 curated slugs, so tests supply only the ones they care
     * about and let the rest throttle.
     */
    function nftFetch(bodies: Record<string, ReturnType<typeof nftBody>>) {
      return vi.fn().mockImplementation((url: string) => {
        const id = url.split("/").pop() as string;
        const body = bodies[id];
        return Promise.resolve(
          body ? jsonResponse(body) : jsonResponse(null, 429),
        );
      });
    }

    it("maps resolved collections and sorts them by 24h volume desc", async () => {
      const fetchMock = nftFetch({
        "bored-ape-yacht-club": nftBody("bored-ape-yacht-club", 16000, 65_000),
        "pudgy-penguins": nftBody("pudgy-penguins", 12000, 900_000),
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await new CoinGeckoProvider().getNftMarket();

      expect(result.map((c) => c.id)).toEqual([
        "pudgy-penguins", // higher volume first
        "bored-ape-yacht-club",
      ]);
      expect(result[0]).toEqual({
        id: "pudgy-penguins",
        name: "pudgy penguins",
        floorNative: 6,
        floorUsd: 12000,
        floorChangePct24h: -3.5,
        marketCapUsd: 120_000_000,
        volume24hUsd: 900_000,
        sales24h: 12,
      });
    });

    it("skips a collection missing a finite floor price but keeps the rest", async () => {
      vi.stubGlobal(
        "fetch",
        nftFetch({
          "bored-ape-yacht-club": nftBody(
            "bored-ape-yacht-club",
            16000,
            65_000,
          ),
          azuki: nftBody("azuki", Number.NaN, 5_000),
        }),
      );

      const result = await new CoinGeckoProvider().getNftMarket();
      expect(result.map((c) => c.id)).toEqual(["bored-ape-yacht-club"]);
    });

    it("skips a collection whose fetch fails (429) and keeps the rest", async () => {
      vi.stubGlobal(
        "fetch",
        nftFetch({ cryptopunks: nftBody("cryptopunks", 40000, 200_000) }),
      );

      const result = await new CoinGeckoProvider().getNftMarket();
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe("cryptopunks");
    });

    it("throws a labelled error when no collection resolves", async () => {
      vi.stubGlobal("fetch", nftFetch({}));

      await expect(new CoinGeckoProvider().getNftMarket()).rejects.toThrow(
        "coingecko nfts: no collections resolved",
      );
    });

    it("serves a fresh cached value on the second call without re-fetching", async () => {
      const fetchMock = nftFetch({
        "bored-ape-yacht-club": nftBody("bored-ape-yacht-club", 16000, 65_000),
      });
      vi.stubGlobal("fetch", fetchMock);

      const first = await new CoinGeckoProvider().getNftMarket();
      const callsAfterFirst = fetchMock.mock.calls.length;
      const second = await new CoinGeckoProvider().getNftMarket();

      expect(second).toEqual(first);
      // Second call served from the shared module-level cache — no new fetches.
      expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
    });
  });

  describe("getCryptoProfile", () => {
    /** A canned /coins/{id} body; overrides replace a whole top-level block. */
    function coinBody(overrides: Record<string, unknown> = {}) {
      return {
        id: "bitcoin",
        symbol: "btc",
        name: "Bitcoin",
        market_cap_rank: 1,
        categories: ["Layer 1 (L1)", "Proof of Work (PoW)"],
        description: { en: "Bitcoin is a decentralized currency." },
        links: {
          homepage: ["https://bitcoin.org"],
          repos_url: { github: ["https://github.com/bitcoin/bitcoin"] },
          twitter_screen_name: "bitcoin",
          subreddit_url: "https://www.reddit.com/r/Bitcoin/",
          whitepaper: "https://bitcoin.org/bitcoin.pdf",
        },
        market_data: {
          current_price: { usd: 64_000 },
          market_cap: { usd: 1_290_000_000_000 },
          fully_diluted_valuation: { usd: 1_340_000_000_000 },
          total_volume: { usd: 22_000_000_000 },
          circulating_supply: 20_000_000,
          total_supply: 20_000_000,
          max_supply: 21_000_000,
          ath: { usd: 126_000 },
          ath_date: { usd: "2025-10-06T10:57:42.000Z" },
          ath_change_percentage: { usd: -48.8 },
          atl: { usd: 67.81 },
          atl_date: { usd: "2013-07-05T16:00:00.000Z" },
          atl_change_percentage: { usd: 95_000 },
          price_change_percentage_24h: 0.7,
          price_change_percentage_7d: 0.02,
          price_change_percentage_30d: 2.1,
          price_change_percentage_1y: -43.4,
        },
        developer_data: {
          stars: 73_168,
          forks: 36_426,
          subscribers: 3_967,
          total_issues: 7_743,
          closed_issues: 7_380,
          pull_requests_merged: 11_215,
          pull_request_contributors: 846,
          commit_count_4_weeks: 108,
        },
        ...overrides,
      };
    }

    /**
     * Route the three endpoints a profile can touch, keyed by URL, so a test can
     * assert *which* of them an input reached — reaching as few as possible is the
     * resolver's whole job. An unsupplied route answers 429, i.e. "this test did
     * not expect that call"; an unknown coin id answers 404.
     */
    function profileFetch(routes: {
      coin?: Record<string, unknown>;
      symbols?: unknown;
      search?: unknown;
    }) {
      return vi.fn().mockImplementation((url: string) => {
        if (url.includes("/coins/markets"))
          return Promise.resolve(
            routes.symbols === undefined
              ? jsonResponse(null, 429)
              : jsonResponse(routes.symbols),
          );
        if (url.includes("/search?query="))
          return Promise.resolve(
            routes.search === undefined
              ? jsonResponse(null, 429)
              : jsonResponse(routes.search),
          );
        const id = decodeURIComponent(/\/coins\/([^?]+)/.exec(url)?.[1] ?? "");
        const body = routes.coin?.[id];
        return Promise.resolve(
          body ? jsonResponse(body) : jsonResponse(null, 404),
        );
      });
    }

    const urls = (mock: ReturnType<typeof vi.fn>) =>
      mock.mock.calls.map((call) => String(call[0]));

    it("maps the full coin payload onto a CryptoAssetProfile", async () => {
      const fetchMock = profileFetch({ coin: { bitcoin: coinBody() } });
      vi.stubGlobal("fetch", fetchMock);

      const profile = await new CoinGeckoProvider().getCryptoProfile("BTC");

      expect(profile).toEqual({
        id: "bitcoin",
        symbol: "BTC",
        name: "Bitcoin",
        description: "Bitcoin is a decentralized currency.",
        categories: ["Layer 1 (L1)", "Proof of Work (PoW)"],
        marketCapRank: 1,
        links: {
          homepage: "https://bitcoin.org",
          sourceCode: "https://github.com/bitcoin/bitcoin",
          twitter: "https://x.com/bitcoin",
          subreddit: "https://www.reddit.com/r/Bitcoin/",
          whitepaper: "https://bitcoin.org/bitcoin.pdf",
        },
        price: 64_000,
        marketCap: 1_290_000_000_000,
        fullyDilutedValuation: 1_340_000_000_000,
        volume24h: 22_000_000_000,
        circulatingSupply: 20_000_000,
        totalSupply: 20_000_000,
        maxSupply: 21_000_000,
        ath: 126_000,
        athDate: "2025-10-06T10:57:42.000Z",
        athChangePct: -48.8,
        atl: 67.81,
        atlDate: "2013-07-05T16:00:00.000Z",
        atlChangePct: 95_000,
        changePct24h: 0.7,
        changePct7d: 0.02,
        changePct30d: 2.1,
        changePct1y: -43.4,
        developer: {
          stars: 73_168,
          forks: 36_426,
          subscribers: 3_967,
          totalIssues: 7_743,
          closedIssues: 7_380,
          pullRequestsMerged: 11_215,
          pullRequestContributors: 846,
          commits4Weeks: 108,
        },
      });
    });

    it("resolves a pinned major with no resolution request at all", async () => {
      const fetchMock = profileFetch({ coin: { bitcoin: coinBody() } });
      vi.stubGlobal("fetch", fetchMock);

      await new CoinGeckoProvider().getCryptoProfile("BTC");

      // Exactly one call, straight to /coins/{id} — the pinned map means no
      // symbols/search round-trip (both routes above would have 429'd).
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(urls(fetchMock)[0]).toContain(
        "https://api.coingecko.com/api/v3/coins/bitcoin?",
      );
    });

    it("resolves a major's own id without letting symbol resolution see it", async () => {
      // Three listed coins publish the literal symbol "ethereum"; the reverse pin
      // is what stops "ethereum" resolving to one of them.
      const fetchMock = profileFetch({
        coin: { ethereum: coinBody({ id: "ethereum", symbol: "eth" }) },
      });
      vi.stubGlobal("fetch", fetchMock);

      const profile = await new CoinGeckoProvider().getCryptoProfile(
        "ethereum",
      );

      expect(profile.id).toBe("ethereum");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("treats a hyphenated input as an id, since no ticker contains a hyphen", async () => {
      const fetchMock = profileFetch({
        coin: {
          "pudgy-penguins": coinBody({ id: "pudgy-penguins", symbol: "pengu" }),
        },
      });
      vi.stubGlobal("fetch", fetchMock);

      const profile = await new CoinGeckoProvider().getCryptoProfile(
        "pudgy-penguins",
      );

      expect(profile.id).toBe("pudgy-penguins");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("picks the largest exact-symbol match, not the first row returned", async () => {
      const fetchMock = profileFetch({
        // Deliberately ordered worst-first, and salted with a non-exact symbol,
        // so a first-hit resolver would pick the scam token.
        symbols: [
          {
            id: "xbtc-scam",
            symbol: "xbtc",
            market_cap: 1_000,
            market_cap_rank: 9_000,
          },
          {
            // Not an exact symbol match, and the largest row — a resolver that
            // sorted before filtering would pick this one.
            id: "wrapped-btc",
            symbol: "wbtc",
            market_cap: 9e11,
            market_cap_rank: 15,
          },
          {
            id: "xbtc-real",
            symbol: "xbtc",
            market_cap: 4.2e8,
            market_cap_rank: 220,
          },
        ],
        coin: { "xbtc-real": coinBody({ id: "xbtc-real", symbol: "xbtc" }) },
      });
      vi.stubGlobal("fetch", fetchMock);

      // Not a pinned major, so this really does go through symbol resolution.
      const profile = await new CoinGeckoProvider().getCryptoProfile("XBTC");

      expect(profile.id).toBe("xbtc-real");
      expect(urls(fetchMock)[0]).toContain("symbols=xbtc");
    });

    it("falls back to /search when the symbols filter lists no exact match", async () => {
      const fetchMock = profileFetch({
        symbols: [{ id: "other", symbol: "notarb", market_cap: 5 }],
        search: {
          coins: [
            { id: "arb-junk", symbol: "arb", market_cap_rank: null },
            { id: "arbitrum", symbol: "arb", market_cap_rank: 97 },
            { id: "arbdoge", symbol: "arb", market_cap_rank: 2_400 },
          ],
        },
        coin: { arbitrum: coinBody({ id: "arbitrum", symbol: "arb" }) },
      });
      vi.stubGlobal("fetch", fetchMock);

      const profile = await new CoinGeckoProvider().getCryptoProfile("ARB");

      // Best (lowest) rank wins, and the unranked coin loses rather than winning
      // on a null-sorts-first comparison.
      expect(profile.id).toBe("arbitrum");
      expect(urls(fetchMock)[1]).toContain("/search?query=arb");
    });

    it("reads an id-shaped input as an id when its only symbol match ranks deep, then falls back", async () => {
      const fetchMock = profileFetch({
        // A squatter on the symbol "moondust", far down the rankings.
        symbols: [
          {
            id: "moondust-scam",
            symbol: "moondust",
            market_cap: 900,
            market_cap_rank: 9_100,
          },
        ],
        // The id reading does not exist, so the guard's fallback must be used.
        coin: {
          "moondust-scam": coinBody({
            id: "moondust-scam",
            symbol: "moondust",
          }),
        },
      });
      vi.stubGlobal("fetch", fetchMock);

      const profile = await new CoinGeckoProvider().getCryptoProfile(
        "moondust",
      );

      expect(profile.id).toBe("moondust-scam");
      // Tried /coins/moondust (404) before /coins/moondust-scam.
      const coinCalls = urls(fetchMock).filter(
        (url) => !url.includes("/markets") && !url.includes("/search"),
      );
      expect(coinCalls[0]).toContain("/coins/moondust?");
      expect(coinCalls[1]).toContain("/coins/moondust-scam?");
    });

    it("uses the input as an id when nothing publishes that symbol", async () => {
      const fetchMock = profileFetch({
        symbols: [],
        search: {
          coins: [{ id: "uniswap", symbol: "uni", market_cap_rank: 37 }],
        },
        coin: { uniswap: coinBody({ id: "uniswap", symbol: "uni" }) },
      });
      vi.stubGlobal("fetch", fetchMock);

      const profile = await new CoinGeckoProvider().getCryptoProfile("uniswap");

      // No coin publishes the symbol "uniswap" (the search hit's symbol is "uni",
      // not an exact match), so the input was an id all along.
      expect(profile.id).toBe("uniswap");
    });

    it("leaves maxSupply ABSENT for an uncapped asset rather than reporting 0", async () => {
      const body = coinBody({ id: "ethereum", symbol: "eth" });
      // Upstream sends null for every uncapped asset. A 0 here would render as
      // "fully diluted" — the exact opposite of uncapped.
      body.market_data.max_supply = null as unknown as number;
      body.market_data.fully_diluted_valuation = {} as { usd: number };
      const fetchMock = profileFetch({ coin: { ethereum: body } });
      vi.stubGlobal("fetch", fetchMock);

      const profile = await new CoinGeckoProvider().getCryptoProfile("ETH");

      expect(profile).not.toHaveProperty("maxSupply", 0);
      expect(profile.maxSupply).toBeUndefined();
      expect(profile.fullyDilutedValuation).toBeUndefined();
      // The fields that WERE published are untouched.
      expect(profile.totalSupply).toBe(20_000_000);
    });

    it("strips markup and collapses whitespace out of the description", async () => {
      const fetchMock = profileFetch({
        coin: {
          bitcoin: coinBody({
            description: {
              en: 'Wrapped <a href="https://x.test">Bitcoin</a>&nbsp;is a token.<br/>\r\n\r\nIt tracks BTC &amp; nothing else.',
            },
          }),
        },
      });
      vi.stubGlobal("fetch", fetchMock);

      const profile = await new CoinGeckoProvider().getCryptoProfile("BTC");

      expect(profile.description).toBe(
        "Wrapped Bitcoin is a token. It tracks BTC & nothing else.",
      );
    });

    it("omits absent links and drops the links object when none resolve", async () => {
      const partial = await (async () => {
        const fetchMock = profileFetch({
          coin: {
            bitcoin: coinBody({
              links: {
                homepage: ["", null],
                repos_url: { github: [] },
                twitter_screen_name: null,
                subreddit_url: null,
                // Published as an empty string, not null — both mean "absent".
                whitepaper: "",
              },
            }),
          },
        });
        vi.stubGlobal("fetch", fetchMock);
        return new CoinGeckoProvider().getCryptoProfile("BTC");
      })();

      expect(partial.links).toBeUndefined();
    });

    it("omits the developer block when the source tracks no repository", async () => {
      const fetchMock = profileFetch({
        coin: {
          bitcoin: coinBody({
            developer_data: {
              stars: null,
              forks: null,
              subscribers: null,
              total_issues: null,
              closed_issues: null,
              pull_requests_merged: null,
              pull_request_contributors: null,
              commit_count_4_weeks: null,
            },
          }),
        },
      });
      vi.stubGlobal("fetch", fetchMock);

      const profile = await new CoinGeckoProvider().getCryptoProfile("BTC");
      expect(profile.developer).toBeUndefined();
    });

    it("keeps a real zero, distinguishing 'none' from 'not published'", async () => {
      const body = coinBody();
      body.developer_data.commit_count_4_weeks = 0;
      const fetchMock = profileFetch({ coin: { bitcoin: body } });
      vi.stubGlobal("fetch", fetchMock);

      const profile = await new CoinGeckoProvider().getCryptoProfile("BTC");
      // An abandoned repo genuinely has 0 commits; that must survive as 0.
      expect(profile.developer?.commits4Weeks).toBe(0);
    });

    it("makes exactly one /coins call and reuses it for a second card", async () => {
      const fetchMock = profileFetch({ coin: { bitcoin: coinBody() } });
      vi.stubGlobal("fetch", fetchMock);

      const first = await new CoinGeckoProvider().getCryptoProfile("BTC");
      const second = await new CoinGeckoProvider().getCryptoProfile("BTC");

      expect(second).toEqual(first);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("re-fetches the profile past its TTL without re-resolving the ticker", async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = profileFetch({
          symbols: [
            {
              id: "arbitrum",
              symbol: "arb",
              market_cap: 5e8,
              market_cap_rank: 97,
            },
          ],
          coin: { arbitrum: coinBody({ id: "arbitrum", symbol: "arb" }) },
        });
        vi.stubGlobal("fetch", fetchMock);
        const provider = new CoinGeckoProvider();
        await provider.getCryptoProfile("ARB");
        expect(
          urls(fetchMock).filter((u) => u.includes("symbols=")),
        ).toHaveLength(1);

        // Past the 4-min profile TTL but well inside the 24h id TTL.
        vi.advanceTimersByTime(5 * 60_000);
        await provider.getCryptoProfile("ARB");

        // The profile refreshed; the id resolution did not repeat.
        expect(
          urls(fetchMock).filter((u) => u.includes("/coins/arbitrum?")),
        ).toHaveLength(2);
        expect(
          urls(fetchMock).filter((u) => u.includes("symbols=")),
        ).toHaveLength(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it("serves the last good profile when a later fetch fails (stale-on-error)", async () => {
      vi.useFakeTimers();
      try {
        const fetchMock = profileFetch({ coin: { bitcoin: coinBody() } });
        vi.stubGlobal("fetch", fetchMock);
        const provider = new CoinGeckoProvider();
        const good = await provider.getCryptoProfile("BTC");

        vi.advanceTimersByTime(5 * 60_000);
        fetchMock.mockResolvedValueOnce(jsonResponse(null, 429));

        expect(await provider.getCryptoProfile("BTC")).toEqual(good);
      } finally {
        vi.useRealTimers();
      }
    });

    it("throws a labelled error on a body missing id/symbol", async () => {
      const fetchMock = profileFetch({
        coin: { bitcoin: { name: "Bitcoin" } },
      });
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        new CoinGeckoProvider().getCryptoProfile("BTC"),
      ).rejects.toThrow("coingecko coin bitcoin: unexpected response shape");
    });

    it("rejects an empty asset without making a request", async () => {
      const fetchMock = profileFetch({});
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        new CoinGeckoProvider().getCryptoProfile("   "),
      ).rejects.toThrow("coingecko crypto-profile: empty asset");
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });
});
