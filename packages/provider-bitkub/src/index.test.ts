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
 * Every host the FX fallback chain can reach. A URL matching none of these is a
 * Bitkub market call — that's how the helpers below tell the two apart, so
 * adding a source to the chain without adding it here shows up as a test
 * failure rather than as an FX body silently fed to a market parser.
 */
const FX_HOSTS = [
  "frankfurter",
  "fxratesapi",
  "currency-api",
  "data-api.ecb.europa.eu",
];

function isFxUrl(url: unknown): boolean {
  return FX_HOSTS.some((host) => String(url).includes(host));
}

/**
 * Route each stubbed request by URL: the provider fetches Bitkub AND the USD/THB
 * rate (in parallel) for every call, so a single-response mock would feed the FX
 * body to the market request. Frankfurter (the chain's primary) answers here, so
 * the fallbacks stay untouched unless a test deliberately breaks it.
 */
function stubFetch(bitkubBody: unknown, status = 200) {
  const fetchMock = vi.fn((url: string) =>
    Promise.resolve(
      isFxUrl(url)
        ? jsonResponse({ rates: { THB: FX } })
        : jsonResponse(bitkubBody, status),
    ),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/**
 * Real captured bodies (2026-08-03), trimmed only of irrelevant keys, so the
 * parsers are tested against the shapes the wire actually produces — including
 * currency-api's lower-case keys and SDMX's index-keyed observation tuples.
 */
const FX_BODIES = {
  frankfurter: { amount: 1.0, base: "USD", date: "2026-07-31", rates: {} },
  fxratesapi: {
    success: true,
    timestamp: 1_785_740_400,
    date: "2026-08-03T07:00:00.000Z",
    base: "USD",
    rates: { THB: 33.3330042997 },
  },
  currencyApi: {
    date: "2026-08-03",
    usd: { aed: 3.6725, eur: 0.8709, thb: 33.3446932 },
  },
  /** THB per EUR; observation "1" is the newest of the two requested. */
  ecbThb: {
    dataSets: [
      {
        series: {
          "0:0:0:0:0": {
            observations: {
              "0": [38.496, 0, 0, null, null],
              "1": [38.435, 0, 0, null, null],
            },
          },
        },
      },
    ],
  },
  /** USD per EUR — the other half of the cross. 38.435 / 1.1485 = 33.464… */
  ecbUsd: {
    dataSets: [
      {
        series: {
          "0:0:0:0:0": {
            observations: {
              "0": [1.1476, 0, 0, null, null],
              "1": [1.1485, 0, 0, null, null],
            },
          },
        },
      },
    ],
  },
} as const;

const ECB_CROSS = 38.435 / 1.1485;

/**
 * Stub the FX chain host-by-host. `overrides` maps a host fragment to either a
 * body (served 200) or `{ body, status }`; an unlisted host resolves to its real
 * captured body. Bitkub market calls always answer `bitkubBody`.
 */
function stubFx(
  overrides: Record<string, unknown>,
  bitkubBody: unknown = { THB_KUB: tickerRow(20.16, 1) },
) {
  const defaults: Record<string, unknown> = {
    frankfurter: FX_BODIES.frankfurter,
    fxratesapi: FX_BODIES.fxratesapi,
    "currency-api": FX_BODIES.currencyApi,
    "D.THB.EUR": FX_BODIES.ecbThb,
    "D.USD.EUR": FX_BODIES.ecbUsd,
  };
  const table = { ...defaults, ...overrides };
  const fetchMock = vi.fn((url: string) => {
    const text = String(url);
    const hit = Object.keys(table).find((fragment) => text.includes(fragment));
    if (!hit) return Promise.resolve(jsonResponse(bitkubBody));
    const entry = table[hit] as { body?: unknown; status?: number } | unknown;
    const isEnvelope =
      !!entry &&
      typeof entry === "object" &&
      "status" in (entry as Record<string, unknown>);
    return isEnvelope
      ? Promise.resolve(
          jsonResponse(
            (entry as { body?: unknown }).body ?? null,
            (entry as { status: number }).status,
          ),
        )
      : Promise.resolve(jsonResponse(entry));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** URLs the FX chain actually hit, in order — the assertion for chain ordering. */
function fxUrls(fetchMock: { mock: { calls: unknown[][] } }): string[] {
  return fetchMock.mock.calls.map((c) => String(c[0])).filter(isFxUrl);
}

/**
 * The rate a stubbed chain resolved to, read back out of a converted price.
 * `markPx` is `last / rate`, so `last / markPx` recovers the rate exactly —
 * which is the only observable the provider exposes, and the thing that actually
 * matters (a wrong rate is a wrong board).
 */
async function resolvedRate(provider: {
  getDayStats(): Promise<Record<string, { markPx: number }>>;
}): Promise<number> {
  const stats = await provider.getDayStats();
  return 20.16 / stats.KUB.markPx;
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
    .filter((u) => !isFxUrl(u));
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
      // Every source answers 200 with a body carrying no rate — the shape of a
      // silent upstream regression, which must never be read as 1:1.
      stubFx({
        fxratesapi: { rates: {} },
        "currency-api": { usd: {} },
        "D.THB.EUR": { dataSets: [] },
        "D.USD.EUR": { dataSets: [] },
      });

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
        const bitkubCalls = fetchMock.mock.calls.filter((c) => !isFxUrl(c[0]));
        expect(bitkubCalls).toHaveLength(1);

        await provider.getCandles("KUB", "1d");
        expect(fetchMock.mock.calls.filter((c) => !isFxUrl(c[0]))).toHaveLength(
          2,
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it("fetches the FX rate once and reuses it across calls", async () => {
      const fetchMock = stubFetch(history);
      const provider = new BitkubProvider();

      await provider.getCandles("KUB", "4h");
      await provider.getOrderBook("KUB");

      expect(fxUrls(fetchMock)).toHaveLength(1);
    });
  });

  /**
   * The USD/THB rate divides every price this provider emits, so it used to be a
   * single point of failure for the whole venue: one Frankfurter outage threw and
   * killed every Bitkub card. These cover the ordered fallback chain that replaced
   * that — each source's parser against its real captured shape, the ordering,
   * and the two ways a chain can be worse than useless (a plausible-looking wrong
   * number, and giving up while a usable stale rate is in hand).
   */
  describe("USD/THB fallback chain", () => {
    it("prefers Frankfurter and asks nothing else when it answers", async () => {
      const fetchMock = stubFx({
        frankfurter: { ...FX_BODIES.frankfurter, rates: { THB: 33.465 } },
      });

      expect(await resolvedRate(new BitkubProvider())).toBeCloseTo(33.465, 10);
      // Zero regression on the healthy path: exactly one FX call, to the primary.
      expect(fxUrls(fetchMock)).toEqual([
        "https://api.frankfurter.dev/v1/latest?base=USD&symbols=THB",
      ]);
    });

    it("falls through to FXRatesAPI when the primary is down", async () => {
      const fetchMock = stubFx({ frankfurter: { status: 503 } });

      expect(await resolvedRate(new BitkubProvider())).toBeCloseTo(
        33.3330042997,
        10,
      );
      const urls = fxUrls(fetchMock);
      expect(urls).toHaveLength(2);
      expect(urls[1]).toContain("api.fxratesapi.com");
    });

    it("falls through a 429 without retrying it", async () => {
      // FXRatesAPI is rate-limited (~61/window); a 429 must cost exactly one
      // request and hand over, never spin.
      const fetchMock = stubFx({
        frankfurter: { status: 503 },
        fxratesapi: { status: 429 },
      });

      expect(await resolvedRate(new BitkubProvider())).toBeCloseTo(
        33.3446932,
        10,
      );
      const urls = fxUrls(fetchMock);
      expect(urls.filter((u) => u.includes("fxratesapi"))).toHaveLength(1);
      expect(urls[2]).toContain("currency-api.pages.dev");
    });

    it("reads currency-api's lower-case, base-keyed shape", async () => {
      stubFx({
        frankfurter: { status: 500 },
        fxratesapi: { status: 500 },
      });

      // {usd:{thb:...}} — not {rates:{THB:...}}; reading it with the upper-case
      // key would yield 0 and fall through to the ECB cross instead.
      expect(await resolvedRate(new BitkubProvider())).toBeCloseTo(
        33.3446932,
        10,
      );
    });

    it("crosses the ECB's two EUR-based series as a last resort", async () => {
      const fetchMock = stubFx({
        frankfurter: { status: 500 },
        fxratesapi: { status: 500 },
        "currency-api": { status: 500 },
      });

      // THB/EUR ÷ USD/EUR = 38.435 / 1.1485 ≈ 33.46 — and it must read the
      // NEWEST observation ("1"), not whichever key enumerates first.
      expect(await resolvedRate(new BitkubProvider())).toBeCloseTo(
        ECB_CROSS,
        10,
      );
      const urls = fxUrls(fetchMock);
      expect(urls.filter((u) => u.includes("D.THB.EUR"))).toHaveLength(1);
      expect(urls.filter((u) => u.includes("D.USD.EUR"))).toHaveLength(1);
    });

    it("keeps the ECB cross last, given it costs two calls", async () => {
      const fetchMock = stubFx({
        frankfurter: { status: 500 },
        fxratesapi: { status: 500 },
        "currency-api": { status: 500 },
      });

      await new BitkubProvider().getDayStats();

      expect(
        fxUrls(fetchMock).map((u) =>
          u.includes("frankfurter")
            ? "frankfurter"
            : u.includes("fxratesapi")
              ? "fxratesapi"
              : u.includes("currency-api")
                ? "currency-api"
                : "ecb",
        ),
      ).toEqual(["frankfurter", "fxratesapi", "currency-api", "ecb", "ecb"]);
    });

    it("skips the ECB cross when its USD leg is missing, rather than dividing by zero", async () => {
      stubFx({
        frankfurter: { status: 500 },
        fxratesapi: { status: 500 },
        "currency-api": { status: 500 },
        "D.USD.EUR": { dataSets: [] },
      });

      await expect(new BitkubProvider().getDayStats()).rejects.toThrow(
        "bitkub fx: no USD/THB rate",
      );
    });

    it.each([
      ["inverted (USD per THB)", 1 / 33.4],
      ["a EUR/USD-shaped cross that skipped the baht leg", 1.1485],
      ["a decimal slip down", 3.34],
      ["a decimal slip up", 3340],
      ["zero", 0],
      ["negative", -33.4],
      ["not a number", Number.NaN],
    ])("rejects an implausible primary rate: %s", async (_label, rate) => {
      const fetchMock = stubFx({
        frankfurter: { ...FX_BODIES.frankfurter, rates: { THB: rate } },
      });

      // A wrong-but-finite rate misprices the entire board silently, so it is
      // treated exactly like an outage: fall through to the next source.
      expect(await resolvedRate(new BitkubProvider())).toBeCloseTo(
        33.3330042997,
        10,
      );
      expect(fxUrls(fetchMock).length).toBeGreaterThan(1);
    });

    it.each([
      ["the low edge of the band", 10],
      ["a 1997-crisis-era baht", 56],
      ["the high edge of the band", 100],
    ])("accepts a rate inside the band: %s", async (_label, rate) => {
      const fetchMock = stubFx({
        frankfurter: { ...FX_BODIES.frankfurter, rates: { THB: rate } },
      });

      expect(await resolvedRate(new BitkubProvider())).toBeCloseTo(rate, 10);
      expect(fxUrls(fetchMock)).toHaveLength(1);
    });

    it("names every failed source in the all-sources-down error", async () => {
      stubFx({
        frankfurter: { status: 500 },
        fxratesapi: { status: 429 },
        "currency-api": { usd: {} },
        "D.THB.EUR": { dataSets: [] },
      });

      // The message is the only breadcrumb for a source that has quietly
      // changed shape or moved, so each one has to be identifiable.
      const error = await new BitkubProvider()
        .getDayStats()
        .catch((e: unknown) => e as Error);
      expect(error.message).toContain("frankfurter");
      expect(error.message).toContain("fxratesapi");
      expect(error.message).toContain("currency-api");
      expect(error.message).toContain("ecb-cross");
    });

    it("serves a stale rate rather than dying when the whole chain goes down", async () => {
      const provider = new BitkubProvider();
      stubFx({});
      // Prime the cache from a healthy chain. It resolves at FXRatesAPI, since
      // the captured Frankfurter body carries an empty `rates` — which also
      // shows the primed value came from a fallback, not the primary.
      expect(await resolvedRate(provider)).toBeCloseTo(33.3330042997, 10);

      // Now every source dies. The card must keep quoting the last good rate —
      // a slightly stale rate beats an error card, matching the core currency
      // layer's own degradation.
      vi.useFakeTimers();
      try {
        vi.setSystemTime(Date.now() + 3 * 60 * 60_000);
        stubFx({
          frankfurter: { status: 500 },
          fxratesapi: { status: 500 },
          "currency-api": { status: 500 },
          "D.THB.EUR": { status: 500 },
          "D.USD.EUR": { status: 500 },
        });
        expect(await resolvedRate(provider)).toBeCloseTo(33.3330042997, 10);
      } finally {
        vi.useRealTimers();
      }
    });

    it("still converts prices but never sizes, whichever source supplied the rate", async () => {
      stubFx(
        { frankfurter: { status: 500 }, fxratesapi: { status: 500 } },
        {
          error: 0,
          result: { asks: [[20.97, 139.43]], bids: [[20.66, 1391.36]] },
        },
      );

      const book = await new BitkubProvider().getOrderBook("KUB");

      expect(book.asks[0].price).toBeCloseTo(20.97 / 33.3446932, 10);
      // A size is a quantity of KUB — no exchange rate touches it, no matter
      // which upstream the rate came from.
      expect(book.asks[0].size).toBe(139.43);
      expect(book.bids[0].size).toBe(1391.36);
      // And the v3 pair spelling is unaffected by the FX path.
      expect(book.pair).toBe("KUB_THB");
    });
  });
});
