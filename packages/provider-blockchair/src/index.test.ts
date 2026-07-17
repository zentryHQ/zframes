import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlockchairProvider as BlockchairProviderType } from "./index";

// chainCache is a module-level singleton — give each test a fresh module (fresh,
// empty cache) via vi.resetModules() + dynamic import, so stale-on-error can't
// leak a primed board into a later error-path assertion.
type Ctor = typeof BlockchairProviderType;

async function loadProvider(): Promise<Ctor> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.BlockchairProvider;
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/** A canned Blockchair /{chain}/stats body. */
function stats(tx: number, price = 100) {
  return {
    data: {
      transactions_24h: tx,
      blocks_24h: 120,
      mempool_transactions: 5000,
      market_price_usd: price,
      market_price_usd_change_24h_percentage: -1.5,
    },
  };
}

/** Route each /{chain}/stats call by its slug; an absent slug 429s. */
function chainFetch(bodies: Record<string, ReturnType<typeof stats>>) {
  return vi.fn().mockImplementation((url: string) => {
    const slug = url.split("/").slice(-2, -1)[0] as string;
    const body = bodies[slug];
    return Promise.resolve(body ? jsonResponse(body) : jsonResponse(null, 429));
  });
}

describe("BlockchairProvider", () => {
  let BlockchairProvider: Ctor;

  beforeEach(async () => {
    BlockchairProvider = await loadProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("advertises its identity and capabilities", () => {
    const provider = new BlockchairProvider();
    expect(provider.name).toBe("blockchair");
    expect(provider.capabilities).toEqual(["chain-activity"]);
  });

  it("maps resolved chains and sorts them by 24h transaction count desc", async () => {
    vi.stubGlobal(
      "fetch",
      chainFetch({
        bitcoin: stats(525_170, 62801),
        ethereum: stats(2_822_839, 1827.87),
      }),
    );

    const result = await new BlockchairProvider().getChainActivity();

    expect(result.map((c) => c.chain)).toEqual(["ethereum", "bitcoin"]);
    expect(result[0]).toEqual({
      chain: "ethereum",
      label: "Ethereum",
      transactions24h: 2_822_839,
      blocks24h: 120,
      mempoolTxns: 5000,
      priceUsd: 1827.87,
      priceChangePct24h: -1.5,
    });
  });

  it("skips a chain whose fetch fails (429) and keeps the rest", async () => {
    vi.stubGlobal("fetch", chainFetch({ litecoin: stats(177_413, 44.57) }));

    const result = await new BlockchairProvider().getChainActivity();
    expect(result).toHaveLength(1);
    expect(result[0].chain).toBe("litecoin");
  });

  it("skips a chain whose body lacks transactions_24h but keeps the rest", async () => {
    vi.stubGlobal(
      "fetch",
      chainFetch({
        bitcoin: stats(525_170),
        // dash returns a shape with no transactions_24h → dropped
        dash: { data: { blocks_24h: 10 } } as ReturnType<typeof stats>,
      }),
    );

    const result = await new BlockchairProvider().getChainActivity();
    expect(result.map((c) => c.chain)).toEqual(["bitcoin"]);
  });

  it("throws a labelled error when no chain resolves", async () => {
    vi.stubGlobal("fetch", chainFetch({}));

    await expect(new BlockchairProvider().getChainActivity()).rejects.toThrow(
      "blockchair: no chains resolved",
    );
  });

  it("serves a fresh cached value on the second call without re-fetching", async () => {
    const fetchMock = chainFetch({ bitcoin: stats(525_170) });
    vi.stubGlobal("fetch", fetchMock);

    const first = await new BlockchairProvider().getChainActivity();
    const callsAfterFirst = fetchMock.mock.calls.length;
    const second = await new BlockchairProvider().getChainActivity();

    expect(second).toEqual(first);
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });
});
