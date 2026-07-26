import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoinMetricsProvider as CoinMetricsProviderType } from "./index";

/**
 * What this file pins: the whole of Coin Metrics' *derived* valuation maths.
 *
 * The community tier grants exactly four metrics (price, market cap, supply,
 * MVRV) — realized cap is premium — so realized cap/price, NUPL and the MVRV
 * Z-score are computed 100% in this provider with no upstream number to
 * cross-check against. Those figures are the headline of several cycle frames
 * ("are we at a top?"), which makes a silent arithmetic drift the worst kind of
 * bug: confidently wrong, never an error card. So this suite hand-computes a
 * tiny fixture and pins every derivation against it:
 *  - realizedCap = marketCap / mvrv, realizedPrice = realizedCap / supply,
 *    nupl = 1 − 1/mvrv
 *  - mvrvZScore = (marketCap − realizedCap) / σ where σ is the **population**
 *    standard deviation (÷n) of the FULL market-cap history, computed once and
 *    shared by the headline and every history point. The fixture is chosen so
 *    the sample σ (÷n−1) gives a visibly different answer — an n/n−1 mix-up
 *    fails here rather than shipping a plausible-looking Z-score.
 *  - σ = 0 (constant or single-row history) must degrade to a Z of 0, never
 *    NaN/Infinity.
 * It also pins the row guards that keep the divisions safe (mvrv > 0,
 * supply > 0, finite metrics, parseable time), the defensive ascending sort,
 * the five equal-length history series, and the single asset-keyed cache both
 * capabilities share (a valuation frame + a cycle-multiple frame on one board
 * must cost ONE request).
 *
 * The cache here is an *instance* field, not a module-level singleton, so a
 * fresh provider means a fresh cache. We still take a fresh module per test
 * (house pattern) so nothing can leak between tests, and construct one provider
 * per test unless a test is specifically about cache sharing.
 */
type Ctor = typeof CoinMetricsProviderType;

async function loadProvider(): Promise<Ctor> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.CoinMetricsProvider;
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

interface Metrics {
  price: number;
  marketCap: number;
  supply: number;
  mvrv: number;
}

/** One /timeseries/asset-metrics row as the API returns it — metrics as strings. */
function cmRow(time: string, m: Metrics) {
  return {
    asset: "btc",
    time,
    PriceUSD: String(m.price),
    CapMrktCurUSD: String(m.marketCap),
    SplyCur: String(m.supply),
    CapMVRVCur: String(m.mvrv),
  };
}

function metricsBody(rows: unknown[]) {
  return { data: rows, next_page_url: null };
}

const D1 = "2024-01-01T00:00:00.000Z";
const D2 = "2024-01-02T00:00:00.000Z";
const D3 = "2024-01-03T00:00:00.000Z";
const T1 = Date.parse(D1);
const T2 = Date.parse(D2);
const T3 = Date.parse(D3);

/**
 * Hand-computed three-day fixture. Market caps [1000, 2000, 3000] → mean 2000,
 * so population σ = √(((−1000)² + 0² + 1000²)/3) = √(2e6/3) ≈ 816.4966, while
 * the sample σ would be √(2e6/2) = 1000 exactly — far enough apart that an
 * n-vs-(n−1) slip can't hide inside a rounding tolerance.
 *
 * Per row: realizedCap = marketCap/mvrv, realizedPrice = realizedCap/supply,
 * nupl = 1 − 1/mvrv.
 *   D1: cap 1000, mvrv 2 → realizedCap 500, realizedPrice 50, nupl 0.5
 *   D2: cap 2000, mvrv 4 → realizedCap 500, realizedPrice 50, nupl 0.75
 *   D3: cap 3000, mvrv 5 → realizedCap 600, realizedPrice 60, nupl 0.8
 */
const THREE_DAY = [
  cmRow(D1, { price: 100, marketCap: 1000, supply: 10, mvrv: 2 }),
  cmRow(D2, { price: 200, marketCap: 2000, supply: 10, mvrv: 4 }),
  cmRow(D3, { price: 300, marketCap: 3000, supply: 10, mvrv: 5 }),
];

/** Population σ of [1000, 2000, 3000] — what the provider must divide by. */
const POP_SIGMA = Math.sqrt(2_000_000 / 3); // ≈ 816.496580927726
/** Sample σ of the same three caps — what an (n−1) bug would divide by. */
const SAMPLE_SIGMA = 1000;

const EXPECTED_URL =
  "https://community-api.coinmetrics.io/v4/timeseries/asset-metrics" +
  "?assets=btc&metrics=PriceUSD,CapMrktCurUSD,SplyCur,CapMVRVCur" +
  "&frequency=1d&page_size=10000&start_time=2010-01-01";

describe("CoinMetricsProvider", () => {
  let CoinMetricsProvider: Ctor;

  beforeEach(async () => {
    CoinMetricsProvider = await loadProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("advertises its identity and capabilities", () => {
    const provider = new CoinMetricsProvider();
    expect(provider.name).toBe("Coin Metrics");
    expect(provider.capabilities).toEqual([
      "onchain-valuation",
      "price-history-daily",
    ]);
  });

  it("requests the four community metrics as one full-history daily page", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(metricsBody(THREE_DAY)));
    vi.stubGlobal("fetch", fetchMock);

    await new CoinMetricsProvider().getOnchainValuation();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Exactly the four metrics the keyless community tier grants — realized cap
    // (CapRealUSD) is premium and must stay absent, since it is derived instead.
    expect(fetchMock.mock.calls[0][0]).toBe(EXPECTED_URL);
    expect(fetchMock.mock.calls[0][0]).not.toContain("CapRealUSD");
  });

  describe("getOnchainValuation", () => {
    /** Resolve a valuation over `rows` with a fetch stub, returning both. */
    async function valuationOf(rows: unknown[]) {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(metricsBody(rows)));
      vi.stubGlobal("fetch", fetchMock);
      const valuation = await new CoinMetricsProvider().getOnchainValuation();
      return { valuation, fetchMock };
    }

    it("takes the headline from the last row and derives realized cap/price and NUPL", async () => {
      const { valuation } = await valuationOf(THREE_DAY);

      // Headline reads the LAST (newest) row: 2024-01-03, cap 3000, mvrv 5.
      expect(valuation.date).toBe("2024-01-03");
      expect(valuation.price).toBe(300);
      expect(valuation.supply).toBe(10);
      expect(valuation.marketCap).toBe(3000);
      expect(valuation.mvrv).toBe(5);
      expect(valuation.realizedCap).toBe(600); // 3000 / 5
      expect(valuation.realizedPrice).toBe(60); // 600 / 10
      expect(valuation.nupl).toBeCloseTo(0.8, 12); // 1 − 1/5
    });

    it("divides the Z-score by the POPULATION σ (÷n), not the sample σ (÷n−1)", async () => {
      const { valuation } = await valuationOf(THREE_DAY);

      // (3000 − 600) / √(2e6/3) = 2400 / 816.4966 ≈ 2.9393877
      expect(valuation.mvrvZScore).toBeCloseTo(2400 / POP_SIGMA, 10);
      expect(valuation.mvrvZScore).toBeCloseTo(2.9393876913, 9);
      // A sample-σ implementation would answer 2400 / 1000 = 2.4 — reject it.
      expect(valuation.mvrvZScore).not.toBeCloseTo(2400 / SAMPLE_SIGMA, 2);
    });

    it("computes σ once over the full history — headline and every point share it", async () => {
      const { valuation } = await valuationOf(THREE_DAY);
      const z = valuation.history.mvrvZScore;

      // Same basis for the last history point as for the headline: identical bits.
      expect(z[z.length - 1].value).toBe(valuation.mvrvZScore);
      // …and the earlier points use that same full-history σ, not a running one.
      expect(z[0].value).toBeCloseTo(500 / POP_SIGMA, 10); // (1000 − 500)/σ
      expect(z[1].value).toBeCloseTo(1500 / POP_SIGMA, 10); // (2000 − 500)/σ
      expect(z.map((p) => p.time)).toEqual([T1, T2, T3]);
    });

    it("returns a Z-score of 0 (never NaN/Infinity) when σ is 0", async () => {
      // Constant market cap → population σ = 0, so the guard must kick in for
      // every history point AND the headline.
      const { valuation } = await valuationOf([
        cmRow(D1, { price: 100, marketCap: 1000, supply: 10, mvrv: 2 }),
        cmRow(D2, { price: 110, marketCap: 1000, supply: 10, mvrv: 4 }),
        cmRow(D3, { price: 120, marketCap: 1000, supply: 10, mvrv: 8 }),
      ]);

      expect(valuation.mvrvZScore).toBe(0);
      expect(valuation.history.mvrvZScore.map((p) => p.value)).toEqual([
        0, 0, 0,
      ]);
      // The rest of the derivation still works off the varying MVRV.
      expect(valuation.realizedCap).toBe(125); // 1000 / 8
      expect(valuation.nupl).toBeCloseTo(0.875, 12); // 1 − 1/8
    });

    it("returns a Z-score of 0 for a single-row history (σ = 0 at n = 1)", async () => {
      const { valuation } = await valuationOf([
        cmRow(D1, { price: 100, marketCap: 1000, supply: 10, mvrv: 2 }),
      ]);

      expect(valuation.mvrvZScore).toBe(0);
      expect(valuation.history.mvrvZScore).toEqual([{ time: T1, value: 0 }]);
      expect(valuation.date).toBe("2024-01-01");
      expect(valuation.realizedPrice).toBe(50);
    });

    it("emits five history series of equal length over the same time sequence", async () => {
      const { valuation } = await valuationOf(THREE_DAY);
      const h = valuation.history;
      const series = [
        h.price,
        h.mvrv,
        h.mvrvZScore,
        h.nupl,
        h.realizedPrice,
      ] as const;

      for (const s of series) {
        expect(s).toHaveLength(3); // one point per surviving row
        expect(s.map((p) => p.time)).toEqual([T1, T2, T3]);
      }
    });

    it("derives each history series pointwise from the row it came from", async () => {
      const { valuation } = await valuationOf(THREE_DAY);
      const h = valuation.history;

      expect(h.price).toEqual([
        { time: T1, value: 100 },
        { time: T2, value: 200 },
        { time: T3, value: 300 },
      ]);
      expect(h.mvrv).toEqual([
        { time: T1, value: 2 },
        { time: T2, value: 4 },
        { time: T3, value: 5 },
      ]);
      // realizedPrice = (marketCap / mvrv) / supply
      expect(h.realizedPrice).toEqual([
        { time: T1, value: 50 },
        { time: T2, value: 50 },
        { time: T3, value: 60 },
      ]);
      // nupl = 1 − 1/mvrv
      expect(h.nupl.map((p) => p.value)).toEqual([0.5, 0.75, 1 - 1 / 5]);
      expect(h.nupl[2].value).toBeCloseTo(0.8, 12);
    });

    it("drops rows with a non-finite metric or an unparseable time", async () => {
      const { valuation } = await valuationOf([
        cmRow(D1, { price: 100, marketCap: 1000, supply: 10, mvrv: 2 }),
        // price missing entirely → Number(undefined) = NaN
        {
          asset: "btc",
          time: D2,
          CapMrktCurUSD: "2000",
          SplyCur: "10",
          CapMVRVCur: "4",
        },
        // non-numeric market cap
        {
          ...cmRow(D2, { price: 200, marketCap: 0, supply: 10, mvrv: 4 }),
          CapMrktCurUSD: "n/a",
        },
        // Infinity supply
        {
          ...cmRow(D2, { price: 200, marketCap: 2000, supply: 1, mvrv: 4 }),
          SplyCur: "Infinity",
        },
        // non-numeric MVRV
        {
          ...cmRow(D2, { price: 200, marketCap: 2000, supply: 10, mvrv: 4 }),
          CapMVRVCur: "n/a",
        },
        // unparseable timestamp → Date.parse → NaN
        cmRow("not-a-date", {
          price: 200,
          marketCap: 2000,
          supply: 10,
          mvrv: 4,
        }),
        cmRow(D3, { price: 300, marketCap: 3000, supply: 10, mvrv: 5 }),
      ]);

      // Only the two clean rows survive, so σ is computed over [1000, 3000]:
      // mean 2000, population σ = 1000.
      expect(valuation.history.price).toEqual([
        { time: T1, value: 100 },
        { time: T3, value: 300 },
      ]);
      expect(valuation.mvrvZScore).toBeCloseTo((3000 - 600) / 1000, 12);
      expect(valuation.date).toBe("2024-01-03");
    });

    it("drops rows whose mvrv or supply is <= 0 (the divide-by-zero sources)", async () => {
      const { valuation } = await valuationOf([
        cmRow(D1, { price: 100, marketCap: 1000, supply: 10, mvrv: 2 }),
        // mvrv 0 → realizedCap would be Infinity
        cmRow(D2, { price: 200, marketCap: 2000, supply: 10, mvrv: 0 }),
        // negative mvrv → nupl / Z-score would flip sign nonsensically
        cmRow(D2, { price: 200, marketCap: 2000, supply: 10, mvrv: -3 }),
        // supply 0 → realizedPrice would be Infinity
        cmRow(D2, { price: 200, marketCap: 2000, supply: 0, mvrv: 4 }),
        cmRow(D3, { price: 300, marketCap: 3000, supply: 10, mvrv: 5 }),
      ]);

      expect(valuation.history.mvrv).toEqual([
        { time: T1, value: 2 },
        { time: T3, value: 5 },
      ]);
      // Every derived number stays finite because the unsafe rows never enter.
      for (const p of valuation.history.realizedPrice)
        expect(Number.isFinite(p.value)).toBe(true);
      for (const p of valuation.history.nupl)
        expect(Number.isFinite(p.value)).toBe(true);
      expect(valuation.realizedPrice).toBe(60);
    });

    it("sorts a descending payload ascending before deriving anything", async () => {
      const { valuation } = await valuationOf([
        THREE_DAY[2],
        THREE_DAY[0],
        THREE_DAY[1],
      ]);

      expect(valuation.history.price).toEqual([
        { time: T1, value: 100 },
        { time: T2, value: 200 },
        { time: T3, value: 300 },
      ]);
      // Headline follows the sorted tail, not the payload's first element.
      expect(valuation.date).toBe("2024-01-03");
      expect(valuation.marketCap).toBe(3000);
      expect(valuation.mvrvZScore).toBeCloseTo(2400 / POP_SIGMA, 10);
    });

    it("throws when no row survives parsing", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonResponse(
          metricsBody([
            cmRow(D1, { price: 100, marketCap: 1000, supply: 10, mvrv: 0 }),
            cmRow("nope", {
              price: 200,
              marketCap: 2000,
              supply: 10,
              mvrv: 4,
            }),
          ]),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      await expect(
        new CoinMetricsProvider().getOnchainValuation(),
      ).rejects.toThrow(/no usable rows in response/);
    });

    it("throws when the response carries no data array at all", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({})));

      await expect(
        new CoinMetricsProvider().getOnchainValuation(),
      ).rejects.toThrow(/no usable rows in response/);
    });

    it("propagates the transport error on a non-2xx response", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse(null, 429)),
      );

      await expect(
        new CoinMetricsProvider().getOnchainValuation(),
      ).rejects.toThrow(/failed: 429/);
    });
  });

  describe("getDailyCloseHistory", () => {
    it("maps surviving rows to ascending close points", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            jsonResponse(
              metricsBody([
                THREE_DAY[2],
                cmRow(D2, { price: 200, marketCap: 2000, supply: 10, mvrv: 0 }),
                THREE_DAY[0],
              ]),
            ),
          ),
      );

      const history = await new CoinMetricsProvider().getDailyCloseHistory();
      expect(history).toEqual([
        { time: T1, value: 100 },
        { time: T3, value: 300 },
      ]);
    });

    it("shares one asset-keyed cache with getOnchainValuation", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(metricsBody(THREE_DAY)));
      vi.stubGlobal("fetch", fetchMock);

      const provider = new CoinMetricsProvider();
      const valuation = await provider.getOnchainValuation(); // key "btc"
      const history = await provider.getDailyCloseHistory("btc"); // same key

      // A valuation frame + a cycle-multiple frame on one board = ONE request.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(history).toEqual(valuation.history.price);
    });

    it("lower-cases the asset, so BTC hits the valuation's cache entry", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(metricsBody(THREE_DAY)));
      vi.stubGlobal("fetch", fetchMock);

      const provider = new CoinMetricsProvider();
      await provider.getOnchainValuation(); // hardcodes "btc"
      await provider.getDailyCloseHistory("BTC"); // → "btc"

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("keys a different asset separately and requests it lower-cased", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(metricsBody(THREE_DAY)));
      vi.stubGlobal("fetch", fetchMock);

      const provider = new CoinMetricsProvider();
      await provider.getOnchainValuation();
      await provider.getDailyCloseHistory("ETH");

      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toContain("assets=btc");
      expect(fetchMock.mock.calls[1][0]).toContain("assets=eth");
      expect(fetchMock.mock.calls[1][0]).not.toContain("assets=ETH");
    });
  });
});
