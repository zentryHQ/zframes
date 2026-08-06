import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NasdaqProvider as NasdaqProviderType } from "./index";

// What this file pins
// ───────────────────
// api.nasdaq.com is the exchange's own site backend: undocumented, unversioned,
// and the only source in the fleet for most of what it serves — so a
// mis-parsed figure has nothing to contradict it. The contracts below are the
// ones whose silent inversion swaps a correct number for a plausible wrong one:
//
//  1. The envelope. Failure arrives as HTTP 200 with `data: null` and the real
//     reason in `status.bCodeMessage[].errorMessage` — `message` is null even
//     then. Reading only `message` would surface every error as "no data".
//  2. Thousands scaling on the statement tables (NVDA's "$215,938,000" of
//     revenue is $215.9bn) and NO scaling on the ratios table beside them.
//  3. Blank cells: a section header's cells are empty strings and are dropped;
//     a line item that didn't print holds "--" and becomes null, never 0.
//  4. The misspelled `FiftTwoWeekHighLow` key, and "N/A" cells never reaching
//     the output as NaN.
//  5. Millions scaling on the two ownership fields labelled "(millions)".
//  6. Candles: newest-first upstream must come back oldest→newest, and a
//     non-daily interval must throw rather than quietly serving daily bars.
//  7. An empty calendar day answers `{rows: null}` inside a POPULATED envelope
//     — so it must return [] without throwing.
//
// Every cache here is a module-level singleton with stale-on-error ON, so a
// value primed by one test would mask the next test's error path. Each test
// therefore gets a genuinely fresh module via vi.resetModules() + dynamic import.

type Ctor = typeof NasdaqProviderType;

async function loadProvider(): Promise<Ctor> {
  vi.resetModules();
  const mod = await import("./index");
  return mod.NasdaqProvider;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

/** A success envelope. */
function ok(data: unknown) {
  return { data, message: null, status: { rCode: 200, bCodeMessage: null } };
}

/** The real failure envelope: HTTP 200, null data, reason under bCodeMessage. */
function upstreamError(reason = "Symbol not exists.") {
  return {
    data: null,
    message: null,
    status: {
      rCode: 400,
      bCodeMessage: [{ code: 1001, errorMessage: reason }],
    },
  };
}

/** [substring of the request url, envelope to answer with]. */
type Route = [match: string, body: unknown];

/** Route the stubbed fetch by url fragment; an unrouted url fails loudly. */
function stubFetch(routes: Route[]) {
  // `init` is declared even though most assertions ignore it: the UA guard
  // below reads the request headers, and a one-arg mock signature makes that
  // tuple index a type error.
  const mock = vi.fn(async (url: string, _init?: RequestInit) => {
    const hit = routes.find(([match]) => url.includes(match));
    if (!hit) throw new Error(`unrouted fetch: ${url}`);
    return jsonResponse(hit[1]);
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}

const QUOTE_NVDA = ok({
  symbol: "NVDA",
  companyName: "NVIDIA Corporation Common Stock",
  exchange: "NASDAQ-GS",
  marketStatus: "Pre-Market",
  primaryData: {
    lastSalePrice: "$218.92",
    netChange: "-0.30",
    percentageChange: "-0.14%",
    volume: "580,833.013589",
  },
  secondaryData: {
    lastSalePrice: "$219.22",
    netChange: "+7.28",
    percentageChange: "+3.43%",
  },
});

const SUMMARY_NVDA = ok({
  symbol: "NVDA",
  summaryData: {
    Exchange: { label: "Exchange", value: "NASDAQ-GS" },
    Sector: { label: "Sector", value: "Technology" },
    Industry: { label: "Industry", value: "Semiconductors" },
    OneYrTarget: { label: "1 Year Target", value: "$300.00" },
    TodayHighLow: { label: "Today's High/Low", value: "N/A" },
    AverageVolume: { label: "Average Volume", value: "149,150,655" },
    PreviousClose: { label: "Previous Close", value: "$219.22" },
    FiftTwoWeekHighLow: {
      label: "52 Week High/Low",
      value: "$236.54/$164.07",
    },
    MarketCap: { label: "Market Cap", value: "5,296,654,000,000" },
    AnnualizedDividend: { label: "Annualized Dividend", value: "$1.00" },
    Yield: { label: "Current Yield", value: "0.47%" },
  },
});

describe("NasdaqProvider", () => {
  let NasdaqProvider: Ctor;

  beforeEach(async () => {
    NasdaqProvider = await loadProvider();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("advertises its identity and capabilities", () => {
    const provider = new NasdaqProvider();
    expect(provider.name).toBe("nasdaq");
    expect(provider.capabilities).toEqual([
      "day-stats",
      "ohlcv",
      "equity-profile",
      "equity-financials",
      "earnings-history",
      "earnings-calendar",
      "analyst-ratings",
      "institutional-ownership",
    ]);
  });

  it("sends a browser User-Agent, which the host requires to answer at all", async () => {
    // Verified live: api.nasdaq.com returns 200 in ~2s for a Chrome UA and
    // DROPS the connection for the transport's own descriptive UA — `http=000`,
    // no status, no body, just a hang until the timeout. That makes the
    // endpoint look healthy to anyone testing it by hand with curl and dead to
    // every Node caller, including the scheduled liveness monitor, which would
    // file an outage issue on every run. Pin the header so the failure mode
    // can't come back silently.
    const fetchMock = stubFetch([
      ["/info?", QUOTE_NVDA],
      ["/summary?", SUMMARY_NVDA],
    ]);
    await new NasdaqProvider().getEquityProfile("NVDA");
    expect(fetchMock.mock.calls.length).toBeGreaterThan(0);
    for (const [, init] of fetchMock.mock.calls) {
      expect(new Headers(init?.headers).get("User-Agent")).toContain(
        "Mozilla/5.0",
      );
    }
  });

  it("surfaces the upstream reason from a 200-with-null-data envelope", async () => {
    stubFetch([["/info?", upstreamError()]]);
    await expect(
      new NasdaqProvider().getEquityProfile("ZZZZQQ"),
    ).rejects.toThrow("Symbol not exists.");
  });

  describe("getDayStats", () => {
    it("answers empty without a request when no symbols are named", async () => {
      const fetchMock = stubFetch([]);
      await expect(new NasdaqProvider().getDayStats()).resolves.toEqual({});
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("prefers the summary's previous close and the published change", async () => {
      // PreviousClose is deliberately inconsistent with the quote here, so the
      // assertion proves WHICH source each field came from.
      stubFetch([
        ["/info?", QUOTE_NVDA],
        [
          "/summary?",
          ok({
            summaryData: { PreviousClose: { value: "$200.00" } },
          }),
        ],
      ]);
      const stats = await new NasdaqProvider().getDayStats(["xyz:NVDA"]);
      // Keyed by the symbol as REQUESTED, dex prefix and all.
      expect(Object.keys(stats)).toEqual(["xyz:NVDA"]);
      expect(stats["xyz:NVDA"]).toEqual({
        markPx: 218.92,
        prevDayPx: 200,
        changePct: -0.14,
      });
    });

    it("falls back to lastSalePrice - netChange when the summary fails", async () => {
      stubFetch([
        ["/info?", QUOTE_NVDA],
        ["/summary?", upstreamError("Summary unavailable.")],
      ]);
      const stats = await new NasdaqProvider().getDayStats(["NVDA"]);
      // 218.92 − (−0.30) = 219.22, the close the published −0.14% is measured against.
      expect(stats.NVDA.prevDayPx).toBeCloseTo(219.22, 10);
    });

    it("keeps the good symbols when one ticker fails", async () => {
      const fetchMock = vi.fn(async (url: string) => {
        if (url.includes("ZZZZ")) return jsonResponse(upstreamError());
        if (url.includes("/summary?")) return jsonResponse(SUMMARY_NVDA);
        return jsonResponse(QUOTE_NVDA);
      });
      vi.stubGlobal("fetch", fetchMock);

      const stats = await new NasdaqProvider().getDayStats(["NVDA", "ZZZZ"]);
      expect(Object.keys(stats)).toEqual(["NVDA"]);
      expect(stats.NVDA.prevDayPx).toBe(219.22);
    });
  });

  describe("getCandles", () => {
    const HISTORY = ok({
      symbol: "NVDA",
      totalRecords: 3,
      tradesTable: {
        rows: [
          // Newest first, as published.
          {
            date: "08/05/2026",
            close: "$219.22",
            volume: "158,187,400",
            open: "$216.86",
            high: "$222.22",
            low: "$216.40",
          },
          {
            date: "08/04/2026",
            close: "$211.94",
            volume: "134,922,000",
            open: "$211.30",
            high: "$213.06",
            low: "$209.05",
          },
          // Unparseable row — dropped, never emitted as a NaN bar.
          {
            date: "08/03/2026",
            close: "--",
            volume: "",
            open: "",
            high: "",
            low: "",
          },
        ],
      },
    });

    it("throws on any interval that isn't daily, without calling out", async () => {
      const fetchMock = stubFetch([]);
      await expect(
        new NasdaqProvider().getCandles("NVDA", "1h", Date.UTC(2026, 6, 1)),
      ).rejects.toThrow(/daily bars only/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("reverses the newest-first rows into an oldest→newest series", async () => {
      stubFetch([["/historical", HISTORY]]);
      const candles = await new NasdaqProvider().getCandles(
        "xyz:NVDA",
        "1d",
        Date.UTC(2026, 6, 1),
      );
      expect(candles.map((candle) => candle.time)).toEqual([
        Date.UTC(2026, 7, 4),
        Date.UTC(2026, 7, 5),
      ]);
      expect(candles[1]).toEqual({
        time: Date.UTC(2026, 7, 5),
        open: 216.86,
        high: 222.22,
        low: 216.4,
        close: 219.22,
        volume: 158_187_400,
      });
    });

    it("accepts the other daily spellings", async () => {
      stubFetch([["/historical", HISTORY]]);
      const provider = new NasdaqProvider();
      for (const interval of ["d", "1Day", "DAILY"])
        await expect(
          provider.getCandles("NVDA", interval, Date.UTC(2026, 6, 1)),
        ).resolves.toHaveLength(2);
    });
  });

  describe("getEquityProfile", () => {
    it("reads the misspelled 52-week key and never emits a NaN", async () => {
      stubFetch([
        ["/info?", QUOTE_NVDA],
        ["/summary?", SUMMARY_NVDA],
      ]);
      const profile = await new NasdaqProvider().getEquityProfile("NVDA");
      expect(profile).toMatchObject({
        symbol: "NVDA",
        companyName: "NVIDIA Corporation Common Stock",
        exchange: "NASDAQ-GS",
        sector: "Technology",
        industry: "Semiconductors",
        price: 218.92,
        previousClose: 219.22,
        // Whole dollars on this endpoint — NOT scaled.
        marketCap: 5_296_654_000_000,
        fiftyTwoWeekHigh: 236.54,
        fiftyTwoWeekLow: 164.07,
        averageVolume: 149_150_655,
        annualisedDividend: 1,
        dividendYield: 0.47,
        oneYearTarget: 300,
      });
      // "N/A" fields are omitted rather than coerced.
      for (const value of Object.values(profile))
        if (typeof value === "number")
          expect(Number.isFinite(value)).toBe(true);
    });

    it("still answers when the summary is unavailable", async () => {
      stubFetch([
        ["/info?", QUOTE_NVDA],
        ["/summary?", upstreamError("Summary unavailable.")],
      ]);
      const profile = await new NasdaqProvider().getEquityProfile("NVDA");
      expect(profile.price).toBe(218.92);
      expect(profile.marketCap).toBeUndefined();
      expect(profile.fiftyTwoWeekHigh).toBeUndefined();
    });
  });

  describe("getEquityFinancials", () => {
    const FINANCIALS = ok({
      incomeStatementTable: {
        headers: {
          value1: "Period Ending:",
          value2: "1/25/2026",
          value3: "1/26/2025",
        },
        rows: [
          {
            value1: "Total Revenue",
            value2: "$215,938,000",
            value3: "$130,497,000",
          },
          { value1: "Operating Expenses", value2: "", value3: "" },
          { value1: "Income Tax", value2: "$21,383,000", value3: "-$187,000" },
          { value1: "Minority Interest", value2: "--", value3: "--" },
        ],
      },
      financialRatiosTable: {
        headers: {
          value1: "Period Ending:",
          value2: "1/25/2026",
          value3: "1/26/2025",
        },
        rows: [
          { value1: "Liquidity Ratios", value2: "", value3: "" },
          { value1: "Gross Margin", value2: "71.06808%", value3: "74.9887%" },
        ],
      },
    });

    it("scales statements out of thousands and leaves ratios alone", async () => {
      stubFetch([["/financials", FINANCIALS]]);
      const financials = await new NasdaqProvider().getEquityFinancials("NVDA");

      expect(financials.periods).toEqual(["1/25/2026", "1/26/2025"]);
      expect(financials.frequency).toBe("annual");
      expect(financials.incomeStatement[0]).toEqual({
        label: "Total Revenue",
        values: [215_938_000_000, 130_497_000_000],
      });
      expect(financials.ratios).toEqual([
        { label: "Gross Margin", values: [71.06808, 74.9887] },
      ]);
    });

    it("drops section headers and keeps a missing print as null", async () => {
      stubFetch([["/financials", FINANCIALS]]);
      const financials = await new NasdaqProvider().getEquityFinancials("NVDA");

      expect(financials.incomeStatement.map((row) => row.label)).toEqual([
        "Total Revenue",
        "Income Tax",
        "Minority Interest",
      ]);
      expect(financials.incomeStatement[2].values).toEqual([null, null]);
      expect(financials.ratios.map((row) => row.label)).toEqual([
        "Gross Margin",
      ]);
    });

    it("asks for the quarterly cadence with frequency=2", async () => {
      const fetchMock = stubFetch([["/financials", FINANCIALS]]);
      const financials = await new NasdaqProvider().getEquityFinancials(
        "NVDA",
        "quarterly",
      );
      expect(fetchMock.mock.calls[0][0]).toContain("frequency=2");
      expect(financials.frequency).toBe("quarterly");
    });
  });

  describe("getEarningsHistory", () => {
    const SURPRISE = ok({
      symbol: "nvda",
      earningsSurpriseTable: {
        rows: [
          {
            fiscalQtrEnd: "Apr 2026",
            dateReported: "5/20/2026",
            eps: 1.87,
            consensusForecast: "1.7",
            percentageSurprise: "10",
          },
          {
            fiscalQtrEnd: "Jan 2026",
            dateReported: "2/25/2026",
            eps: 1.57,
            consensusForecast: "1.45",
            percentageSurprise: "8.28",
          },
        ],
      },
    });

    it("converts reported dates to ISO and keeps the newest first", async () => {
      stubFetch([
        ["/earnings-surprise", SURPRISE],
        ["/calendar/earnings", ok({ rows: null })],
      ]);
      const history = await new NasdaqProvider().getEarningsHistory("NVDA");
      expect(history.results[0]).toEqual({
        fiscalQuarterEnd: "Apr 2026",
        dateReported: "2026-05-20",
        eps: 1.87,
        consensusEps: 1.7,
        surprisePct: 10,
      });
      expect(history.results[1].dateReported).toBe("2026-02-25");
      // Not scheduled today → no date invented.
      expect(history.nextReportDate).toBeUndefined();
    });

    it("picks up the next report when the company is on today's calendar", async () => {
      stubFetch([
        ["/earnings-surprise", SURPRISE],
        [
          "/calendar/earnings",
          ok({
            rows: [
              { time: "time-after-hours", symbol: "NVDA", name: "NVIDIA Corp" },
            ],
          }),
        ],
      ]);
      const history = await new NasdaqProvider().getEarningsHistory("NVDA");
      expect(history.nextReportDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(history.nextReportTime).toBe("after-hours");
    });

    it("still returns the track record when the calendar call fails", async () => {
      stubFetch([
        ["/earnings-surprise", SURPRISE],
        ["/calendar/earnings", upstreamError("Calendar unavailable.")],
      ]);
      const history = await new NasdaqProvider().getEarningsHistory("NVDA");
      expect(history.results).toHaveLength(2);
      expect(history.nextReportDate).toBeUndefined();
    });
  });

  describe("getEarningsCalendar", () => {
    it("answers [] for a session with nothing scheduled", async () => {
      // A weekend answers 200 with a POPULATED envelope whose rows are null —
      // the generic "data is null" guard never fires, so this path is its own.
      stubFetch([
        ["/calendar/earnings", ok({ asOf: "Sun, Aug 9, 2026", rows: null })],
      ]);
      await expect(
        new NasdaqProvider().getEarningsCalendar("2026-08-09"),
      ).resolves.toEqual([]);
    });

    it("maps a session's rows, omitting figures the exchange left blank", async () => {
      stubFetch([
        [
          "/calendar/earnings",
          ok({
            asOf: "Thu, Aug 6, 2026",
            rows: [
              {
                time: "time-pre-market",
                symbol: "COP",
                name: "ConocoPhillips",
                marketCap: "$143,685,595,186",
                epsForecast: "$2.96",
                noOfEsts: "6",
              },
              {
                time: "time-not-supplied",
                symbol: "PBR.A",
                name: "Petroleo Brasileiro S.A.- Petrobras",
                marketCap: "$120,638,538,652",
                epsForecast: "",
                noOfEsts: "1",
              },
            ],
          }),
        ],
      ]);
      const entries = await new NasdaqProvider().getEarningsCalendar(
        "2026-08-06",
      );
      expect(entries[0]).toEqual({
        symbol: "COP",
        companyName: "ConocoPhillips",
        date: "2026-08-06",
        time: "pre-market",
        consensusEps: 2.96,
        estimateCount: 6,
        marketCap: 143_685_595_186,
      });
      expect(entries[1].time).toBe("unknown");
      expect(entries[1].consensusEps).toBeUndefined();
    });

    it("refuses a date that isn't ISO", async () => {
      const fetchMock = stubFetch([]);
      await expect(
        new NasdaqProvider().getEarningsCalendar("8/6/2026"),
      ).rejects.toThrow(/YYYY-MM-DD/);
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  it("reads the analyst count out of the ratings blurb and leaves meanRating unset", async () => {
    stubFetch([
      [
        "/ratings",
        ok({
          symbol: "nvda",
          meanRatingType: "Buy",
          ratingsSummary:
            "Based on 39 analysts offering recommendations for 'NVDA'.",
          brokerNames: ["GOLDMAN SACHS", "MORGAN STANLEY"],
        }),
      ],
    ]);
    const ratings = await new NasdaqProvider().getAnalystRatings("xyz:NVDA");
    expect(ratings).toEqual({
      symbol: "NVDA",
      consensus: "Buy",
      analystCount: 39,
      brokers: ["GOLDMAN SACHS", "MORGAN STANLEY"],
    });
    // No numeric mean is published; mapping "Buy" onto 1–5 would be our invention.
    expect(ratings.meanRating).toBeUndefined();
  });

  it("scales the ownership fields labelled '(millions)'", async () => {
    stubFetch([
      [
        "/institutional-holdings",
        ok({
          ownershipSummary: {
            SharesOutstandingPCT: {
              label: "Institutional Ownership",
              value: "78.43%",
            },
            ShareoutstandingTotal: {
              label: "Total Shares Outstanding (millions)",
              value: "24,200",
            },
            TotalHoldingsValue: {
              label: "Total Value of Holdings (millions)",
              value: "$4,160,663",
            },
          },
          activePositions: {
            rows: [
              {
                positions: "Increased Positions",
                holders: "3,316",
                shares: "2,828,585,031",
              },
              {
                positions: "Decreased Positions",
                holders: "2,590",
                shares: "401,755,808",
              },
              {
                positions: "Held Positions",
                holders: "339",
                shares: "15,749,055,973",
              },
            ],
          },
        }),
      ],
    ]);
    const ownership = await new NasdaqProvider().getInstitutionalOwnership(
      "NVDA",
    );
    expect(ownership).toEqual({
      symbol: "NVDA",
      institutionalOwnershipPct: 78.43,
      // "24,200" is 24.2 BILLION shares, and the holdings value is $4.16tn.
      sharesOutstanding: 24_200_000_000,
      totalHoldingsValue: 4_160_663_000_000,
      increasedHolders: 3316,
      increasedShares: 2_828_585_031,
      decreasedHolders: 2590,
      decreasedShares: 401_755_808,
    });
  });

  it("reuses a cached financials payload instead of re-fetching", async () => {
    const fetchMock = stubFetch([
      [
        "/financials",
        ok({
          incomeStatementTable: {
            headers: { value1: "Period Ending:", value2: "1/25/2026" },
            rows: [{ value1: "Total Revenue", value2: "$215,938,000" }],
          },
        }),
      ],
    ]);
    const provider = new NasdaqProvider();
    const first = await provider.getEquityFinancials("NVDA");
    const second = await provider.getEquityFinancials("NVDA");
    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
