import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeckoTerminalProvider as GeckoTerminalProviderType } from "./index";

// poolsCache is a module-level singleton, so each test gets a genuinely fresh
// module (fresh, empty cache) via vi.resetModules() + a dynamic import — the same
// isolation the CoinGecko provider test uses, so stale-on-error can't leak a
// primed value into a later error-path assertion.
type Ctor = typeof GeckoTerminalProviderType;

async function loadProvider(): Promise<Ctor> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.GeckoTerminalProvider;
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** A canned GeckoTerminal trending-pools row (numbers as strings, like the API). */
function pool(name: string, volumeUsd: number, priceUsd = 1.5) {
  return {
    attributes: {
      name,
      base_token_price_usd: String(priceUsd),
      volume_usd: { h24: String(volumeUsd) },
      price_change_percentage: { h24: "-4.75" },
      reserve_in_usd: "1628629.19",
      fdv_usd: "23001512.01",
      transactions: {
        h24: { buys: 915, sells: 400, buyers: 500, sellers: 300 },
      },
    },
  };
}

function poolsBody(...rows: ReturnType<typeof pool>[]) {
  return { data: rows };
}

describe("GeckoTerminalProvider", () => {
  let GeckoTerminalProvider: Ctor;

  beforeEach(async () => {
    GeckoTerminalProvider = await loadProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("advertises its identity and capabilities", () => {
    const provider = new GeckoTerminalProvider();
    expect(provider.name).toBe("geckoterminal");
    expect(provider.capabilities).toEqual(["dex-pools"]);
  });

  it("maps string numerics, sums h24 trades, and sorts by 24h volume desc", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          poolsBody(pool("A / WETH", 65_000), pool("B / WETH", 900_000, 0.5)),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await new GeckoTerminalProvider().getDexPools();

    expect(result.map((p) => p.name)).toEqual(["B / WETH", "A / WETH"]);
    expect(result[0]).toEqual({
      name: "B / WETH",
      network: "eth",
      priceUsd: 0.5,
      volume24hUsd: 900_000,
      changePct24h: -4.75,
      reserveUsd: 1628629.19,
      fdvUsd: 23001512.01,
      txns24h: 1315,
    });
  });

  it("defaults to the eth network and honours a custom network in the URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(poolsBody(pool("X / SOL", 10))));
    vi.stubGlobal("fetch", fetchMock);

    await new GeckoTerminalProvider().getDexPools();
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.geckoterminal.com/api/v2/networks/eth/trending_pools?page=1",
    );

    await new GeckoTerminalProvider().getDexPools("solana");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.geckoterminal.com/api/v2/networks/solana/trending_pools?page=1",
    );
  });

  it("caps the list to 15 pools", async () => {
    const rows = Array.from({ length: 20 }, (_, i) => pool(`P${i} / WETH`, i));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(poolsBody(...rows))),
    );

    const result = await new GeckoTerminalProvider().getDexPools();
    expect(result).toHaveLength(15);
  });

  it("coerces a missing/garbage numeric field to 0 instead of NaN", async () => {
    const broken = {
      attributes: {
        name: "GHOST / WETH",
        // price/volume/reserve absent
        transactions: {},
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ data: [broken] })),
    );

    const [row] = await new GeckoTerminalProvider().getDexPools();
    expect(row).toEqual({
      name: "GHOST / WETH",
      network: "eth",
      priceUsd: 0,
      volume24hUsd: 0,
      changePct24h: 0,
      reserveUsd: 0,
      fdvUsd: 0,
      txns24h: 0,
    });
  });

  it("throws a labelled error when data is not an array", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "bad network" })),
    );

    await expect(new GeckoTerminalProvider().getDexPools()).rejects.toThrow(
      "geckoterminal pools: unexpected response shape",
    );
  });

  it("throws the fetch transport error on a non-2xx response (e.g. 429)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(null, 429)));

    await expect(new GeckoTerminalProvider().getDexPools()).rejects.toThrow(
      /failed: 429/,
    );
  });

  it("serves a fresh cached value on the second call without re-fetching", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(poolsBody(pool("A / WETH", 65_000))));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GeckoTerminalProvider();
    const first = await provider.getDexPools();
    const second = await new GeckoTerminalProvider().getDexPools();

    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches per network — a different network triggers its own fetch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(poolsBody(pool("A / WETH", 1))));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GeckoTerminalProvider();
    await provider.getDexPools("eth");
    await provider.getDexPools("eth"); // cache hit
    await provider.getDexPools("base"); // distinct key → new fetch

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
