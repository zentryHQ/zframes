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
  | "portfolio";

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
