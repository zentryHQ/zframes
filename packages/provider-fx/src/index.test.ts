import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Contract pinned here: the keyless Frankfurter/ECB FX provider — the one feed
 * behind BOTH the whole display-currency layer (`DashboardCurrencyProvider`
 * polls `getFxRates` once per board and every `useMoney()` card converts off its
 * rate) and the synthetic dollar-index frame.
 *
 * Two clusters earn a suite of their own:
 *
 *  1. **Request shaping + cache keying.** `getFxRates` upper-cases, dedups and
 *     drops the base from the requested symbols, keys its shared `TtlCache` on
 *     `BASE:sorted-symbols`, and returns rows in the CALLER's order. A
 *     regression in any of those mis-labels (and therefore mis-converts) cards
 *     on every non-USD board, or spends one rate-limited request per frame
 *     instead of one per board.
 *
 *  2. **The collapsed DXY exponents.** Frankfurter quotes "currency per USD", so
 *     each ICE pair's signed exponent collapses to a POSITIVE power of the
 *     per-USD rate (EURUSD^-0.576 = EURperUSD^0.576). Invert one while
 *     "fixing" it and the index still renders as a plausible ~100 — so the value
 *     is recomputed here longhand from literal constants (never imported from
 *     the source) and each constituent's weight/sign is probed one at a time.
 *
 * The module's two `TtlCache`s are module-level singletons with stale-on-error
 * on, so a good value primed by an earlier test would mask every error path:
 * each test takes a genuinely FRESH module (`vi.resetModules()` + a dynamic
 * import) and therefore its own empty caches. The network is always stubbed —
 * this suite is hermetic.
 */

type Provider = InstanceType<Awaited<typeof import("./index")>["FxProvider"]>;

async function freshProvider(): Promise<Provider> {
  vi.resetModules();
  const { FxProvider } = await import("./index");
  return new FxProvider();
}

/** A minimal Response-like the stubbed global fetch resolves to. */
function jsonRes(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** A non-2xx Response — fetchJson throws on it (`res.ok` is false). */
function errorRes(status: number): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
    text: async () => "",
  } as unknown as Response;
}

/** The URL the stubbed fetch was called with on the Nth call. */
function fetchTarget(mock: ReturnType<typeof vi.fn>, n = 0): string {
  return mock.mock.calls[n][0] as string;
}

/**
 * A Frankfurter `/{start}..` timeseries body. Day values are deliberately typed
 * `unknown` so a test can plant a string / null / NaN where a rate belongs.
 */
function timeseries(
  rates: Record<string, Record<string, unknown> | null>,
  base = "USD",
) {
  const days = Object.keys(rates);
  return {
    base,
    start_date: days[0] ?? "",
    end_date: days[days.length - 1] ?? "",
    rates,
  };
}

// ── DXY reference model ─────────────────────────────────────────────────────
// The ICE constant + weights, and the geometric mean, are RESTATED here on
// purpose: the point is an independent expectation, not a mirror of whatever the
// source currently exports.
const WEIGHTS = {
  EUR: 0.576,
  JPY: 0.136,
  GBP: 0.119,
  CAD: 0.091,
  SEK: 0.042,
  CHF: 0.036,
} as const;

/** Plausible "currency per 1 USD" quotes — the shape Frankfurter serves. */
const PER_USD: Record<keyof typeof WEIGHTS, number> = {
  EUR: 0.92,
  JPY: 157.4,
  GBP: 0.79,
  CAD: 1.36,
  SEK: 10.9,
  CHF: 0.88,
};

function expectedDxy(rates: Record<string, number>): number {
  return (
    50.14348112 *
    Math.pow(rates.EUR, 0.576) *
    Math.pow(rates.JPY, 0.136) *
    Math.pow(rates.GBP, 0.119) *
    Math.pow(rates.CAD, 0.091) *
    Math.pow(rates.SEK, 0.042) *
    Math.pow(rates.CHF, 0.036)
  );
}

/** All six per-USD rates multiplied by `factor` (a uniform dollar move). */
function scaled(factor: number): Record<string, number> {
  return Object.fromEntries(
    Object.entries(PER_USD).map(([code, rate]) => [code, rate * factor]),
  );
}

// ── Fallback-chain fixtures ─────────────────────────────────────────────────
// Every body below is a REAL captured response (2026-08-03) trimmed to the
// fields the adapters read, so a parser can't pass against an invented shape.

/** Host fragments the routed stub matches on, in chain order. */
const HOST = {
  frankfurter: "api.frankfurter.dev",
  fxSeries: "api.fxratesapi.com/timeseries",
  fxSpot: "api.fxratesapi.com/latest",
  currencyApi: "latest.currency-api.pages.dev",
  ecb: "data-api.ecb.europa.eu",
} as const;

/**
 * A fetch stub that answers per URL fragment. Anything unmatched 500s — so a
 * test naming only the sources it cares about still exercises the real
 * fall-through instead of accidentally being served a wrong-source body.
 */
function routedFetch(routes: Partial<Record<keyof typeof HOST, Response>>) {
  return vi.fn(async (url: string) => {
    for (const [name, fragment] of Object.entries(HOST))
      if (url.includes(fragment)) {
        const res = routes[name as keyof typeof HOST];
        if (res) return res;
      }
    return errorRes(500);
  });
}

/** Every URL the stub was called with, in call order. */
function fetchTargets(mock: ReturnType<typeof vi.fn>): string[] {
  return mock.mock.calls.map(([url]) => url as string);
}

/**
 * FXRatesAPI `/timeseries`: an `success` envelope, keys that are full ISO
 * TIMESTAMPS (not dates) in DESCENDING order — both quirks the adapter folds.
 */
function fxSeriesRes(
  rates: Record<string, Record<string, number>>,
  extra: Record<string, unknown> = {},
) {
  return jsonRes({
    success: true,
    terms: "https://fxratesapi.com/legal/terms-conditions",
    base: "USD",
    start_date: "2026-07-28T00:00:00.000Z",
    end_date: "2026-08-01T00:00:00.000Z",
    rates,
    ...extra,
  });
}

/** FXRatesAPI `/latest`: minute-level, its `date` is the request minute. */
function fxSpotRes(
  rates: Record<string, number>,
  date = "2026-08-03T07:00:00.000Z",
) {
  return jsonRes({
    success: true,
    timestamp: 1785740400,
    date,
    base: "USD",
    rates,
  });
}

/** currency-api: one file per base per DAY, codes lower-case under the base key. */
function currencyApiRes(
  quotes: Record<string, number>,
  date = "2026-08-03",
  base = "usd",
) {
  return jsonRes({ date, [base]: quotes });
}

/**
 * ECB SDMX-JSON. Observations are keyed by POSITION into the shared
 * `structure.dimensions.observation[0].values` day list, series keys are
 * positions into the series dimensions, and CURRENCY's values come back
 * ALPHABETICALLY — never in request order. `series` here maps a currency code to
 * `{ dayIndex: value }`, and the fixture sorts + indexes exactly like the portal.
 */
function ecbRes(
  days: string[],
  series: Record<string, Record<number, number>>,
  /** The portal says `dimensions`; older SDMX-JSON emitters say `dimension`. */
  dimKey: "dimensions" | "dimension" = "dimensions",
) {
  const currencies = Object.keys(series).sort();
  return jsonRes({
    header: { id: "fixture", test: false, sender: { id: "ECB" } },
    dataSets: [
      {
        action: "Replace",
        series: Object.fromEntries(
          currencies.map((code, i) => [
            `0:${i}:0:0:0`,
            {
              attributes: [0, null, 0],
              observations: Object.fromEntries(
                Object.entries(series[code]).map(([index, value]) => [
                  index,
                  [value, 0, 0, null, null],
                ]),
              ),
            },
          ]),
        ),
      },
    ],
    structure: {
      name: "Exchange Rates",
      [dimKey]: {
        series: [
          { id: "FREQ", name: "Frequency", values: [{ id: "D" }] },
          {
            id: "CURRENCY",
            name: "Currency",
            values: currencies.map((id) => ({ id })),
          },
          { id: "CURRENCY_DENOM", name: "…", values: [{ id: "EUR" }] },
          { id: "EXR_TYPE", name: "…", values: [{ id: "SP00" }] },
          { id: "EXR_SUFFIX", name: "…", values: [{ id: "A" }] },
        ],
        observation: [
          {
            id: "TIME_PERIOD",
            name: "Time period or range",
            role: "time",
            values: days.map((id) => ({ id, name: id })),
          },
        ],
      },
    },
  });
}

describe("FxProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("advertises its identity and capabilities", async () => {
    const provider = await freshProvider();
    expect(provider.name).toBe("fx");
    expect(provider.capabilities).toEqual(["fx-rates", "dollar-index"]);
  });

  describe("getFxRates — request shaping", () => {
    it("upper-cases, dedups, and drops the base + blanks from the symbols", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonRes(
          timeseries({
            "2026-03-02": { EUR: 0.92, JPY: 157.4 },
          }),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const rates = await provider.getFxRates("usd", [
        "usd", // the base itself — Frankfurter rejects a self-quote
        "eur",
        "EUR", // duplicate after upper-casing
        "", // blank
        "jpy",
      ]);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchTarget(fetchMock)).toContain("base=USD");
      expect(fetchTarget(fetchMock)).toContain("symbols=EUR,JPY");
      expect(rates.map((r) => r.symbol)).toEqual(["EUR", "JPY"]);
      // The base is normalised on the way out too, not just in the query.
      expect(rates.map((r) => r.base)).toEqual(["USD", "USD"]);
    });

    it("returns [] without touching the network for an empty symbol list", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      await expect(provider.getFxRates("USD", [])).resolves.toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("returns [] without touching the network when every symbol is the base", async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      // The USD board case: the currency provider asks for its own code.
      await expect(
        provider.getFxRates("USD", ["usd", "USD", ""]),
      ).resolves.toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("pins the 40-day open-ended window in the outgoing URL", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 2, 15, 12)));
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonRes(timeseries({ "2026-03-14": { THB: 36.5 } })),
        );
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      await provider.getFxRates("USD", ["THB"]);

      // 40 days before 2026-03-15 is 2026-02-03 (Feb 2026 has 28 days:
      // 15 back to Feb 28, then 25 more back to Feb 3), and the range is
      // left-open ("..") so Frankfurter runs it to the latest publication.
      expect(fetchTarget(fetchMock)).toBe(
        "https://api.frankfurter.dev/v1/2026-02-03..?base=USD&symbols=THB",
      );
    });
  });

  describe("getFxRates — mapping", () => {
    it("sorts day keys ascending and times each point at UTC midnight", async () => {
      // Keys planted out of order: the provider must sort, not trust insertion.
      const fetchMock = vi.fn().mockResolvedValue(
        jsonRes(
          timeseries({
            "2026-03-03": { THB: 36.7 },
            "2026-03-01": { THB: 36.5 },
            "2026-03-02": { THB: 36.6 },
          }),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb] = await provider.getFxRates("USD", ["THB"]);

      expect(thb.history.map((p) => p.value)).toEqual([36.5, 36.6, 36.7]);
      // UTC midnight, so the series can't drift a day in a non-UTC timezone.
      expect(thb.history.map((p) => p.time)).toEqual([
        Date.UTC(2026, 2, 1),
        Date.UTC(2026, 2, 2),
        Date.UTC(2026, 2, 3),
      ]);
    });

    it("derives rate + changePct from the last two history points", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonRes(
          timeseries({
            "2026-03-01": { THB: 30 }, // ignored by changePct — not the last two
            "2026-03-02": { THB: 36 },
            "2026-03-03": { THB: 36.9 },
          }),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb] = await provider.getFxRates("USD", ["THB"]);

      expect(thb.rate).toBe(36.9);
      // ((36.9 - 36) / 36) * 100 = 2.5
      expect(thb.changePct).toBeCloseTo(2.5, 10);
    });

    it("skips unusable per-day values and drops a symbol with no finite points", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonRes(
          timeseries({
            "2026-03-01": { THB: 36.5, EUR: "0.92", EUR_OTHER: 1 },
            "2026-03-02": { THB: "n/a", EUR: null },
            "2026-03-03": { THB: Number.NaN },
            "2026-03-04": null, // the whole day's map is absent
            "2026-03-05": { THB: 36.8 },
          }),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const rates = await provider.getFxRates("USD", ["THB", "EUR"]);

      // EUR never had a numeric print, so it is dropped entirely rather than
      // emitted as a row with an empty history (which frames render as a blank).
      expect(rates.map((r) => r.symbol)).toEqual(["THB"]);
      expect(rates[0].history.map((p) => p.value)).toEqual([36.5, 36.8]);
      expect(rates[0].rate).toBe(36.8);
    });

    it("reports changePct 0 for a single-point history", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonRes(timeseries({ "2026-03-05": { THB: 36.5 } })),
        );
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb] = await provider.getFxRates("USD", ["THB"]);

      expect(thb.history).toHaveLength(1);
      expect(thb.rate).toBe(36.5);
      expect(thb.changePct).toBe(0);
    });

    it("reports changePct 0 when the previous point is not positive", async () => {
      // A zero or negative print is nonsense for a rate but IS finite, so it
      // lands in the history; the change% guard must not divide by it.
      const fetchMock = vi.fn().mockResolvedValue(
        jsonRes(
          timeseries({
            "2026-03-01": { THB: 0, EUR: -1 },
            "2026-03-02": { THB: 36.5, EUR: 0.92 },
          }),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const rates = await provider.getFxRates("USD", ["THB", "EUR"]);

      expect(rates.map((r) => r.symbol)).toEqual(["THB", "EUR"]);
      expect(rates.map((r) => r.rate)).toEqual([36.5, 0.92]);
      expect(rates.map((r) => r.changePct)).toEqual([0, 0]);
    });

    it("returns [] when the window carries no days at all", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonRes(timeseries({})));
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      await expect(provider.getFxRates("USD", ["THB"])).resolves.toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("throws a labelled error on a body with no rates map", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonRes({ base: "USD", amount: 1 }));
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      await expect(provider.getFxRates("USD", ["THB"])).rejects.toThrow(
        "frankfurter: unexpected response shape",
      );
    });

    it("throws the transport error on a non-2xx response", async () => {
      const fetchMock = vi.fn().mockResolvedValue(errorRes(422));
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      await expect(provider.getFxRates("USD", ["THB"])).rejects.toThrow(
        /failed: 422/,
      );
    });
  });

  describe("getFxRates — caching", () => {
    it("collapses reversed symbol lists onto one cache key and one fetch", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonRes(
          timeseries({
            "2026-03-01": { EUR: 0.9, JPY: 156 },
            "2026-03-02": { EUR: 0.92, JPY: 157.4 },
          }),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const first = await provider.getFxRates("USD", ["JPY", "EUR"]);

      // The request keeps the caller's order (the sorted form is only the cache
      // key), and so does the result — sorted would have been EUR first.
      expect(fetchTarget(fetchMock)).toContain("symbols=JPY,EUR");
      expect(first.map((r) => r.symbol)).toEqual(["JPY", "EUR"]);

      const second = await provider.getFxRates("USD", ["EUR", "JPY"]);
      // `USD:EUR,JPY` either way → the second board's request is free.
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // KNOWN BUG: the cache-hit caller asked for EUR first but receives the
      // FIRST caller's ordering (["JPY","EUR"]) — should be the requesting
      // caller's order, i.e. the cached rows re-ordered per call (frames such as
      // fx-board render `rates` in array order). Pinned so the suite stays
      // green; fixing the source must flip this assertion.
      expect(second.map((r) => r.symbol)).toEqual(["JPY", "EUR"]);
    });

    it("serves the cached rates until the 55-minute TTL lapses", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 2, 15, 12)));
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonRes(timeseries({ "2026-03-14": { THB: 36.5 } })),
        );
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const first = await provider.getFxRates("USD", ["THB"]);

      vi.advanceTimersByTime(54 * 60_000); // still inside the 55-min window
      const cached = await provider.getFxRates("USD", ["THB"]);
      expect(cached).toEqual(first);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(2 * 60_000); // 56 min in — the TTL has lapsed
      await provider.getFxRates("USD", ["THB"]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("serves the last good rates when a later fetch fails", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 2, 15, 12)));
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonRes(timeseries({ "2026-03-14": { THB: 36.5 } })),
        );
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const good = await provider.getFxRates("USD", ["THB"]);

      vi.advanceTimersByTime(56 * 60_000);
      fetchMock.mockResolvedValueOnce(errorRes(429));

      const stale = await provider.getFxRates("USD", ["THB"]);
      // A minutes-old rate beats blanking every converted card on the board.
      expect(stale).toEqual(good);
      // The 429 costs Frankfurter's turn and the chain then asks the other three
      // — which are stubbed with a Frankfurter-shaped body none of them accepts —
      // so all four fail and the cache falls back to the last good value. One
      // priming call + four chain attempts.
      expect(fetchMock).toHaveBeenCalledTimes(5);
    });
  });

  describe("getDollarIndex", () => {
    it("recomputes the ICE-weighted geometric mean of the six per-USD rates", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 2, 15, 12)));
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonRes(timeseries({ "2026-03-13": { ...PER_USD } })),
        );
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const dxy = await provider.getDollarIndex();

      // The six constituents, in ICE weight order, over the same 40-day window.
      expect(fetchTarget(fetchMock)).toBe(
        "https://api.frankfurter.dev/v1/2026-02-03.." +
          "?base=USD&symbols=EUR,JPY,GBP,CAD,SEK,CHF",
      );
      expect(dxy.value).toBeCloseTo(expectedDxy(PER_USD), 9);
      // Sanity anchor: these are realistic quotes, so the index must land in
      // DXY territory (~104.6) — not, say, its reciprocal (~0.0096).
      expect(dxy.value).toBeGreaterThan(90);
      expect(dxy.value).toBeLessThan(120);
      expect(dxy.history).toEqual([
        { time: Date.UTC(2026, 2, 13), value: dxy.value },
      ]);
      expect(dxy.changePct).toBe(0); // single point
    });

    it("scales exactly with a uniform strengthening of the dollar", async () => {
      // The six weights sum to 1, so multiplying every per-USD rate by 1.05
      // must multiply the index by 1.05 — and the index must go UP, which is the
      // sign the collapsed exponents encode (a stronger dollar buys more of
      // each currency).
      const fetchMock = vi.fn().mockResolvedValue(
        jsonRes(
          timeseries({
            "2026-03-12": { ...PER_USD },
            "2026-03-13": scaled(1.05),
          }),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const dxy = await provider.getDollarIndex();

      const [weaker, stronger] = dxy.history;
      expect(stronger.value).toBeGreaterThan(weaker.value);
      expect(stronger.value / weaker.value).toBeCloseTo(1.05, 12);
      expect(stronger.value).toBeCloseTo(expectedDxy(scaled(1.05)), 9);
      expect(dxy.value).toBe(stronger.value);
      expect(dxy.changePct).toBeCloseTo(5, 10);
    });

    it("raises the index by rate^weight when a single constituent rises", async () => {
      // One day per constituent, each with ONLY that currency's per-USD rate up
      // 10%. This is what catches a single flipped exponent: a uniform move
      // would still look sane if two errors cancelled.
      const days: Record<string, Record<string, unknown>> = {
        "2026-03-01": { ...PER_USD },
      };
      const codes = Object.keys(WEIGHTS) as (keyof typeof WEIGHTS)[];
      codes.forEach((code, i) => {
        days[`2026-03-0${i + 2}`] = { ...PER_USD, [code]: PER_USD[code] * 1.1 };
      });
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonRes(timeseries(days))),
      );

      const provider = await freshProvider();
      const dxy = await provider.getDollarIndex();

      expect(dxy.history).toHaveLength(codes.length + 1);
      const base = dxy.history[0].value;
      codes.forEach((code, i) => {
        const bumped = dxy.history[i + 1].value;
        expect(bumped).toBeGreaterThan(base);
        expect(bumped / base).toBeCloseTo(Math.pow(1.1, WEIGHTS[code]), 12);
      });
    });

    it("skips any day without a positive finite rate for all six", async () => {
      const complete = { ...PER_USD };
      const fetchMock = vi.fn().mockResolvedValue(
        jsonRes(
          timeseries({
            "2026-03-02": complete,
            "2026-03-03": { ...complete, JPY: undefined }, // missing one
            "2026-03-04": { ...complete, CHF: 0 }, // zero
            "2026-03-05": { ...complete, SEK: -10.9 }, // negative
            "2026-03-06": { ...complete, GBP: "0.79" }, // string
            "2026-03-07": { ...complete, CAD: Number.NaN }, // non-finite
            "2026-03-08": null, // no rates for the day
          }),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const dxy = await provider.getDollarIndex();

      // No partial index is ever synthesised from five of the six legs.
      expect(dxy.history).toHaveLength(1);
      expect(dxy.history[0].time).toBe(Date.UTC(2026, 2, 2));
      expect(dxy.value).toBeCloseTo(expectedDxy(PER_USD), 9);
    });

    it("throws when no day in the window is complete", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        jsonRes(
          timeseries({
            "2026-03-02": { ...PER_USD, EUR: 0 },
            "2026-03-03": { EUR: 0.92, JPY: 157.4 }, // only two legs
          }),
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      await expect(provider.getDollarIndex()).rejects.toThrow(
        /no complete days in window/,
      );
    });

    it("throws a labelled error on a body with no rates map", async () => {
      const fetchMock = vi.fn().mockResolvedValue(jsonRes({ base: "USD" }));
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      await expect(provider.getDollarIndex()).rejects.toThrow(
        "frankfurter dxy: unexpected response shape",
      );
    });

    it("serves the cached index on a second call without re-fetching", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonRes(timeseries({ "2026-03-13": { ...PER_USD } })),
        );
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const first = await provider.getDollarIndex();
      const second = await provider.getDollarIndex();

      expect(second).toEqual(first);
      expect(second.value).toBeCloseTo(expectedDxy(PER_USD), 9);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * The reason this package has a chain at all: it is the repo's ONLY fiat FX
   * feed, so a Frankfurter outage doesn't blank a card — it makes every
   * `useMoney()` card on a non-USD board quietly quote USD, which reads as wrong
   * data rather than as a failure. These tests pin that a source dying is
   * invisible to callers (same shape, same numbers, only `source` differs), and
   * that Frankfurter is still asked FIRST every time.
   */
  describe("fallback chain", () => {
    it("stops at the first source that answers, in declared order", async () => {
      const fetchMock = routedFetch({
        frankfurter: errorRes(503),
        fxSeries: fxSeriesRes({
          "2026-07-30T23:59:00.000Z": { THB: 33.381 },
          "2026-07-31T23:59:00.000Z": { THB: 33.42 },
        }),
        // currency-api + ecb are stubbed too, so "stops" is a real assertion:
        // if the chain kept going it would overwrite this answer.
        currencyApi: currencyApiRes({ thb: 99 }),
        ecb: ecbRes(["2026-07-31"], { THB: { 0: 99 }, USD: { 0: 1 } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb] = await provider.getFxRates("USD", ["THB"]);

      expect(fetchTargets(fetchMock)).toEqual([
        expect.stringContaining(HOST.frankfurter),
        expect.stringContaining(HOST.fxSeries),
      ]);
      expect(thb.rate).toBe(33.42);
      expect(thb.source).toBe("fxratesapi");
    });

    it("falls all the way through to the ECB portal", async () => {
      const fetchMock = routedFetch({
        frankfurter: errorRes(503),
        fxSeries: errorRes(500),
        currencyApi: errorRes(404),
        ecb: ecbRes(["2026-07-31"], { THB: { 0: 38.435 }, USD: { 0: 1.1485 } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb] = await provider.getFxRates("USD", ["THB"]);

      expect(fetchTargets(fetchMock)).toEqual([
        expect.stringContaining(HOST.frankfurter),
        expect.stringContaining(HOST.fxSeries),
        expect.stringContaining(HOST.currencyApi),
        expect.stringContaining(HOST.ecb),
      ]);
      expect(thb.source).toBe("ecb");
      expect(thb.rate).toBeCloseTo(38.435 / 1.1485, 10);
    });

    it("re-throws the PRIMARY's error when every source fails", async () => {
      // Whichever fallback happened to fail last must not become the message a
      // frame shows — the operator needs to know the primary is the problem.
      const fetchMock = routedFetch({});
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      await expect(provider.getFxRates("USD", ["THB"])).rejects.toThrow(
        /api\.frankfurter\.dev.*failed: 500/,
      );
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it("never sends a symbol list that would ask a fallback for the base itself", async () => {
      // The base is dropped before the chain runs, so every source gets the same
      // already-normalised request — one place to get it right, not four.
      const fetchMock = routedFetch({
        frankfurter: errorRes(503),
        fxSeries: fxSeriesRes({ "2026-07-31T23:59:00.000Z": { THB: 33.42 } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      await provider.getFxRates("usd", ["thb", "USD", ""]);

      const [, fxUrl] = fetchTargets(fetchMock);
      expect(fxUrl).toContain("base=USD");
      expect(fxUrl).toContain("currencies=THB");
    });
  });

  describe("source: FXRatesAPI", () => {
    it("folds ISO-timestamp keys onto calendar days and sorts them ascending", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 7, 3, 12)));
      const fetchMock = routedFetch({
        frankfurter: errorRes(503),
        // As served: full ISO timestamps at 23:59Z, NEWEST FIRST.
        fxSeries: fxSeriesRes({
          "2026-07-31T23:59:00.000Z": { EUR: 0.8674531568, THB: 33.4200043785 },
          "2026-07-30T23:59:00.000Z": { EUR: 0.8678071077, THB: 33.3810042012 },
          "2026-07-29T23:59:00.000Z": { EUR: 0.8719991604, THB: 33.4800055845 },
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb, eur] = await provider.getFxRates("USD", ["THB", "EUR"]);

      // A bounded window, both ends dated — this feed has no open-ended form.
      expect(fetchTargets(fetchMock)[1]).toBe(
        "https://api.fxratesapi.com/timeseries?start_date=2026-06-24" +
          "&end_date=2026-08-03&base=USD&currencies=THB,EUR",
      );
      // The 23:59Z stamp must land on its own day, not roll to the next one.
      expect(thb.history.map((p) => p.time)).toEqual([
        Date.UTC(2026, 6, 29),
        Date.UTC(2026, 6, 30),
        Date.UTC(2026, 6, 31),
      ]);
      expect(thb.history.map((p) => p.value)).toEqual([
        33.4800055845, 33.3810042012, 33.4200043785,
      ]);
      expect(thb.rate).toBe(33.4200043785);
      expect(thb.changePct).toBeCloseTo(
        ((33.4200043785 - 33.3810042012) / 33.3810042012) * 100,
        10,
      );
      expect(eur.symbol).toBe("EUR");
      expect(thb.source).toBe("fxratesapi");
    });

    it("keeps the later print when one day carries two intraday stamps", async () => {
      const fetchMock = routedFetch({
        frankfurter: errorRes(503),
        fxSeries: fxSeriesRes({
          "2026-07-31T23:59:00.000Z": { THB: 33.42 },
          "2026-07-31T09:00:00.000Z": { THB: 33.1 },
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb] = await provider.getFxRates("USD", ["THB"]);

      expect(thb.history).toHaveLength(1);
      expect(thb.rate).toBe(33.42);
    });

    it("rejects a body without success:true and moves on", async () => {
      // Guards the confusable case: this feed's envelope is otherwise shaped
      // exactly like Frankfurter's `{base, rates}`, so requiring `success`
      // is what stops a misrouted body from being read as this source's answer.
      const fetchMock = routedFetch({
        frankfurter: errorRes(503),
        fxSeries: jsonRes({
          base: "USD",
          rates: { "2026-07-31T23:59:00.000Z": { THB: 33.42 } },
        }),
        currencyApi: currencyApiRes({ thb: 33.333 }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb] = await provider.getFxRates("USD", ["THB"]);

      expect(thb.source).toBe("currency-api");
      expect(thb.rate).toBe(33.333);
    });
  });

  describe("source: currency-api", () => {
    it("reads the lower-cased base + symbol keys of the latest daily file", async () => {
      const fetchMock = routedFetch({
        frankfurter: errorRes(503),
        fxSeries: errorRes(500),
        currencyApi: currencyApiRes({
          thb: 33.3330042997,
          eur: 0.8675551067,
          btc: 0.0000091,
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const rates = await provider.getFxRates("USD", ["THB", "EUR"]);

      expect(fetchTargets(fetchMock)[2]).toBe(
        "https://latest.currency-api.pages.dev/v1/currencies/usd.json",
      );
      expect(rates.map((r) => r.symbol)).toEqual(["THB", "EUR"]);
      expect(rates.map((r) => r.rate)).toEqual([33.3330042997, 0.8675551067]);
      expect(rates.every((r) => r.source === "currency-api")).toBe(true);
    });

    it("degrades to a one-point history at the published day, change 0", async () => {
      // This source publishes one file per day: the rate survives (which is what
      // keeps a board converting), the sparkline and change% do not.
      const fetchMock = routedFetch({
        frankfurter: errorRes(503),
        fxSeries: errorRes(500),
        currencyApi: currencyApiRes({ thb: 33.333 }, "2026-08-03"),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb] = await provider.getFxRates("USD", ["THB"]);

      expect(thb.history).toEqual([
        { time: Date.UTC(2026, 7, 3), value: 33.333 },
      ]);
      expect(thb.changePct).toBe(0);
    });

    it("drops a symbol the file doesn't quote and moves on when none is quoted", async () => {
      const fetchMock = routedFetch({
        frankfurter: errorRes(503),
        fxSeries: errorRes(500),
        currencyApi: currencyApiRes({ thb: 33.333 }),
        ecb: ecbRes(["2026-07-31"], { XYZ: { 0: 2 }, USD: { 0: 1.1485 } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const rates = await provider.getFxRates("USD", ["THB", "XYZ"]);

      // A quoted-but-partial answer is still an answer — the chain does not
      // discard a good THB rate just because XYZ is unknown to this source.
      expect(rates.map((r) => r.symbol)).toEqual(["THB"]);
      expect(fetchTargets(fetchMock)).toHaveLength(3);
    });

    it("rejects a body whose base key is missing", async () => {
      const fetchMock = routedFetch({
        frankfurter: errorRes(503),
        fxSeries: errorRes(500),
        currencyApi: jsonRes({ date: "2026-08-03", eur: { thb: 38.4 } }),
        ecb: ecbRes(["2026-07-31"], { THB: { 0: 38.435 }, USD: { 0: 1.1485 } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb] = await provider.getFxRates("USD", ["THB"]);

      expect(thb.source).toBe("ecb");
    });
  });

  describe("source: ECB Data Portal (SDMX-JSON)", () => {
    // Real captured values: THB and USD per 1 EUR on three consecutive days.
    const DAYS = ["2026-07-29", "2026-07-30", "2026-07-31"];
    const THB_PER_EUR = { 0: 38.157, 1: 38.496, 2: 38.435 };
    const USD_PER_EUR = { 0: 1.138, 1: 1.1476, 2: 1.1485 };

    function ecbOnly(res: Response) {
      return routedFetch({
        frankfurter: errorRes(503),
        fxSeries: errorRes(500),
        currencyApi: errorRes(404),
        ecb: res,
      });
    }

    it("indexes observations by position and series keys through the CURRENCY list", async () => {
      // THB sorts BEFORE USD, so THB is series `0:0:0:0:0` and USD is `0:1:0:0:0`
      // — read the dimension list wrong and the cross is inverted, which still
      // renders as a plausible number.
      const fetchMock = ecbOnly(
        ecbRes(DAYS, { THB: THB_PER_EUR, USD: USD_PER_EUR }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb] = await provider.getFxRates("USD", ["THB"]);

      // The portal only quotes against the euro, so the base rides along as a
      // requested currency and each day is divided through.
      expect(fetchTargets(fetchMock)[3]).toContain(
        "/service/data/EXR/D.THB+USD.EUR.SP00.A?format=jsondata&startPeriod=",
      );
      expect(thb.history.map((p) => p.time)).toEqual([
        Date.UTC(2026, 6, 29),
        Date.UTC(2026, 6, 30),
        Date.UTC(2026, 6, 31),
      ]);
      expect(thb.history.map((p) => p.value)).toEqual([
        38.157 / 1.138,
        38.496 / 1.1476,
        38.435 / 1.1485,
      ]);
      // Sanity anchor: baht per dollar is ~33, not ~38 (per euro) or ~0.03.
      expect(thb.rate).toBeGreaterThan(30);
      expect(thb.rate).toBeLessThan(36);
    });

    it("honours a sparse observation index — a series may skip days the union has", async () => {
      // THB prints on all three days, USD only on the first and last: the day
      // with no cross leg is dropped, and the survivors keep their own days.
      const fetchMock = ecbOnly(
        ecbRes(DAYS, {
          THB: THB_PER_EUR,
          USD: { 0: 1.138, 2: 1.1485 },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb] = await provider.getFxRates("USD", ["THB"]);

      expect(thb.history).toEqual([
        { time: Date.UTC(2026, 6, 29), value: 38.157 / 1.138 },
        { time: Date.UTC(2026, 6, 31), value: 38.435 / 1.1485 },
      ]);
    });

    it("asks for no cross series on a EUR board and quotes EUR at 1", async () => {
      const fetchMock = ecbOnly(ecbRes(DAYS, { THB: THB_PER_EUR }));
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb] = await provider.getFxRates("EUR", ["THB"]);

      // EUR IS the denominator, so it is never requested as a currency.
      expect(fetchTargets(fetchMock)[3]).toContain("D.THB.EUR.SP00.A");
      expect(thb.base).toBe("EUR");
      expect(thb.rate).toBe(38.435);
    });

    it("quotes EUR itself as the reciprocal of the base's euro rate", async () => {
      const fetchMock = ecbOnly(ecbRes(DAYS, { USD: USD_PER_EUR }));
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [eur] = await provider.getFxRates("USD", ["EUR"]);

      expect(fetchTargets(fetchMock)[3]).toContain("D.USD.EUR.SP00.A");
      expect(eur.rate).toBeCloseTo(1 / 1.1485, 12);
    });

    it("accepts the legacy singular `structure.dimension` spelling", async () => {
      const fetchMock = ecbOnly(
        ecbRes(DAYS, { THB: THB_PER_EUR, USD: USD_PER_EUR }, "dimension"),
      );
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb] = await provider.getFxRates("USD", ["THB"]);
      expect(thb.rate).toBeCloseTo(38.435 / 1.1485, 12);
    });

    it("rejects a body with no dataSets and reports the primary's failure", async () => {
      const fetchMock = ecbOnly(jsonRes({ header: { id: "x" } }));
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      await expect(provider.getFxRates("USD", ["THB"])).rejects.toThrow(
        /api\.frankfurter\.dev.*failed: 503/,
      );
    });

    it("skips a day whose observation value is zero or non-numeric", async () => {
      const fetchMock = ecbOnly(
        ecbRes(DAYS, {
          THB: { 0: 0, 1: 38.496, 2: 38.435 },
          USD: USD_PER_EUR,
        }),
      );
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb] = await provider.getFxRates("USD", ["THB"]);

      expect(thb.history.map((p) => p.time)).toEqual([
        Date.UTC(2026, 6, 30),
        Date.UTC(2026, 6, 31),
      ]);
    });
  });

  describe("rate limiting", () => {
    it("falls through on a 429 instead of throwing", async () => {
      const fetchMock = routedFetch({
        frankfurter: errorRes(429),
        fxSeries: fxSeriesRes({ "2026-07-31T23:59:00.000Z": { THB: 33.42 } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb] = await provider.getFxRates("USD", ["THB"]);

      expect(thb.rate).toBe(33.42);
      expect(thb.source).toBe("fxratesapi");
    });

    it("stops asking a rate-limited source for the cooldown window", async () => {
      // `fetchJson` has no backoff (and isn't ours to change), so "don't hammer"
      // lives here: a second board asking a different symbol set must not spend
      // another request on the source that just said 429.
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 7, 3, 12)));
      const fetchMock = routedFetch({
        frankfurter: errorRes(429),
        fxSeries: fxSeriesRes({ "2026-07-31T23:59:00.000Z": { THB: 33.42 } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      await provider.getFxRates("USD", ["THB"]);
      expect(
        fetchTargets(fetchMock).filter((u) => u.includes(HOST.frankfurter)),
      ).toHaveLength(1);

      // A different cache key, one minute later — inside the cooldown.
      vi.advanceTimersByTime(60_000);
      await provider.getFxRates("USD", ["EUR"]);
      expect(
        fetchTargets(fetchMock).filter((u) => u.includes(HOST.frankfurter)),
      ).toHaveLength(1);

      // Past the 10-minute cooldown the primary is trusted again — a 429 must
      // never retire a source permanently.
      vi.advanceTimersByTime(11 * 60_000);
      await provider.getFxRates("USD", ["JPY"]);
      expect(
        fetchTargets(fetchMock).filter((u) => u.includes(HOST.frankfurter)),
      ).toHaveLength(2);
    });

    it("reports a dedicated error when every source is in cooldown", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 7, 3, 12)));
      const fetchMock = routedFetch({
        frankfurter: errorRes(429),
        fxSeries: errorRes(429),
        currencyApi: errorRes(429),
        ecb: errorRes(418), // some CDNs answer a quota breach with a teapot
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      await expect(provider.getFxRates("USD", ["THB"])).rejects.toThrow(
        /failed: 429/,
      );
      expect(fetchMock).toHaveBeenCalledTimes(4);

      // Every source is cooling down, so the next key spends NO requests and
      // says why, rather than looking like a transport failure.
      vi.advanceTimersByTime(60_000);
      await expect(provider.getFxRates("USD", ["EUR"])).rejects.toThrow(
        /every source is rate-limited \(4 in cooldown\)/,
      );
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  describe("history window", () => {
    it("deepens every source's window on request, and keys the cache by it", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 7, 3, 12)));
      const fetchMock = routedFetch({
        frankfurter: errorRes(503),
        fxSeries: errorRes(500),
        currencyApi: errorRes(404),
        ecb: ecbRes(["2026-07-31"], { THB: { 0: 38.435 }, USD: { 0: 1.1485 } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      await provider.getFxRates("USD", ["THB"], { windowDays: 4000 });

      // 4000 days before 2026-08-03 is 2015-08-21 — both the deep-history feeds
      // reach 1999, so the cap is a default, not a limit.
      const [fr, fx, , ecb] = fetchTargets(fetchMock);
      expect(fr).toContain("/v1/2015-08-21..");
      expect(fx).toContain("start_date=2015-08-21");
      expect(ecb).toContain("startPeriod=2015-08-21");

      // Same base+symbols, different depth → a separate cache entry, or the
      // 40-day board would be served a decade-long sparkline (and vice versa).
      await provider.getFxRates("USD", ["THB"], { windowDays: 4000 });
      expect(fetchTargets(fetchMock)).toHaveLength(4);
      await provider.getFxRates("USD", ["THB"]);
      expect(fetchTargets(fetchMock)).toHaveLength(8);
      expect(fetchTargets(fetchMock)[4]).toContain("/v1/2026-06-24..");
    });

    it("keeps the 40-day default when no window is given", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 7, 3, 12)));
      const fetchMock = routedFetch({
        frankfurter: jsonRes(timeseries({ "2026-08-02": { THB: 33.4 } })),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      await provider.getFxRates("USD", ["THB"]);
      expect(fetchTargets(fetchMock)[0]).toBe(
        "https://api.frankfurter.dev/v1/2026-06-24..?base=USD&symbols=THB",
      );
    });
  });

  describe("intraday spot", () => {
    const daily = jsonRes(
      timeseries({
        "2026-08-01": { THB: 33.381 },
        "2026-08-02": { THB: 33.42 },
      }),
    );

    it("costs nothing by default", async () => {
      const fetchMock = routedFetch({ frankfurter: daily });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb] = await provider.getFxRates("USD", ["THB"]);

      expect(fetchTargets(fetchMock)).toHaveLength(1);
      expect(thb.spot).toBeUndefined();
      expect(thb.spotAt).toBeUndefined();
    });

    it("attaches the minute-level quote WITHOUT moving the conversion rate", async () => {
      // The whole point: `rate` is what every `useMoney()` card divides by, so it
      // stays the published daily close — swap in a minute quote and every
      // converted figure on the board twitches on each poll. The fresher number
      // rides alongside for a frame that wants to show it.
      const fetchMock = routedFetch({
        frankfurter: daily,
        fxSpot: fxSpotRes({ THB: 33.3330042997 }, "2026-08-03T07:00:00.000Z"),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb] = await provider.getFxRates("USD", ["THB"], {
        intraday: true,
      });

      expect(fetchTargets(fetchMock)[1]).toBe(
        "https://api.fxratesapi.com/latest?base=USD&currencies=THB",
      );
      expect(thb.rate).toBe(33.42); // the daily close, untouched
      expect(thb.history).toHaveLength(2);
      expect(thb.changePct).toBeCloseTo(((33.42 - 33.381) / 33.381) * 100, 10);
      expect(thb.spot).toBe(33.3330042997);
      expect(thb.spotAt).toBe(Date.parse("2026-08-03T07:00:00.000Z"));
    });

    it("shares one spot request across repeat calls", async () => {
      const fetchMock = routedFetch({
        frankfurter: daily,
        fxSpot: fxSpotRes({ THB: 33.333 }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      await provider.getFxRates("USD", ["THB"], { intraday: true });
      await provider.getFxRates("USD", ["THB"], { intraday: true });

      expect(
        fetchTargets(fetchMock).filter((u) => u.includes(HOST.fxSpot)),
      ).toHaveLength(1);
    });

    it("still returns the daily rows when the spot call fails", async () => {
      // Best-effort by contract: an optional garnish must never take down the
      // rate the board actually converts with.
      const fetchMock = routedFetch({
        frankfurter: daily,
        fxSpot: errorRes(429),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb] = await provider.getFxRates("USD", ["THB"], {
        intraday: true,
      });

      expect(thb.rate).toBe(33.42);
      expect(thb.spot).toBeUndefined();
    });

    it("ignores a spot body without success:true", async () => {
      const fetchMock = routedFetch({
        frankfurter: daily,
        fxSpot: jsonRes({ base: "USD", rates: { THB: 33.333 } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const [thb] = await provider.getFxRates("USD", ["THB"], {
        intraday: true,
      });
      expect(thb.spot).toBeUndefined();
    });
  });

  describe("getDollarIndex — fallback chain", () => {
    it("computes the same index from a fallback source", async () => {
      const fetchMock = routedFetch({
        frankfurter: errorRes(503),
        fxSeries: fxSeriesRes({
          "2026-08-02T23:59:00.000Z": { ...PER_USD },
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const dxy = await provider.getDollarIndex();

      expect(fetchTargets(fetchMock)[1]).toContain(
        "currencies=EUR,JPY,GBP,CAD,SEK,CHF",
      );
      expect(dxy.value).toBeCloseTo(expectedDxy(PER_USD), 9);
      expect(dxy.value).toBeGreaterThan(90);
      expect(dxy.value).toBeLessThan(120);
      expect(dxy.source).toBe("fxratesapi");
    });

    it("crosses the ECB's euro quotes into all six per-USD legs", async () => {
      // Each leg is (currency per EUR) / (USD per EUR) — six divisions, any one
      // of which inverted still yields a believable ~100.
      // EUR is the denominator, so it gets NO series of its own: its per-USD leg
      // is the reciprocal of the dollar's euro quote. Pick that quote so the
      // implied EUR leg is exactly PER_USD.EUR, then scale the rest through it.
      const usdPerEur = 1 / PER_USD.EUR;
      const perEur: Record<string, number> = { USD: usdPerEur };
      for (const [code, perUsd] of Object.entries(PER_USD))
        if (code !== "EUR") perEur[code] = perUsd * usdPerEur;
      const fetchMock = routedFetch({
        frankfurter: errorRes(503),
        fxSeries: errorRes(500),
        currencyApi: errorRes(404),
        ecb: ecbRes(
          ["2026-08-02"],
          Object.fromEntries(
            Object.entries(perEur).map(([code, value]) => [code, { 0: value }]),
          ),
        ),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const dxy = await provider.getDollarIndex();

      expect(dxy.source).toBe("ecb");
      expect(dxy.value).toBeCloseTo(expectedDxy(PER_USD), 6);
    });

    it("falls through when a source's window has no complete day", async () => {
      // A body that parses but yields no index is that SOURCE's failure, not the
      // request's — so the chain keeps going instead of erroring the card while
      // three working feeds go unasked.
      const fetchMock = routedFetch({
        frankfurter: jsonRes(
          timeseries({ "2026-08-02": { EUR: 0.92, JPY: 157.4 } }), // 2 of 6 legs
        ),
        fxSeries: fxSeriesRes({ "2026-08-02T23:59:00.000Z": { ...PER_USD } }),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      const dxy = await provider.getDollarIndex();

      expect(dxy.source).toBe("fxratesapi");
      expect(dxy.value).toBeCloseTo(expectedDxy(PER_USD), 9);
    });

    it("reports the primary's incomplete-window error when no source can build one", async () => {
      const fetchMock = routedFetch({
        frankfurter: jsonRes(timeseries({ "2026-08-02": { EUR: 0.92 } })),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      await expect(provider.getDollarIndex()).rejects.toThrow(
        /frankfurter dxy: no complete days in window/,
      );
    });

    it("deepens the DXY window on request", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(Date.UTC(2026, 7, 3, 12)));
      const fetchMock = routedFetch({
        frankfurter: jsonRes(timeseries({ "2026-08-02": { ...PER_USD } })),
      });
      vi.stubGlobal("fetch", fetchMock);

      const provider = await freshProvider();
      await provider.getDollarIndex({ windowDays: 400 });
      expect(fetchTargets(fetchMock)[0]).toContain("/v1/2025-06-29..");

      // Cached per window, exactly like the rates path.
      await provider.getDollarIndex({ windowDays: 400 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await provider.getDollarIndex();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
