import { afterEach, describe, expect, it, vi } from "vitest";
import type { HyperliquidProvider as HyperliquidProviderType } from "./index";

// The TtlCaches in index.ts are MODULE-LEVEL singletons shared by every
// provider instance, so a fresh `new HyperliquidProvider()` does NOT reset
// them. To keep each test isolated we `vi.resetModules()` and dynamically
// re-import the module, minting fresh caches per test. `@zframes/data-primitives/fetch`
// reads the global `fetch` at call time, so stubbing the global still applies
// to the freshly-imported provider.
type Ctor = new () => HyperliquidProviderType;

async function freshProvider(): Promise<HyperliquidProviderType> {
  vi.resetModules();
  const mod = await import("./index");
  const Provider = mod.HyperliquidProvider as unknown as Ctor;
  return new Provider();
}

/** A canned Response-like for a successful JSON body. */
function okJson(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => "",
  };
}

/** A non-2xx Response-like; fetchJson throws before touching the body. */
function errStatus(status: number) {
  return {
    ok: false,
    status,
    json: async () => {
      throw new Error("should not read body on !ok");
    },
    text: async () => "",
  };
}

/** The [meta, ctxs] tuple metaAndAssetCtxs returns. */
function metaAndCtxs(
  entries: Array<{
    name: string;
    markPx: string;
    prevDayPx: string;
    openInterest: string;
  }>,
) {
  return [
    { universe: entries.map((e) => ({ name: e.name })) },
    entries.map((e) => ({
      markPx: e.markPx,
      prevDayPx: e.prevDayPx,
      openInterest: e.openInterest,
    })),
  ];
}

/** Parse the JSON body of the Nth fetch call. */
function bodyOf(
  mock: ReturnType<typeof vi.fn>,
  call = 0,
): Record<string, unknown> {
  const init = mock.mock.calls[call][1] as RequestInit;
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

const INFO_URL = "https://api.hyperliquid.xyz/info";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HyperliquidProvider.getDayStats", () => {
  it("no symbols → default dex, whole universe, string→Number + changePct", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson(
        metaAndCtxs([
          { name: "BTC", markPx: "110", prevDayPx: "100", openInterest: "5" },
          { name: "ETH", markPx: "90", prevDayPx: "100", openInterest: "9" },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    const stats = await provider.getDayStats();

    // Whole default-dex universe is returned, with numbers coerced.
    expect(stats).toEqual({
      BTC: { markPx: 110, prevDayPx: 100, changePct: 10 },
      ETH: { markPx: 90, prevDayPx: 100, changePct: -10 },
    });
    // Exactly one POST to the info endpoint with the default-dex body (no `dex`).
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(INFO_URL);
    expect((init as RequestInit).method).toBe("POST");
    expect(bodyOf(fetchMock)).toEqual({ type: "metaAndAssetCtxs" });
  });

  it("sends a JSON Content-Type header (and a Node User-Agent)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okJson(
          metaAndCtxs([
            { name: "BTC", markPx: "1", prevDayPx: "1", openInterest: "0" },
          ]),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();
    await provider.getDayStats();
    const headers = (fetchMock.mock.calls[0][1] as { headers: Headers })
      .headers;
    expect(headers.get("Content-Type")).toBe("application/json");
    // Node runtime (no document) → shared transport adds a descriptive UA.
    expect(headers.get("User-Agent")).toContain("zframes");
  });

  it('"<dex>:*" wildcard → routes to that dex and returns its whole universe', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson(
        metaAndCtxs([
          { name: "TSLA", markPx: "250", prevDayPx: "200", openInterest: "3" },
          { name: "AAPL", markPx: "180", prevDayPx: "180", openInterest: "4" },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    const stats = await provider.getDayStats(["xyz:*"]);

    expect(bodyOf(fetchMock)).toEqual({ type: "metaAndAssetCtxs", dex: "xyz" });
    // Whole xyz universe, including the flat 0% mover.
    expect(stats).toEqual({
      TSLA: { markPx: 250, prevDayPx: 200, changePct: 25 },
      AAPL: { markPx: 180, prevDayPx: 180, changePct: 0 },
    });
  });

  it("concrete symbols → filtered to just those, NOT the whole universe", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson(
        metaAndCtxs([
          { name: "BTC", markPx: "110", prevDayPx: "100", openInterest: "1" },
          { name: "ETH", markPx: "90", prevDayPx: "100", openInterest: "2" },
          { name: "SOL", markPx: "50", prevDayPx: "40", openInterest: "3" },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    const stats = await provider.getDayStats(["BTC"]);

    // Only the requested symbol survives the universe filter.
    expect(Object.keys(stats)).toEqual(["BTC"]);
    expect(stats.BTC).toEqual({ markPx: 110, prevDayPx: 100, changePct: 10 });
    expect(stats.ETH).toBeUndefined();
    expect(stats.SOL).toBeUndefined();
  });

  it('"xyz:TSLA" concrete symbol routes to dex "xyz" but yields no rows (name-mismatch bug)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson(
        metaAndCtxs([
          { name: "TSLA", markPx: "250", prevDayPx: "200", openInterest: "1" },
          { name: "AAPL", markPx: "180", prevDayPx: "170", openInterest: "2" },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    const stats = await provider.getDayStats(["xyz:TSLA"]);

    // Dex routing IS correct: the "xyz" prefix drives the `dex` field so the
    // right dex is queried.
    expect(bodyOf(fetchMock)).toEqual({ type: "metaAndAssetCtxs", dex: "xyz" });
    // BUG SURFACED: `concrete` holds the namespaced symbol "xyz:TSLA", but the
    // universe filter compares it against the bare `asset.name` ("TSLA") via
    // `concrete.has(asset.name)` — which never matches. So a concrete HIP-3
    // (dex-namespaced) symbol resolves to an EMPTY result even though its data
    // is present in the payload. A wildcard "xyz:*" is the only way concrete
    // dex symbols surface today.
    expect(stats).toEqual({});
    expect(stats["xyz:TSLA"]).toBeUndefined();
    expect(stats.TSLA).toBeUndefined();
  });

  it("guards against divide-by-zero: prevDayPx 0 yields changePct 0", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okJson(
          metaAndCtxs([
            { name: "NEW", markPx: "50", prevDayPx: "0", openInterest: "1" },
          ]),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    const stats = await provider.getDayStats();

    // (mark - prev)/prev would be a divide-by-zero (Infinity/NaN); the source
    // guards it with `prevDayPx ? … : 0`.
    expect(stats.NEW).toEqual({ markPx: 50, prevDayPx: 0, changePct: 0 });
  });

  it("skips entries whose markPx/prevDayPx are not finite numbers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson(
        metaAndCtxs([
          { name: "BTC", markPx: "110", prevDayPx: "100", openInterest: "1" },
          {
            name: "BAD",
            markPx: "not-a-number",
            prevDayPx: "100",
            openInterest: "1",
          },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    const stats = await provider.getDayStats();

    expect(Object.keys(stats)).toEqual(["BTC"]);
    expect(stats.BAD).toBeUndefined();
  });

  it("skips a symbol missing its matching ctx entry", async () => {
    // meta.universe has two assets but ctxs only has one → the second has no ctx.
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okJson([
          { universe: [{ name: "BTC" }, { name: "ETH" }] },
          [{ markPx: "110", prevDayPx: "100", openInterest: "1" }],
        ]),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    const stats = await provider.getDayStats();

    expect(Object.keys(stats)).toEqual(["BTC"]);
  });

  it("caches: a second call for the same key does not re-fetch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okJson(
          metaAndCtxs([
            { name: "BTC", markPx: "110", prevDayPx: "100", openInterest: "1" },
          ]),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    await provider.getDayStats(["BTC"]);
    const second = await provider.getDayStats(["BTC"]);

    expect(second.BTC.markPx).toBe(110);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("cache key is order-independent: [A,B] and [B,A] collapse to one fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson(
        metaAndCtxs([
          { name: "BTC", markPx: "110", prevDayPx: "100", openInterest: "1" },
          { name: "ETH", markPx: "90", prevDayPx: "100", openInterest: "2" },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    await provider.getDayStats(["BTC", "ETH"]);
    await provider.getDayStats(["ETH", "BTC"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("distinct request shapes use distinct cache keys (no cross-contamination)", async () => {
    // Default-universe call primes key "*"; a concrete call is a different key.
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        okJson(
          metaAndCtxs([
            { name: "BTC", markPx: "110", prevDayPx: "100", openInterest: "1" },
          ]),
        ),
      )
      .mockResolvedValueOnce(
        okJson(
          metaAndCtxs([
            { name: "ETH", markPx: "90", prevDayPx: "100", openInterest: "2" },
          ]),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    const all = await provider.getDayStats();
    const one = await provider.getDayStats(["ETH"]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    // The "*" key did not serve the concrete request's result.
    expect(all.BTC.markPx).toBe(110);
    expect(one.ETH.markPx).toBe(90);
    expect(one.BTC).toBeUndefined();
  });

  it("rejects when the info endpoint returns a non-2xx status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(429));
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    await expect(provider.getDayStats(["BTC"])).rejects.toThrow(/429/);
  });

  it("serves the last-good value when a later refresh fails (stale-on-error)", async () => {
    vi.useFakeTimers();
    try {
      let call = 0;
      const fetchMock = vi.fn().mockImplementation(() => {
        call += 1;
        if (call === 1) {
          return Promise.resolve(
            okJson(
              metaAndCtxs([
                {
                  name: "BTC",
                  markPx: "110",
                  prevDayPx: "100",
                  openInterest: "1",
                },
              ]),
            ),
          );
        }
        return Promise.resolve(errStatus(500));
      });
      vi.stubGlobal("fetch", fetchMock);
      const provider = await freshProvider();

      const first = await provider.getDayStats(["BTC"]);
      expect(first.BTC.markPx).toBe(110);

      // Advance past the 25s TTL so the next get triggers a refresh, which fails.
      vi.advanceTimersByTime(30_000);
      const second = await provider.getDayStats(["BTC"]);

      // Last-good value is served instead of surfacing the error.
      expect(second.BTC.markPx).toBe(110);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("HyperliquidProvider.getOpenInterest", () => {
  it("no symbols → default dex, USD notional = oi × markPx, sorted descending", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson(
        metaAndCtxs([
          // 2 × 100 = 200 notional
          { name: "BTC", markPx: "100", prevDayPx: "0", openInterest: "2" },
          // 10 × 50 = 500 notional (larger → sorts first)
          { name: "ETH", markPx: "50", prevDayPx: "0", openInterest: "10" },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    const oi = await provider.getOpenInterest();

    expect(bodyOf(fetchMock)).toEqual({ type: "metaAndAssetCtxs" });
    // Descending by USD notional.
    expect(oi).toEqual([
      { symbol: "ETH", openInterestUsd: 500 },
      { symbol: "BTC", openInterestUsd: 200 },
    ]);
  });

  it('"<dex>:*" wildcard routes to that dex and returns its whole universe', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okJson(
          metaAndCtxs([
            { name: "TSLA", markPx: "200", prevDayPx: "0", openInterest: "3" },
          ]),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    const oi = await provider.getOpenInterest(["xyz:*"]);

    expect(bodyOf(fetchMock)).toEqual({ type: "metaAndAssetCtxs", dex: "xyz" });
    expect(oi).toEqual([{ symbol: "TSLA", openInterestUsd: 600 }]);
  });

  it("concrete symbols → filtered, NOT the whole universe", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson(
        metaAndCtxs([
          { name: "BTC", markPx: "100", prevDayPx: "0", openInterest: "2" },
          { name: "ETH", markPx: "50", prevDayPx: "0", openInterest: "10" },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    const oi = await provider.getOpenInterest(["BTC"]);

    expect(oi).toEqual([{ symbol: "BTC", openInterestUsd: 200 }]);
    expect(oi.find((e) => e.symbol === "ETH")).toBeUndefined();
  });

  it('"xyz:TSLA" concrete symbol routes to dex "xyz" but yields no rows (name-mismatch bug)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okJson(
          metaAndCtxs([
            { name: "TSLA", markPx: "200", prevDayPx: "0", openInterest: "3" },
          ]),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    const oi = await provider.getOpenInterest(["xyz:TSLA"]);

    // Dex routing IS correct — the "xyz" prefix drives the `dex` field.
    expect(bodyOf(fetchMock)).toEqual({ type: "metaAndAssetCtxs", dex: "xyz" });
    // BUG (identical to getDayStats): `concrete` holds "xyz:TSLA" but the
    // universe filter compares it to the bare `asset.name` ("TSLA") via
    // `concrete.has(asset.name)`, which never matches — so a concrete HIP-3
    // (dex-namespaced) symbol resolves to EMPTY even though its data is present.
    // "xyz:*" is the only way concrete dex symbols surface today.
    expect(oi).toEqual([]);
  });

  it("skips entries whose openInterest/markPx are not finite", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson(
        metaAndCtxs([
          { name: "BTC", markPx: "100", prevDayPx: "0", openInterest: "2" },
          {
            name: "BAD",
            markPx: "100",
            prevDayPx: "0",
            openInterest: "not-a-number",
          },
        ]),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    const oi = await provider.getOpenInterest();

    expect(oi).toEqual([{ symbol: "BTC", openInterestUsd: 200 }]);
  });

  it("caches on the sorted-symbol key: repeat call does not re-fetch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okJson(
          metaAndCtxs([
            { name: "BTC", markPx: "100", prevDayPx: "0", openInterest: "2" },
          ]),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    await provider.getOpenInterest(["BTC"]);
    await provider.getOpenInterest(["BTC"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("HyperliquidProvider.getFundingHistory", () => {
  it("POSTs fundingHistory per coin, coerces rate to Number, keys by coin", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson([
        { coin: "BTC", fundingRate: "0.0000125", time: 1000 },
        { coin: "BTC", fundingRate: "0.00002", time: 2000 },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    const funding = await provider.getFundingHistory(["BTC"], 500);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(bodyOf(fetchMock)).toEqual({
      type: "fundingHistory",
      coin: "BTC",
      startTime: 500,
    });
    expect(funding).toEqual({
      BTC: [
        { time: 1000, fundingRate: 0.0000125 },
        { time: 2000, fundingRate: 0.00002 },
      ],
    });
  });

  it("fires one request per coin and merges into a keyed object", async () => {
    const fetchMock = vi
      .fn()
      .mockImplementation((_url: string, init: RequestInit) => {
        const body = JSON.parse(String(init.body)) as { coin: string };
        return Promise.resolve(
          okJson([{ coin: body.coin, fundingRate: "0.001", time: 10 }]),
        );
      });
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    const funding = await provider.getFundingHistory(["BTC", "ETH"], 0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(Object.keys(funding).sort()).toEqual(["BTC", "ETH"]);
    expect(funding.BTC).toEqual([{ time: 10, fundingRate: 0.001 }]);
    expect(funding.ETH).toEqual([{ time: 10, fundingRate: 0.001 }]);
  });

  it("filters out points with a non-finite funding rate", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson([
        { coin: "BTC", fundingRate: "0.001", time: 10 },
        { coin: "BTC", fundingRate: "garbage", time: 20 },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    const funding = await provider.getFundingHistory(["BTC"], 0);

    expect(funding.BTC).toEqual([{ time: 10, fundingRate: 0.001 }]);
  });

  it("caches on the sorted-symbols|startTime key: repeat call does not re-fetch", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okJson([{ coin: "BTC", fundingRate: "0.001", time: 10 }]),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    await provider.getFundingHistory(["BTC"], 42);
    await provider.getFundingHistory(["BTC"], 42);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A different startTime is a distinct key → a fresh fetch.
    await provider.getFundingHistory(["BTC"], 99);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("HyperliquidProvider.getCandles", () => {
  it("POSTs candleSnapshot with a nested req and maps OHLCV fields to Numbers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      okJson([
        { t: 1000, o: "10", h: "12", l: "9", c: "11", v: "100" },
        { t: 2000, o: "11", h: "13", l: "10", c: "12", v: "200" },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    const candles = await provider.getCandles("xyz:TSLA", "1h", 500);

    expect(bodyOf(fetchMock)).toEqual({
      type: "candleSnapshot",
      req: { coin: "xyz:TSLA", interval: "1h", startTime: 500 },
    });
    expect(candles).toEqual([
      { time: 1000, open: 10, high: 12, low: 9, close: 11, volume: 100 },
      { time: 2000, open: 11, high: 13, low: 10, close: 12, volume: 200 },
    ]);
  });

  it("passes OHLCV through Number() WITHOUT a finite guard (documents current behavior)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okJson([{ t: 1000, o: "bad", h: "12", l: "9", c: "11", v: "100" }]),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    const candles = await provider.getCandles("BTC", "1h", 0);

    // Unlike getDayStats/getFundingHistory, getCandles does NOT drop non-finite
    // values — a non-numeric field becomes NaN and the row is kept. Pinned so a
    // future finite-filter (intended or not) is a conscious, visible change.
    expect(candles).toHaveLength(1);
    expect(Number.isNaN(candles[0].open)).toBe(true);
    expect(candles[0].high).toBe(12);
  });

  it("returns an empty array for an empty candle response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson([]));
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    const candles = await provider.getCandles("BTC", "1d", 0);
    expect(candles).toEqual([]);
  });

  it("caches on the symbol|interval|startTime key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        okJson([{ t: 1, o: "1", h: "1", l: "1", c: "1", v: "1" }]),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    await provider.getCandles("BTC", "1h", 0);
    await provider.getCandles("BTC", "1h", 0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // A different interval is a distinct key → a fresh fetch.
    await provider.getCandles("BTC", "4h", 0);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("rejects when the info endpoint returns a non-2xx status", async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(503));
    vi.stubGlobal("fetch", fetchMock);
    const provider = await freshProvider();

    await expect(provider.getCandles("BTC", "1h", 0)).rejects.toThrow(/503/);
  });
});
