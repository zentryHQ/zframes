import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BitkubProvider as BitkubProviderType } from "./index";

// The four TtlCaches are module-level singletons, so each test gets a genuinely
// fresh module (empty caches) via vi.resetModules() + a dynamic import — the
// same isolation the GeckoTerminal/CoinGecko provider tests use, so a primed
// value can't leak into a later error-path assertion.
type Ctor = typeof BitkubProviderType;

/** THB per USD used by every stub below, so expected USD values are exact. */
const FX = 33.6;

async function loadProvider(): Promise<Ctor> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.BitkubProvider;
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

/**
 * Route each stubbed request by URL: the provider fetches Bitkub AND the ECB
 * rate (in parallel) for every call, so a single-response mock would feed the
 * FX body to the market request.
 */
function stubFetch(bitkubBody: unknown, status = 200) {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      String(url).includes("frankfurter")
        ? jsonResponse({ rates: { THB: FX } })
        : jsonResponse(bitkubBody, status),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** One row of the legacy THB_* ticker map (Bitkub sends these as JSON numbers). */
function tickerRow(
  last: number,
  quoteVolume: number,
  extra: Record<string, number> = {},
) {
  return {
    last,
    percentChange: -8,
    baseVolume: 1_024_696.75,
    quoteVolume,
    isFrozen: 0,
    ...extra,
  };
}

/** The Bitkub URL from a call list, skipping the parallel FX request. */
function bitkubUrl(fetchMock: ReturnType<typeof stubFetch>, nth = 0): string {
  const calls = fetchMock.mock.calls
    .map((c) => String(c[0]))
    .filter((u) => !u.includes("frankfurter"));
  return calls[nth];
}

describe("BitkubProvider", () => {
  let BitkubProvider: Ctor;

  beforeEach(async () => {
    BitkubProvider = await loadProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fulfils existing capabilities, so existing frames can render it", () => {
    const provider = new BitkubProvider();
    expect(provider.name).toBe("bitkub");
    expect(provider.capabilities).toEqual(["day-stats", "ohlcv", "order-book"]);
  });

  describe("getDayStats", () => {
    it("keys by base ticker and converts baht prices to canonical USD", async () => {
      stubFetch({
        THB_KUB: tickerRow(20.16, 21_000_000),
        THB_BTC: tickerRow(2_160_386.75, 480_000_000),
      });

      const stats = await new BitkubProvider().getDayStats();

      expect(Object.keys(stats).sort()).toEqual(["BTC", "KUB"]);
      const kub = stats.KUB;
      // 20.16 THB ÷ 33.6 = $0.60
      expect(kub.markPx).toBeCloseTo(0.6, 10);
      expect(kub.changePct).toBe(-8);
      // Bitkub reports only the change, so the previous close is recovered:
      // 20.16 / (1 - 0.08) = 21.913 THB → $0.6522
      expect(kub.prevDayPx).toBeCloseTo(20.16 / 0.92 / FX, 10);
      expect(kub.dayNtlVlm).toBeCloseTo(21_000_000 / FX, 6);
    });

    it("filters to the requested symbols, accepting either pair spelling", async () => {
      stubFetch({
        THB_KUB: tickerRow(20.16, 1),
        THB_BTC: tickerRow(2_000_000, 1),
        THB_ETH: tickerRow(60_000, 1),
      });

      const stats = await new BitkubProvider().getDayStats(["KUB", "eth_thb"]);

      expect(Object.keys(stats).sort()).toEqual(["ETH", "KUB"]);
    });

    it("skips frozen pairs and anything not quoted in THB", async () => {
      stubFetch({
        THB_KUB: tickerRow(20.16, 100),
        THB_DEAD: tickerRow(1, 50, { isFrozen: 1 }),
        USDT_ETH: tickerRow(2_500, 999_999),
      });

      const stats = await new BitkubProvider().getDayStats();

      expect(Object.keys(stats)).toEqual(["KUB"]);
    });

    it("reads the legacy ticker map, whose keys are quote-first", async () => {
      const fetchMock = stubFetch({ THB_KUB: tickerRow(20, 1) });

      await new BitkubProvider().getDayStats();

      expect(bitkubUrl(fetchMock)).toBe(
        "https://api.bitkub.com/api/market/ticker",
      );
    });

    it("survives a -100% row without dividing by zero", async () => {
      stubFetch({ THB_KUB: tickerRow(0, 0, { percentChange: -100 }) });

      const stats = await new BitkubProvider().getDayStats();

      expect(stats.KUB.prevDayPx).toBe(0);
      expect(Number.isFinite(stats.KUB.markPx)).toBe(true);
    });

    it("throws a labelled error when the body is not a map", async () => {
      stubFetch(null);

      await expect(new BitkubProvider().getDayStats()).rejects.toThrow(
        "bitkub day stats: unexpected response shape",
      );
    });

    it("throws the transport error on a non-2xx response", async () => {
      stubFetch(null, 429);

      await expect(new BitkubProvider().getDayStats()).rejects.toThrow(
        /failed: 429/,
      );
    });

    it("throws when no USD/THB rate is available, rather than quoting baht as USD", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn((url: string) =>
          Promise.resolve(
            String(url).includes("frankfurter")
              ? jsonResponse({ rates: {} })
              : jsonResponse({ THB_KUB: tickerRow(20.16, 1) }),
          ),
        ),
      );

      await expect(new BitkubProvider().getDayStats()).rejects.toThrow(
        "bitkub fx: no USD/THB rate",
      );
    });
  });

  describe("getOrderBook", () => {
    const book = {
      error: 0,
      result: {
        asks: [
          [20.97, 139.43],
          [20.98, 229.91],
        ],
        bids: [
          [20.66, 1391.36],
          [20.65, 30.99],
        ],
      },
    };

    it("converts prices but not sizes, and cumulates depth per side", async () => {
      stubFetch(book);

      const result = await new BitkubProvider().getOrderBook("KUB");

      expect(result.symbol).toBe("KUB");
      expect(result.pair).toBe("KUB_THB");
      // Price is money → converted. Size is a quantity of KUB → untouched.
      expect(result.asks[0].price).toBeCloseTo(20.97 / FX, 10);
      expect(result.asks[0].size).toBe(139.43);
      expect(result.asks[1].cumulativeSize).toBeCloseTo(369.34, 2);
      expect(result.bids[1].cumulativeSize).toBeCloseTo(1422.35, 2);
      expect(result.mid).toBeCloseTo((20.97 + 20.66) / 2 / FX, 10);
      // A spread is a ratio, so it is FX-invariant.
      expect(result.spreadPct).toBeCloseTo(1.489, 3);
    });

    it("requests the base-first v3 pair spelling, never the v1 one", async () => {
      const fetchMock = stubFetch(book);

      // A v1-style pair, a bare ticker and lowercase all mean the same market.
      // Crossing the spellings matters: /api/market/depth?sym=THB_KUB answers
      // 200 with a DIFFERENT pair's book, so this must always emit KUB_THB.
      await new BitkubProvider().getOrderBook("THB_KUB", 2);
      expect(bitkubUrl(fetchMock, 0)).toBe(
        "https://api.bitkub.com/api/v3/market/depth?sym=KUB_THB&lmt=2",
      );

      await new BitkubProvider().getOrderBook("kub_thb", 3);
      expect(bitkubUrl(fetchMock, 1)).toContain("sym=KUB_THB&lmt=3");
    });

    it("defaults to KUB with 15 levels and clamps an absurd depth", async () => {
      const fetchMock = stubFetch(book);

      await new BitkubProvider().getOrderBook();
      expect(bitkubUrl(fetchMock, 0)).toContain("sym=KUB_THB&lmt=15");

      await new BitkubProvider().getOrderBook("BTC", 5_000);
      expect(bitkubUrl(fetchMock, 1)).toContain("lmt=50");
    });

    it("drops malformed and non-positive levels", async () => {
      stubFetch({
        error: 0,
        result: {
          asks: [[20.97, 139.43], "junk", [0, 5], [21, 0], [21.1, 3]],
          bids: [],
        },
      });

      const result = await new BitkubProvider().getOrderBook("KUB");

      expect(result.asks).toHaveLength(2);
      // One empty side means there is no meaningful mid to quote.
      expect(result.mid).toBe(0);
      expect(result.spreadPct).toBe(0);
    });

    it("throws on a v3 error code delivered with HTTP 200", async () => {
      stubFetch({ error: 11, result: null });

      await expect(new BitkubProvider().getOrderBook("NOPE")).rejects.toThrow(
        "bitkub depth NOPE_THB: 11",
      );
    });
  });

  describe("getCandles", () => {
    const history = {
      s: "ok",
      t: [1_782_003_600, 1_782_018_000],
      o: [24.9, 24.75],
      h: [25.1, 24.8],
      l: [24.6, 24.5],
      c: [24.75, 24.62],
      v: [1000, 2000],
    };

    it("maps UDF columns to USD candles with epoch-ms times", async () => {
      stubFetch(history);

      const candles = await new BitkubProvider().getCandles("KUB", "4h");

      expect(candles).toHaveLength(2);
      expect(candles[0].time).toBe(1_782_003_600_000);
      expect(candles[0].open).toBeCloseTo(24.9 / FX, 10);
      expect(candles[0].close).toBeCloseTo(24.75 / FX, 10);
      // Volume is in the base asset — a quantity, so no conversion.
      expect(candles[0].volume).toBe(1000);
    });

    it("translates generic interval ids into Bitkub resolution codes", async () => {
      const fetchMock = stubFetch(history);
      const provider = new BitkubProvider();

      await provider.getCandles("KUB", "4h");
      expect(bitkubUrl(fetchMock, 0)).toContain("resolution=240");

      await provider.getCandles("KUB", "1d");
      expect(bitkubUrl(fetchMock, 1)).toContain("resolution=1D");

      // An interval Bitkub doesn't offer falls back to the 1h default rather
      // than sending a code the endpoint would reject.
      await provider.getCandles("KUB", "3w");
      expect(bitkubUrl(fetchMock, 2)).toContain("resolution=60");
    });

    it("anchors the window to now so the series can never freeze", async () => {
      const fetchMock = stubFetch(history);
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-24T00:00:00Z"));

      try {
        await new BitkubProvider().getCandles("KUB", "4h");
      } finally {
        vi.useRealTimers();
      }

      const url = new URL(bitkubUrl(fetchMock));
      const to = Number(url.searchParams.get("to"));
      const from = Number(url.searchParams.get("from"));
      expect(to).toBe(Math.floor(Date.parse("2026-07-24T00:00:00Z") / 1000));
      // 300 bars × 4h — a window that walks forward with wall-clock time.
      expect(to - from).toBe(300 * 14_400);
      expect(url.searchParams.get("symbol")).toBe("KUB_THB");
    });

    it("caps a caller's startTimeMs to the bar budget", async () => {
      const fetchMock = stubFetch(history);
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-24T00:00:00Z"));

      try {
        // Ask for ten years of 1m candles; the window is clamped to 300 bars.
        await new BitkubProvider().getCandles(
          "KUB",
          "1m",
          Date.parse("2016-01-01T00:00:00Z"),
        );
      } finally {
        vi.useRealTimers();
      }

      const url = new URL(bitkubUrl(fetchMock));
      const span =
        Number(url.searchParams.get("to")) -
        Number(url.searchParams.get("from"));
      expect(span).toBe(300 * 60);
    });

    it("treats no_data as an empty series, not a failure", async () => {
      stubFetch({ s: "no_data" });

      await expect(new BitkubProvider().getCandles("KUB")).resolves.toEqual([]);
    });

    it("throws a labelled error on an unexpected status", async () => {
      stubFetch({ s: "error" });

      await expect(new BitkubProvider().getCandles("KUB")).rejects.toThrow(
        "bitkub candles KUB_THB: error",
      );
    });

    it("caches per symbol+resolution and reuses in-flight requests", async () => {
      const fetchMock = stubFetch(history);
      const provider = new BitkubProvider();
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-24T00:00:00Z"));

      try {
        const [a, b] = await Promise.all([
          provider.getCandles("KUB", "4h"),
          provider.getCandles("KUB", "4h"),
        ]);
        expect(a).toEqual(b);
        const bitkubCalls = fetchMock.mock.calls.filter(
          (c) => !String(c[0]).includes("frankfurter"),
        );
        expect(bitkubCalls).toHaveLength(1);

        await provider.getCandles("KUB", "1d");
        expect(
          fetchMock.mock.calls.filter(
            (c) => !String(c[0]).includes("frankfurter"),
          ),
        ).toHaveLength(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("fetches the FX rate once and reuses it across calls", async () => {
      const fetchMock = stubFetch(history);
      const provider = new BitkubProvider();

      await provider.getCandles("KUB", "4h");
      await provider.getOrderBook("KUB");

      const fxCalls = fetchMock.mock.calls.filter((c) =>
        String(c[0]).includes("frankfurter"),
      );
      expect(fxCalls).toHaveLength(1);
    });
  });
});
