import type {
  AnalystRatings,
  Candle,
  Capability,
  DayStats,
  EarningsCalendarEntry,
  EarningsHistory,
  EarningsResult,
  EquityFinancials,
  EquityProfile,
  FinancialStatementRow,
  InstitutionalOwnership,
  MarketDataProvider,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";
import {
  dailyBarTime,
  earningsCalendarTime,
  easternDate,
  parseAnalystCount,
  parseHighLowPair,
  parseNumericCell,
  parseStatementTable,
  parseUsDate,
  periodKeys,
  scaleOrNull,
  tickerOf,
  type StatementTable,
} from "./parse";

/**
 * Keyless provider for the Nasdaq quote-page backend — the equity deep-dive
 * source in a fleet that is otherwise strong on crypto and US macro.
 *
 * `api.nasdaq.com` is what the exchange's own nasdaq.com quote pages call. It
 * takes no key, no token and no signup, which is what keeps this provider in
 * the keyless set, and it is the only free source in the fleet that publishes
 * all of: a consolidated listed quote, decades of daily bars, pre-aligned
 * multi-year financial statements, a reported-vs-consensus earnings record, a
 * market-wide earnings calendar, sell-side consensus, and 13F ownership
 * aggregates — eight capabilities off one host.
 *
 * **CORS:** the host sends no `Access-Control-Allow-Origin` at all, so *every*
 * call here passes `{ proxied: true }` — relayed through the runtime's
 * same-origin proxy in the browser (`api.nasdaq.com` is on the serve
 * allowlist), fetched direct in Node. The proxy's desktop-Chrome User-Agent is
 * also what makes these endpoints answer. On a static host with no runtime
 * these frames degrade to empty, like every other proxied provider.
 *
 * **This is an internal site API, and it is treated as one.** It is
 * undocumented, unversioned and carries no stability contract: fields can be
 * renamed or dropped, a shape can change without notice, and the host can
 * rate-limit or block outright. Three things follow, and they are the design of
 * this file rather than an afterthought. Every method **fails loudly** — a
 * response whose envelope reports failure, or whose payload yields nothing
 * parseable, throws with the upstream message instead of returning a
 * half-parsed object. Every read goes through a `TtlCache` with stale-on-error
 * on, so a transient block serves the last good value rather than blanking a
 * card. And every coercion in `parse.ts` returns `null` for an unreadable cell,
 * so a shape change surfaces as a missing field or a gap in a series — never as
 * a `NaN`, and never as a `0` that would draw a real trough where there is only
 * a missing print.
 *
 * Two published quirks worth knowing before reading the code, both confirmed
 * live: the summary endpoint misspells its 52-week key as `FiftTwoWeekHighLow`,
 * and the statement tables are denominated in thousands while the ratios table
 * beside them is not.
 */

const BASE_URL = "https://api.nasdaq.com";

/** These payloads are large (the calendar is ~250 KB) and pass through a relay. */
const REQUEST_TIMEOUT_MS = 15_000;

/** Two summary fields are labelled "(millions)" and read as such. */
const MILLIONS = 1e6;
/** Income / balance / cash-flow figures are published in thousands. */
const THOUSANDS = 1000;

const quoteUrl = (ticker: string) =>
  `${BASE_URL}/api/quote/${encodeURIComponent(ticker)}/info?assetclass=stocks`;
const summaryUrl = (ticker: string) =>
  `${BASE_URL}/api/quote/${encodeURIComponent(ticker)}/summary?assetclass=stocks`;
const historicalUrl = (
  ticker: string,
  from: string,
  to: string,
  limit: number,
) =>
  `${BASE_URL}/api/quote/${encodeURIComponent(ticker)}/historical` +
  `?assetclass=stocks&fromdate=${from}&todate=${to}&limit=${limit}`;
const financialsUrl = (ticker: string, frequency: 1 | 2) =>
  `${BASE_URL}/api/company/${encodeURIComponent(ticker)}/financials?frequency=${frequency}`;
const earningsSurpriseUrl = (ticker: string) =>
  `${BASE_URL}/api/company/${encodeURIComponent(ticker)}/earnings-surprise`;
const earningsCalendarUrl = (date: string) =>
  `${BASE_URL}/api/calendar/earnings?date=${date}`;
const ratingsUrl = (ticker: string) =>
  `${BASE_URL}/api/analyst/${encodeURIComponent(ticker)}/ratings`;
const ownershipUrl = (ticker: string) =>
  `${BASE_URL}/api/company/${encodeURIComponent(ticker)}/institutional-holdings?limit=5&type=TOTAL`;

// ── Response shapes ────────────────────────────────────────────────────────
// Only the fields actually read, typed loosely (everything optional) because the
// upstream contract can change under us — a missing field must reach a parse
// helper and become `null`, not throw a TypeError deep in a getter.

/** Every endpoint answers in this envelope, success or failure. */
interface Envelope<T> {
  data?: T | null;
  message?: string | null;
  status?: {
    rCode?: number;
    bCodeMessage?: { code?: number; errorMessage?: string }[] | string | null;
    developerMessage?: string | null;
  } | null;
}

interface QuoteSide {
  lastSalePrice?: string;
  netChange?: string;
  percentageChange?: string;
  volume?: string;
  lastTradeTimestamp?: string;
}

interface QuoteInfo {
  symbol?: string;
  companyName?: string;
  exchange?: string;
  marketStatus?: string;
  primaryData?: QuoteSide | null;
  secondaryData?: QuoteSide | null;
}

/** The summary endpoint's `{label, value}` map, keyed by its own field names. */
type SummaryData = Record<
  string,
  { label?: string; value?: string } | undefined
>;

interface QuoteSummary {
  summaryData?: SummaryData | null;
}

interface HistoricalData {
  totalRecords?: number;
  tradesTable?: {
    rows?:
      | {
          date?: string;
          close?: string;
          volume?: string;
          open?: string;
          high?: string;
          low?: string;
        }[]
      | null;
  } | null;
}

interface FinancialsData {
  incomeStatementTable?: StatementTable | null;
  balanceSheetTable?: StatementTable | null;
  cashFlowTable?: StatementTable | null;
  financialRatiosTable?: StatementTable | null;
}

interface EarningsSurpriseData {
  earningsSurpriseTable?: {
    rows?:
      | {
          fiscalQtrEnd?: string;
          dateReported?: string;
          eps?: number | string;
          consensusForecast?: string;
          percentageSurprise?: string;
        }[]
      | null;
  } | null;
}

interface CalendarData {
  asOf?: string | null;
  rows?:
    | {
        time?: string;
        symbol?: string;
        name?: string;
        marketCap?: string;
        epsForecast?: string;
        noOfEsts?: string;
      }[]
    | null;
}

interface RatingsData {
  meanRatingType?: string;
  ratingsSummary?: string;
  brokerNames?: unknown;
}

interface OwnershipData {
  ownershipSummary?: SummaryData | null;
  activePositions?: {
    rows?: { positions?: string; holders?: string; shares?: string }[] | null;
  } | null;
}

// ── Caches ─────────────────────────────────────────────────────────────────
// One instance per logical endpoint family, keyed by ticker (plus cadence or
// date where the endpoint takes one). TTLs sit just under the poll interval the
// consuming hook would sensibly use, so background polls still refresh while
// reloads and sibling cards on the same ticker reuse one download.
//
// Only the genuinely slow-moving payloads persist. Quote and summary carry live
// prices and must not survive a reload; historical and calendar are large (a
// busy calendar day is ~560 rows) and would crowd every other provider's small
// entries out of the ~5 MB origin quota.

const quoteCache = new TtlCache<QuoteInfo>({
  namespace: "zframes:nasdaq:quote",
  ttlMs: 45_000,
});
const summaryCache = new TtlCache<SummaryData>({
  namespace: "zframes:nasdaq:summary",
  ttlMs: 5 * 60_000,
});
const historyCache = new TtlCache<Candle[]>({
  namespace: "zframes:nasdaq:history",
  ttlMs: 4 * 60 * 60_000,
});
const financialsCache = new TtlCache<EquityFinancials>({
  namespace: "zframes:nasdaq:financials",
  ttlMs: 12 * 60 * 60_000,
  persist: true,
});
const earningsCache = new TtlCache<EarningsResult[]>({
  namespace: "zframes:nasdaq:earnings",
  ttlMs: 6 * 60 * 60_000,
  persist: true,
});
const calendarCache = new TtlCache<EarningsCalendarEntry[]>({
  namespace: "zframes:nasdaq:calendar",
  ttlMs: 6 * 60 * 60_000,
});
const ratingsCache = new TtlCache<AnalystRatings>({
  namespace: "zframes:nasdaq:ratings",
  ttlMs: 6 * 60 * 60_000,
  persist: true,
});
const ownershipCache = new TtlCache<InstitutionalOwnership>({
  namespace: "zframes:nasdaq:ownership",
  ttlMs: 12 * 60 * 60_000,
  persist: true,
});

// ── Transport ──────────────────────────────────────────────────────────────

/**
 * The best description of a failure the envelope offers. `message` is usually
 * null even on an error — an unknown ticker answers `rCode: 400` with the real
 * reason buried in `status.bCodeMessage[].errorMessage` ("Symbol not exists.").
 */
function upstreamMessage(body: Envelope<unknown> | null | undefined): string {
  if (body?.message) return body.message;
  const bCode = body?.status?.bCodeMessage;
  if (Array.isArray(bCode)) {
    const reasons = bCode
      .map((entry) => entry?.errorMessage)
      .filter((reason): reason is string => Boolean(reason));
    if (reasons.length > 0) return reasons.join("; ");
  } else if (typeof bCode === "string" && bCode) {
    return bCode;
  }
  const rCode = body?.status?.rCode;
  return rCode === undefined ? "no data" : `no data (rCode ${rCode})`;
}

/**
 * Nasdaq's bot mitigation answers a non-browser User-Agent by DROPPING the
 * connection — no status, no body, just a hang until the timeout fires. That is
 * far nastier than a 403: `curl` with a browser UA returns 200 in ~2s while the
 * transport's own descriptive UA gets `http=000`, so the endpoint looks healthy
 * to a human checking it by hand and dead to the provider.
 *
 * The browser path never sees this (the runtime proxy already relays with a
 * real Chrome UA), but every Node caller does — the CLI and, most visibly, the
 * scheduled provider-liveness monitor, which would file an outage issue every
 * run. `fetchJson` only sets its default UA when the caller hasn't, and skips
 * the header entirely in browsers where it is forbidden, so passing one here is
 * the sanctioned per-provider override.
 */
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const REQUEST_INIT: RequestInit = { headers: { "User-Agent": BROWSER_UA } };

/** Unwrap the envelope, throwing on anything that isn't a populated success. */
async function request<T>(url: string, label: string): Promise<T> {
  const body = await fetchJson<Envelope<T>>(url, undefined, {
    proxied: true,
    timeoutMs: REQUEST_TIMEOUT_MS,
    init: REQUEST_INIT,
  });
  const rCode = body?.status?.rCode;
  if (body?.data == null || (typeof rCode === "number" && rCode !== 200))
    throw new Error(`nasdaq ${label}: ${upstreamMessage(body)}`);
  return body.data;
}

/**
 * Like {@link request} but an absent payload is a legitimate answer rather than
 * a failure — the calendar reports "nothing scheduled" that way. A non-200
 * `rCode` still throws, so a real outage can't masquerade as a quiet day.
 */
async function requestOptional<T>(
  url: string,
  label: string,
): Promise<T | null> {
  const body = await fetchJson<Envelope<T>>(url, undefined, {
    proxied: true,
    timeoutMs: REQUEST_TIMEOUT_MS,
    init: REQUEST_INIT,
  });
  const rCode = body?.status?.rCode;
  if (typeof rCode === "number" && rCode !== 200)
    throw new Error(`nasdaq ${label}: ${upstreamMessage(body)}`);
  return body?.data ?? null;
}

/** Read a `{label, value}` entry out of a summary-style map. */
function summaryValue(data: SummaryData | null | undefined, key: string) {
  return data?.[key]?.value;
}

/** Spread-in an optional numeric field, skipping it entirely when unreadable. */
function optional<K extends string>(
  key: K,
  value: number | null | undefined,
): Partial<Record<K, number>> {
  return value === null || value === undefined
    ? {}
    : ({ [key]: value } as Record<K, number>);
}

/** Intervals the historical endpoint can serve — it publishes daily bars only. */
const DAILY_INTERVALS = new Set(["1d", "d", "1day", "day", "daily"]);

export class NasdaqProvider implements MarketDataProvider {
  readonly name = "nasdaq";
  readonly capabilities: readonly Capability[] = [
    "day-stats",
    "ohlcv",
    "equity-profile",
    "equity-financials",
    "earnings-history",
    "earnings-calendar",
    "analyst-ratings",
    "institutional-ownership",
  ];

  // ── Quote ────────────────────────────────────────────────────────────────

  private loadQuote(ticker: string): Promise<QuoteInfo> {
    return quoteCache.get(ticker, () =>
      request<QuoteInfo>(quoteUrl(ticker), `quote ${ticker}`),
    );
  }

  private loadSummary(ticker: string): Promise<SummaryData> {
    return summaryCache.get(ticker, async () => {
      const data = await request<QuoteSummary>(
        summaryUrl(ticker),
        `summary ${ticker}`,
      );
      if (!data.summaryData)
        throw new Error(`nasdaq summary ${ticker}: no summaryData in response`);
      return data.summaryData;
    });
  }

  /**
   * The summary is supporting detail on both the quote paths, so a failure
   * there must not cost the caller the quote itself. The quote endpoint stays
   * required — it carries the identity (symbol, company name) and the price.
   */
  private async loadSummaryOptional(
    ticker: string,
  ): Promise<SummaryData | null> {
    try {
      return await this.loadSummary(ticker);
    } catch {
      return null;
    }
  }

  /**
   * 24h stats per symbol. Unlike a venue provider there is no "full universe"
   * to fall back on here — a bare call would mean fanning out over every US
   * listing — so an empty request answers empty rather than melting the host.
   *
   * Symbols are fetched in parallel and settled independently: one bad ticker
   * (or one rate-limited call) drops its own entry instead of emptying the
   * board. Results are keyed by the symbol as *requested*, so a caller that
   * asked for "xyz:NVDA" finds it under that name.
   */
  async getDayStats(symbols?: string[]): Promise<Record<string, DayStats>> {
    if (!symbols?.length) return {};
    const settled = await Promise.allSettled(
      symbols.map(
        async (requested) =>
          [requested, await this.dayStatsFor(requested)] as const,
      ),
    );
    const out: Record<string, DayStats> = {};
    for (const result of settled) {
      if (result.status === "fulfilled") {
        const [requested, stats] = result.value;
        out[requested] = stats;
      }
    }
    return out;
  }

  private async dayStatsFor(requested: string): Promise<DayStats> {
    const ticker = tickerOf(requested);
    const quote = await this.loadQuote(ticker);
    const summary = await this.loadSummaryOptional(ticker);
    const primary = quote.primaryData ?? undefined;

    const markPx = parseNumericCell(primary?.lastSalePrice);
    if (markPx === null)
      throw new Error(`nasdaq quote ${ticker}: no last sale price`);

    // Previous close, best source first. The summary's own "Previous Close" is
    // the authoritative print. Failing that, derive it from the quote's
    // netChange — `lastSalePrice - netChange` is the close the published
    // percentageChange is measured against, so the two stay consistent by
    // construction. secondaryData is the last resort: it holds the previous
    // close during and before a session, but outside one the roles can present
    // differently and it may be *today's* close instead.
    const netChange = parseNumericCell(primary?.netChange);
    const prevDayPx =
      parseNumericCell(summaryValue(summary, "PreviousClose")) ??
      (netChange === null ? null : markPx - netChange) ??
      parseNumericCell(quote.secondaryData?.lastSalePrice);
    if (prevDayPx === null || prevDayPx <= 0)
      throw new Error(`nasdaq quote ${ticker}: no previous close`);

    // Prefer the exchange's own percentage; it already accounts for splits and
    // corporate actions between the two prints. Compute only as a fallback.
    const publishedChange = parseNumericCell(primary?.percentageChange);
    const changePct =
      publishedChange ?? ((markPx - prevDayPx) / prevDayPx) * 100;

    // No `dayNtlVlm`: the only volume this backend publishes on a quote is
    // session-to-date SHARE volume (`primaryData.volume` reads ~580k for NVDA
    // in the pre-market), which is neither notional nor a trailing 24h window.
    // Putting it in a USD field would understate the number by ~99% before the
    // open and mis-label it all day. Average daily share volume is on the
    // profile instead, where it is named for what it is.
    return { markPx, prevDayPx, changePct };
  }

  // ── Daily bars ───────────────────────────────────────────────────────────

  /**
   * Daily OHLCV bars since `startTimeMs`. Daily is the only cadence this
   * backend publishes, so a non-daily interval throws rather than silently
   * substituting one — a frame asking for hourly bars and getting daily ones
   * looks like it worked.
   */
  async getCandles(
    symbol: string,
    interval: string,
    startTimeMs: number,
  ): Promise<Candle[]> {
    if (!DAILY_INTERVALS.has(interval.trim().toLowerCase()))
      throw new Error(
        `nasdaq: interval "${interval}" is not available — this source publishes daily bars only (use "1d")`,
      );
    const ticker = tickerOf(symbol);
    // Day-granular bounds on the exchange's own calendar. This also keeps the
    // cache key from drifting: a frame computes `Date.now() - window` on every
    // mount, so a millisecond key would mint a fresh entry per reload — as a
    // date, the same chart reuses one entry all session.
    const from = easternDate(startTimeMs);
    const to = easternDate();
    return historyCache.get(`${ticker}|${from}|${to}`, () =>
      this.fetchCandles(ticker, from, to, startTimeMs),
    );
  }

  private async fetchCandles(
    ticker: string,
    from: string,
    to: string,
    startTimeMs: number,
  ): Promise<Candle[]> {
    // Ask for more rows than the window can hold (~5 trading days a week, plus
    // slack) — the endpoint caps the count itself, and a short limit silently
    // truncates the *oldest* end of the chart.
    const days = Math.ceil((Date.now() - startTimeMs) / 86_400_000);
    const limit = Math.min(Math.max(days + 10, 50), 10_000);
    const data = await request<HistoricalData>(
      historicalUrl(ticker, from, to, limit),
      `historical ${ticker}`,
    );
    const rows = data.tradesTable?.rows ?? [];
    const candles: Candle[] = [];
    for (const row of rows) {
      const time = dailyBarTime(row.date);
      const open = parseNumericCell(row.open);
      const high = parseNumericCell(row.high);
      const low = parseNumericCell(row.low);
      const close = parseNumericCell(row.close);
      if (
        time === undefined ||
        open === null ||
        high === null ||
        low === null ||
        close === null
      )
        continue;
      const volume = parseNumericCell(row.volume);
      candles.push({
        time,
        open,
        high,
        low,
        close,
        ...(volume === null ? {} : { volume }),
      });
    }
    // Rows arrive newest-first; charts need oldest→newest. Sorting rather than
    // reversing means a change of upstream order can't invert the series.
    candles.sort((a, b) => a.time - b.time);
    if (candles.length === 0 && rows.length > 0)
      throw new Error(`nasdaq historical ${ticker}: no parseable daily bars`);
    // Server-side `fromdate` already bounds the window; this only trims a bar
    // the exchange's calendar day rounded in.
    const floor = Date.parse(`${from}T00:00:00Z`);
    return candles.filter((candle) => candle.time >= floor);
  }

  // ── Profile ──────────────────────────────────────────────────────────────

  async getEquityProfile(symbol: string): Promise<EquityProfile> {
    const ticker = tickerOf(symbol);
    const quote = await this.loadQuote(ticker);
    const summary = await this.loadSummaryOptional(ticker);
    // NOTE the misspelling: upstream drops the "y" from "Fifty". Matching it is
    // required — "fixing" it silently loses the 52-week range.
    const range = parseHighLowPair(summaryValue(summary, "FiftTwoWeekHighLow"));
    const exchange = summaryValue(summary, "Exchange") ?? quote.exchange;
    const sector = summaryValue(summary, "Sector");
    const industry = summaryValue(summary, "Industry");
    return {
      symbol: ticker,
      companyName: quote.companyName ?? ticker,
      ...(exchange ? { exchange } : {}),
      ...(sector ? { sector } : {}),
      ...(industry ? { industry } : {}),
      ...optional("price", parseNumericCell(quote.primaryData?.lastSalePrice)),
      ...optional(
        "previousClose",
        parseNumericCell(summaryValue(summary, "PreviousClose")),
      ),
      // Already whole dollars here (5.3e12 for NVDA) — unlike the ownership
      // figures below, this one is NOT in millions.
      ...optional(
        "marketCap",
        parseNumericCell(summaryValue(summary, "MarketCap")),
      ),
      ...(range
        ? { fiftyTwoWeekHigh: range.high, fiftyTwoWeekLow: range.low }
        : {}),
      ...optional(
        "averageVolume",
        parseNumericCell(summaryValue(summary, "AverageVolume")),
      ),
      ...optional(
        "annualisedDividend",
        parseNumericCell(summaryValue(summary, "AnnualizedDividend")),
      ),
      ...optional(
        "dividendYield",
        parseNumericCell(summaryValue(summary, "Yield")),
      ),
      ...optional(
        "oneYearTarget",
        parseNumericCell(summaryValue(summary, "OneYrTarget")),
      ),
    };
  }

  // ── Financial statements ─────────────────────────────────────────────────

  async getEquityFinancials(
    symbol: string,
    frequency: "annual" | "quarterly" = "annual",
  ): Promise<EquityFinancials> {
    const ticker = tickerOf(symbol);
    return financialsCache.get(`${ticker}|${frequency}`, () =>
      this.fetchFinancials(ticker, frequency),
    );
  }

  private async fetchFinancials(
    ticker: string,
    frequency: "annual" | "quarterly",
  ): Promise<EquityFinancials> {
    const data = await request<FinancialsData>(
      financialsUrl(ticker, frequency === "quarterly" ? 2 : 1),
      `financials ${ticker}`,
    );
    const tables = [
      data.incomeStatementTable,
      data.balanceSheetTable,
      data.cashFlowTable,
      data.financialRatiosTable,
    ];
    // All four tables publish the same period columns; take them from whichever
    // arrived, so a single missing table doesn't cost the whole statement set.
    const headers = tables.find((table) => table?.headers)?.headers;
    const keys = periodKeys(headers);
    if (keys.length === 0)
      throw new Error(`nasdaq financials ${ticker}: no period columns`);

    const [incomeStatement, balanceSheet, cashFlow, ratios] = [
      parseStatementTable(data.incomeStatementTable, keys, THOUSANDS),
      parseStatementTable(data.balanceSheetTable, keys, THOUSANDS),
      parseStatementTable(data.cashFlowTable, keys, THOUSANDS),
      // Ratios are percents and multiples as published — scaling them by a
      // thousand would turn a 71% gross margin into 71,000.
      parseStatementTable(data.financialRatiosTable, keys, 1),
    ] as FinancialStatementRow[][];

    if (
      incomeStatement.length === 0 &&
      balanceSheet.length === 0 &&
      cashFlow.length === 0 &&
      ratios.length === 0
    )
      throw new Error(`nasdaq financials ${ticker}: no statement rows`);

    return {
      symbol: ticker,
      periods: keys.map((key) => headers?.[key] ?? ""),
      frequency,
      incomeStatement,
      balanceSheet,
      cashFlow,
      ratios,
    };
  }

  // ── Earnings ─────────────────────────────────────────────────────────────

  async getEarningsHistory(symbol: string): Promise<EarningsHistory> {
    const ticker = tickerOf(symbol);
    const results = await earningsCache.get(ticker, () =>
      this.fetchEarningsResults(ticker),
    );
    return { symbol: ticker, results, ...(await this.nextReport(ticker)) };
  }

  private async fetchEarningsResults(
    ticker: string,
  ): Promise<EarningsResult[]> {
    const data = await request<EarningsSurpriseData>(
      earningsSurpriseUrl(ticker),
      `earnings ${ticker}`,
    );
    const rows = data.earningsSurpriseTable?.rows ?? [];
    const results: EarningsResult[] = [];
    for (const row of rows) {
      const eps = parseNumericCell(row.eps);
      const dateReported = parseUsDate(row.dateReported);
      // Both are load-bearing and neither can be invented: a result with no EPS
      // says nothing, and a non-ISO date in an ISO field would misplace the
      // point on any timeline that consumes it.
      if (eps === null || !dateReported) continue;
      results.push({
        fiscalQuarterEnd: (row.fiscalQtrEnd ?? "").trim(),
        dateReported,
        eps,
        ...optional("consensusEps", parseNumericCell(row.consensusForecast)),
        ...optional("surprisePct", parseNumericCell(row.percentageSurprise)),
      });
    }
    if (results.length === 0)
      throw new Error(`nasdaq earnings ${ticker}: no reported quarters`);
    return results;
  }

  /**
   * The next scheduled report, when it can be had for **one** call.
   *
   * The surprise endpoint carries no forward date, and the only other place it
   * exists is the earnings calendar — which is per-date, so a general answer
   * would mean scanning weeks of dates on an undocumented host. Instead this
   * checks today's session only (a call the calendar cache usually already
   * holds) and leaves both fields undefined otherwise. That surfaces the date
   * on the day it matters most and never invents one. Best-effort throughout:
   * a calendar failure must not cost the caller its earnings history.
   */
  private async nextReport(
    ticker: string,
  ): Promise<Pick<EarningsHistory, "nextReportDate" | "nextReportTime">> {
    try {
      const scheduled = await this.getEarningsCalendar();
      const entry = scheduled.find((row) => row.symbol === ticker);
      return entry
        ? { nextReportDate: entry.date, nextReportTime: entry.time }
        : {};
    } catch {
      return {};
    }
  }

  /**
   * Companies scheduled to report on `date` (ISO), defaulting to the current
   * New York session. Upstream already orders the day by market cap, so a frame
   * taking the head gets the session's heavyweights.
   */
  async getEarningsCalendar(date?: string): Promise<EarningsCalendarEntry[]> {
    const day = date?.trim() || easternDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day))
      throw new Error(
        `nasdaq calendar: "${date}" is not an ISO date (expected YYYY-MM-DD)`,
      );
    return calendarCache.get(day, () => this.fetchCalendar(day));
  }

  private async fetchCalendar(day: string): Promise<EarningsCalendarEntry[]> {
    const data = await requestOptional<CalendarData>(
      earningsCalendarUrl(day),
      `calendar ${day}`,
    );
    // A weekend or holiday answers 200 with `{asOf, headers: null, rows: null}`
    // — a populated envelope carrying nothing. "Nobody reports today" is a real
    // answer, not a failure, so it must not throw and must not cache an error.
    const rows = data?.rows;
    if (!Array.isArray(rows)) return [];
    const entries: EarningsCalendarEntry[] = [];
    for (const row of rows) {
      const symbol = (row.symbol ?? "").trim().toUpperCase();
      if (!symbol) continue;
      entries.push({
        symbol,
        companyName: (row.name ?? "").trim(),
        date: day,
        time: earningsCalendarTime(row.time),
        ...optional("consensusEps", parseNumericCell(row.epsForecast)),
        ...optional("estimateCount", parseNumericCell(row.noOfEsts)),
        ...optional("marketCap", parseNumericCell(row.marketCap)),
      });
    }
    return entries;
  }

  // ── Coverage and ownership ───────────────────────────────────────────────

  async getAnalystRatings(symbol: string): Promise<AnalystRatings> {
    const ticker = tickerOf(symbol);
    return ratingsCache.get(ticker, async () => {
      const data = await request<RatingsData>(
        ratingsUrl(ticker),
        `ratings ${ticker}`,
      );
      const brokers = Array.isArray(data.brokerNames)
        ? data.brokerNames.filter(
            (broker): broker is string => typeof broker === "string",
          )
        : [];
      const analystCount = parseAnalystCount(data.ratingsSummary);
      if (!data.meanRatingType && brokers.length === 0 && !analystCount)
        throw new Error(`nasdaq ratings ${ticker}: no coverage in response`);
      // `meanRating` stays absent on purpose: this endpoint publishes a label
      // ("Buy") and nothing numeric, and mapping the label onto the spec's 1–5
      // scale would be our invention presented as the exchange's.
      return {
        symbol: ticker,
        ...(data.meanRatingType ? { consensus: data.meanRatingType } : {}),
        ...(analystCount === undefined ? {} : { analystCount }),
        brokers,
      };
    });
  }

  async getInstitutionalOwnership(
    symbol: string,
  ): Promise<InstitutionalOwnership> {
    const ticker = tickerOf(symbol);
    return ownershipCache.get(ticker, () => this.fetchOwnership(ticker));
  }

  private async fetchOwnership(
    ticker: string,
  ): Promise<InstitutionalOwnership> {
    const data = await request<OwnershipData>(
      ownershipUrl(ticker),
      `ownership ${ticker}`,
    );
    const summary = data.ownershipSummary;
    // Both of these are labelled "(millions)" upstream and read as such —
    // NVDA's 24.2bn shares print as "24,200". Note the lowercase "o" in
    // `ShareoutstandingTotal`; it is spelled that way on the wire.
    const sharesOutstanding = scaleOrNull(
      parseNumericCell(summaryValue(summary, "ShareoutstandingTotal")),
      MILLIONS,
    );
    const totalHoldingsValue = scaleOrNull(
      parseNumericCell(summaryValue(summary, "TotalHoldingsValue")),
      MILLIONS,
    );
    const institutionalOwnershipPct = parseNumericCell(
      summaryValue(summary, "SharesOutstandingPCT"),
    );

    let increasedHolders: number | null = null;
    let increasedShares: number | null = null;
    let decreasedHolders: number | null = null;
    let decreasedShares: number | null = null;
    for (const row of data.activePositions?.rows ?? []) {
      const position = (row.positions ?? "").trim().toLowerCase();
      if (position.startsWith("increased")) {
        increasedHolders = parseNumericCell(row.holders);
        increasedShares = parseNumericCell(row.shares);
      } else if (position.startsWith("decreased")) {
        decreasedHolders = parseNumericCell(row.holders);
        decreasedShares = parseNumericCell(row.shares);
      }
    }

    const ownership: InstitutionalOwnership = {
      symbol: ticker,
      ...optional("institutionalOwnershipPct", institutionalOwnershipPct),
      ...optional("sharesOutstanding", sharesOutstanding),
      ...optional("totalHoldingsValue", totalHoldingsValue),
      ...optional("increasedHolders", increasedHolders),
      ...optional("increasedShares", increasedShares),
      ...optional("decreasedHolders", decreasedHolders),
      ...optional("decreasedShares", decreasedShares),
    };
    // A response that parsed to nothing but the ticker is a shape change, not
    // an answer — throw so the cache serves the last good value instead.
    if (Object.keys(ownership).length === 1)
      throw new Error(`nasdaq ownership ${ticker}: no ownership figures`);
    return ownership;
  }
}
