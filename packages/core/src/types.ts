/** Data needs a frame can declare; providers advertise which they fulfill. */
export type Capability =
  | "quote-stream"
  | "day-stats"
  | "funding-history"
  | "ohlcv"
  | "tvl"
  | "sentiment"
  | "global-market"
  | "reference-rates"
  | "treasury-rates"
  | "yield-curve"
  | "treasury-auctions"
  | "national-debt"
  | "financial-stress"
  | "macro-series"
  | "news"
  | "fundamentals"
  | "filings"
  | "short-volume"
  | "social";

export interface DayStats {
  markPx: number;
  prevDayPx: number;
  changePct: number;
}

/** One historical funding observation for a perp symbol. */
export interface FundingPoint {
  /** Epoch milliseconds. */
  time: number;
  /** Funding rate for the interval as a decimal, e.g. 0.0000125 = 0.00125%/h. */
  fundingRate: number;
}

/** One OHLCV candle. */
export interface Candle {
  /** Open time, epoch milliseconds. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

/** Total value locked for one chain/protocol. */
export interface TvlEntry {
  name: string;
  tvl: number;
}

/** One fear & greed index observation. */
export interface FearGreedPoint {
  /** 0 (extreme fear) … 100 (extreme greed). */
  value: number;
  classification: string;
  /** Epoch milliseconds. */
  time: number;
}

/** Global crypto market snapshot. */
export interface GlobalMarket {
  totalMarketCapUsd: number;
  marketCapChangePct24h: number;
  /** Market-cap dominance per asset symbol (lowercase), as percentages. */
  dominance: Record<string, number>;
}

/** One short-rate / repo reference rate observation from an official source. */
export interface ReferenceRate {
  code: string;
  label: string;
  /** ISO date, e.g. "2026-06-17". */
  date: string;
  /** Percent rate, e.g. 3.63. */
  rate: number;
  source: string;
  volumeInBillions?: number;
  targetRateFrom?: number;
  targetRateTo?: number;
  average30Day?: number;
  average90Day?: number;
  average180Day?: number;
}

/** Treasury average interest rate by security class. */
export interface TreasuryAverageRate {
  /** ISO date, e.g. "2026-05-31". */
  date: string;
  securityType: string;
  security: string;
  /** Percent rate, e.g. 3.69. */
  rate: number;
}

/** One maturity point on the Treasury yield curve. */
export interface YieldPoint {
  /** Display label, e.g. "3M", "2Y", "10Y". */
  label: string;
  /** Maturity in months (for ordering / axis spacing). */
  months: number;
  /** Par yield, percent, e.g. 4.46. */
  rate: number;
}

/** The US Treasury daily par yield curve for one date. */
export interface YieldCurve {
  /** ISO date of the curve, e.g. "2026-06-18". */
  date: string;
  /** Maturity points, shortest → longest. */
  points: YieldPoint[];
}

/** One completed US Treasury auction. */
export interface TreasuryAuction {
  /** ISO auction date, e.g. "2026-06-18". */
  auctionDate: string;
  /** Security class, e.g. "Bill", "Note", "Bond", "TIPS", "FRN". */
  securityType: string;
  /** Term as offered, e.g. "4-Week", "10-Year", "30-Year". */
  securityTerm: string;
  /**
   * Headline awarded rate, percent: high yield for notes/bonds, the
   * coupon-equivalent (high investment rate) for bills. Null when the auction
   * hasn't reported results yet.
   */
  rate: number | null;
  /** Bid-to-cover ratio (total bids ÷ amount accepted); higher = stronger demand. */
  bidToCover: number | null;
  /** Offering amount, USD. */
  offeringAmount: number | null;
  /** Total amount accepted, USD. */
  totalAccepted: number | null;
}

/** One observation in the national-debt history. */
export interface NationalDebtPoint {
  /** Epoch milliseconds at the record date. */
  time: number;
  /** ISO record date, e.g. "2026-06-17". */
  date: string;
  /** Total public debt outstanding, USD. */
  total: number;
}

/**
 * US total public debt outstanding from Treasury's "Debt to the Penny",
 * with the public vs intragovernmental split and a recent trend.
 */
export interface NationalDebt {
  /** ISO date of the latest reading, e.g. "2026-06-17". */
  date: string;
  /** Total public debt outstanding, USD. */
  total: number;
  /** Debt held by the public, USD. */
  heldByPublic: number;
  /** Intragovernmental holdings, USD. */
  intragovernmental: number;
  /** Recent history, oldest → newest, for a trend sparkline and change calc. */
  trend: NationalDebtPoint[];
}

/** One component's contribution to the OFR Financial Stress Index. */
export interface FinancialStressCategory {
  /** Category label, e.g. "Credit", "Volatility", "Funding". */
  label: string;
  /** Signed contribution to the index (can be negative). */
  value: number;
}

/** One observation in the financial-stress history. */
export interface FinancialStressPoint {
  /** Epoch milliseconds at the observation date. */
  time: number;
  /** ISO date, e.g. "2026-06-17". */
  date: string;
  /** Overall index value (0 = historical average; >0 stressed, <0 calm). */
  value: number;
}

/**
 * The OFR Financial Stress Index — a daily, market-based measure of systemic
 * financial stress. Zero is the historical average; positive = above-average
 * stress, negative = calmer-than-average conditions. Keyless official data.
 */
export interface FinancialStress {
  /** Latest overall index value. */
  value: number;
  /** ISO date of the latest reading. */
  date: string;
  /** Category contributions for the latest reading. */
  categories: FinancialStressCategory[];
  /** Recent history, oldest → newest, for a trend sparkline. */
  trend: FinancialStressPoint[];
  source: string;
}

/** One point in a macroeconomic time series. */
export interface MacroPoint {
  /** Epoch milliseconds at the period start. */
  time: number;
  /** Human-readable period, e.g. "May 2026". */
  date: string;
  value: number;
  period: string;
}

/** Macro series from an official public data source. */
export interface MacroSeries {
  seriesId: string;
  label: string;
  source: string;
  points: MacroPoint[];
}

/** One filing from SEC EDGAR. */
export interface SecFiling {
  /** Form type, e.g. "10-K", "10-Q", "8-K", "4". */
  form: string;
  /** ISO filing date, e.g. "2026-06-17". */
  filingDate: string;
  /** ISO period-of-report date when the form carries one, e.g. "2026-03-29". */
  reportDate?: string;
  /** EDGAR's short description, e.g. "FORM 4" — often empty. */
  description?: string;
  /** Accession number, e.g. "0001140361-26-025622". */
  accessionNumber: string;
  /** Comma-separated 8-K item codes when present, e.g. "5.02,9.01". */
  items?: string;
  /** Direct URL to the primary filing document (or its folder) on sec.gov. */
  url: string;
}

/**
 * Company profile and recent filings from SEC EDGAR's submissions endpoint.
 * Event-driven, official, keyless data — not a price feed.
 */
export interface SecCompanyFilings {
  /** Zero-padded 10-digit CIK, e.g. "0000320193". */
  cik: string;
  /** Registrant name, e.g. "Apple Inc.". */
  name: string;
  /** Tickers EDGAR associates with the registrant. */
  tickers: string[];
  /** Listing exchanges, e.g. ["Nasdaq"]. */
  exchanges: string[];
  /** Standard Industrial Classification code. */
  sic?: string;
  /** SIC description, e.g. "Electronic Computers". */
  sicDescription?: string;
  /** Filer category, e.g. "Large accelerated filer". */
  category?: string;
  /** Fiscal year end as "MMDD", e.g. "0926". */
  fiscalYearEnd?: string;
  /** Recent filings, newest first. */
  filings: SecFiling[];
}

/** One headline financial metric extracted from SEC XBRL company facts. */
export interface FinancialMetric {
  /** Human label, e.g. "Revenue", "Net income". */
  label: string;
  /** Most recent reported value (USD, shares, or per-share depending on unit). */
  value: number;
  /** XBRL unit, e.g. "USD", "USD/shares", "shares". */
  unit: string;
  /** Fiscal period end, ISO date e.g. "2025-09-27". */
  end: string;
  /** Readable fiscal period, e.g. "FY2025" or "Q3 2026". */
  fiscalPeriod: string;
  /** SEC form the value was reported on, e.g. "10-K". */
  form: string;
}

/**
 * A company's headline financials from SEC EDGAR XBRL company facts. Periodic,
 * official, keyless data (browser-reachable only via the runtime proxy).
 */
export interface CompanyFacts {
  /** Zero-padded 10-digit CIK. */
  cik: string;
  /** Registrant name, e.g. "Apple Inc.". */
  entityName: string;
  /** Headline metrics, in display order. */
  metrics: FinancialMetric[];
}

/**
 * One symbol's daily short-sale volume from FINRA's consolidated tape report.
 * This is *reported short volume* (sell-side short flow for the day, including
 * market-maker hedging) — NOT short interest (outstanding short positions).
 */
export interface ShortVolumeEntry {
  /** ISO date of the FINRA report, e.g. "2026-06-18". */
  date: string;
  /** Ticker as FINRA reports it, e.g. "TSLA". */
  symbol: string;
  /** Reported short volume (shares). */
  shortVolume: number;
  /** Short-exempt volume (shares), a subset of short volume. */
  shortExemptVolume: number;
  /** Total reported volume (shares). */
  totalVolume: number;
  /** shortVolume / totalVolume as a percent (0–100). */
  shortPct: number;
}

export type Unsubscribe = () => void;

/**
 * A data provider fulfills frame capabilities. Every data method is optional —
 * a provider implements the methods matching the capabilities it advertises,
 * and the host routes each frame's needs to the first provider covering them.
 *
 * Symbols are provider-native. Hyperliquid already namespaces HIP-3 builder
 * dexes ("xyz:TSLA", "km:US500"), so equity perps need no extra scheme.
 */
export interface MarketDataProvider {
  readonly name: string;
  readonly capabilities: readonly Capability[];
  /**
   * Stream mid prices; frames filter what they need. `symbols` is a hint so
   * providers can lazily widen coverage (e.g. subscribe extra HIP-3 dexes).
   */
  subscribeMids?(
    onMids: (mids: Record<string, number>) => void,
    symbols?: readonly string[],
  ): Unsubscribe;
  /** 24h stats per symbol. Omitting `symbols` returns the full universe. */
  getDayStats?(symbols?: string[]): Promise<Record<string, DayStats>>;
  /** Historical funding rates since startTimeMs. */
  getFundingHistory?(
    symbols: string[],
    startTimeMs: number,
  ): Promise<Record<string, FundingPoint[]>>;
  /** OHLCV candles. `interval` is provider-native, e.g. "1m" | "1h" | "1d". */
  getCandles?(
    symbol: string,
    interval: string,
    startTimeMs: number,
  ): Promise<Candle[]>;
  /** Total value locked per chain, descending. */
  getTvlByChain?(): Promise<TvlEntry[]>;
  /** Fear & greed index history, most recent first. */
  getFearGreed?(limit?: number): Promise<FearGreedPoint[]>;
  /** Global market snapshot (total mcap, dominance). */
  getGlobalMarket?(): Promise<GlobalMarket>;
  /** Official short-rate / repo reference rates. */
  getReferenceRates?(): Promise<ReferenceRate[]>;
  /** Treasury average interest rates by security class. */
  getTreasuryAverageRates?(): Promise<TreasuryAverageRate[]>;
  /** US Treasury daily par yield curve (latest available date). */
  getYieldCurve?(): Promise<YieldCurve>;
  /** Recent completed US Treasury auctions, newest first. */
  getTreasuryAuctions?(limit?: number): Promise<TreasuryAuction[]>;
  /** US total public debt outstanding, with a recent trend (`days` of history). */
  getNationalDebt?(days?: number): Promise<NationalDebt>;
  /** OFR Financial Stress Index — latest reading, category split, and trend. */
  getFinancialStress?(): Promise<FinancialStress>;
  /** Official macroeconomic time series. */
  getMacroSeries?(
    seriesId: string,
    startYear: number,
    endYear: number,
  ): Promise<MacroSeries>;
  /** SEC EDGAR company profile + recent filings, by ticker or CIK. */
  getCompanyFilings?(tickerOrCik: string): Promise<SecCompanyFilings>;
  /** SEC EDGAR XBRL headline financials, by ticker or CIK. */
  getCompanyFacts?(tickerOrCik: string): Promise<CompanyFacts>;
  /** FINRA daily reported short-sale volume, keyed by the requested symbol. */
  getShortVolume?(symbols: string[]): Promise<Record<string, ShortVolumeEntry>>;
}
