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
  | "dex-volume"
  | "protocol-tvl"
  | "protocol-fees"
  // Crypto deep-dive: the per-asset research half of a crypto board. A token has
  // no filings, so "what is this, what does it earn, how diluted is it" is
  // answered by supply, protocol revenue and public dev activity instead.
  | "crypto-profile"
  | "protocol-fundamentals"
  | "token-unlocks"
  | "coin-markets"
  | "open-interest"
  | "btc-fees"
  | "btc-mempool"
  | "btc-blocks"
  | "btc-hashrate"
  | "btc-difficulty"
  | "mining-pools"
  | "lightning-stats"
  | "options-summary"
  | "volatility-index"
  | "coin-movers"
  | "fx-rates"
  | "onchain-valuation"
  | "price-history-daily"
  | "onchain-cycle-extras"
  | "dollar-index"
  | "stablecoins"
  | "yields"
  | "fees-overview"
  | "funding-comparison"
  | "eth-supply"
  | "prediction-markets"
  | "etf-flows"
  | "trending-coins"
  | "sector-performance"
  | "nft-market"
  | "dex-pools"
  | "chain-activity"
  | "order-book"
  | "metal-spot"
  | "metal-history"
  | "metal-positioning"
  | "gold-reserve"
  | "tokenized-gold"
  // Commodity deep-dive: a metal has no earnings, so "is this expensive" is
  // answered by its own implied-vol regime and by the real (inflation-adjusted)
  // price and macro backdrop — the commodity analogue of a valuation snapshot.
  | "commodity-vol-index"
  | "macro-reference-series"
  | "index-level"
  | "credit-spread"
  | "housing-price"
  | "mortgage-rate"
  | "home-value-index"
  | "regional-housing-price"
  // Equity deep-dive: the company-research half of a stocks-first board. These
  // answer "what is this business worth / what did it report / what does the
  // street think", which price and filings alone never do.
  | "fundamentals-history"
  | "equity-profile"
  | "equity-financials"
  | "earnings-history"
  | "earnings-calendar"
  | "analyst-ratings"
  | "institutional-ownership"
  | "options-chain"
  | "portfolio";

export interface DayStats {
  markPx: number;
  prevDayPx: number;
  changePct: number;
  /** Predicted hourly funding rate, decimal (e.g. 0.0000125 = 0.00125%/h). Only present when the wire payload carries it. */
  funding?: number;
  /** Trailing-24h notional trading volume, USD. */
  dayNtlVlm?: number;
  /** Mark price's premium over the oracle price, decimal fraction (e.g. 0.0003 = 3bps). */
  premium?: number;
  /** Oracle price the mark price is anchored to, USD. */
  oraclePx?: number;
  /** [bid, ask] impact prices at a fixed notional depth — used to estimate order-book spread/slippage. */
  impactPxs?: [number, number];
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

/** One currency's exchange rate vs a base, with a short trend. */
export interface FxRate {
  /** Quote currency code, e.g. "EUR" — units of this per 1 `base`. */
  symbol: string;
  /** Base currency the rate is quoted against, e.g. "USD". */
  base: string;
  /** Latest rate: how many `symbol` one `base` buys. */
  rate: number;
  /** Percent change vs the previous available (business) day. */
  changePct: number;
  /** Recent daily closes for a sparkline, oldest→newest. */
  history: SeriesPoint[];
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

/**
 * Bitcoin on-chain valuation snapshot — the market-vs-realized-value family
 * (MVRV, its Z-score, NUPL, realized price/cap). Sourced from a keyless
 * on-chain metrics API (Coin Metrics community tier). All values are the latest
 * daily reading; `history` carries the daily series (oldest→newest) each frame
 * charts. Derived quantities are computed by the provider: `nupl = 1 − 1/mvrv`,
 * `mvrvZScore = (marketCap − realizedCap) / stddev(marketCap over all history)`,
 * `realizedPrice = realizedCap / supply`.
 */
export interface OnchainValuation {
  /** ISO date of the latest reading, e.g. "2026-07-08". */
  date: string;
  /** Latest market (spot) price, USD. */
  price: number;
  /** Circulating supply, coins. */
  supply: number;
  /** Market cap = price × supply, USD. */
  marketCap: number;
  /** Realized cap — sum of each UTXO valued at its last-moved price, USD. */
  realizedCap: number;
  /** Realized price = realizedCap / supply, USD. */
  realizedPrice: number;
  /** MVRV ratio = marketCap / realizedCap. */
  mvrv: number;
  /** MVRV Z-score — how stretched market cap is above realized cap, in σ. */
  mvrvZScore: number;
  /** Net Unrealized Profit/Loss as a fraction (−1…1); = 1 − 1/mvrv. */
  nupl: number;
  /** Daily series, oldest→newest, for charts. */
  history: {
    price: SeriesPoint[];
    mvrv: SeriesPoint[];
    mvrvZScore: SeriesPoint[];
    nupl: SeriesPoint[];
    realizedPrice: SeriesPoint[];
  };
}

/**
 * Bitcoin on-chain cycle oscillators from a keyless full-history source
 * (bitcoin-data.com). Its free tier is hard-capped at 10 requests/hour, so a
 * provider fetches all of these behind ONE shared long-TTL poll. Any metric the
 * source didn't return is null. `history` carries a recent tail for sparklines.
 */
export interface OnchainExtras {
  /** ISO date of the latest reading. */
  date: string;
  /** SOPR — Spent Output Profit Ratio (>1 coins move in profit, <1 in loss). */
  sopr: number | null;
  /** Puell Multiple — daily issuance USD ÷ its 365-day average. */
  puell: number | null;
  /** Reserve Risk — conviction-vs-price; low = attractive risk/reward. */
  reserveRisk: number | null;
  /** Recent daily tail per metric, oldest→newest. */
  history: {
    sopr: SeriesPoint[];
    puell: SeriesPoint[];
    reserveRisk: SeriesPoint[];
  };
}

/**
 * Synthetic US Dollar Index (DXY) — the ICE-weighted geometric mean of six
 * USD pairs, computed from ECB reference rates (a keyless FX source). A live
 * tick isn't available keyless; this is the daily-granularity workaround.
 */
export interface DollarIndex {
  /** Latest DXY value. */
  value: number;
  /** Percent change vs the previous available business day. */
  changePct: number;
  /** Recent daily history, oldest→newest, for a trend line/sparkline. */
  history: SeriesPoint[];
}

/**
 * One live spot quote for a precious/industrial metal. Priced in USD per troy
 * ounce for the four precious metals (XAU/XAG/XPT/XPD) and USD per pound for
 * copper (HG), matching how each contract is quoted.
 */
export interface MetalSpot {
  /** Metal symbol: "XAU" | "XAG" | "XPT" | "XPD" | "HG". */
  symbol: string;
  /** Human name, e.g. "Gold". */
  name: string;
  /** Latest price, USD per troy ounce (copper: USD per pound). */
  price: number;
  /** Epoch milliseconds of the quote. */
  updatedAt: number;
  /**
   * Percent change vs `prevFix` — the most recent daily benchmark fix. Absent
   * when no benchmark history is available for the metal (copper has no LBMA
   * fix) or the history fetch failed.
   */
  changePct?: number;
  /** The daily benchmark the change is measured against (latest LBMA fix), USD. */
  prevFix?: number;
}

/**
 * A metal's daily benchmark-price history — the LBMA London fixes, the
 * reference price the physical market settles against. Decades deep (gold and
 * silver from 1968), so frames can slice their own window.
 */
export interface MetalHistory {
  /** Metal symbol: "XAU" | "XAG" | "XPT" | "XPD". */
  symbol: string;
  /** Quote currency, ISO 4217 — the LBMA publishes USD, GBP and EUR. */
  currency: string;
  /** Daily fix points, oldest → newest. */
  points: SeriesPoint[];
}

/**
 * One trader class in the CFTC's *disaggregated* Commitments-of-Traders report.
 *
 * Every field beyond `long`/`short` is published by the CFTC rather than
 * derived, so a frame reads the agency's own arithmetic instead of recomputing
 * it from a window that may be shorter than the one the agency used.
 */
export interface CotTraderClass {
  /** Long contracts held by this class. */
  long: number;
  /** Short contracts held by this class. */
  short: number;
  /** Spreading contracts (long and short in different months); some classes never spread. */
  spread?: number;
  /** Week-over-week change in longs, as published. */
  changeLong?: number;
  /** Week-over-week change in shorts, as published. */
  changeShort?: number;
  /** Week-over-week change in spreads, as published. */
  changeSpread?: number;
  /** Longs as a percent of total open interest (0–100), as published. */
  pctOfOiLong?: number;
  /** Shorts as a percent of total open interest (0–100), as published. */
  pctOfOiShort?: number;
  /** How many distinct reporting traders hold the long side. */
  tradersLong?: number;
  /** How many distinct reporting traders hold the short side. */
  tradersShort?: number;
}

/**
 * Position concentration in the largest reporting traders, percent (0–100).
 *
 * "Gross" counts a trader's long and short books separately; "net" nets them
 * first, so net is always ≤ gross. The gold market routinely runs above 50% of
 * gross shorts in four hands — a fact the legacy report cannot show at all.
 */
export interface CotConcentration {
  /** Percent of gross longs held by the largest 4 traders. */
  grossLong4: number;
  /** Percent of gross shorts held by the largest 4 traders. */
  grossShort4: number;
  /** Percent of gross longs held by the largest 8 traders. */
  grossLong8: number;
  /** Percent of gross shorts held by the largest 8 traders. */
  grossShort8: number;
  /** Percent of net longs held by the largest 4 traders. */
  netLong4?: number;
  /** Percent of net shorts held by the largest 4 traders. */
  netShort4?: number;
  /** Percent of net longs held by the largest 8 traders. */
  netLong8?: number;
  /** Percent of net shorts held by the largest 8 traders. */
  netShort8?: number;
}

/**
 * One week of the CFTC's *disaggregated* futures-only report — who holds the
 * position, not just the net.
 *
 * **Why this exists alongside the legacy fields on {@link CotWeek}:** the legacy
 * report's single `commercial` bucket lumps producer/merchant *hedging* together
 * with swap-dealer *bank* shorts. In metals those are opposite stories — a miner
 * selling forward is supply reaching the market, a dealer short is the other
 * side of an index long — and conflating them is the most common misreading of
 * gold positioning. The disaggregated report separates them, and additionally
 * publishes trader counts and concentration, which the legacy report omits.
 *
 * Published weekly from 2006-06-13 (the legacy series runs decades further
 * back), so the oldest weeks of a long window carry legacy fields only.
 */
export interface CotDisaggregated {
  /** Producer / merchant / processor / user — physical-market hedgers. */
  producerMerchant: CotTraderClass;
  /** Swap dealers — banks intermediating index and OTC exposure. */
  swapDealer: CotTraderClass;
  /** Managed money — CTAs, hedge funds and other registered money managers. */
  managedMoney: CotTraderClass;
  /** Other reportables — large traders fitting none of the above. */
  otherReportable: CotTraderClass;
  /** Non-reportable — positions below the reporting threshold ("small traders"). */
  nonReportable: CotTraderClass;
  /** Total distinct reporting traders in the market. */
  totalTraders?: number;
  /** Concentration in the largest 4 and 8 traders. */
  concentration?: CotConcentration;
  /** Contract unit exactly as published, e.g. "(CONTRACTS OF 100 TROY OUNCES)". */
  contractUnits?: string;
}

/** One weekly CFTC Commitments-of-Traders observation (legacy futures-only report). */
export interface CotWeek {
  /** Epoch milliseconds of the Tuesday the positions were reported for. */
  time: number;
  /** Total open interest, contracts. */
  openInterest: number;
  /** Non-commercial ("large speculator") long contracts. */
  noncommercialLong: number;
  /** Non-commercial short contracts. */
  noncommercialShort: number;
  /** Non-commercial spreading contracts (long and short in different months). */
  noncommercialSpread: number;
  /** Commercial (hedger / producer / merchant) long contracts. */
  commercialLong: number;
  /** Commercial short contracts. */
  commercialShort: number;
  /** Non-reportable ("small trader") long contracts. */
  nonreportableLong: number;
  /** Non-reportable short contracts. */
  nonreportableShort: number;
  /**
   * The same week from the disaggregated report, when the CFTC published one.
   * Absent for weeks before 2006-06-13, so a frame that needs it must handle a
   * mixed series rather than assuming every week carries it.
   */
  disaggregated?: CotDisaggregated;
}

/** Weekly CFTC positioning for one metal's US futures market. */
export interface MetalPositioning {
  /** Metal symbol: "XAU" | "XAG" | "XPT" | "XPD" | "HG". */
  symbol: string;
  /** Exchange market name as CFTC publishes it, e.g. "GOLD - COMMODITY EXCHANGE INC.". */
  market: string;
  /** Contract size in the metal's native unit (gold 100 oz, silver 5000 oz, copper 25000 lb) — makes notional derivable. */
  contractSize: number;
  /** Weekly observations, oldest → newest. */
  weeks: CotWeek[];
}

/** One line of the U.S. Treasury's monthly gold-reserve status report. */
export interface GoldReserveEntry {
  /** Holding facility, e.g. "Mint Held Gold - Deep Storage". */
  facility: string;
  /** Physical form, "Gold Bullion" or "Gold Coins". */
  form: string;
  /** Vault location, e.g. "Fort Knox, KY". */
  location: string;
  /** Fine troy ounces held. */
  ounces: number;
  /** Statutory book value, USD (gold is carried at $42.2222/oz, not market). */
  bookValueUsd: number;
}

/** The U.S. official gold reserve for one reporting month. */
export interface GoldReserve {
  /** Epoch milliseconds of the report date (month end). */
  asOf: number;
  /** Total fine troy ounces across every facility. */
  totalOunces: number;
  /** Total statutory book value, USD. */
  totalBookValueUsd: number;
  /** Per-facility/location lines, descending by ounces. */
  entries: GoldReserveEntry[];
}

/** A gold-backed token (1 token ≈ 1 troy ounce), with its premium to spot. */
export interface TokenizedGold {
  /** Provider coin id, e.g. "pax-gold". */
  id: string;
  /** Ticker, e.g. "PAXG". */
  symbol: string;
  /** Display name, e.g. "PAX Gold". */
  name: string;
  /** Token price, USD. */
  price: number;
  /** 24h price change, percent. */
  changePct: number;
  /** Market capitalisation, USD. */
  marketCap: number;
  /** Trailing-24h trading volume, USD. */
  volume24h: number;
  /** Circulating supply — one token is one troy ounce, so this is ounces vaulted. */
  ounces: number;
  /** Premium (+) or discount (−) vs spot gold, percent. Absent when spot is unavailable. */
  premiumPct?: number;
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
  /** Debt held by the public, USD. Present from the same fetch as `total`. */
  heldByPublic?: number;
  /** Intragovernmental holdings, USD. Present from the same fetch as `total`. */
  intragovernmental?: number;
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
  /** Credit category contribution (signed). Present from the same fetch as `value`. */
  credit?: number;
  /** Equity valuation category contribution (signed). */
  equityValuation?: number;
  /** Safe assets category contribution (signed). */
  safeAssets?: number;
  /** Funding category contribution (signed). */
  funding?: number;
  /** Volatility category contribution (signed). */
  volatility?: number;
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

/**
 * A published official series with its latest reading — the shape every
 * single-series official feed resolves to (a market index level, a credit
 * spread, a house-price index, a mortgage rate).
 *
 * Deliberately one type across four capabilities: they differ in what they
 * measure, not in shape, and a frame only needs `unit` to know whether to render
 * "335.10" or "6.66%". Distinct from {@link MacroSeries}, whose points carry a
 * human period label ("May 2026") because BLS publishes by period rather than
 * by observation date.
 */
export interface OfficialSeries {
  /** Publisher's series id, e.g. "SP500", "BAMLH0A0HYM2", "CSUSHPINSA". */
  seriesId: string;
  /** Display label, e.g. "S&P 500", "US High Yield OAS". */
  label: string;
  /**
   * What the values are, so a frame formats them without a per-series lookup:
   * `index` = a unitless level, `percent` = already in percent (6.66 = 6.66%),
   * `usd` = a dollar amount.
   */
  unit: "index" | "percent" | "usd";
  /** How often the publisher updates it. */
  frequency: "daily" | "weekly" | "monthly" | "quarterly";
  /** Most recent observed value. */
  latest: number;
  /** ISO date of the latest observation, e.g. "2026-07-31". */
  date: string;
  /**
   * Move from the previous observation. For `index`/`usd` this is a PERCENT
   * change; for `percent` (a rate or spread) it is a change in percentage
   * POINTS, because a spread going 2.84 → 2.87 is "+3bps", not "+1.1%".
   */
  change: number;
  /** Observations oldest → newest; missing prints (holidays) are dropped. */
  points: SeriesPoint[];
  /** Publisher credit, e.g. "FRED". */
  source: string;
}

/** One region's Zillow Home Value Index (ZHVI) reading and monthly history. */
export interface HomeValueEntry {
  /** Region label as Zillow publishes it: "United States", "Austin, TX". */
  region: string;
  /** Region granularity — "country" for the national row, "msa" for a metro. */
  kind: "country" | "msa";
  /** Two-letter state of the metro's principal city; absent nationally. */
  state?: string;
  /** Zillow's population size rank (0 = the national row, 1 = New York). */
  sizeRank: number;
  /** Latest typical home value, USD. */
  value: number;
  /** % change vs the previous month. */
  changePctMoM: number;
  /** % change vs twelve months earlier, when that far back is published. */
  changePctYoY?: number;
  /** Monthly values oldest → newest, USD. */
  points: SeriesPoint[];
}

/** Zillow ZHVI for a set of regions, all read from one published monthly file. */
export interface HomeValueIndex {
  /** One entry per requested region, in request order. */
  entries: HomeValueEntry[];
  /** ISO date of the newest monthly column in the file, e.g. "2026-06-30". */
  asOf: string;
  source: string;
}

/** One region's FHFA House Price Index series. */
export interface RegionalHousingSeries {
  /** Region key as published — a state code ("TX") or a metro name ("Austin, TX"). */
  region: string;
  /** Latest index value (FHFA rebases each series to 100 at its own start). */
  latest: number;
  /** Human-readable latest period, e.g. "2026 Q1". */
  period: string;
  /** % change vs four quarters earlier, when that much history exists. */
  changePctYoY?: number;
  /** Quarterly points oldest → newest, timed at each quarter's first day. */
  points: SeriesPoint[];
}

/**
 * FHFA House Price Index at sub-national granularity — the state/metro
 * counterpart to the single national {@link OfficialSeries} house-price index.
 */
export interface RegionalHousingPrice {
  /** One series per requested region, in request order. */
  series: RegionalHousingSeries[];
  /** Which published granularity was read. */
  level: "state" | "metro";
  source: string;
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

/** One reported observation of a single XBRL concept, oldest→newest in a series. */
export interface FinancialFact {
  /** Fiscal period end, ISO date e.g. "2026-01-25". */
  end: string;
  /** Period start, ISO date — absent for instant (balance-sheet) facts. */
  start?: string;
  /** Reported value in the concept's unit. */
  value: number;
  /** Readable fiscal period, e.g. "FY2026" or "Q3 2026". */
  fiscalPeriod: string;
  /** SEC form the value was reported on, e.g. "10-K". */
  form: string;
}

/**
 * One XBRL concept's full reported history, oldest→newest.
 *
 * **Why the concept is a list upstream, not a single tag:** issuers change the
 * tag they report a line under. NVIDIA's revenue runs on
 * `RevenueFromContractWithCustomerExcludingAssessedTax` only through FY2022 and
 * on a different tag after, so a series built from one tag ends mid-history and
 * reads as a data outage. A provider MUST merge across the concept's whole
 * alias chain (newest reporting wins on a tie) before returning this.
 */
export interface FinancialSeries {
  /** Human label, e.g. "Revenue". */
  label: string;
  /** XBRL unit, e.g. "USD", "USD/shares", "shares". */
  unit: string;
  /** Whether the facts are durational (income/cash-flow) or instant (balance-sheet). */
  kind: "duration" | "instant";
  /** Which XBRL tags actually contributed, in the order they were merged. */
  concepts: string[];
  /** Observations, oldest→newest. */
  facts: FinancialFact[];
}

/** A company's reported financial history from SEC EDGAR XBRL company facts. */
export interface CompanyFactsHistory {
  /** Zero-padded 10-digit CIK. */
  cik: string;
  /** Registrant name, e.g. "NVIDIA Corporation". */
  entityName: string;
  /** Which reporting cadence the duration series were filtered to. */
  cadence: "annual" | "quarterly";
  /** One series per headline metric, in display order. */
  series: FinancialSeries[];
}

/**
 * Exchange-published profile and valuation snapshot for one listed company —
 * the numbers a quote page shows beside the price. Market cap and the analyst
 * target come from the exchange; ratios that need earnings (P/E, P/S) are
 * derived by the frame, because no keyless source publishes them.
 */
export interface EquityProfile {
  /** Ticker as the exchange spells it, e.g. "NVDA". */
  symbol: string;
  /** Registrant name, e.g. "NVIDIA Corporation Common Stock". */
  companyName: string;
  /** Listing exchange, e.g. "NASDAQ-GS". */
  exchange?: string;
  /** Sector, e.g. "Technology". */
  sector?: string;
  /** Industry, e.g. "Semiconductors". */
  industry?: string;
  /** Last sale price, USD. */
  price?: number;
  /** Previous session's close, USD. */
  previousClose?: number;
  /** Market capitalisation, USD. */
  marketCap?: number;
  /** 52-week high, USD. */
  fiftyTwoWeekHigh?: number;
  /** 52-week low, USD. */
  fiftyTwoWeekLow?: number;
  /** Average daily share volume. */
  averageVolume?: number;
  /** Annualised dividend per share, USD. */
  annualisedDividend?: number;
  /** Indicated dividend yield as a percent (0–100). */
  dividendYield?: number;
  /** Consensus one-year price target, USD. */
  oneYearTarget?: number;
}

/** One line item of a published financial statement, across fiscal periods. */
export interface FinancialStatementRow {
  /** Line label exactly as published, e.g. "Total Revenue". */
  label: string;
  /**
   * Values aligned index-for-index with {@link EquityFinancials.periods}.
   * `null` where the publisher left the cell blank — never coerced to 0, which
   * would draw a real trough on a chart where there is only a missing print.
   */
  values: (number | null)[];
}

/**
 * Multi-year published financial statements for one company, newest period
 * first. Complements {@link CompanyFactsHistory}: the exchange's tables are
 * pre-aligned and carry ratios, while SEC XBRL is deeper and authoritative.
 */
export interface EquityFinancials {
  symbol: string;
  /** Period-end labels, newest first, e.g. ["1/25/2026", "1/26/2025"]. */
  periods: string[];
  /** "annual" or "quarterly" — which cadence these periods are. */
  frequency: "annual" | "quarterly";
  incomeStatement: FinancialStatementRow[];
  balanceSheet: FinancialStatementRow[];
  cashFlow: FinancialStatementRow[];
  /** Published ratios (margins, ROE, liquidity) as percentages or multiples. */
  ratios: FinancialStatementRow[];
}

/** One quarter's reported EPS against the consensus estimate that preceded it. */
export interface EarningsResult {
  /** Fiscal quarter end label, e.g. "Apr 2026". */
  fiscalQuarterEnd: string;
  /** ISO date the result was reported, e.g. "2026-05-20". */
  dateReported: string;
  /** Actual reported EPS. */
  eps: number;
  /** Consensus EPS forecast going into the print. */
  consensusEps?: number;
  /** Surprise as a percent of consensus; positive = beat. */
  surprisePct?: number;
}

/** A company's earnings track record plus its next scheduled report. */
export interface EarningsHistory {
  symbol: string;
  /** Past results, newest first. */
  results: EarningsResult[];
  /** ISO date of the next scheduled report, when the exchange publishes one. */
  nextReportDate?: string;
  /** Whether the next report lands before the open or after the close. */
  nextReportTime?: "pre-market" | "after-hours" | "unknown";
}

/** One company scheduled to report on a given session. */
export interface EarningsCalendarEntry {
  symbol: string;
  companyName: string;
  /** ISO date of the scheduled report. */
  date: string;
  time: "pre-market" | "after-hours" | "unknown";
  /** Consensus EPS forecast, when published. */
  consensusEps?: number;
  /** Number of estimates behind the consensus. */
  estimateCount?: number;
  /** Market capitalisation, USD — lets a frame rank the session's heavyweights. */
  marketCap?: number;
}

/** Sell-side coverage summary for one company. */
export interface AnalystRatings {
  symbol: string;
  /** Headline consensus, e.g. "Buy". */
  consensus?: string;
  /**
   * Consensus mapped to 1–5 (1 = strong buy, 5 = strong sell) when the
   * publisher gives a numeric mean; absent when only a label is published.
   */
  meanRating?: number;
  /** How many analysts contribute to the consensus. */
  analystCount?: number;
  /** Covering broker names, as published. */
  brokers: string[];
}

/** Institutional ownership summary for one company (13F aggregates). */
export interface InstitutionalOwnership {
  symbol: string;
  /** Share of shares outstanding held by institutions, percent (0–100). */
  institutionalOwnershipPct?: number;
  /** Total shares outstanding. */
  sharesOutstanding?: number;
  /** Total reported value of institutional holdings, USD. */
  totalHoldingsValue?: number;
  /** Holders that increased their position last quarter. */
  increasedHolders?: number;
  /** Shares added by those holders. */
  increasedShares?: number;
  /** Holders that decreased their position last quarter. */
  decreasedHolders?: number;
  /** Shares sold by those holders. */
  decreasedShares?: number;
}

/**
 * One listed option contract in a chain.
 *
 * ⚠️ `iv` here is a DECIMAL (0.42 = 42%), unlike {@link OptionsSummary.avgIv}
 * and {@link OptionsStrikeOi.callIv}, which carry the venue's unscaled percent.
 * The two shapes coexist because the aggregate summary predates the chain; a
 * provider filling both must scale, and a frame must not mix them on one axis.
 */
export interface OptionContract {
  /** OCC-style contract id, e.g. "NVDA260821C00220000". */
  contract: string;
  /** Expiry, ISO date e.g. "2026-08-21". */
  expiry: string;
  /** Strike price, USD. */
  strike: number;
  side: "call" | "put";
  /** Implied volatility as a decimal (0.42 = 42%); 0 upstream means "no quote". */
  iv?: number;
  openInterest: number;
  volume: number;
  bid?: number;
  ask?: number;
  lastPrice?: number;
  delta?: number;
  gamma?: number;
  vega?: number;
  theta?: number;
  rho?: number;
}

/**
 * A listed option chain, per underlying — deliberately asset-class-agnostic.
 * The same expiry/strike/side/IV/OI fields describe a crypto venue's book, a
 * listed equity and a metal ETF (GLD/SLV chains come off the same Cboe feed),
 * so one frame reads all three and the card picks its feed with `source`.
 *
 * Greeks are present only where the feed publishes them: the delayed exchange
 * feed does, a crypto book-summary call does NOT (they exist there only
 * per-instrument, i.e. one request per contract), so a frame must hide those
 * columns rather than render an empty grid.
 */
export interface OptionsChain {
  /** Underlying ticker, e.g. "NVDA". */
  symbol: string;
  /** Underlying last price, USD. */
  underlyingPrice?: number;
  /** 30-day implied volatility index for the underlying, decimal. */
  iv30?: number;
  /** Minutes the quotes lag real time (15 for a delayed feed, 0 for live). */
  delayMinutes: number;
  contracts: OptionContract[];
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

/**
 * One news headline, normalised across different upstream RSS outlet feeds.
 */
export interface NewsItem {
  /** Headline text. */
  title: string;
  /** Canonical article URL (opened in a new tab). */
  url: string;
  /** Display name of the outlet/source, e.g. "CoinDesk". */
  source: string;
  /** Publication time, epoch milliseconds, when the feed provides one. */
  publishedAt?: number;
  /** Short plain-text excerpt/summary, when the feed provides one. */
  summary?: string;
  /**
   * Article thumbnail URL (https), when the feed provides one — RSS
   * `media:content` / `media:thumbnail` / `enclosure`. Loaded directly in an
   * `<img>` (not CORS-bound), so it needs no proxy; absent for feeds that carry
   * no media (CNBC, Nasdaq, Google News).
   */
  imageUrl?: string;
}

/** What a `news` provider is asked for: a named outlet feed, optionally scoped to symbols. */
export interface NewsQuery {
  /**
   * Named outlet feed to pull, e.g. "coindesk", "cnbc". The special feed
   * "yahoo" is a per-symbol headline feed and reads `symbols`.
   */
  feed: string;
  /** Symbols to scope a per-symbol feed (the Yahoo Finance headline feed). */
  symbols?: readonly string[];
  /** Max items to return. */
  limit?: number;
}

/** One observation in a generic numeric time series (epoch ms → value). */
export interface SeriesPoint {
  /** Epoch milliseconds. */
  time: number;
  value: number;
}

/** 24h trading volume for one DEX protocol. */
export interface DexVolumeEntry {
  name: string;
  /** Trailing-24h volume, USD. */
  volume24h: number;
  /** 1-day change in volume, percent (when the source reports it). */
  changePct?: number;
}

/** Current total value locked for one DeFi protocol. */
export interface ProtocolTvlEntry {
  name: string;
  /** Current TVL, USD. */
  tvl: number;
  /** DeFiLlama category, e.g. "Dexes", "Lending", "Liquid Staking". */
  category?: string;
  /** 1-day change in TVL, percent (when the source reports it). */
  changePct?: number;
}

/** Trailing-24h protocol fees for one DeFi protocol. */
export interface ProtocolFeesEntry {
  name: string;
  /** Fees accrued in the last 24h, USD. */
  fees24h: number;
  /** 1-day change, percent (when the source reports it). */
  changePct?: number;
}

/** One coin's market-cap snapshot. */
export interface CoinMarketEntry {
  /** Upper-case ticker, e.g. "BTC". */
  symbol: string;
  /** Display name, e.g. "Bitcoin". */
  name: string;
  /** Market capitalisation, USD. */
  marketCapUsd: number;
  /** 24h price change, percent (when the source reports it). */
  changePct24h?: number;
}

/**
 * Public development activity behind a crypto asset.
 *
 * A token has no filings, so this is the nearest available read on whether
 * anything is still being built — the crypto stand-in for the qualitative half
 * of a company profile. It is a weak signal on purpose: it measures one public
 * repository, so a monorepo, a rename or a private fork all distort it.
 */
export interface CryptoDeveloperActivity {
  stars?: number;
  forks?: number;
  /** Repository watchers/subscribers. */
  subscribers?: number;
  totalIssues?: number;
  closedIssues?: number;
  pullRequestsMerged?: number;
  pullRequestContributors?: number;
  /** Commits in the trailing four weeks. */
  commits4Weeks?: number;
}

/**
 * Identity, supply and valuation snapshot for ONE crypto asset — the crypto
 * analogue of an equity profile.
 *
 * The supply fields are the point of it. An equity's share count is in its
 * filings; a token's is the whole investment case, and the gap between
 * `circulatingSupply` and `totalSupply`/`maxSupply` (and so between
 * `marketCap` and `fullyDilutedValuation`) is the dilution a price chart alone
 * never shows. Everything past identity is optional because coverage thins
 * fast below the majors — a frame must render what it has.
 */
export interface CryptoAssetProfile {
  /** Provider-native asset id, e.g. "bitcoin" — NOT the ticker. */
  id: string;
  /** Upper-case ticker, e.g. "BTC". */
  symbol: string;
  /** Display name, e.g. "Bitcoin". */
  name: string;
  /** Plain-text description as published (markup stripped). */
  description?: string;
  /** Publisher's taxonomy, e.g. ["Layer 1", "Smart Contract Platform"]. */
  categories: string[];
  /** Market-cap rank, 1 = largest. */
  marketCapRank?: number;
  /** Canonical links, when published. */
  links?: {
    homepage?: string;
    sourceCode?: string;
    twitter?: string;
    subreddit?: string;
    whitepaper?: string;
  };
  /** Last price, USD. */
  price?: number;
  /** Market capitalisation (circulating supply × price), USD. */
  marketCap?: number;
  /** Fully diluted valuation (total/max supply × price), USD. */
  fullyDilutedValuation?: number;
  /** 24h traded volume, USD. */
  volume24h?: number;
  /** Tokens in circulation. */
  circulatingSupply?: number;
  /** Tokens issued, including locked/vesting. */
  totalSupply?: number;
  /** Hard supply cap; absent when the asset is uncapped (most are). */
  maxSupply?: number;
  /** All-time high, USD. */
  ath?: number;
  /** ISO date of the all-time high. */
  athDate?: string;
  /** Percent below the all-time high now (negative). */
  athChangePct?: number;
  /** All-time low, USD. */
  atl?: number;
  /** ISO date of the all-time low. */
  atlDate?: string;
  /** Percent above the all-time low now. */
  atlChangePct?: number;
  changePct24h?: number;
  changePct7d?: number;
  changePct30d?: number;
  changePct1y?: number;
  /** Public repository activity, when the publisher tracks one. */
  developer?: CryptoDeveloperActivity;
}

/**
 * A protocol's fee and revenue history — the crypto analogue of an income
 * statement, and the only keyless basis for a real valuation multiple.
 *
 * **`fees` and `revenue` are different lines and the distinction decides the
 * multiple.** `fees` is everything users paid to use the protocol; `revenue` is
 * only the part the protocol itself kept — the rest accrues to liquidity
 * providers, suppliers or stakers. Dividing market cap by *fees* flatters a
 * protocol that passes almost everything through, so a price-to-sales analogue
 * must use `revenue`.
 *
 * Distinct from {@link ProtocolFeesEntry}, which is a cross-protocol 24h
 * snapshot list (a leaderboard). This is one protocol, in depth, over time.
 */
export interface ProtocolFundamentals {
  /** Publisher's protocol slug, e.g. "uniswap". */
  protocol: string;
  /** Display name, e.g. "Uniswap". */
  name: string;
  /** Daily total fees paid by users, USD, oldest → newest. */
  fees: SeriesPoint[];
  /** Daily protocol revenue, USD, oldest → newest. Empty when unpublished. */
  revenue: SeriesPoint[];
  /** Trailing 30-day total fees, USD. */
  fees30d?: number;
  /** Trailing 365-day total fees, USD. */
  fees365d?: number;
  /** Trailing 30-day total revenue, USD. */
  revenue30d?: number;
  /** Trailing 365-day total revenue, USD — the denominator of a P/S analogue. */
  revenue365d?: number;
  /** Current total value locked, USD, when the publisher reports it. */
  tvl?: number;
}

/** One scheduled or already-passed token-unlock event. */
export interface TokenUnlockEvent {
  /** Epoch ms the tokens unlock. Can be in the FUTURE — that is the point. */
  time: number;
  /** Who it unlocks to, as published: "Team", "Investors", "Ecosystem", … */
  category: string;
  /** Publisher's description of the event. */
  description?: string;
  /** Tokens unlocking in this event. */
  tokens: number;
  /** How it releases — a cliff, or a linear stream — as published. */
  unlockType?: string;
}

/**
 * A token's emission and unlock schedule.
 *
 * **The only forward-looking supply information in the fleet**, and the crypto
 * analogue of a share-lockup expiry: every other supply number here describes
 * what has already been issued, while this says what is *about* to be. For a
 * token whose insiders hold a third of the supply on a vesting cliff, it is the
 * single most decision-relevant fact on a research card, and a price chart
 * cannot express it.
 *
 * `schedule` deliberately runs past today — a frame should draw the boundary
 * between observed and scheduled rather than plotting one continuous line, or
 * the projection reads as history.
 */
export interface TokenUnlocks {
  /** Publisher's protocol slug, e.g. "arbitrum". */
  protocol: string;
  /**
   * Cumulative unlocked/circulating supply over time, oldest → newest,
   * INCLUDING scheduled future points.
   */
  schedule: SeriesPoint[];
  /** Epoch ms of the last OBSERVED point — everything after it is projection. */
  observedThrough?: number;
  /** Max supply as the publisher models it. */
  maxSupply?: number;
  /** Share of supply held by insiders today, percent (0–100). */
  insiderPctNow?: number;
  /** Share of supply insiders hold once fully vested, percent (0–100). */
  insiderPctFinal?: number;
  /** How far through the documented schedule the token is, percent (0–100). */
  progressPct?: number;
  /** Upcoming unlock events, soonest first. */
  upcoming: TokenUnlockEvent[];
}

/** Live open interest for one perp symbol (single venue). */
export interface OpenInterestEntry {
  /** Provider-native symbol, e.g. "BTC", "xyz:TSLA". */
  symbol: string;
  /** Open interest as USD notional (base-unit OI × mark price). */
  openInterestUsd: number;
}

/** Recommended on-chain fee tiers (sat/vB) from a mempool source. */
export interface BtcFees {
  /** Next-block inclusion. */
  fastest: number;
  halfHour: number;
  hour: number;
  economy: number;
  minimum: number;
}

/** One projected ("template") block the mempool will likely mine next. */
export interface ProjectedBlock {
  /** Median fee rate, sat/vB. */
  medianFee: number;
  /** [min, …, max] sat/vB fee spread across the block. */
  feeRange: number[];
  /** Total fees in the projected block, sats. */
  totalFees: number;
  /** Transaction count. */
  nTx: number;
  /** Virtual size, vB. */
  blockVSize: number;
}

/** Current mempool congestion + the next few projected blocks. */
export interface MempoolState {
  /** Unconfirmed transaction count. */
  count: number;
  /** Total vsize of the mempool, vB. */
  vsize: number;
  /** Sum of fees of all mempool txs, sats. */
  totalFee: number;
  /** Projected blocks, next-to-mine first (typically up to 8). */
  projected: ProjectedBlock[];
}

/** One recently mined block (normalised). */
export interface BtcBlock {
  /** Block hash. */
  id: string;
  height: number;
  /** Mined-at, epoch milliseconds. */
  time: number;
  txCount: number;
  /** Block size, bytes. */
  size: number;
  /** Total fees paid in the block, sats. */
  totalFees: number;
  /** Median fee rate, sat/vB. */
  medianFee: number;
  /** Mining pool display name, e.g. "Foundry USA". */
  poolName: string;
  /** Mining pool slug, e.g. "foundryusa". */
  poolSlug: string;
}

/** One observation in the hashrate history. */
export interface HashratePoint {
  /** Epoch milliseconds. */
  time: number;
  /** Average network hashrate, H/s. */
  hashrate: number;
}

/** One observation in the difficulty history. */
export interface DifficultyPoint {
  /** Epoch milliseconds. */
  time: number;
  difficulty: number;
}

/** Network hashrate + difficulty over a window, with current readings. */
export interface NetworkHashrate {
  /** Latest network hashrate, H/s. */
  currentHashrate: number;
  currentDifficulty: number;
  /** Hashrate history, oldest → newest. */
  hashrates: HashratePoint[];
  /** Difficulty history, oldest → newest. */
  difficulty: DifficultyPoint[];
}

/** Countdown + estimate to the next Bitcoin difficulty retarget. */
export interface DifficultyAdjustment {
  /** Progress through the current 2016-block epoch, percent (0–100). */
  progressPercent: number;
  /** Signed estimated % change at the NEXT retarget (+ = harder). */
  difficultyChange: number;
  /** Signed % change applied at the PREVIOUS retarget. */
  previousRetarget: number;
  /** Blocks left until the retarget. */
  remainingBlocks: number;
  /** Time left until the retarget, milliseconds. */
  remainingTimeMs: number;
  /** Estimated retarget moment, epoch milliseconds. */
  estimatedRetargetDate: number;
  /** Block height of the next retarget. */
  nextRetargetHeight: number;
  /** Average block time this epoch, ms (target = 600_000). */
  avgBlockTimeMs: number;
}

/** One mining pool's share over a window. */
export interface MiningPool {
  name: string;
  slug: string;
  /** Blocks mined in the window. */
  blockCount: number;
  /** Share of window blocks, percent (0–100). */
  sharePct: number;
  rank: number;
}

/** Mining-pool dominance over a window. */
export interface MiningPools {
  /** Window label echoed back, e.g. "1w". */
  window: string;
  /** Total blocks in the window (denominator for share). */
  totalBlocks: number;
  /** Pools in rank order. */
  pools: MiningPool[];
}

/** Lightning Network summary stats. */
export interface LightningStats {
  nodeCount: number;
  channelCount: number;
  /** Total public capacity, sats. */
  totalCapacity: number;
  torNodes: number;
  clearnetNodes: number;
  /** Median channel capacity, sats. */
  medCapacity: number;
  /** Prior-day snapshot for a delta (when present). */
  prevNodeCount?: number;
  prevChannelCount?: number;
  prevTotalCapacity?: number;
}

/** Call vs put open interest at one strike. */
export interface OptionsStrikeOi {
  strike: number;
  /** Call open interest at this strike (contracts). */
  callOi: number;
  /** Put open interest at this strike (contracts). */
  putOi: number;
  /** Call mark implied vol % when a call is listed here (e.g. 58.4 = 58.4%, matching `OptionsSummary.avgIv`'s unscaled convention). */
  callIv?: number;
  /** Put mark implied vol % when a put is listed here. */
  putIv?: number;
}

/** Per-strike call/put OI for one expiry. */
export interface OptionsExpiryStrikes {
  /** Expiry label as Deribit names it, e.g. "27JUN26". */
  expiry: string;
  /** Expiry as epoch ms (for sorting / "nearest"). */
  expiryMs: number;
  /** Strikes ascending; one row per strike present in the book. */
  strikes: OptionsStrikeOi[];
}

/** Aggregated options-market summary for one currency (BTC/ETH), one snapshot. */
export interface OptionsSummary {
  /** Upper-case currency, e.g. "BTC". */
  currency: string;
  /** Reference spot/underlying price (USD) for ATM context. */
  underlyingPrice: number;
  /** Put/call ratio by total open interest (sum putOI / sum callOI). */
  putCallRatioOi: number;
  /** Put/call ratio by 24h contract volume. */
  putCallRatioVolume: number;
  /** Total call open interest (contracts). */
  callOi: number;
  /** Total put open interest (contracts). */
  putOi: number;
  /** Total 24h call volume (contracts). */
  callVolume: number;
  /** Total 24h put volume (contracts). */
  putVolume: number;
  /** Open-interest-weighted mean implied vol % across the book (ATM-ish proxy). */
  avgIv: number;
  /** Per-strike OI for the single nearest expiry, ascending by strike. */
  nearestExpiry: OptionsExpiryStrikes;
  /** Every expiry present in the book (not just nearest), nearest-first — lets a frame build a strike-vs-expiry ladder or compare a derived metric (e.g. max pain) across the term structure. */
  allExpiries?: OptionsExpiryStrikes[];
  /** Epoch ms the snapshot was built. */
  asOf: number;
}

/** One point on a volatility index (DVOL) series. */
export interface VolatilityPoint {
  /** Epoch ms. */
  time: number;
  /** Index value (annualised IV %, e.g. 38.7). */
  value: number;
}

/** One coin's multi-window price-change snapshot across the broad market. */
export interface CoinMover {
  /** Upper-case ticker, e.g. "BTC". */
  symbol: string;
  /** Display name, e.g. "Bitcoin". */
  name: string;
  /** Market-cap rank (1 = largest). Lets a frame exclude illiquid dust. */
  rank: number;
  /** Spot price, USD. */
  priceUsd: number;
  /** Market capitalisation, USD. */
  marketCapUsd: number;
  /** 24h volume, USD — a liquidity floor for filtering dust pumps. */
  volume24hUsd: number;
  /** % price change per window. Keys: "1h" | "24h" | "7d" | "30d". */
  changePct: Record<string, number>;
}

/** A connected-account portfolio source: a keyed CEX account or an on-chain address. */
export type PortfolioSourceKind = "binance" | "wallet";

/** Identifies which account/address a portfolio frame is bound to. */
export interface PortfolioSource {
  /** Which kind of source — routes to the provider that serves it. */
  kind: PortfolioSourceKind;
  /** For on-chain sources: the public address or ENS name. */
  address?: string;
}

/** One asset position in a connected portfolio. */
export interface Holding {
  /** Display/native symbol, e.g. "BTC", "ETH", "TSLA". */
  symbol: string;
  /** Quantity held. */
  amount: number;
  /**
   * USD value of the position when the provider prices it directly. Omit to let
   * frames value it live from streamed mids (amount × mid).
   */
  valueUsd?: number;
  /** Average cost basis per unit, USD — keyed sources with trade history only. */
  costBasisUsd?: number;
  /** 24h price change percent for the asset, when the provider supplies it. */
  changePct24h?: number;
}

/**
 * A snapshot of a connected account's holdings. Produced identically by keyed
 * (Binance) and keyless (on-chain wallet) providers, so the portfolio frames are
 * source-agnostic — they consume this regardless of where it came from.
 */
export interface Portfolio {
  /** Which source kind produced this snapshot. */
  source: PortfolioSourceKind;
  /** Human label for the account, e.g. "Binance · main" or "0x12…ab". */
  label?: string;
  /** Positions held. */
  holdings: Holding[];
  /** Total USD value when the provider computes it; else frames sum the holdings. */
  totalUsd?: number;
  /** Epoch milliseconds the snapshot was taken. */
  asOf: number;
}

export type Unsubscribe = () => void;

/** Total stablecoin supply — a market-wide liquidity-regime gauge. */
export interface StablecoinSupply {
  /** Total USD-pegged stablecoin circulating supply, USD. */
  totalUsd: number;
  /** Percent change vs 1 day / 7 days / 30 days ago. */
  changePct1d: number;
  changePct7d: number;
  changePct30d: number;
  /** Coarse trend: [30d ago, 7d ago, 1d ago, now], for a sparkline. */
  history: SeriesPoint[];
  /** Largest chains by stablecoin circulating supply, descending. */
  topChains: { name: string; usd: number }[];
}

/** One DeFi yield pool. */
export interface YieldPool {
  /** DeFiLlama pool uuid. */
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  /** Total value locked, USD. */
  tvlUsd: number;
  /** Total APY, percent. */
  apy: number;
  /** Base (organic) APY, percent, when reported. */
  apyBase: number | null;
  /** Reward (incentive) APY, percent, when reported. */
  apyReward: number | null;
  /** 7-day APY change, percentage points, when reported. */
  apyPct7D: number | null;
  /** Whether the pool is a stablecoin pool. */
  stablecoin: boolean;
  /** Impermanent-loss risk flag ("no" | "yes"). */
  ilRisk: string;
}

/** Aggregate DeFi fees/revenue snapshot with a trend. */
export interface FeesOverview {
  /** Trailing-24h protocol fees across all of DeFi, USD. */
  total24h: number;
  /** Trailing-7d fees, USD (when reported). */
  total7d: number | null;
  /** 1-day change in 24h fees, percent (when reported). */
  changePct: number | null;
  /** Daily fees history, oldest→newest. */
  history: SeriesPoint[];
}

/** One venue's funding rate for a coin, annualized for cross-venue comparison. */
export interface FundingVenueRate {
  /** Venue label, e.g. "Hyperliquid", "Binance", "Bybit". */
  venue: string;
  /** Raw funding rate for the interval, decimal. */
  rawRate: number;
  /** Funding interval in hours (varies by venue — 1h vs 8h vs 4h). */
  intervalHours: number;
  /** Annualized funding, percent (rawRate × periods-per-year × 100). */
  annualizedPct: number;
}

/** Cross-venue predicted funding for one coin. */
export interface FundingComparison {
  /** Coin symbol, e.g. "BTC". */
  coin: string;
  /** Per-venue annualized funding. */
  venues: FundingVenueRate[];
  /** Max − min annualized funding across venues, percentage points. */
  spreadPct: number;
}

/** Ethereum supply economics — EIP-1559 burn vs PoS issuance, net growth, staking. */
export interface EthSupply {
  /** Current total ETH supply, coins. */
  supply: number;
  /** Annualized burn, ETH/yr. */
  burnRateYearlyEth: number;
  /** Annualized PoS issuance, ETH/yr. */
  issuanceRateYearlyEth: number;
  /** Net annual supply growth, percent (negative = deflationary). */
  supplyGrowthYearlyPct: number;
  /** Counterfactual PoW annual supply growth, percent. */
  supplyGrowthYearlyPowPct: number;
  /** Total staking yield, percent (issuance + MEV + tips APR). */
  stakingAprPct: number;
  /** Live burn, ETH/minute. */
  burnEthPerMin: number;
  /** Recent supply history, oldest→newest, for a sparkline. */
  history: SeriesPoint[];
}

/** One outcome of a prediction market, with its implied probability. */
export interface PredictionOutcome {
  /** Outcome label, e.g. "Yes". */
  label: string;
  /** Market-implied probability, 0–1. */
  prob: number;
}

/** One prediction-market question with outcome probabilities. */
export interface PredictionMarket {
  /** The market question. */
  question: string;
  /** Outcomes with implied probabilities. */
  outcomes: PredictionOutcome[];
  /** Trailing-24h volume, USD. */
  volume24h: number;
  /** ISO end date. */
  endDate: string;
}

/** One issuer's spot-ETF flow figures. */
export interface EtfIssuerFlow {
  ticker: string;
  institute: string;
  /** Latest-day net inflow, USD (negative = outflow). */
  dailyNetInflow: number;
  /** Net assets under management, USD. */
  netAssets: number;
  /** Cumulative net inflow since inception, USD. */
  cumNetInflow: number;
}

/** Spot-ETF flows for one asset (BTC or ETH), per-issuer + total, with history. */
export interface EtfFlows {
  /** "btc" | "eth". */
  asset: string;
  /** ISO date of the latest reading. */
  date: string;
  /** Latest-day total net inflow across all issuers, USD. */
  dailyTotalNetInflow: number;
  /** Cumulative net inflow, USD. */
  cumNetInflow: number;
  /** Total net assets across all issuers, USD. */
  totalNetAssets: number;
  /** Per-issuer breakdown, descending by net assets. */
  issuers: EtfIssuerFlow[];
  /** Daily total-net-inflow history, oldest→newest. */
  history: SeriesPoint[];
}

/** One trending coin (by search interest). */
export interface TrendingCoin {
  id: string;
  name: string;
  symbol: string;
  /** Market-cap rank, when known. */
  rank: number | null;
  /** Current price, USD, when reported. */
  price: number | null;
  /** 24h price change, percent, when reported. */
  changePct24h: number | null;
}

/** One market sector / category with its aggregate performance. */
export interface MarketSector {
  name: string;
  /** Aggregate market cap, USD. */
  marketCap: number;
  /** 24h market-cap change, percent. */
  changePct24h: number;
}

/** One NFT collection's market snapshot (floor, volume, sales). */
export interface NftCollection {
  /** CoinGecko collection id/slug, e.g. "bored-ape-yacht-club". */
  id: string;
  /** Human display name, e.g. "Bored Ape Yacht Club". */
  name: string;
  /** Floor price in the collection's native currency (usually ETH). */
  floorNative: number;
  /** Floor price in USD. */
  floorUsd: number;
  /** 24h change in the floor price, percent (USD basis). */
  floorChangePct24h: number;
  /** Collection market cap in USD (floor × supply). */
  marketCapUsd: number;
  /** Trailing-24h trading volume in USD. */
  volume24hUsd: number;
  /** Number of sales in the last 24h. */
  sales24h: number;
}

/** One DEX liquidity pool / trading pair with 24h activity. */
export interface DexPool {
  /** Pool/pair label, e.g. "PEPE / WETH". */
  name: string;
  /** Network id the pool trades on, e.g. "eth", "solana", "base". */
  network: string;
  /** Base-token spot price in USD. */
  priceUsd: number;
  /** Trailing-24h volume in USD. */
  volume24hUsd: number;
  /** 24h price change, percent. */
  changePct24h: number;
  /** Total pool liquidity (reserve) in USD. */
  reserveUsd: number;
  /** Fully-diluted valuation of the base token in USD (0 if unknown). */
  fdvUsd: number;
  /** Trade count in the last 24h (buys + sells). */
  txns24h: number;
}

/** One price level in an order book, with the depth cumulated from the top. */
export interface OrderBookLevel {
  /** Level price, in the pair's quote currency. */
  price: number;
  /** Resting size at this level, in the base asset. */
  size: number;
  /** Size summed from the best level through this one, in the base asset. */
  cumulativeSize: number;
}

/** A two-sided order-book snapshot, best level first on both sides. */
export interface OrderBook {
  /** Base asset ticker the book is for, e.g. "KUB". */
  symbol: string;
  /** Venue-native pair id, e.g. "KUB_THB". */
  pair: string;
  /** Bids, highest price first. */
  bids: OrderBookLevel[];
  /** Asks, lowest price first. */
  asks: OrderBookLevel[];
  /** Midpoint of the best bid and best ask, quote currency. 0 if either side is empty. */
  mid: number;
  /** Best-bid/best-ask spread as a percent of `mid`. */
  spreadPct: number;
}

/** One blockchain's headline network activity over the last 24h. */
export interface ChainActivity {
  /** Blockchair chain slug, e.g. "bitcoin", "ethereum". */
  chain: string;
  /** Human display label, e.g. "Bitcoin". */
  label: string;
  /** Confirmed transactions in the last 24h. */
  transactions24h: number;
  /** Blocks produced in the last 24h. */
  blocks24h: number;
  /** Transactions currently waiting in the mempool. */
  mempoolTxns: number;
  /** Spot price of the chain's native asset in USD. */
  priceUsd: number;
  /** 24h change in the native asset price, percent. */
  priceChangePct24h: number;
}

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
  /** FX rates for `symbols` quoted against `base`, each with a short trend. */
  getFxRates?(base: string, symbols: string[]): Promise<FxRate[]>;
  /** Synthetic US Dollar Index (DXY) — latest value, change, and trend. */
  getDollarIndex?(): Promise<DollarIndex>;
  /** Bitcoin on-chain valuation (MVRV, MVRV-Z, NUPL, realized price/cap). */
  getOnchainValuation?(): Promise<OnchainValuation>;
  /**
   * Long daily close series for `asset` (default BTC), oldest→newest — enough
   * history (years) to drive cycle multiples (Mayer, Pi Cycle, 2Y/4Y-MA, RSI).
   */
  getDailyCloseHistory?(asset?: string): Promise<SeriesPoint[]>;
  /** Bitcoin on-chain cycle oscillators (SOPR, Puell, Reserve Risk). */
  getOnchainExtras?(): Promise<OnchainExtras>;
  /** Total stablecoin supply + change + per-chain distribution. */
  getStablecoinSupply?(): Promise<StablecoinSupply>;
  /** DeFi yield pools (descending by TVL); frames filter/sort client-side. */
  getYieldPools?(): Promise<YieldPool[]>;
  /** Aggregate DeFi fees/revenue with a daily trend. */
  getFeesOverview?(): Promise<FeesOverview>;
  /** Cross-venue predicted funding per coin (spread across venues). */
  getFundingComparison?(): Promise<FundingComparison[]>;
  /** Ethereum supply economics (burn/issuance/net growth/staking). */
  getEthSupply?(): Promise<EthSupply>;
  /** Prediction-market questions with outcome probabilities, by volume. */
  getPredictionMarkets?(limit?: number): Promise<PredictionMarket[]>;
  /** Spot-ETF flows for `asset` ("btc" | "eth"): per-issuer + total + history. */
  getEtfFlows?(asset: string): Promise<EtfFlows>;
  /** Trending coins (by search interest). */
  getTrendingCoins?(): Promise<TrendingCoin[]>;
  /** Market sectors / categories with aggregate performance. */
  getSectorPerformance?(): Promise<MarketSector[]>;
  /** Blue-chip NFT collections: floor, 24h change, market cap, volume, sales. */
  getNftMarket?(): Promise<NftCollection[]>;
  /**
   * Trending/hot DEX pools for a network (default the provider's own), each with
   * base-token price, 24h volume/change, liquidity and trade count.
   */
  getDexPools?(network?: string): Promise<DexPool[]>;
  /** Cross-chain network activity (tx count, blocks, mempool, price) per chain. */
  getChainActivity?(): Promise<ChainActivity[]>;
  /**
   * Order-book snapshot for one base asset (e.g. "KUB"), `depth` levels per
   * side. The provider maps the ticker onto its own pair id.
   */
  getOrderBook?(symbol: string, depth?: number): Promise<OrderBook>;
  /**
   * Live metal spot quotes. Omitting `symbols` returns the provider's full
   * metal universe; order follows the request.
   */
  getMetalSpot?(symbols?: string[]): Promise<MetalSpot[]>;
  /**
   * Daily benchmark-price history per metal (LBMA fixes), oldest→newest.
   * `currency` selects the LBMA's published quote currency (USD/GBP/EUR).
   */
  getMetalHistory?(
    symbols: string[],
    currency?: string,
  ): Promise<MetalHistory[]>;
  /** Weekly CFTC Commitments-of-Traders positioning for one metal's futures market. */
  getMetalPositioning?(symbol: string): Promise<MetalPositioning>;
  /** The U.S. Treasury's monthly official gold-reserve status report. */
  getGoldReserve?(): Promise<GoldReserve>;
  /** Gold-backed tokens (PAXG, XAUT) with their premium/discount to spot. */
  getTokenizedGold?(): Promise<TokenizedGold[]>;
  /**
   * Daily history of a listed commodity implied-volatility index (GVZ for gold,
   * VXSLV for silver, VXGDX for gold miners, OVX for oil) — the metals
   * counterpart of the VIX that the equity side reads through `index-level`.
   * Keyed by the publisher's index symbol.
   */
  getCommodityVolIndex?(indexId: string): Promise<OfficialSeries>;
  /**
   * A macro reference series to sit a commodity against — CPI (to deflate a
   * nominal price into a real one), the 10-year TIPS real yield, the broad
   * dollar index, the 10-year inflation breakeven.
   *
   * Deliberately three-ways separate from its neighbours, because routing is
   * first-match per capability and each pairing would mis-route:
   *  - from {@link getIndexSeries} (`index-level`), the *market index* subset —
   *    S&P, VIX, Nasdaq — served by the same provider;
   *  - from {@link getMacroSeries} (`macro-series`), which is BLS's published
   *    CPI/unemployment series in a period-labelled shape, served by a provider
   *    that sits EARLIER in the routing order and would swallow these ids;
   *  - from the credit/housing/mortgage getters, which are fixed single series.
   */
  getMacroReferenceSeries?(seriesId: string): Promise<OfficialSeries>;
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
  /**
   * Level history for one market index (e.g. the S&P 500, VIX, Nasdaq
   * Composite). `seriesId` is the publisher's own id, so the caller picks the
   * index; a provider that doesn't publish it should throw rather than
   * substitute another.
   */
  getIndexSeries?(seriesId: string): Promise<OfficialSeries>;
  /**
   * Corporate-bond option-adjusted spreads, one series per credit grade
   * (high-yield first, then investment-grade) — returned together because the
   * pair is only meaningful side by side.
   */
  getCreditSpreads?(): Promise<OfficialSeries[]>;
  /** National house-price index (e.g. Case-Shiller), monthly. */
  getHousingPriceIndex?(): Promise<OfficialSeries>;
  /** Benchmark 30-year fixed mortgage rate, weekly. */
  getMortgageRates?(): Promise<OfficialSeries>;
  /**
   * Typical home value per region (Zillow ZHVI). Omitting `regions` returns the
   * provider's curated set; region labels are publisher-native ("Austin, TX").
   */
  getHomeValueIndex?(regions?: string[]): Promise<HomeValueIndex>;
  /**
   * House-price index per state or metro. `level` selects the published
   * granularity ("state" | "metro"); region keys are level-native — a two-letter
   * code at state level, a metro name at metro level.
   */
  getRegionalHousingPrice?(
    regions: string[],
    level?: string,
  ): Promise<RegionalHousingPrice>;
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
  /**
   * SEC EDGAR XBRL reported history — every fact behind the headline metrics,
   * oldest→newest, merged across each concept's tag aliases.
   */
  getCompanyFactsHistory?(
    tickerOrCik: string,
    cadence?: "annual" | "quarterly",
  ): Promise<CompanyFactsHistory>;
  /** Exchange profile + valuation snapshot for one listed company. */
  getEquityProfile?(symbol: string): Promise<EquityProfile>;
  /** Published multi-period financial statements for one listed company. */
  getEquityFinancials?(
    symbol: string,
    frequency?: "annual" | "quarterly",
  ): Promise<EquityFinancials>;
  /** Reported-vs-consensus earnings track record plus the next scheduled date. */
  getEarningsHistory?(symbol: string): Promise<EarningsHistory>;
  /**
   * Companies scheduled to report on `date` (ISO, default the next session).
   * Market-wide, not per-symbol.
   */
  getEarningsCalendar?(date?: string): Promise<EarningsCalendarEntry[]>;
  /** Sell-side consensus and covering brokers for one company. */
  getAnalystRatings?(symbol: string): Promise<AnalystRatings>;
  /** Institutional (13F) ownership aggregates for one company. */
  getInstitutionalOwnership?(symbol: string): Promise<InstitutionalOwnership>;
  /**
   * Listed option chain for one underlying. Serves both crypto venues and
   * listed-equity feeds, so frames read strikes/expiries/IV/OI the same way
   * whatever the asset class.
   */
  getOptionsChain?(symbol: string): Promise<OptionsChain>;
  /** FINRA daily reported short-sale volume, keyed by the requested symbol. */
  getShortVolume?(symbols: string[]): Promise<Record<string, ShortVolumeEntry>>;
  /** Latest headlines from a named outlet feed (RSS), newest first. */
  getNews?(query: NewsQuery): Promise<NewsItem[]>;
  /** Trailing-24h trading volume per DEX protocol, descending. */
  getDexVolume?(): Promise<DexVolumeEntry[]>;
  /** Historical daily DEX volume per protocol slug. */
  getDexVolumeHistory?(slugs: string[]): Promise<Record<string, SeriesPoint[]>>;
  /** Current TVL per DeFi protocol, descending. */
  getProtocolTvl?(): Promise<ProtocolTvlEntry[]>;
  /** Historical TVL per protocol slug. */
  getProtocolTvlHistory?(
    slugs: string[],
  ): Promise<Record<string, SeriesPoint[]>>;
  /** Trailing-24h protocol fees per protocol, descending. */
  getProtocolFees?(): Promise<ProtocolFeesEntry[]>;
  /**
   * Identity, supply and valuation snapshot for one crypto asset.
   *
   * `asset` is a ticker ("BTC") or the publisher's own id ("bitcoin"); a
   * provider whose API is keyed by id must resolve the ticker itself, since a
   * frame's symbol field holds tickers.
   */
  getCryptoProfile?(asset: string): Promise<CryptoAssetProfile>;
  /**
   * One protocol's fee and revenue history — the crypto income statement.
   * Keyed by the publisher's protocol slug ("uniswap"), not a token ticker.
   */
  getProtocolFundamentals?(protocol: string): Promise<ProtocolFundamentals>;
  /**
   * One token's emission and unlock schedule, including scheduled FUTURE
   * unlocks. Keyed by the publisher's protocol slug, like
   * {@link getProtocolFundamentals}.
   */
  getTokenUnlocks?(protocol: string): Promise<TokenUnlocks>;
  /** Coin market-cap snapshots, descending by market cap. */
  getCoinMarkets?(): Promise<CoinMarketEntry[]>;
  /**
   * Live open interest per perp symbol (single venue). Omitting `symbols`
   * returns the provider's full universe; a "<dex>:*" wildcard returns that
   * dex's entire universe.
   */
  getOpenInterest?(symbols?: string[]): Promise<OpenInterestEntry[]>;
  /** Recommended on-chain fee tiers (sat/vB). */
  getBtcFees?(): Promise<BtcFees>;
  /** Current mempool congestion + projected blocks. */
  getMempoolState?(): Promise<MempoolState>;
  /** Most recently mined blocks, newest first. */
  getBtcBlocks?(limit?: number): Promise<BtcBlock[]>;
  /** Network hashrate + difficulty over a window ("1y" | "2y" | "3y" | …). */
  getNetworkHashrate?(window: string): Promise<NetworkHashrate>;
  /** Countdown + estimate to the next difficulty retarget. */
  getDifficultyAdjustment?(): Promise<DifficultyAdjustment>;
  /** Mining-pool dominance over a window ("24h" | "3d" | "1w" | …). */
  getMiningPools?(window: string): Promise<MiningPools>;
  /** Lightning Network summary stats. */
  getLightningStats?(): Promise<LightningStats>;
  /** Aggregated options summary (PCR, OI-by-strike, avg IV) for one currency. */
  getOptionsSummary?(currency: string): Promise<OptionsSummary>;
  /** Volatility-index (DVOL) history for one currency since startTimeMs. */
  getVolatilityIndex?(
    currency: string,
    startTimeMs: number,
    resolutionSec: number,
  ): Promise<VolatilityPoint[]>;
  /**
   * Broad multi-window price-change snapshots across the market, descending by
   * market cap. `limit` caps how many coins to pull (provider may cap lower).
   */
  getCoinMovers?(limit?: number): Promise<CoinMover[]>;
  /**
   * Which portfolio source kinds this provider serves — routing for the
   * "portfolio" capability, since several providers may advertise it (a keyed
   * CEX vs an on-chain wallet). A provider implementing `getPortfolio` lists the
   * kinds it handles here; the host routes by kind.
   */
  readonly portfolioKinds?: readonly PortfolioSourceKind[];
  /**
   * A connected account's holdings — a keyed CEX account or an on-chain address.
   * Providers advertising "portfolio" implement this for the kinds in
   * `portfolioKinds`. Keyed providers read the account behind a local secret
   * (the source carries no secret); keyless providers read a public `address`.
   */
  getPortfolio?(source: PortfolioSource): Promise<Portfolio>;
}
