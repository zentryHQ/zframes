import type {
  BtcBlock,
  BtcFees,
  Candle,
  Capability,
  CoinMarketEntry,
  CoinMover,
  CompanyFacts,
  CotDisaggregated,
  CotTraderClass,
  CryptoAssetProfile,
  CryptoDeveloperActivity,
  DayStats,
  DexVolumeEntry,
  DifficultyAdjustment,
  DollarIndex,
  FearGreedPoint,
  FinancialStress,
  FundingPoint,
  FxRate,
  GlobalMarket,
  LightningStats,
  MacroSeries,
  MarketDataProvider,
  MempoolState,
  MiningPools,
  NationalDebt,
  EthSupply,
  EtfFlows,
  FeesOverview,
  FundingComparison,
  MarketSector,
  NewsItem,
  NewsQuery,
  OnchainExtras,
  OnchainValuation,
  OpenInterestEntry,
  OptionContract,
  OptionsChain,
  OptionsSummary,
  OrderBook,
  OrderBookLevel,
  PredictionMarket,
  StablecoinSupply,
  TrendingCoin,
  YieldPool,
  Portfolio,
  PortfolioSource,
  PortfolioSourceKind,
  ProtocolFeesEntry,
  TokenUnlockEvent,
  TokenUnlocks,
  ProtocolFundamentals,
  ProtocolTvlEntry,
  ReferenceRate,
  SecCompanyFilings,
  SeriesPoint,
  ShortVolumeEntry,
  TreasuryAuction,
  TreasuryAverageRate,
  TvlEntry,
  Unsubscribe,
  VolatilityPoint,
  YieldCurve,
  NftCollection,
  DexPool,
  ChainActivity,
  MetalSpot,
  MetalHistory,
  MetalPositioning,
  CotWeek,
  GoldReserve,
  TokenizedGold,
  OfficialSeries,
  HomeValueEntry,
  HomeValueIndex,
  RegionalHousingSeries,
  RegionalHousingPrice,
  FinancialFact,
  FinancialSeries,
  CompanyFactsHistory,
  EquityProfile,
  FinancialStatementRow,
  EquityFinancials,
  EarningsResult,
  EarningsHistory,
  EarningsCalendarEntry,
  AnalystRatings,
  InstitutionalOwnership,
} from "@zframes/core";

/**
 * What the mock provider should pretend is happening:
 * - normal:  realistic seeded data
 * - empty:   provider has no data (frames show their empty state)
 * - loading: requests never resolve (frames stay in skeleton)
 * - error:   every request rejects (frames show the error path)
 */
export type MockMode = "normal" | "empty" | "loading" | "error";

/**
 * "Now" anchor for every synthetic time series, fixed once at module load.
 * It must be ≥ the `startTimeMs` frames derive from the real clock (they pass
 * `Date.now() - window`), or windowed series (candles, DVOL) compute a negative
 * count and render empty — so we anchor to the real clock, not a hardcoded past
 * epoch. Values stay seeded/deterministic; only the timestamps track real time.
 */
const BASELINE_NOW = Date.now();

const DAY = 86_400_000;

// Cross-asset, mirroring the real xyz dex: indices + mega-cap tech + the
// semis/memory complex + crypto-adjacent names + commodities + FX + an ETF, so
// the auto-populated stock frames (movers, tickers) read as a cross-asset desk.
const STOCKS = [
  "xyz:XYZ100",
  "xyz:SP500",
  "xyz:NVDA",
  "xyz:TSLA",
  "xyz:AAPL",
  "xyz:MSFT",
  "xyz:GOOGL",
  "xyz:META",
  "xyz:MU",
  "xyz:AMD",
  "xyz:AVGO",
  "xyz:SKHX",
  "xyz:MSTR",
  "xyz:COIN",
  "xyz:GOLD",
  "xyz:SILVER",
  "xyz:CL",
  "xyz:BRENTOIL",
  "xyz:EUR",
  "xyz:SMH",
];
const CRYPTO = [
  "BTC",
  "ETH",
  "SOL",
  "HYPE",
  "BNB",
  "XRP",
  "DOGE",
  "LINK",
  "AVAX",
  "SUI",
];
const UNIVERSE = [...STOCKS, ...CRYPTO];

// Plausible anchors so the cross-asset universe renders at believable levels
// (an FX pair near 1.14, crude near 71, the S&P index near 7400) instead of the
// hashed [40,600) fallback. Values track the live xyz dex contexts.
const FIXED_PRICE: Record<string, number> = {
  BTC: 67_432,
  ETH: 3_380,
  SOL: 168,
  HYPE: 28.4,
  BNB: 592,
  XRP: 0.62,
  DOGE: 0.16,
  LINK: 14.2,
  AVAX: 36.1,
  SUI: 1.05,
  // Indices
  "xyz:XYZ100": 29_958,
  "xyz:SP500": 7_444,
  // Mega-cap tech & semis/memory
  "xyz:NVDA": 196.76,
  "xyz:TSLA": 409.99,
  "xyz:AAPL": 283.67,
  "xyz:MSFT": 370.97,
  "xyz:GOOGL": 351.9,
  "xyz:META": 557.39,
  "xyz:MU": 1_140,
  "xyz:AMD": 549.79,
  "xyz:AVGO": 376.75,
  "xyz:SKHX": 1_715,
  // Crypto-adjacent
  "xyz:MSTR": 85.3,
  "xyz:COIN": 145.06,
  // Commodities
  "xyz:GOLD": 4_025,
  "xyz:SILVER": 59.05,
  "xyz:CL": 70.82,
  "xyz:BRENTOIL": 74.11,
  // FX & ETF
  "xyz:EUR": 1.1402,
  "xyz:SMH": 644.14,
  // Not on the dex, but the crypto-profile capability asks for an uncapped
  // mid-cap by ticker and a hashed [40,600) price would put ATOM near NVDA.
  ATOM: 4.15,
};

/**
 * Listed metal/miner ETFs an options chain names but the perp tape doesn't
 * carry. Calibrated off the dex commodity marks so a GLD chain and a
 * `xyz:GOLD` card can't disagree: GLD tracks ~1/10 oz of gold, SLV ~1 oz of
 * silver.
 */
const ETF_QUOTES: Record<string, number> = {
  GLD: 372.4,
  IAU: 76.1,
  SLV: 53.6,
  GDX: 88.2,
};

const NAMES: Record<string, string> = {
  BTC: "Bitcoin",
  ETH: "Ethereum",
  SOL: "Solana",
  HYPE: "Hyperliquid",
  BNB: "BNB",
  XRP: "XRP",
  DOGE: "Dogecoin",
  LINK: "Chainlink",
  AVAX: "Avalanche",
  SUI: "Sui",
};

function tickerOf(symbol: string): string {
  const i = symbol.indexOf(":");
  return (i === -1 ? symbol : symbol.slice(i + 1)).toUpperCase();
}

// ── deterministic PRNG ──────────────────────────────────────────────────────
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A fresh seeded [0,1) generator for a given key. */
function rng(key: string): () => number {
  return mulberry32(hashString(key));
}

function priceFor(symbol: string): number {
  if (FIXED_PRICE[symbol] != null) return FIXED_PRICE[symbol];
  const r = rng(`price:${symbol}`);
  return Math.round((40 + r() * 560) * 100) / 100;
}

function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** ISO "YYYY-MM-DD" for a millisecond instant. */
function isoDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** "1/25/2026" — how the exchange labels a statement's period column. */
function usDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
}

// ── equity research ─────────────────────────────────────────────────────────

/**
 * Registrant name, listing and classification per ticker — the fields an
 * exchange quote page carries beside the price. Anything unmapped falls back to
 * a generic profile, so a board pointed at an arbitrary ticker still renders a
 * complete card rather than a half-empty one.
 */
const COMPANY_PROFILES: Record<
  string,
  { name: string; exchange: string; sector: string; industry: string }
> = {
  NVDA: {
    name: "NVIDIA Corporation",
    exchange: "NASDAQ-GS",
    sector: "Technology",
    industry: "Semiconductors",
  },
  AMD: {
    name: "Advanced Micro Devices, Inc.",
    exchange: "NASDAQ-GS",
    sector: "Technology",
    industry: "Semiconductors",
  },
  AVGO: {
    name: "Broadcom Inc.",
    exchange: "NASDAQ-GS",
    sector: "Technology",
    industry: "Semiconductors",
  },
  MU: {
    name: "Micron Technology, Inc.",
    exchange: "NASDAQ-GS",
    sector: "Technology",
    industry: "Semiconductors",
  },
  AAPL: {
    name: "Apple Inc.",
    exchange: "NASDAQ-GS",
    sector: "Technology",
    industry: "Computer Manufacturing",
  },
  MSFT: {
    name: "Microsoft Corporation",
    exchange: "NASDAQ-GS",
    sector: "Technology",
    industry: "Computer Software: Prepackaged Software",
  },
  GOOGL: {
    name: "Alphabet Inc.",
    exchange: "NASDAQ-GS",
    sector: "Technology",
    industry: "Computer Software: Programming, Data Processing",
  },
  META: {
    name: "Meta Platforms, Inc.",
    exchange: "NASDAQ-GS",
    sector: "Technology",
    industry: "Computer Software: Programming, Data Processing",
  },
  TSLA: {
    name: "Tesla, Inc.",
    exchange: "NASDAQ-GS",
    sector: "Consumer Discretionary",
    industry: "Auto Manufacturing",
  },
  COIN: {
    name: "Coinbase Global, Inc.",
    exchange: "NASDAQ-GS",
    sector: "Finance",
    industry: "Finance: Consumer Services",
  },
  MSTR: {
    name: "Strategy Inc.",
    exchange: "NASDAQ-GS",
    sector: "Technology",
    industry: "Computer Software: Prepackaged Software",
  },
};

function companyProfileOf(ticker: string): {
  name: string;
  exchange: string;
  sector: string;
  industry: string;
} {
  return (
    COMPANY_PROFILES[ticker] ?? {
      name: `${ticker} Inc.`,
      exchange: "NASDAQ-GS",
      sector: "Technology",
      industry: "Computer Software: Prepackaged Software",
    }
  );
}

/**
 * Underlying price for an equity symbol. The equity-research frames pass a bare
 * ticker ("NVDA") while {@link FIXED_PRICE} is keyed by the HIP-3 perp
 * ("xyz:NVDA"), so the dex spelling is tried too — otherwise a profile card
 * would quote a hashed [40,600) level beside a ticker tape showing the anchor.
 */
function equityPriceFor(symbol: string): number {
  const t = tickerOf(symbol);
  return FIXED_PRICE[symbol] ?? FIXED_PRICE[`xyz:${t}`] ?? priceFor(t);
}

/** Fiscal year end — late September, so the newest closed year is the FY2025 /
 *  2025-09-27 pair the headline {@link CompanyFacts} mock already reports. */
const FY_END_MONTH = 8;
const FY_END_DAY = 27;

/** Quarter ends of a fiscal year as `[year offset, month, day]`. Fiscal Q1 lands
 *  in the PREVIOUS calendar year, which is exactly why a fiscal quarter can't be
 *  inferred from its end date alone. */
const QUARTER_ENDS: readonly (readonly [number, number, number])[] = [
  [-1, 11, 28],
  [0, 2, 29],
  [0, 5, 28],
  [0, FY_END_MONTH, FY_END_DAY],
];

/** One reporting period a mock filer has reported on. */
interface MockPeriod {
  endMs: number;
  fy: number;
  /** 1–4 for a fiscal quarter, 0 for a full year. */
  quarter: number;
  fiscalPeriod: string;
  form: string;
}

/**
 * Reporting periods oldest→newest, ending at the last fiscal year that has
 * actually closed. Anchored to {@link BASELINE_NOW} like every other series
 * here so the history never goes stale, while the COUNT stays fixed — a story
 * renders the same number of columns whatever day CI runs it.
 */
function fiscalPeriods(
  years: number,
  cadence: "annual" | "quarterly",
): MockPeriod[] {
  const nowYear = new Date(BASELINE_NOW).getUTCFullYear();
  const latestFy =
    BASELINE_NOW < Date.UTC(nowYear, FY_END_MONTH, FY_END_DAY)
      ? nowYear - 1
      : nowYear;
  const out: MockPeriod[] = [];
  for (let i = years - 1; i >= 0; i--) {
    const fy = latestFy - i;
    if (cadence === "annual") {
      out.push({
        endMs: Date.UTC(fy, FY_END_MONTH, FY_END_DAY),
        fy,
        quarter: 0,
        fiscalPeriod: `FY${fy}`,
        form: "10-K",
      });
      continue;
    }
    for (let q = 1; q <= 4; q++) {
      const [dy, month, day] = QUARTER_ENDS[q - 1];
      out.push({
        endMs: Date.UTC(fy + dy, month, day),
        fy,
        quarter: q,
        fiscalPeriod: `Q${q} ${fy}`,
        // A fiscal Q4 is reported inside the annual report, never on its own 10-Q.
        form: q === 4 ? "10-K" : "10-Q",
      });
    }
  }
  return out;
}

/** Share of the fiscal year each quarter carries. Deliberately lopsided toward
 *  the December quarter so a quarterly chart shows real seasonality instead of
 *  four indistinguishable bars. */
const QUARTER_SEASONALITY = [0.3, 0.22, 0.22, 0.26];

/** One period's modelled figures, in dollars (EPS in dollars per share). */
interface MockFinancials {
  revenue: number;
  costOfRevenue: number;
  grossProfit: number;
  researchDevelopment: number;
  sellingGeneralAdmin: number;
  operatingIncome: number;
  pretaxIncome: number;
  incomeTax: number;
  netIncome: number;
  dilutedEps: number;
  dilutedShares: number;
  totalAssets: number;
  currentAssets: number;
  totalLiabilities: number;
  currentLiabilities: number;
  shareholdersEquity: number;
  operatingCashFlow: number;
  /** Negative, the way publishers report a cash outflow. */
  capex: number;
  investingCashFlow: number;
  financingCashFlow: number;
}

/**
 * A modelled decade of financials for one filer, aligned index-for-index with
 * `periods`. The SEC-XBRL history, the exchange's statement tables, the profile
 * card's market cap and the earnings track record all read off this ONE model:
 * a board carrying several of those cards would otherwise quote two different
 * revenues for the same fiscal year, which reads as a bug in the frames.
 */
function modelFinancials(
  ticker: string,
  periods: MockPeriod[],
): MockFinancials[] {
  const r = rng(`financials:${ticker}`);
  const years = [...new Set(periods.map((p) => p.fy))].sort((a, b) => a - b);

  // Anchor the newest year off the ticker, then walk BACKWARDS at ~18% a year so
  // the decade compounds instead of drifting around a flat line.
  const annualRevenue = new Map<number, number>();
  let revenue = 90_000_000_000 + r() * 260_000_000_000;
  for (let i = years.length - 1; i >= 0; i--) {
    annualRevenue.set(years[i], Math.round(revenue));
    revenue /= 1.18 + (r() - 0.5) * 0.12;
  }

  const span = Math.max(1, periods.length - 1);
  return periods.map((period, i) => {
    // 0 at the oldest period, 1 at the newest — margins and the buyback both
    // ride this so the whole statement improves coherently over the decade.
    const t = i / span;
    const yearRevenue = annualRevenue.get(period.fy) ?? 0;
    const rev =
      period.quarter === 0
        ? yearRevenue
        : yearRevenue * QUARTER_SEASONALITY[period.quarter - 1];

    const grossMargin = 0.55 + 0.16 * t;
    const operatingMargin = 0.24 + 0.22 * t;
    const grossProfit = rev * grossMargin;
    const operatingIncome = rev * operatingMargin;
    const opex = grossProfit - operatingIncome;
    const pretaxIncome = operatingIncome + rev * 0.015;
    const incomeTax = pretaxIncome * 0.14;
    const netIncome = pretaxIncome - incomeTax;
    const dilutedShares = Math.round(26_000_000_000 * (1 - 0.11 * t));
    const totalAssets = yearRevenue * (1.45 + 0.35 * t);
    const shareholdersEquity = totalAssets * (0.52 + 0.14 * t);
    const operatingCashFlow = netIncome * 1.12;
    const capex = -rev * 0.035;

    return {
      revenue: Math.round(rev),
      costOfRevenue: Math.round(rev - grossProfit),
      grossProfit: Math.round(grossProfit),
      researchDevelopment: Math.round(opex * 0.62),
      sellingGeneralAdmin: Math.round(opex * 0.38),
      operatingIncome: Math.round(operatingIncome),
      pretaxIncome: Math.round(pretaxIncome),
      incomeTax: Math.round(incomeTax),
      netIncome: Math.round(netIncome),
      dilutedEps: round(netIncome / dilutedShares, 2),
      dilutedShares,
      totalAssets: Math.round(totalAssets),
      currentAssets: Math.round(totalAssets * (0.4 + 0.08 * t)),
      totalLiabilities: Math.round(totalAssets - shareholdersEquity),
      // Short-term obligations shrink as a share of the book over the decade,
      // so the current ratio derived from these two actually MOVES — a liquidity
      // row that prints the same figure four columns running looks synthetic.
      currentLiabilities: Math.round(
        (totalAssets - shareholdersEquity) * (0.46 - 0.09 * t),
      ),
      shareholdersEquity: Math.round(shareholdersEquity),
      operatingCashFlow: Math.round(operatingCashFlow),
      capex: Math.round(capex),
      investingCashFlow: Math.round(capex - rev * 0.06),
      financingCashFlow: Math.round(-operatingCashFlow * 0.72),
    };
  });
}

// ── option-chain maths ──────────────────────────────────────────────────────

/** Publication cadence → milliseconds between prints. */
const STEP_MS: Record<OfficialSeries["frequency"], number> = {
  daily: DAY,
  weekly: 7 * DAY,
  monthly: 30 * DAY,
  quarterly: 91 * DAY,
};

/** Standard normal CDF (Abramowitz & Stegun 26.2.17). Black-Scholes below runs
 *  on it so the mock's greeks are internally consistent — a call delta that
 *  really does fall 1→0 across the ladder, a gamma that really does peak at the
 *  money — rather than three independent fudge curves that disagree. */
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const poly =
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const p = normPdf(x) * poly;
  return x >= 0 ? 1 - p : p;
}

function normPdf(x: number): number {
  return 0.3989422804014327 * Math.exp((-x * x) / 2);
}

/** Risk-free rate the mock's greeks and premiums are priced off. */
const OPTION_RATE = 0.043;

/** Strike increments a listing actually uses; the ladder snaps to the first one
 *  at least as coarse as ~2.5% of spot, so a $85 name and a $1,140 name both get
 *  a readable axis instead of 200 strikes or 3. */
const STRIKE_STEPS = [0.5, 1, 2.5, 5, 10, 25, 50, 100, 250];

function strikeStepFor(price: number): number {
  const target = price * 0.025;
  return STRIKE_STEPS.find((s) => s >= target) ?? 500;
}

/**
 * Days from {@link BASELINE_NOW} to each listed expiry, and the multiplier on
 * that expiry's open interest.
 *
 * **The front expiry is deliberately near-empty.** `selectExpiry` in
 * `equity-options-shared` skips the nearest expiry when it fails a liquidity
 * floor of 10% of the busiest one — real front weeklies often are that thin, and
 * charting them produces a card that looks broken. A mock where every expiry is
 * equally busy never exercises that branch, so the choice would be untested and
 * invisible.
 *
 * Whole-day offsets rather than a snap to the next Friday: days-to-expiry then
 * never moves with the weekday CI happens to run on, and every IV, premium and
 * greek derived from it stays byte-identical between runs.
 */
const OPTION_EXPIRIES: readonly { days: number; oiScale: number }[] = [
  { days: 7, oiScale: 0.012 },
  { days: 35, oiScale: 1 },
  { days: 91, oiScale: 0.62 },
  { days: 182, oiScale: 0.34 },
];

/** Strikes per expiry — 10 either side of the money. */
const STRIKES_PER_EXPIRY = 21;

/** How far out of the money a contract stops being quoted at all. Beyond this
 *  many steps on its own OTM side the feed publishes no IV, which is the case
 *  the smile frame has to drop rather than plot as zero vol. */
const UNQUOTED_STEPS = 8;

/** OCC-21 contract id: `<ROOT><YYMMDD><C|P><strike × 1000, 8 digits>`. */
function occSymbol(
  root: string,
  expiryMs: number,
  side: "call" | "put",
  strike: number,
): string {
  const d = new Date(expiryMs);
  const yy = String(d.getUTCFullYear() % 100).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const strikeField = String(Math.round(strike * 1000)).padStart(8, "0");
  return `${root}${yy}${mm}${dd}${side === "call" ? "C" : "P"}${strikeField}`;
}

/** "hyperliquid-perps" → "Hyperliquid Perps", for an unlisted protocol slug. */
function prettyName(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ── disaggregated COT ───────────────────────────────────────────────────────
/** First week the CFTC published the disaggregated report. */
const DISAGG_START_MS = Date.UTC(2006, 5, 13);

type CotClassKey =
  | "producerMerchant"
  | "swapDealer"
  | "managedMoney"
  | "otherReportable"
  | "nonReportable";

/** One week's full five-class split; the legacy buckets roll up out of it. */
type CotSplit = Record<
  CotClassKey,
  { long: number; short: number; spread: number }
>;

const COT_CLASSES: readonly CotClassKey[] = [
  "producerMerchant",
  "swapDealer",
  "managedMoney",
  "otherReportable",
  "nonReportable",
];

/**
 * Relative weights within each side, re-normalised per week so that
 * long + spread === short + spread === open interest.
 *
 * Metals positioning has a characteristic shape — producers and swap dealers
 * net SHORT against managed money net LONG — and a symmetric random split would
 * erase the one thing the disaggregated frames exist to show.
 */
const COT_LONG_WEIGHTS: Record<CotClassKey, number> = {
  producerMerchant: 0.07,
  swapDealer: 0.09,
  managedMoney: 0.55,
  otherReportable: 0.17,
  nonReportable: 0.12,
};
const COT_SHORT_WEIGHTS: Record<CotClassKey, number> = {
  producerMerchant: 0.36,
  swapDealer: 0.34,
  managedMoney: 0.13,
  otherReportable: 0.1,
  nonReportable: 0.07,
};
/**
 * Spreading as a share of open interest. Producers and small traders have no
 * spreading column in the report at all, so those classes are absent here.
 */
const COT_SPREAD_SHARES: Partial<Record<CotClassKey, number>> = {
  swapDealer: 0.045,
  managedMoney: 0.022,
  otherReportable: 0.085,
};

// ── macro reference series ──────────────────────────────────────────────────
/**
 * How one macro reference series is generated. CPI is the odd one out: it is a
 * steadily compounding index, so it comes off the exponential glide with a tiny
 * wobble — a real monthly print moves ~0.3%, and a frame deflating a gold price
 * by a jumpy CPI would show fake swings in the real price. The yields and the
 * dollar index instead mean-revert around a level with a slow regime swing, and
 * a real yield crosses zero, which the glide cannot express at all.
 */
type MacroRefDef =
  | {
      shape: "glide";
      label: string;
      unit: OfficialSeries["unit"];
      frequency: OfficialSeries["frequency"];
      count: number;
      start: number;
      end: number;
      wobble: number;
    }
  | {
      shape: "revert";
      label: string;
      unit: OfficialSeries["unit"];
      frequency: OfficialSeries["frequency"];
      count: number;
      mean: number;
      revert: number;
      vol: number;
      min: number;
      max: number;
      dp: number;
      cycle: { amp: number; count: number };
    };

/** Per-asset identity and supply behind {@link CryptoAssetProfile}. */
type CryptoProfileSeed = {
  id: string;
  name: string;
  rank: number;
  categories: string[];
  circulating: number;
  total: number;
  /**
   * Hard cap — **absent** for an uncapped asset, never 0. A 0 cap renders as
   * "fully diluted", the exact opposite of the truth, and the dilution maths a
   * tokenomics frame does keys off the distinction.
   */
  max?: number;
  ath: number;
  athDate: string;
  atl: number;
  atlDate: string;
  description: string;
  links: NonNullable<CryptoAssetProfile["links"]>;
  developer: CryptoDeveloperActivity;
};

export class MockMarketDataProvider implements MarketDataProvider {
  readonly name = "mock";
  readonly capabilities: readonly Capability[] = [
    "quote-stream",
    "day-stats",
    "funding-history",
    "ohlcv",
    "tvl",
    "sentiment",
    "global-market",
    "reference-rates",
    "treasury-rates",
    "yield-curve",
    "treasury-auctions",
    "national-debt",
    "financial-stress",
    "macro-series",
    "token-unlocks",
    "news",
    "fundamentals",
    "fundamentals-history",
    "filings",
    "equity-profile",
    "equity-financials",
    "earnings-history",
    "earnings-calendar",
    "analyst-ratings",
    "institutional-ownership",
    "options-chain",
    "short-volume",
    "dex-volume",
    "protocol-tvl",
    "protocol-fees",
    "crypto-profile",
    "protocol-fundamentals",
    "coin-markets",
    "open-interest",
    "btc-fees",
    "btc-mempool",
    "btc-blocks",
    "btc-hashrate",
    "btc-difficulty",
    "mining-pools",
    "lightning-stats",
    "options-summary",
    "options-chain",
    "volatility-index",
    "coin-movers",
    "fx-rates",
    "onchain-valuation",
    "price-history-daily",
    "onchain-cycle-extras",
    "dollar-index",
    "stablecoins",
    "yields",
    "fees-overview",
    "funding-comparison",
    "eth-supply",
    "prediction-markets",
    "etf-flows",
    "trending-coins",
    "sector-performance",
    "nft-market",
    "dex-pools",
    "chain-activity",
    "order-book",
    "metal-spot",
    "metal-history",
    "metal-positioning",
    "gold-reserve",
    "tokenized-gold",
    "commodity-vol-index",
    "macro-reference-series",
    "index-level",
    "credit-spread",
    "housing-price",
    "mortgage-rate",
    "home-value-index",
    "regional-housing-price",
    "portfolio",
  ];
  readonly portfolioKinds: readonly PortfolioSourceKind[] = [
    "binance",
    "wallet",
  ];

  private tick = 0;

  constructor(private readonly mode: MockMode = "normal") {}

  /** Gate every async read on the simulated mode. */
  private gate<T>(emptyValue: T, build: () => T): Promise<T> {
    if (this.mode === "error")
      return Promise.reject(new Error("mock: simulated provider failure"));
    if (this.mode === "loading") return new Promise<T>(() => {});
    if (this.mode === "empty") return Promise.resolve(emptyValue);
    return Promise.resolve(build());
  }

  // ── on-chain valuation / cycle ──────────────────────────────────────────
  /** A long seeded daily BTC close series (enough history for a 4Y MA). */
  private dailyCloses(seed: string): SeriesPoint[] {
    const r = rng(seed);
    const n = 1600;
    const out: SeriesPoint[] = [];
    let price = 6000;
    for (let i = 0; i < n; i++) {
      price *= 1 + (r() - 0.47) * 0.03;
      price = Math.max(1000, price);
      out.push({
        time: BASELINE_NOW - (n - 1 - i) * DAY,
        value: round(price, 2),
      });
    }
    return out;
  }

  getDailyCloseHistory(asset = "btc"): Promise<SeriesPoint[]> {
    return this.gate<SeriesPoint[]>([], () =>
      this.dailyCloses(`close:${asset}`),
    );
  }

  getOnchainValuation(): Promise<OnchainValuation> {
    const empty: OnchainValuation = {
      date: "",
      price: 0,
      supply: 0,
      marketCap: 0,
      realizedCap: 0,
      realizedPrice: 0,
      mvrv: 0,
      mvrvZScore: 0,
      nupl: 0,
      history: {
        price: [],
        mvrv: [],
        mvrvZScore: [],
        nupl: [],
        realizedPrice: [],
      },
    };
    return this.gate<OnchainValuation>(empty, () => {
      const closes = this.dailyCloses("valuation");
      const supply = 19_800_000;
      const price: SeriesPoint[] = [];
      const mvrv: SeriesPoint[] = [];
      const nupl: SeriesPoint[] = [];
      const mvrvZScore: SeriesPoint[] = [];
      const realizedPrice: SeriesPoint[] = [];
      let realized = closes[0].value * 0.7;
      for (const point of closes) {
        realized += (point.value - realized) * 0.02; // realized price lags spot
        const m = point.value / realized;
        price.push(point);
        realizedPrice.push({ time: point.time, value: round(realized, 2) });
        mvrv.push({ time: point.time, value: round(m, 3) });
        nupl.push({ time: point.time, value: round(1 - 1 / m, 3) });
        mvrvZScore.push({ time: point.time, value: round((m - 1) * 2.2, 2) });
      }
      const last = (s: SeriesPoint[]) => s[s.length - 1].value;
      return {
        date: new Date(BASELINE_NOW).toISOString().slice(0, 10),
        price: last(price),
        supply,
        marketCap: last(price) * supply,
        realizedCap: last(realizedPrice) * supply,
        realizedPrice: last(realizedPrice),
        mvrv: last(mvrv),
        mvrvZScore: last(mvrvZScore),
        nupl: last(nupl),
        history: { price, mvrv, mvrvZScore, nupl, realizedPrice },
      };
    });
  }

  getOnchainExtras(): Promise<OnchainExtras> {
    const empty: OnchainExtras = {
      date: "",
      sopr: null,
      puell: null,
      reserveRisk: null,
      history: { sopr: [], puell: [], reserveRisk: [] },
    };
    return this.gate<OnchainExtras>(empty, () => {
      const r = rng("extras");
      const n = 365;
      const sopr: SeriesPoint[] = [];
      const puell: SeriesPoint[] = [];
      const reserveRisk: SeriesPoint[] = [];
      for (let i = 0; i < n; i++) {
        const t = BASELINE_NOW - (n - 1 - i) * DAY;
        sopr.push({ time: t, value: round(0.97 + r() * 0.08, 4) });
        puell.push({ time: t, value: round(0.4 + r() * 0.8, 3) });
        reserveRisk.push({ time: t, value: round(0.0003 + r() * 0.0006, 6) });
      }
      const last = (s: SeriesPoint[]) => s[s.length - 1].value;
      return {
        date: new Date(BASELINE_NOW).toISOString().slice(0, 10),
        sopr: last(sopr),
        puell: last(puell),
        reserveRisk: last(reserveRisk),
        history: { sopr, puell, reserveRisk },
      };
    });
  }

  getDollarIndex(): Promise<DollarIndex> {
    const empty: DollarIndex = { value: 0, changePct: 0, history: [] };
    return this.gate<DollarIndex>(empty, () => {
      const r = rng("dxy");
      const n = 30;
      const history: SeriesPoint[] = [];
      let value = 99;
      for (let i = 0; i < n; i++) {
        value += (r() - 0.5) * 0.4;
        history.push({
          time: BASELINE_NOW - (n - 1 - i) * DAY,
          value: round(value, 2),
        });
      }
      const latest = history[history.length - 1].value;
      const prev = history[history.length - 2].value;
      return {
        value: latest,
        changePct: round(((latest - prev) / prev) * 100, 2),
        history,
      };
    });
  }

  // ── market-data expansion ───────────────────────────────────────────────
  getStablecoinSupply(): Promise<StablecoinSupply> {
    const empty: StablecoinSupply = {
      totalUsd: 0,
      changePct1d: 0,
      changePct7d: 0,
      changePct30d: 0,
      history: [],
      topChains: [],
    };
    return this.gate<StablecoinSupply>(empty, () => {
      const total = 245e9;
      return {
        totalUsd: total,
        changePct1d: 0.12,
        changePct7d: 0.9,
        changePct30d: 3.4,
        history: [
          { time: BASELINE_NOW - 30 * DAY, value: round(total * 0.967, 0) },
          { time: BASELINE_NOW - 7 * DAY, value: round(total * 0.991, 0) },
          { time: BASELINE_NOW - DAY, value: round(total * 0.999, 0) },
          { time: BASELINE_NOW, value: total },
        ],
        topChains: [
          { name: "Ethereum", usd: 130e9 },
          { name: "Tron", usd: 90e9 },
          { name: "Solana", usd: 12e9 },
          { name: "BSC", usd: 6e9 },
        ],
      };
    });
  }

  getYieldPools(): Promise<YieldPool[]> {
    return this.gate<YieldPool[]>([], () => {
      const base: [string, string, string, number, number, boolean][] = [
        ["Ethereum", "lido", "STETH", 16e9, 2.9, false],
        ["Ethereum", "aave-v3", "USDC", 2.1e9, 4.6, true],
        ["Solana", "kamino", "USDC", 900e6, 7.2, true],
        ["Ethereum", "sky", "SUSDS", 5e9, 3.6, true],
        ["Base", "aerodrome", "USDC-ETH", 300e6, 12.4, false],
        ["Arbitrum", "gmx", "GLP", 180e6, 9.1, false],
      ];
      // The six curated pools above name the real protocols the list-shaped
      // yield frames show. They are not enough of a SAMPLE, though: a
      // distribution frame needs tens of observations before a histogram means
      // anything, and with only six every such card renders its empty state.
      // So the curated set is padded out deterministically with a realistic APY
      // spread — a dense low-yield body, a thinner double-digit tail, and a
      // couple of triple-digit incentive pools, which is the shape the real
      // DeFiLlama universe has.
      const CHAINS = ["Ethereum", "Solana", "Base", "Arbitrum", "Polygon"];
      const PROJECTS = ["curve", "convex", "pendle", "morpho", "compound-v3"];
      const padded: typeof base = [];
      for (let i = 0; i < 30; i += 1) {
        const r = rng(`pool:${i}`);
        const roll = r();
        // Exponential-ish: most pools cluster in single digits, a few don't.
        const apy =
          roll > 0.94
            ? round(120 + r() * 260, 1)
            : roll > 0.78
              ? round(18 + r() * 55, 1)
              : round(0.6 + r() * 11, 1);
        const stable = r() > 0.55;
        padded.push([
          CHAINS[i % CHAINS.length],
          PROJECTS[i % PROJECTS.length],
          stable ? "USDC" : "ETH-USDC",
          // Straddles the frames' default $1M floor so the filter is exercised.
          round(0.4e6 + r() * 800e6, 0),
          apy,
          stable,
        ]);
      }

      return [...base, ...padded].map(
        ([chain, project, symbol, tvlUsd, apy, stable], i) => ({
          pool: `mock-${i}`,
          chain,
          project,
          symbol,
          tvlUsd,
          apy,
          apyBase: round(apy * 0.8, 2),
          apyReward: round(apy * 0.2, 2),
          apyPct7D: round((rng(`y${i}`)() - 0.5) * 2, 2),
          stablecoin: stable,
          ilRisk: stable ? "no" : "yes",
        }),
      );
    });
  }

  getFeesOverview(): Promise<FeesOverview> {
    const empty: FeesOverview = {
      total24h: 0,
      total7d: null,
      changePct: null,
      history: [],
    };
    return this.gate<FeesOverview>(empty, () => {
      const r = rng("fees");
      const n = 30;
      const history: SeriesPoint[] = [];
      for (let i = 0; i < n; i++)
        history.push({
          time: BASELINE_NOW - (n - 1 - i) * DAY,
          value: round(30e6 + r() * 20e6, 0),
        });
      return {
        total24h: history[history.length - 1].value,
        total7d: 300e6,
        changePct: 2.1,
        history,
      };
    });
  }

  getFundingComparison(): Promise<FundingComparison[]> {
    return this.gate<FundingComparison[]>([], () => {
      const coins = ["BTC", "ETH", "SOL", "HYPE", "DOGE", "XRP"];
      return coins
        .map((coin) => {
          const r = rng(`fc${coin}`);
          const venues = ["Hyperliquid", "Binance", "Bybit"].map((venue) => {
            const annualizedPct = round((r() - 0.4) * 30, 2);
            return {
              venue,
              rawRate: annualizedPct / 8760,
              intervalHours: venue === "Hyperliquid" ? 1 : 8,
              annualizedPct,
            };
          });
          const rates = venues.map((v) => v.annualizedPct);
          return {
            coin,
            venues,
            spreadPct: round(Math.max(...rates) - Math.min(...rates), 2),
          };
        })
        .sort((a, b) => b.spreadPct - a.spreadPct);
    });
  }

  getEthSupply(): Promise<EthSupply> {
    const empty: EthSupply = {
      supply: 0,
      burnRateYearlyEth: 0,
      issuanceRateYearlyEth: 0,
      supplyGrowthYearlyPct: 0,
      supplyGrowthYearlyPowPct: 0,
      stakingAprPct: 0,
      burnEthPerMin: 0,
      history: [],
    };
    return this.gate<EthSupply>(empty, () => {
      const r = rng("eth");
      const n = 30;
      const history: SeriesPoint[] = [];
      let s = 120_700_000;
      for (let i = 0; i < n; i++) {
        s += (r() - 0.5) * 2000;
        history.push({
          time: BASELINE_NOW - (n - 1 - i) * DAY,
          value: round(s, 0),
        });
      }
      return {
        supply: history[history.length - 1].value,
        burnRateYearlyEth: 900_000,
        issuanceRateYearlyEth: 850_000,
        supplyGrowthYearlyPct: -0.04,
        supplyGrowthYearlyPowPct: 3.8,
        stakingAprPct: 3.1,
        burnEthPerMin: 1.7,
        history,
      };
    });
  }

  getPredictionMarkets(limit = 12): Promise<PredictionMarket[]> {
    return this.gate<PredictionMarket[]>([], () => {
      const qs: [string, number][] = [
        ["Fed cuts rates in September?", 0.62],
        ["BTC above $100k by year end?", 0.48],
        ["ETH ETF net inflow positive this week?", 0.71],
        ["US recession in 2026?", 0.29],
        ["Solana flips Ethereum by 2027?", 0.14],
        ["Government shutdown this quarter?", 0.37],
      ];
      return qs.slice(0, limit).map(([question, p]) => ({
        question,
        outcomes: [
          { label: "Yes", prob: p },
          { label: "No", prob: round(1 - p, 2) },
        ],
        volume24h: round(1e5 + (1 - p) * 5e6, 0),
        endDate: new Date(BASELINE_NOW + 30 * DAY).toISOString(),
      }));
    });
  }

  getEtfFlows(asset: string): Promise<EtfFlows> {
    const empty: EtfFlows = {
      asset,
      date: "",
      dailyTotalNetInflow: 0,
      cumNetInflow: 0,
      totalNetAssets: 0,
      issuers: [],
      history: [],
    };
    return this.gate<EtfFlows>(empty, () => {
      const r = rng(`etf${asset}`);
      const n = 30;
      const history: SeriesPoint[] = [];
      for (let i = 0; i < n; i++)
        history.push({
          time: BASELINE_NOW - (n - 1 - i) * DAY,
          value: round((r() - 0.4) * 400e6, 0),
        });
      const issuers = (
        [
          ["IBIT", "BlackRock"],
          ["FBTC", "Fidelity"],
          ["ARKB", "Ark"],
          ["GBTC", "Grayscale"],
          ["BITB", "Bitwise"],
        ] as [string, string][]
      ).map(([ticker, institute], i) => ({
        ticker,
        institute,
        dailyNetInflow: round((rng(`e${asset}${i}`)() - 0.4) * 150e6, 0),
        netAssets: round((5 - i) * 10e9, 0),
        cumNetInflow: round((5 - i) * 12e9, 0),
      }));
      return {
        asset,
        date: new Date(BASELINE_NOW).toISOString().slice(0, 10),
        dailyTotalNetInflow: history[history.length - 1].value,
        cumNetInflow: 51e9,
        totalNetAssets: 75e9,
        issuers,
        history,
      };
    });
  }

  getTrendingCoins(): Promise<TrendingCoin[]> {
    return this.gate<TrendingCoin[]>([], () => {
      const coins: [string, string, string, number][] = [
        ["bitcoin", "Bitcoin", "BTC", 1],
        ["ethereum", "Ethereum", "ETH", 2],
        ["solana", "Solana", "SOL", 5],
        ["hyperliquid", "Hyperliquid", "HYPE", 11],
        ["dogecoin", "Dogecoin", "DOGE", 8],
        ["pepe", "Pepe", "PEPE", 24],
      ];
      return coins.map(([id, name, symbol, rank]) => ({
        id,
        name,
        symbol,
        rank,
        price: round(priceFor(symbol), 2),
        changePct24h: round((rng(`t${id}`)() - 0.4) * 20, 2),
      }));
    });
  }

  getSectorPerformance(): Promise<MarketSector[]> {
    return this.gate<MarketSector[]>([], () => {
      const sectors = [
        "Layer 1",
        "DeFi",
        "AI Agents",
        "Meme",
        "RWA",
        "Layer 2",
        "Gaming",
        "DePIN",
        "Liquid Staking",
        "Oracle",
      ];
      return sectors
        .map((name, i) => ({
          name,
          marketCap: round((10 - i) * 8e9, 0),
          changePct24h: round((rng(`s${name}`)() - 0.45) * 15, 2),
        }))
        .sort((a, b) => b.marketCap - a.marketCap);
    });
  }

  // ── NFT / DEX / chain activity ──────────────────────────────────────────
  getNftMarket(): Promise<NftCollection[]> {
    return this.gate<NftCollection[]>([], () => {
      const rows: [string, string, number][] = [
        ["bored-ape-yacht-club", "Bored Ape Yacht Club", 16.2],
        ["pudgy-penguins", "Pudgy Penguins", 12.4],
        ["mutant-ape-yacht-club", "Mutant Ape Yacht Club", 2.8],
        ["cryptopunks", "CryptoPunks", 44.1],
        ["azuki", "Azuki", 5.3],
        ["milady", "Milady Maker", 3.1],
        ["doodles-official", "Doodles", 1.9],
        ["moonbirds", "Moonbirds", 1.2],
      ];
      return rows
        .map(([id, name, floorEth]) => {
          const r = rng(`nft:${id}`);
          const floorUsd = round(floorEth * 3380, 0);
          return {
            id,
            name,
            floorNative: floorEth,
            floorUsd,
            floorChangePct24h: round((r() * 2 - 1) * 10),
            marketCapUsd: round(floorUsd * 10_000, 0),
            volume24hUsd: round(r() * 3_000_000, 0),
            sales24h: Math.round(r() * 60),
          };
        })
        .sort((a, b) => b.volume24hUsd - a.volume24hUsd);
    });
  }

  getDexPools(network = "eth"): Promise<DexPool[]> {
    return this.gate<DexPool[]>([], () => {
      const pairs = [
        "PEPE / WETH",
        "USDC / WETH",
        "WBTC / WETH",
        "LINK / WETH",
        "SHIB / WETH",
        "UNI / WETH",
        "ARB / WETH",
        "AAVE / WETH",
        "MKR / WETH",
        "LDO / WETH",
        "CRV / WETH",
        "ENA / WETH",
      ];
      return pairs
        .map((name) => {
          const r = rng(`pool:${network}:${name}`);
          return {
            name,
            network,
            priceUsd: round(r() * 4, 4),
            volume24hUsd: round(r() * 50_000_000, 0),
            changePct24h: round((r() * 2 - 1) * 25),
            reserveUsd: round(r() * 20_000_000, 0),
            fdvUsd: round(r() * 500_000_000, 0),
            txns24h: Math.round(r() * 5000),
          };
        })
        .sort((a, b) => b.volume24hUsd - a.volume24hUsd);
    });
  }

  // ── venue order book ────────────────────────────────────────────────────
  getOrderBook(symbol = "KUB", depth = 15): Promise<OrderBook> {
    const empty: OrderBook = {
      symbol,
      pair: `${symbol}_THB`,
      bids: [],
      asks: [],
      mid: 0,
      spreadPct: 0,
    };
    return this.gate<OrderBook>(empty, () => {
      const r = rng(`book:${symbol}`);
      // USD, like every other capability — the display layer converts.
      const mid = round(priceFor(symbol), 2);
      const tick = Math.max(round(mid * 0.0005, 4), 0.0001);
      const side = (dir: 1 | -1): OrderBookLevel[] => {
        let running = 0;
        return Array.from({ length: depth }, (_, i) => {
          const size = round(r() * 4000 + 20, 2);
          running = round(running + size, 2);
          return {
            price: round(mid + dir * tick * (i + 1), 4),
            size,
            cumulativeSize: running,
          };
        });
      };
      const bids = side(-1);
      const asks = side(1);
      return {
        symbol,
        pair: `${symbol}_THB`,
        bids,
        asks,
        mid,
        spreadPct: round(((asks[0].price - bids[0].price) / mid) * 100, 3),
      };
    });
  }

  getChainActivity(): Promise<ChainActivity[]> {
    return this.gate<ChainActivity[]>([], () => {
      const rows: [string, string, number][] = [
        ["ethereum", "Ethereum", 3380],
        ["bitcoin", "Bitcoin", 67432],
        ["litecoin", "Litecoin", 88],
        ["dogecoin", "Dogecoin", 0.16],
        ["bitcoin-cash", "Bitcoin Cash", 420],
        ["dash", "Dash", 28],
        ["zcash", "Zcash", 34],
      ];
      return rows
        .map(([chain, label, price]) => {
          const r = rng(`chain:${chain}`);
          return {
            chain,
            label,
            transactions24h: Math.round(50_000 + r() * 3_000_000),
            blocks24h: Math.round(100 + r() * 7000),
            mempoolTxns: Math.round(r() * 30_000),
            priceUsd: price,
            priceChangePct24h: round((r() * 2 - 1) * 6),
          };
        })
        .sort((a, b) => b.transactions24h - a.transactions24h);
    });
  }

  // ── streaming mids ──────────────────────────────────────────────────────
  subscribeMids(
    onMids: (mids: Record<string, number>) => void,
    symbols?: readonly string[],
  ): Unsubscribe {
    if (this.mode === "loading" || this.mode === "error") return () => {};

    const requested = symbols && symbols.length ? [...symbols] : UNIVERSE;
    // Expand a "<dex>:*" wildcard to the stock universe (ticker-tape style).
    const syms = requested.flatMap((s) => (s.endsWith(":*") ? STOCKS : [s]));

    const emit = () => {
      if (this.mode === "empty") {
        onMids({});
        return;
      }
      const mids: Record<string, number> = {};
      for (const s of syms) {
        const base = priceFor(s);
        // gentle deterministic wobble so livelines/tickers look alive
        const wob = Math.sin((this.tick + (hashString(s) % 100)) / 6) * 0.004;
        mids[s] = round(base * (1 + wob), base < 1 ? 4 : 2);
      }
      onMids(mids);
    };

    emit();
    if (this.mode === "empty") return () => {};
    const id = setInterval(() => {
      this.tick += 1;
      emit();
    }, 1500);
    return () => clearInterval(id);
  }

  // ── day stats ───────────────────────────────────────────────────────────
  getDayStats(symbols?: string[]): Promise<Record<string, DayStats>> {
    return this.gate<Record<string, DayStats>>({}, () => {
      const requested =
        symbols && symbols.length
          ? symbols.flatMap((s) => (s.endsWith(":*") ? STOCKS : [s]))
          : UNIVERSE;
      const out: Record<string, DayStats> = {};
      for (const s of requested) {
        const markPx = priceFor(s);
        const changePct = round((rng(`chg:${s}`)() * 2 - 1) * 6);
        out[s] = {
          markPx,
          prevDayPx: round(markPx / (1 + changePct / 100), markPx < 1 ? 5 : 2),
          changePct,
        };
      }
      return out;
    });
  }

  // ── funding ───────────────────────────────────────────────────────────────
  getFundingHistory(
    symbols: string[],
    startTimeMs: number,
  ): Promise<Record<string, FundingPoint[]>> {
    return this.gate<Record<string, FundingPoint[]>>({}, () => {
      const out: Record<string, FundingPoint[]> = {};
      const hours = Math.min(
        720,
        Math.max(24, Math.round((BASELINE_NOW - startTimeMs) / 3_600_000)),
      );
      for (const s of symbols) {
        const r = rng(`funding:${s}`);
        out[s] = Array.from({ length: hours }, (_, i) => ({
          time: startTimeMs + i * 3_600_000,
          fundingRate: round((r() - 0.5) * 0.00005, 8),
        }));
      }
      return out;
    });
  }

  // ── candles ───────────────────────────────────────────────────────────────
  getCandles(
    symbol: string,
    interval: string,
    startTimeMs: number,
  ): Promise<Candle[]> {
    return this.gate<Candle[]>([], () => {
      const stepMs =
        {
          "1m": 60_000,
          "5m": 300_000,
          "15m": 900_000,
          "1h": 3_600_000,
          "4h": 14_400_000,
          "1d": DAY,
        }[interval] ?? 3_600_000;
      const count = Math.min(
        300,
        Math.max(2, Math.round((BASELINE_NOW - startTimeMs) / stepMs)),
      );
      const r = rng(`candles:${symbol}:${interval}`);
      let close = priceFor(symbol) * (0.85 + r() * 0.1);
      const out: Candle[] = [];
      for (let i = 0; i < count; i++) {
        const open = close;
        const drift = (r() - 0.48) * open * 0.02;
        close = Math.max(open * 0.5, open + drift);
        const high = Math.max(open, close) * (1 + r() * 0.01);
        const low = Math.min(open, close) * (1 - r() * 0.01);
        out.push({
          time: startTimeMs + i * stepMs,
          open: round(open, open < 1 ? 5 : 2),
          high: round(high, open < 1 ? 5 : 2),
          low: round(low, open < 1 ? 5 : 2),
          close: round(close, open < 1 ? 5 : 2),
          volume: round(r() * 1_000_000, 0),
        });
      }
      return out;
    });
  }

  // ── TVL / DeFi ──────────────────────────────────────────────────────────
  getTvlByChain(): Promise<TvlEntry[]> {
    return this.gate<TvlEntry[]>([], () => {
      const chains = [
        "Ethereum",
        "Solana",
        "Tron",
        "BSC",
        "Base",
        "Arbitrum",
        "Bitcoin",
        "Sui",
        "Avalanche",
        "Polygon",
        "Aptos",
        "Sei",
      ];
      return chains.map((name, i) => ({
        name,
        tvl: round(rng(`tvl:${name}`)() * 90_000_000_000 * (1 - i * 0.06), 0),
      }));
    });
  }

  getDexVolume(): Promise<DexVolumeEntry[]> {
    return this.gate<DexVolumeEntry[]>([], () => {
      const dexes = [
        "Uniswap",
        "PancakeSwap",
        "Aerodrome",
        "Curve",
        "Raydium",
        "Hyperliquid",
        "Fluid",
        "Balancer",
        "Orca",
        "SushiSwap",
        "Camelot",
        "Maverick",
      ];
      return dexes.map((name) => ({
        name,
        volume24h: round(rng(`dexv:${name}`)() * 4_000_000_000, 0),
        changePct: round((rng(`dexvc:${name}`)() * 2 - 1) * 25),
      }));
    });
  }

  getDexVolumeHistory(slugs: string[]): Promise<Record<string, SeriesPoint[]>> {
    return this.gate<Record<string, SeriesPoint[]>>({}, () =>
      this.seriesFor(slugs, "dexvh", 2_000_000_000),
    );
  }

  getProtocolTvl(): Promise<ProtocolTvlEntry[]> {
    return this.gate<ProtocolTvlEntry[]>([], () => {
      const rows: [string, string][] = [
        ["Lido", "Liquid Staking"],
        ["EigenLayer", "Restaking"],
        ["Aave", "Lending"],
        ["ether.fi", "Liquid Restaking"],
        ["Sky", "CDP"],
        ["Uniswap", "Dexes"],
        ["Babylon", "Restaking"],
        ["Pendle", "Yield"],
        ["Morpho", "Lending"],
        ["Curve", "Dexes"],
        ["Compound", "Lending"],
        ["Convex", "Yield"],
      ];
      return rows.map(([name, category]) => ({
        name,
        category,
        tvl: round(rng(`ptvl:${name}`)() * 35_000_000_000, 0),
        changePct: round((rng(`ptvlc:${name}`)() * 2 - 1) * 10),
      }));
    });
  }

  getProtocolTvlHistory(
    slugs: string[],
  ): Promise<Record<string, SeriesPoint[]>> {
    return this.gate<Record<string, SeriesPoint[]>>({}, () =>
      this.seriesFor(slugs, "ptvlh", 20_000_000_000),
    );
  }

  getProtocolFees(): Promise<ProtocolFeesEntry[]> {
    return this.gate<ProtocolFeesEntry[]>([], () => {
      const protos = [
        "Tether",
        "Circle",
        "Tron",
        "Ethereum",
        "Solana",
        "Hyperliquid",
        "Aave",
        "Uniswap",
        "Pump.fun",
        "Jito",
        "Lido",
        "PancakeSwap",
      ];
      return protos.map((name) => ({
        name,
        fees24h: round(rng(`fees:${name}`)() * 12_000_000, 0),
        changePct: round((rng(`feesc:${name}`)() * 2 - 1) * 20),
      }));
    });
  }

  private seriesFor(
    slugs: string[],
    salt: string,
    scale: number,
  ): Record<string, SeriesPoint[]> {
    const out: Record<string, SeriesPoint[]> = {};
    for (const slug of slugs) {
      const r = rng(`${salt}:${slug}`);
      let v = scale * (0.5 + r() * 0.5);
      out[slug] = Array.from({ length: 90 }, (_, i) => {
        v = Math.max(scale * 0.05, v * (0.97 + r() * 0.06));
        return { time: BASELINE_NOW - (89 - i) * DAY, value: round(v, 0) };
      });
    }
    return out;
  }

  // ── crypto deep dive ────────────────────────────────────────────────────
  /**
   * Identity and supply per asset. Note which assets carry `max` and which
   * don't: BTC's 21 M cap and HYPE's 1 B cap are real, while ETH, SOL, DOGE and
   * ATOM are genuinely uncapped and so omit the field entirely rather than
   * carrying 0 — see {@link CryptoProfileSeed.max}.
   */
  private static readonly CRYPTO_PROFILES: Record<string, CryptoProfileSeed> = {
    BTC: {
      id: "bitcoin",
      name: "Bitcoin",
      rank: 1,
      categories: ["Cryptocurrency", "Layer 1", "Proof of Work"],
      circulating: 19_912_500,
      total: 19_912_500,
      max: 21_000_000,
      ath: 126_198,
      athDate: "2025-10-06",
      atl: 0.04865,
      atlDate: "2013-07-05",
      description:
        "The first decentralised digital currency, secured by proof of work and capped at 21 million coins.",
      links: {
        homepage: "https://bitcoin.org",
        sourceCode: "https://github.com/bitcoin/bitcoin",
        twitter: "bitcoin",
        subreddit: "https://reddit.com/r/bitcoin",
        whitepaper: "https://bitcoin.org/bitcoin.pdf",
      },
      developer: {
        stars: 84_100,
        forks: 37_400,
        subscribers: 4_020,
        totalIssues: 8_640,
        closedIssues: 7_910,
        pullRequestsMerged: 12_480,
        pullRequestContributors: 1_090,
        commits4Weeks: 132,
      },
    },
    ETH: {
      id: "ethereum",
      name: "Ethereum",
      rank: 2,
      categories: ["Layer 1", "Smart Contract Platform", "Proof of Stake"],
      circulating: 120_710_000,
      total: 120_710_000,
      ath: 4_953.73,
      athDate: "2025-08-24",
      atl: 0.432979,
      atlDate: "2015-10-20",
      description:
        "A programmable settlement layer whose issuance nets against a fee burn, so its supply can shrink.",
      links: {
        homepage: "https://ethereum.org",
        sourceCode: "https://github.com/ethereum/go-ethereum",
        twitter: "ethereum",
        subreddit: "https://reddit.com/r/ethereum",
        whitepaper: "https://ethereum.org/en/whitepaper/",
      },
      developer: {
        stars: 48_900,
        forks: 20_800,
        subscribers: 2_210,
        totalIssues: 27_300,
        closedIssues: 25_900,
        pullRequestsMerged: 22_100,
        pullRequestContributors: 1_460,
        commits4Weeks: 214,
      },
    },
    SOL: {
      id: "solana",
      name: "Solana",
      rank: 6,
      categories: ["Layer 1", "Smart Contract Platform", "Solana Ecosystem"],
      circulating: 545_800_000,
      total: 606_400_000,
      ath: 294.33,
      athDate: "2024-11-23",
      atl: 0.500801,
      atlDate: "2020-05-11",
      description:
        "A single-shard high-throughput chain with an inflationary, uncapped supply schedule.",
      links: {
        homepage: "https://solana.com",
        sourceCode: "https://github.com/anza-xyz/agave",
        twitter: "solana",
        subreddit: "https://reddit.com/r/solana",
      },
      developer: {
        stars: 14_200,
        forks: 4_780,
        subscribers: 396,
        totalIssues: 6_140,
        closedIssues: 5_320,
        pullRequestsMerged: 9_870,
        pullRequestContributors: 604,
        commits4Weeks: 288,
      },
    },
    HYPE: {
      id: "hyperliquid",
      name: "Hyperliquid",
      rank: 22,
      categories: ["Layer 1", "Perpetuals", "Hyperliquid Ecosystem"],
      circulating: 333_928_180,
      total: 1_000_000_000,
      max: 1_000_000_000,
      ath: 59.39,
      athDate: "2025-09-18",
      atl: 3.81,
      atlDate: "2024-11-29",
      description:
        "An order-book perp exchange on its own L1; a third of the capped supply circulates, so the FDV gap is the story.",
      links: {
        homepage: "https://hyperliquid.xyz",
        twitter: "HyperliquidX",
      },
      developer: {
        stars: 620,
        forks: 214,
        commits4Weeks: 41,
      },
    },
    DOGE: {
      id: "dogecoin",
      name: "Dogecoin",
      rank: 9,
      categories: ["Meme", "Proof of Work", "Payments"],
      circulating: 149_560_000_000,
      total: 149_560_000_000,
      ath: 0.731578,
      athDate: "2021-05-08",
      atl: 0.0000869,
      atlDate: "2015-05-06",
      description:
        "A proof-of-work payments coin with a fixed 10,000-per-block reward and no supply cap at all.",
      links: {
        homepage: "https://dogecoin.com",
        sourceCode: "https://github.com/dogecoin/dogecoin",
        twitter: "dogecoin",
        subreddit: "https://reddit.com/r/dogecoin",
      },
      developer: {
        stars: 15_100,
        forks: 2_880,
        subscribers: 649,
        totalIssues: 2_390,
        closedIssues: 2_180,
        pullRequestsMerged: 1_640,
        pullRequestContributors: 258,
        commits4Weeks: 9,
      },
    },
    LINK: {
      id: "chainlink",
      name: "Chainlink",
      rank: 18,
      categories: ["Oracle", "Infrastructure", "Smart Contract Platform"],
      circulating: 678_099_970,
      total: 1_000_000_000,
      max: 1_000_000_000,
      ath: 52.7,
      athDate: "2021-05-10",
      atl: 0.148183,
      atlDate: "2017-11-29",
      description:
        "The dominant oracle network; roughly a third of the capped token supply is still undistributed.",
      links: {
        homepage: "https://chain.link",
        sourceCode: "https://github.com/smartcontractkit/chainlink",
        twitter: "chainlink",
        whitepaper: "https://chain.link/whitepaper",
      },
      developer: {
        stars: 7_320,
        forks: 4_610,
        subscribers: 291,
        totalIssues: 1_180,
        closedIssues: 990,
        pullRequestsMerged: 14_900,
        pullRequestContributors: 372,
        commits4Weeks: 176,
      },
    },
    ATOM: {
      id: "cosmos",
      name: "Cosmos Hub",
      rank: 48,
      categories: ["Layer 1", "Cosmos Ecosystem", "Interoperability"],
      circulating: 470_500_000,
      total: 470_500_000,
      ath: 44.7,
      athDate: "2021-09-20",
      atl: 1.16,
      atlDate: "2020-03-13",
      description:
        "An uncapped mid-cap: the IBC hub's staking issuance runs indefinitely, so market cap and FDV coincide.",
      links: {
        homepage: "https://cosmos.network",
        sourceCode: "https://github.com/cosmos/gaia",
        twitter: "cosmoshub",
        subreddit: "https://reddit.com/r/cosmosnetwork",
      },
      developer: {
        stars: 1_320,
        forks: 830,
        subscribers: 112,
        totalIssues: 1_960,
        closedIssues: 1_790,
        pullRequestsMerged: 2_410,
        pullRequestContributors: 214,
        commits4Weeks: 27,
      },
    },
  };

  getCryptoProfile(asset: string): Promise<CryptoAssetProfile> {
    // Callers pass either a ticker ("BTC") or the publisher's id ("bitcoin").
    const ticker = tickerOf(asset);
    const profiles = MockMarketDataProvider.CRYPTO_PROFILES;
    const byId = Object.keys(profiles).find(
      (key) => profiles[key].id === asset.toLowerCase(),
    );
    const symbol = profiles[ticker] ? ticker : (byId ?? ticker);
    const known = profiles[symbol];
    const empty: CryptoAssetProfile = {
      id: known?.id ?? symbol.toLowerCase(),
      symbol,
      name: known?.name ?? NAMES[symbol] ?? symbol,
      categories: [],
    };
    return this.gate<CryptoAssetProfile>(empty, () => {
      const r = rng(`profile:${symbol}`);
      const raw = priceFor(symbol);
      const price = round(raw, raw < 1 ? 5 : 2);
      const def: CryptoProfileSeed = known ?? {
        id: symbol.toLowerCase(),
        name: NAMES[symbol] ?? symbol,
        rank: 25 + Math.round(r() * 90),
        categories: ["Smart Contract Platform"],
        circulating: round(2e8 + r() * 8e8, 0),
        total: round(2e8 + r() * 1.4e9, 0),
        // Uncapped, like most assets — hence no `max` key at all.
        ath: round(price * (1.8 + r() * 3), 4),
        athDate: "2025-01-19",
        atl: round(price * (0.03 + r() * 0.05), 6),
        atlDate: "2020-03-13",
        description: `${symbol} has no curated profile in the mock provider, so its supply and history are seeded.`,
        links: { homepage: `https://example.com/${symbol.toLowerCase()}` },
        developer: { stars: 940, forks: 318, commits4Weeks: 46 },
      };
      const total = Math.max(def.total, def.circulating);
      // Market cap and FDV are COMPUTED off `price`, never quoted independently:
      // a card showing the mcap-vs-FDV gap next to the price would otherwise
      // read as a frame bug the moment the two disagreed.
      return {
        id: def.id,
        symbol,
        name: def.name,
        description: def.description,
        categories: def.categories,
        marketCapRank: def.rank,
        links: def.links,
        price,
        marketCap: round(price * def.circulating, 0),
        fullyDilutedValuation: round(price * (def.max ?? total), 0),
        volume24h: round(price * def.circulating * (0.012 + r() * 0.05), 0),
        circulatingSupply: def.circulating,
        totalSupply: total,
        // Spread rather than assigned, so an uncapped asset has NO key.
        ...(def.max != null ? { maxSupply: def.max } : {}),
        ath: def.ath,
        athDate: def.athDate,
        athChangePct: round((price / def.ath - 1) * 100, 2),
        atl: def.atl,
        atlDate: def.atlDate,
        atlChangePct: round((price / def.atl - 1) * 100, 2),
        changePct24h: round((r() * 2 - 1) * 6, 2),
        changePct7d: round((r() * 2 - 1) * 14, 2),
        changePct30d: round((r() * 2 - 1) * 28, 2),
        changePct1y: round((r() * 2 - 0.7) * 90, 2),
        developer: def.developer,
      };
    });
  }

  /**
   * Per-protocol fee scale and take rate. The take rate is the whole point:
   * `revenue` is only the slice the protocol keeps, so a pass-through DEX runs a
   * few percent while a chain keeps nearly all of its gas.
   */
  private static readonly PROTOCOL_FUNDAMENTALS: Record<
    string,
    { name: string; feesPerDay: number; takeRate: number; tvl: number }
  > = {
    uniswap: {
      name: "Uniswap",
      feesPerDay: 2_450_000,
      takeRate: 0.045,
      tvl: 4_620_000_000,
    },
    aave: {
      name: "Aave",
      feesPerDay: 1_680_000,
      takeRate: 0.14,
      tvl: 24_300_000_000,
    },
    lido: {
      name: "Lido",
      feesPerDay: 3_120_000,
      takeRate: 0.1,
      tvl: 29_100_000_000,
    },
    ethereum: {
      name: "Ethereum",
      feesPerDay: 3_450_000,
      takeRate: 0.86,
      tvl: 65_400_000_000,
    },
    hyperliquid: {
      name: "Hyperliquid",
      feesPerDay: 1_930_000,
      takeRate: 0.93,
      tvl: 2_140_000_000,
    },
  };

  getProtocolFundamentals(protocol: string): Promise<ProtocolFundamentals> {
    const slug = protocol.toLowerCase();
    const known = MockMarketDataProvider.PROTOCOL_FUNDAMENTALS[slug];
    const name = known?.name ?? prettyName(slug);
    const empty: ProtocolFundamentals = {
      protocol: slug,
      name,
      fees: [],
      revenue: [],
    };
    return this.gate<ProtocolFundamentals>(empty, () => {
      const r = rng(`fundamentals:${slug}`);
      const scale = known?.feesPerDay ?? round(200_000 + r() * 2_000_000, 0);
      const takeRate = known?.takeRate ?? round(0.08 + r() * 0.5, 3);
      // Comfortably over a year, so a 365-day trailing window is exercised
      // rather than silently truncated to whatever history exists.
      const n = 480;
      const fees: SeriesPoint[] = [];
      const revenue: SeriesPoint[] = [];
      let level = scale;
      let burst = 1;
      for (let i = 0; i < n; i++) {
        const time = BASELINE_NOW - (n - 1 - i) * DAY;
        level *= 1 + (r() - 0.5) * 0.14;
        level = Math.min(scale * 2.6, Math.max(scale * 0.32, level));
        // Fee days are spiky: a liquidation cascade or a mint doubles one.
        if (r() < 0.03) burst += 0.9;
        burst = 1 + (burst - 1) * 0.55;
        const fee = round(level * burst, 0);
        // STRICTLY below fees, every day: the remainder accrues to LPs,
        // suppliers or stakers, and a P/S analogue is nonsense the moment
        // revenue can equal fees. The floor makes that a guarantee, not a
        // property of the jitter range.
        const rev = Math.min(
          round(fee * takeRate * (0.94 + r() * 0.12), 0),
          fee - 1,
        );
        fees.push({ time, value: fee });
        revenue.push({ time, value: rev });
      }
      const sum = (s: SeriesPoint[], days: number) =>
        s.slice(-days).reduce((a, p) => a + p.value, 0);
      return {
        protocol: slug,
        name,
        fees,
        revenue,
        // The published aggregates ARE the sums of the series, so a frame that
        // divides market cap by revenue365d gets exactly the multiple it would
        // get by summing the chart itself.
        fees30d: sum(fees, 30),
        fees365d: sum(fees, 365),
        revenue30d: sum(revenue, 30),
        revenue365d: sum(revenue, 365),
        tvl: known?.tvl ?? round(3e8 + r() * 5e9, 0),
      };
    });
  }

  /**
   * Emission schedules. `finalInsiderPct` above `insiderPct` means still
   * vesting; `progress: 100` with no remaining tranches is the fully-vested
   * fixture, which the frame renders with different copy — without one here
   * that branch is never exercised.
   */
  private static readonly UNLOCKS: Record<
    string,
    {
      maxSupply: number;
      insiderPct: number;
      finalInsiderPct: number;
      progress: number;
    }
  > = {
    arbitrum: {
      maxSupply: 10_000_000_000,
      insiderPct: 36.5,
      finalInsiderPct: 39.4,
      progress: 81.3,
    },
    uniswap: {
      maxSupply: 1_000_000_000,
      insiderPct: 21.3,
      finalInsiderPct: 21.3,
      progress: 100,
    },
    lido: {
      maxSupply: 1_000_000_000,
      insiderPct: 28.1,
      finalInsiderPct: 32.7,
      progress: 74.5,
    },
    hyperliquid: {
      maxSupply: 1_000_000_000,
      insiderPct: 23.8,
      finalInsiderPct: 38.9,
      progress: 41.2,
    },
  };

  getTokenUnlocks(protocol: string): Promise<TokenUnlocks> {
    const slug = protocol.toLowerCase();
    const known = MockMarketDataProvider.UNLOCKS[slug];
    const empty: TokenUnlocks = { protocol: slug, schedule: [], upcoming: [] };
    if (!known) return this.gate<TokenUnlocks>(empty, () => empty);
    return this.gate<TokenUnlocks>(empty, () => {
      const r = rng(`unlocks:${slug}`);
      // ~80% history, ~20% schedule: the future half is the whole point, and a
      // fixture that stopped at today would never exercise the frame's
      // observed-vs-projected split.
      const past = 320;
      const future = 80;
      const step = 7 * DAY;
      const observedThrough = BASELINE_NOW;
      const schedule: SeriesPoint[] = [];
      // Cumulative unlocked supply, so it MUST be non-decreasing — a dip would
      // render as tokens un-unlocking. Each step adds a non-negative amount.
      let unlocked = known.maxSupply * (known.progress / 100) * 0.55;
      for (let i = -past; i <= future; i++) {
        const remaining = known.maxSupply - unlocked;
        const add =
          i <= 0 ? remaining * 0.004 : remaining * (0.004 + r() * 0.01);
        unlocked = Math.min(known.maxSupply, unlocked + add);
        schedule.push({
          time: observedThrough + i * step,
          value: round(unlocked, 0),
        });
      }

      const CATEGORIES = ["Team", "Investors", "Ecosystem", "Airdrop"];
      const upcoming: TokenUnlockEvent[] =
        known.progress >= 100
          ? []
          : Array.from({ length: 5 }, (_, i) => ({
              time: observedThrough + (i + 1) * 34 * DAY,
              category: CATEGORIES[i % CATEGORIES.length],
              description: `${CATEGORIES[i % CATEGORIES.length]} tranche ${i + 1}`,
              tokens: round(known.maxSupply * (0.004 + r() * 0.012), 0),
              unlockType: i % 3 === 0 ? "cliff" : "linear",
            }));

      return {
        protocol: slug,
        schedule,
        observedThrough,
        maxSupply: known.maxSupply,
        insiderPctNow: known.insiderPct,
        insiderPctFinal: known.finalInsiderPct,
        progressPct: known.progress,
        upcoming,
      };
    });
  }

  getCoinMarkets(): Promise<CoinMarketEntry[]> {
    return this.gate<CoinMarketEntry[]>([], () =>
      CRYPTO.map((symbol, i) => ({
        symbol,
        name: NAMES[symbol] ?? symbol,
        marketCapUsd: round(
          (1_300_000_000_000 / (i + 1)) * (0.8 + rng(`mc:${symbol}`)() * 0.4),
          0,
        ),
        changePct24h: round((rng(`mcc:${symbol}`)() * 2 - 1) * 8),
      })),
    );
  }

  // ── sentiment / global ────────────────────────────────────────────────────
  getFearGreed(limit?: number): Promise<FearGreedPoint[]> {
    return this.gate<FearGreedPoint[]>([], () => {
      const n = limit ?? 90;
      const r = rng("feargreed");
      return Array.from({ length: n }, (_, i) => {
        const value = Math.round(20 + r() * 60);
        return {
          value,
          classification:
            value < 25
              ? "Extreme Fear"
              : value < 45
                ? "Fear"
                : value < 55
                  ? "Neutral"
                  : value < 75
                    ? "Greed"
                    : "Extreme Greed",
          // most-recent first
          time: BASELINE_NOW - i * DAY,
        };
      });
    });
  }

  getGlobalMarket(): Promise<GlobalMarket> {
    const empty: GlobalMarket = {
      totalMarketCapUsd: 0,
      marketCapChangePct24h: 0,
      dominance: {},
    };
    return this.gate<GlobalMarket>(empty, () => ({
      totalMarketCapUsd: 2_410_000_000_000,
      marketCapChangePct24h: round((rng("gm")() * 2 - 1) * 4),
      dominance: { btc: 54.2, eth: 12.8, usdt: 4.1, bnb: 3.2, sol: 2.9 },
    }));
  }

  // ── macro / rates / official ──────────────────────────────────────────────
  getReferenceRates(): Promise<ReferenceRate[]> {
    return this.gate<ReferenceRate[]>([], () => [
      {
        code: "SOFR",
        label: "Secured Overnight Financing Rate",
        date: "2026-06-15",
        rate: 4.33,
        source: "NY Fed",
        volumeInBillions: 2_410,
      },
      {
        code: "EFFR",
        label: "Effective Federal Funds Rate",
        date: "2026-06-15",
        rate: 4.33,
        source: "NY Fed",
        targetRateFrom: 4.25,
        targetRateTo: 4.5,
      },
      {
        code: "BGCR",
        label: "Broad General Collateral Rate",
        date: "2026-06-15",
        rate: 4.31,
        source: "NY Fed",
      },
    ]);
  }

  getFxRates(base: string, symbols: string[]): Promise<FxRate[]> {
    const b = base.toUpperCase();
    // Plausible anchors — units of the currency per 1 USD; others get a seed.
    const ANCHOR: Record<string, number> = {
      EUR: 0.877,
      GBP: 0.756,
      JPY: 161.9,
      CHF: 0.815,
      CAD: 1.37,
      AUD: 1.52,
      CNY: 7.18,
      INR: 83.4,
      MXN: 18.6,
      BRL: 5.42,
    };
    return this.gate<FxRate[]>([], () =>
      symbols
        .map((s) => s.toUpperCase())
        .filter((s) => s && s !== b)
        .map((symbol) => {
          const r = rng(`fx:${b}:${symbol}`);
          const anchor = ANCHOR[symbol] ?? round(0.5 + r() * 4, 4);
          const history: SeriesPoint[] = [];
          let v = anchor * (0.97 + r() * 0.04);
          for (let i = 29; i >= 0; i--) {
            v *= 1 + (r() - 0.5) * 0.01;
            history.push({ time: BASELINE_NOW - i * DAY, value: round(v, 5) });
          }
          const latest = history[history.length - 1].value;
          const prev = history[history.length - 2].value;
          const changePct = round(((latest - prev) / prev) * 100, 2);
          return { symbol, base: b, rate: latest, changePct, history };
        }),
    );
  }

  getTreasuryAverageRates(): Promise<TreasuryAverageRate[]> {
    return this.gate<TreasuryAverageRate[]>([], () =>
      [
        ["Treasury Bills", "Bills"],
        ["Treasury Notes", "Notes"],
        ["Treasury Bonds", "Bonds"],
        ["Total Marketable", "Marketable"],
      ].map(([security, securityType]) => ({
        date: "2026-05-31",
        securityType,
        security,
        rate: round(3.4 + rng(`avgrate:${security}`)() * 1.6),
      })),
    );
  }

  getYieldCurve(): Promise<YieldCurve> {
    const empty: YieldCurve = { date: "2026-06-15", points: [] };
    return this.gate<YieldCurve>(empty, () => {
      const mats: [string, number][] = [
        ["1M", 1],
        ["3M", 3],
        ["6M", 6],
        ["1Y", 12],
        ["2Y", 24],
        ["5Y", 60],
        ["10Y", 120],
        ["30Y", 360],
      ];
      return {
        date: "2026-06-15",
        points: mats.map(([label, months]) => ({
          label,
          months,
          rate: round(4.0 + Math.log10(months) * 0.45),
        })),
      };
    });
  }

  getTreasuryAuctions(limit?: number): Promise<TreasuryAuction[]> {
    return this.gate<TreasuryAuction[]>([], () => {
      const terms: [string, string][] = [
        ["Bill", "4-Week"],
        ["Bill", "8-Week"],
        ["Note", "2-Year"],
        ["Note", "10-Year"],
        ["Bond", "30-Year"],
        ["TIPS", "5-Year"],
      ];
      const n = limit ?? terms.length;
      return Array.from({ length: n }, (_, i) => {
        const [securityType, securityTerm] = terms[i % terms.length];
        const r = rng(`auction:${i}`);
        return {
          auctionDate: new Date(BASELINE_NOW - i * 3 * DAY)
            .toISOString()
            .slice(0, 10),
          securityType,
          securityTerm,
          rate: round(4 + r() * 1.2),
          bidToCover: round(2.2 + r() * 0.8),
          offeringAmount: 70_000_000_000,
          totalAccepted: 69_000_000_000,
        };
      });
    });
  }

  getNationalDebt(days?: number): Promise<NationalDebt> {
    const empty: NationalDebt = {
      date: "2026-06-15",
      total: 0,
      heldByPublic: 0,
      intragovernmental: 0,
      trend: [],
    };
    return this.gate<NationalDebt>(empty, () => {
      const n = days ?? 90;
      const r = rng("debt");
      let total = 36_200_000_000_000;
      const trend = Array.from({ length: n }, (_, i) => {
        total += r() * 6_000_000_000;
        const t = BASELINE_NOW - (n - 1 - i) * DAY;
        return {
          time: t,
          date: new Date(t).toISOString().slice(0, 10),
          total: round(total, 0),
        };
      });
      return {
        date: trend[trend.length - 1].date,
        total: trend[trend.length - 1].total,
        heldByPublic: round(total * 0.79, 0),
        intragovernmental: round(total * 0.21, 0),
        trend,
      };
    });
  }

  getFinancialStress(): Promise<FinancialStress> {
    const empty: FinancialStress = {
      value: 0,
      date: "2026-06-15",
      categories: [],
      trend: [],
      source: "OFR",
    };
    return this.gate<FinancialStress>(empty, () => {
      const r = rng("stress");
      const trend = Array.from({ length: 60 }, (_, i) => {
        const t = BASELINE_NOW - (59 - i) * DAY;
        return {
          time: t,
          date: new Date(t).toISOString().slice(0, 10),
          value: round((r() - 0.5) * 3),
        };
      });
      return {
        value: trend[trend.length - 1].value,
        date: trend[trend.length - 1].date,
        categories: [
          { label: "Credit", value: round((r() - 0.5) * 1.5) },
          { label: "Equity Valuation", value: round((r() - 0.5) * 1.5) },
          { label: "Funding", value: round((r() - 0.5) * 1.5) },
          { label: "Safe Assets", value: round((r() - 0.5) * 1.5) },
          { label: "Volatility", value: round((r() - 0.5) * 1.5) },
        ],
        trend,
        source: "OFR",
      };
    });
  }

  getMacroSeries(
    seriesId: string,
    startYear: number,
    endYear: number,
  ): Promise<MacroSeries> {
    const empty: MacroSeries = {
      seriesId,
      label: seriesId,
      source: "BLS",
      points: [],
    };
    return this.gate<MacroSeries>(empty, () => {
      const months = Math.max(12, Math.min(48, (endYear - startYear + 1) * 12));
      const r = rng(`macro:${seriesId}`);
      let v = 300 + r() * 50;
      const monthNames = [
        "Jan",
        "Feb",
        "Mar",
        "Apr",
        "May",
        "Jun",
        "Jul",
        "Aug",
        "Sep",
        "Oct",
        "Nov",
        "Dec",
      ];
      const points = Array.from({ length: months }, (_, i) => {
        v *= 1 + (r() - 0.45) * 0.01;
        const t = BASELINE_NOW - (months - 1 - i) * 30 * DAY;
        const d = new Date(t);
        return {
          time: t,
          date: `${monthNames[d.getUTCMonth()]} ${d.getUTCFullYear()}`,
          value: round(v),
          period: `M${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
        };
      });
      return { seriesId, label: seriesId, source: "BLS", points };
    });
  }

  // ── equities ────────────────────────────────────────────────────────────
  getCompanyFilings(tickerOrCik: string): Promise<SecCompanyFilings> {
    const t = tickerOf(tickerOrCik);
    const empty: SecCompanyFilings = {
      cik: "0000000000",
      name: t,
      tickers: [t],
      exchanges: [],
      filings: [],
    };
    return this.gate<SecCompanyFilings>(empty, () => {
      const forms = ["10-K", "10-Q", "8-K", "4", "8-K", "4", "S-8", "DEF 14A"];
      return {
        cik: "0000320193",
        name: `${t} Inc.`,
        tickers: [t],
        exchanges: ["Nasdaq"],
        sic: "3571",
        sicDescription: "Electronic Computers",
        category: "Large accelerated filer",
        fiscalYearEnd: "0927",
        filings: forms.map((form, i) => ({
          form,
          filingDate: new Date(BASELINE_NOW - i * 5 * DAY)
            .toISOString()
            .slice(0, 10),
          accessionNumber: `0001140361-26-0256${22 + i}`,
          url: "https://www.sec.gov/cgi-bin/browse-edgar",
        })),
      };
    });
  }

  getCompanyFacts(tickerOrCik: string): Promise<CompanyFacts> {
    const t = tickerOf(tickerOrCik);
    const empty: CompanyFacts = {
      cik: "0000000000",
      entityName: t,
      metrics: [],
    };
    return this.gate<CompanyFacts>(empty, () => {
      const r = rng(`facts:${t}`);
      const rev = round(80_000_000_000 + r() * 320_000_000_000, 0);
      return {
        cik: "0000320193",
        entityName: `${t} Inc.`,
        metrics: [
          {
            label: "Revenue",
            value: rev,
            unit: "USD",
            end: "2025-09-27",
            fiscalPeriod: "FY2025",
            form: "10-K",
          },
          {
            label: "Net income",
            value: round(rev * 0.25, 0),
            unit: "USD",
            end: "2025-09-27",
            fiscalPeriod: "FY2025",
            form: "10-K",
          },
          {
            label: "Total assets",
            value: round(rev * 1.9, 0),
            unit: "USD",
            end: "2025-09-27",
            fiscalPeriod: "FY2025",
            form: "10-K",
          },
          {
            label: "EPS (diluted)",
            value: round(2 + r() * 6),
            unit: "USD/shares",
            end: "2025-09-27",
            fiscalPeriod: "FY2025",
            form: "10-K",
          },
          {
            label: "Shares outstanding",
            value: round(2_000_000_000 + r() * 13_000_000_000, 0),
            unit: "shares",
            end: "2025-09-27",
            fiscalPeriod: "FY2025",
            form: "10-K",
          },
        ],
      };
    });
  }

  getShortVolume(symbols: string[]): Promise<Record<string, ShortVolumeEntry>> {
    return this.gate<Record<string, ShortVolumeEntry>>({}, () => {
      const out: Record<string, ShortVolumeEntry> = {};
      for (const symbol of symbols) {
        const t = tickerOf(symbol);
        const r = rng(`short:${t}`);
        const total = Math.round(5_000_000 + r() * 80_000_000);
        const short = Math.round(total * (0.3 + r() * 0.35));
        out[symbol] = {
          date: "2026-06-13",
          symbol: t,
          shortVolume: short,
          shortExemptVolume: Math.round(short * 0.02),
          totalVolume: total,
          shortPct: round((short / total) * 100),
        };
      }
      return out;
    });
  }

  // ── equity deep-dive ────────────────────────────────────────────────────
  getCompanyFactsHistory(
    tickerOrCik: string,
    cadence: "annual" | "quarterly" = "annual",
  ): Promise<CompanyFactsHistory> {
    const t = tickerOf(tickerOrCik);
    const resolved = cadence === "quarterly" ? "quarterly" : "annual";
    const empty: CompanyFactsHistory = {
      cik: "0000000000",
      entityName: t,
      cadence: resolved,
      series: [],
    };
    return this.gate<CompanyFactsHistory>(empty, () => {
      const periods = fiscalPeriods(10, resolved);
      const model = modelFinancials(t, periods);
      const facts = (
        pick: (m: MockFinancials) => number,
        kind: "duration" | "instant",
        dp = 0,
      ): FinancialFact[] =>
        periods.map((period, i) => {
          const fact: FinancialFact = {
            end: isoDay(period.endMs),
            value: round(pick(model[i]), dp),
            fiscalPeriod: period.fiscalPeriod,
            form: period.form,
          };
          // Instant (balance-sheet) facts are a snapshot and carry no start —
          // the same asymmetry the real XBRL blob has, and what a frame keys off
          // to decide whether a value covers a period or names a moment.
          if (kind === "duration")
            fact.start = isoDay(
              period.endMs - (period.quarter === 0 ? 364 : 90) * DAY,
            );
          return fact;
        });

      const series: FinancialSeries[] = [
        {
          label: "Revenue",
          unit: "USD",
          kind: "duration",
          // Two tags on purpose. Issuers move their top line between them
          // mid-decade, so a real revenue series is stitched — and a frame that
          // captions "stitched across N XBRL tags" only shows that caption when
          // a series actually has more than one.
          concepts: [
            "RevenueFromContractWithCustomerExcludingAssessedTax",
            "Revenues",
          ],
          facts: facts((m) => m.revenue, "duration"),
        },
        {
          label: "Net income",
          unit: "USD",
          kind: "duration",
          concepts: ["NetIncomeLoss"],
          facts: facts((m) => m.netIncome, "duration"),
        },
        {
          label: "Total assets",
          unit: "USD",
          kind: "instant",
          concepts: ["Assets"],
          facts: facts((m) => m.totalAssets, "instant"),
        },
        {
          label: "Shareholders' equity",
          unit: "USD",
          kind: "instant",
          concepts: [
            "StockholdersEquity",
            "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest",
          ],
          facts: facts((m) => m.shareholdersEquity, "instant"),
        },
        {
          label: "EPS (diluted)",
          unit: "USD/shares",
          kind: "duration",
          concepts: ["EarningsPerShareDiluted"],
          facts: facts((m) => m.dilutedEps, "duration", 2),
        },
      ];
      return {
        cik: "0001045810",
        entityName: companyProfileOf(t).name,
        cadence: resolved,
        series,
      };
    });
  }

  getEquityProfile(symbol: string): Promise<EquityProfile> {
    const t = tickerOf(symbol);
    const meta = companyProfileOf(t);
    // Shaped but observation-free: who the registrant is survives a session with
    // no published quote, and every figure on this contract is optional.
    const empty: EquityProfile = {
      symbol: t,
      companyName: `${meta.name} Common Stock`,
    };
    return this.gate<EquityProfile>(empty, () => {
      const r = rng(`profile:${t}`);
      const price = equityPriceFor(symbol);
      // Share count and earnings come from the same model the statements do, so
      // a valuation card deriving P/E from price ÷ EPS and P/S from market cap ÷
      // revenue lands on multiples that agree with each other.
      const model = modelFinancials(t, fiscalPeriods(10, "annual"));
      const latest = model[model.length - 1];
      const dividend = round(price * (0.002 + r() * 0.014));
      return {
        symbol: t,
        companyName: `${meta.name} Common Stock`,
        exchange: meta.exchange,
        sector: meta.sector,
        industry: meta.industry,
        price,
        previousClose: round(price * (0.985 + r() * 0.028)),
        marketCap: Math.round(price * latest.dilutedShares),
        // The 52-week range BRACKETS the last price on purpose: a profile card
        // draws a position marker along that track, and a price outside its own
        // range renders off the end of it.
        fiftyTwoWeekHigh: round(price * (1.14 + r() * 0.3)),
        fiftyTwoWeekLow: round(price * (0.52 + r() * 0.16)),
        averageVolume: Math.round(8_000_000 + r() * 160_000_000),
        annualisedDividend: dividend,
        // Derived from the dividend rather than drawn separately, so the two
        // fields on the same card can't contradict each other.
        dividendYield: round((dividend / price) * 100),
        // Street targets sit above spot far more often than not, and the frame
        // renders the gap as upside — a target below price shows as a shrug.
        oneYearTarget: round(price * (1.12 + r() * 0.22)),
      };
    });
  }

  getEquityFinancials(
    symbol: string,
    frequency: "annual" | "quarterly" = "annual",
  ): Promise<EquityFinancials> {
    const t = tickerOf(symbol);
    const resolved = frequency === "quarterly" ? "quarterly" : "annual";
    const empty: EquityFinancials = {
      symbol: t,
      periods: [],
      frequency: resolved,
      incomeStatement: [],
      balanceSheet: [],
      cashFlow: [],
      ratios: [],
    };
    return this.gate<EquityFinancials>(empty, () => {
      // Model the whole decade, publish the newest four columns: the exchange's
      // tables are shallow, but the margins have to sit on the same ramp the
      // XBRL history shows or the two cards disagree about the same year.
      const all = fiscalPeriods(10, resolved);
      const model = modelFinancials(t, all);
      const columns = [0, 1, 2, 3].map((i) => all.length - 1 - i);
      const periods = columns.map((i) => usDate(all[i].endMs));

      const row = (
        label: string,
        pick: (m: MockFinancials) => number,
        dp = 0,
      ): FinancialStatementRow => ({
        label,
        values: columns.map((i) => round(pick(model[i]), dp)),
      });
      /** A row the publisher only filled in for some of the columns. `null` is a
       *  blank cell, and a frame is required to skip it rather than draw a zero
       *  — so at least one of these ships in every statement. */
      const sparse = (
        label: string,
        pick: (m: MockFinancials) => number,
        blank: number[],
        dp = 0,
      ): FinancialStatementRow => ({
        label,
        values: columns.map((i, col) =>
          blank.includes(col) ? null : round(pick(model[i]), dp),
        ),
      });

      return {
        symbol: t,
        periods,
        frequency: resolved,
        incomeStatement: [
          row("Total Revenue", (m) => m.revenue),
          row("Cost of Revenue", (m) => m.costOfRevenue),
          row("Gross Profit", (m) => m.grossProfit),
          row("Research and Development", (m) => m.researchDevelopment),
          row("SG&A Expense", (m) => m.sellingGeneralAdmin),
          row("Operating Income", (m) => m.operatingIncome),
          row("Pre-Tax Income", (m) => m.pretaxIncome),
          row("Income Tax", (m) => m.incomeTax),
          row("Net Income", (m) => m.netIncome),
          row("Diluted EPS", (m) => m.dilutedEps, 2),
          row("Diluted Shares Outstanding", (m) => m.dilutedShares),
          // The classic all-blank line: the exchange prints the row whether or
          // not the filer has anything to put in it.
          sparse("Minority Interest", () => 0, [0, 1, 2, 3]),
        ],
        balanceSheet: [
          row("Total Assets", (m) => m.totalAssets),
          // Blank in the OLDEST column — the filer began breaking this out
          // mid-decade, which is the ordinary reason a cell is empty.
          sparse("Total Current Assets", (m) => m.currentAssets, [3]),
          row("Total Liabilities", (m) => m.totalLiabilities),
          row("Total Current Liabilities", (m) => m.currentLiabilities),
          row("Total Shareholders Equity", (m) => m.shareholdersEquity),
        ],
        cashFlow: [
          row("Net Cash Flow-Operating", (m) => m.operatingCashFlow),
          // Negative, as publishers report a cash outflow — a frame that plots
          // free cash flow has to ADD this, not subtract it.
          row("Capital Expenditures", (m) => m.capex),
          sparse("Net Cash Flow-Investing", (m) => m.investingCashFlow, [3]),
          row("Net Cash Flow-Financing", (m) => m.financingCashFlow),
        ],
        // Percentages as published — 70.1 means 70.1%, not 0.701.
        ratios: [
          row("Gross Margin", (m) => (m.grossProfit / m.revenue) * 100, 2),
          row(
            "Operating Margin",
            (m) => (m.operatingIncome / m.revenue) * 100,
            2,
          ),
          row("Pre-Tax Margin", (m) => (m.pretaxIncome / m.revenue) * 100, 2),
          row("Profit Margin", (m) => (m.netIncome / m.revenue) * 100, 2),
          row(
            "Return On Equity",
            (m) => (m.netIncome / m.shareholdersEquity) * 100,
            2,
          ),
          // A multiple, not a percent — the ratios table mixes both, so a frame
          // can't assume every row in it wants a "%" suffix.
          row(
            "Current Ratio",
            (m) => m.currentAssets / m.currentLiabilities,
            2,
          ),
        ],
      };
    });
  }

  /**
   * Surprise (percent of consensus) for the last eight quarters, newest first.
   *
   * Fixed rather than drawn: the frames need a run of beats, at least one MISS,
   * and one quarter the street never published a consensus for. A seeded random
   * walk would produce those only some of the time, and a story that renders the
   * interesting branch on a Tuesday isn't a test.
   */
  private static readonly EARNINGS_SURPRISES: readonly (number | null)[] = [
    10,
    8.28,
    5.6,
    -4.2,
    6.1,
    2.4,
    null,
    12.7,
  ];

  getEarningsHistory(symbol: string): Promise<EarningsHistory> {
    const t = tickerOf(symbol);
    const empty: EarningsHistory = { symbol: t, results: [] };
    return this.gate<EarningsHistory>(empty, () => {
      const all = fiscalPeriods(10, "quarterly");
      const model = modelFinancials(t, all);
      const results: EarningsResult[] = [];
      for (let i = 0; i < 8; i++) {
        const idx = all.length - 1 - i;
        const period = all[idx];
        const end = new Date(period.endMs);
        const eps = model[idx].dilutedEps;
        const result: EarningsResult = {
          fiscalQuarterEnd: `${MONTH_ABBR[end.getUTCMonth()]} ${end.getUTCFullYear()}`,
          // Companies report a few weeks after the books close.
          dateReported: isoDay(period.endMs + 24 * DAY),
          eps,
        };
        const surprise = MockMarketDataProvider.EARNINGS_SURPRISES[i];
        if (surprise !== null) {
          const consensus = round(eps / (1 + surprise / 100), 2);
          result.consensusEps = consensus;
          // Recomputed off the ROUNDED consensus rather than echoed back, so a
          // card that derives the surprise itself prints the same number as one
          // that trusts the field.
          result.surprisePct = round(
            ((eps - consensus) / Math.abs(consensus)) * 100,
            2,
          );
        }
        results.push(result);
      }
      return {
        symbol: t,
        results,
        nextReportDate: isoDay(BASELINE_NOW + 12 * DAY),
        nextReportTime: "after-hours",
      };
    });
  }

  /**
   * One session's scheduled reporters. A literal list, not a seeded draw: the
   * mix the frames need — pre-market against after-hours, a mega-cap against a
   * mid-cap, and one company whose market cap the exchange simply doesn't carry
   * — is a property of this list, and a generator would keep re-rolling it.
   *
   * The entry with no `marketCap` sits in the MIDDLE on purpose: a frame that
   * ranks the session by size has to sort it last, and one that forgets to
   * handle the gap shows it stranded mid-table where a reviewer will see it.
   */
  private static readonly EARNINGS_CALENDAR: readonly Omit<
    EarningsCalendarEntry,
    "date"
  >[] = [
    {
      symbol: "AAPL",
      companyName: "Apple Inc.",
      time: "after-hours",
      consensusEps: 2.41,
      estimateCount: 28,
      marketCap: 4_182_000_000_000,
    },
    {
      symbol: "COP",
      companyName: "ConocoPhillips",
      time: "pre-market",
      consensusEps: 2.96,
      estimateCount: 6,
      marketCap: 143_685_595_186,
    },
    {
      symbol: "GILD",
      companyName: "Gilead Sciences, Inc.",
      time: "after-hours",
      consensusEps: 1.98,
      estimateCount: 19,
      marketCap: 137_402_118_000,
    },
    {
      symbol: "MNST",
      companyName: "Monster Beverage Corporation",
      time: "after-hours",
      consensusEps: 0.51,
      estimateCount: 14,
      marketCap: 62_918_400_000,
    },
    {
      symbol: "PBR.A",
      companyName: "Petroleo Brasileiro S.A.- Petrobras",
      time: "unknown",
      estimateCount: 1,
      marketCap: 120_638_538_652,
    },
    {
      symbol: "DDOG",
      companyName: "Datadog, Inc.",
      time: "pre-market",
      consensusEps: 0.46,
      estimateCount: 22,
      marketCap: 48_720_000_000,
    },
    {
      symbol: "TTWO",
      companyName: "Take-Two Interactive Software, Inc.",
      time: "after-hours",
      consensusEps: -0.12,
      estimateCount: 16,
      marketCap: 41_360_000_000,
    },
    {
      // No market cap published — the exchange leaves the column blank on plenty
      // of foreign issuers and freshly listed names.
      symbol: "GRAB",
      companyName: "Grab Holdings Limited",
      time: "pre-market",
      consensusEps: 0.02,
      estimateCount: 9,
    },
    {
      symbol: "EXPE",
      companyName: "Expedia Group, Inc.",
      time: "after-hours",
      consensusEps: 4.13,
      estimateCount: 21,
      marketCap: 25_240_000_000,
    },
    {
      symbol: "PARA",
      companyName: "Paramount Global",
      time: "pre-market",
      consensusEps: 0.18,
      estimateCount: 11,
      marketCap: 8_930_000_000,
    },
    {
      symbol: "YETI",
      companyName: "YETI Holdings, Inc.",
      time: "pre-market",
      consensusEps: 0.63,
      estimateCount: 8,
      marketCap: 2_410_000_000,
    },
    {
      symbol: "SBLK",
      companyName: "Star Bulk Carriers Corp.",
      time: "pre-market",
      consensusEps: 0.29,
      estimateCount: 4,
      marketCap: 1_870_000_000,
    },
  ];

  getEarningsCalendar(date?: string): Promise<EarningsCalendarEntry[]> {
    return this.gate<EarningsCalendarEntry[]>([], () => {
      const session = date ?? isoDay(BASELINE_NOW);
      return MockMarketDataProvider.EARNINGS_CALENDAR.map((entry) => ({
        ...entry,
        date: session,
      }));
    });
  }

  /** Covering brokers as the exchange publishes them: upper case and truncated
   *  to a fixed width mid-word, which is what a frame's column has to survive. */
  private static readonly BROKERS = [
    "GOLDMAN SACHS",
    "MORGAN STANLEY",
    "B OF A GLBL RES",
    "SANFORD BERNSTE",
    "JP MORGAN",
    "WELLS FARGO SEC",
    "CANTOR FITZGERA",
    "TRUIST SECURIT",
    "OPPENHEIMER & C",
    "RAYMOND JAMES &",
    "PIPER SANDLER &",
    "MIZUHO SECURITI",
    "DEUTSCHE BANK",
    "BARCLAYS CAPITA",
    "STIFEL NICOLAUS",
  ];

  getAnalystRatings(symbol: string): Promise<AnalystRatings> {
    const t = tickerOf(symbol);
    const empty: AnalystRatings = { symbol: t, brokers: [] };
    return this.gate<AnalystRatings>(empty, () => {
      const r = rng(`ratings:${t}`);
      const labels = ["Strong Buy", "Buy", "Buy", "Hold"];
      const count = 12 + Math.floor(r() * 30);
      return {
        symbol: t,
        consensus: labels[Math.floor(r() * labels.length)],
        analystCount: count,
        // meanRating is deliberately absent: the keyless source publishes only
        // the label, and mapping "Buy" onto 1–5 would be our invention. The
        // frames are built around the label, so this is the shape they must see.
        brokers: MockMarketDataProvider.BROKERS.slice(
          0,
          Math.min(MockMarketDataProvider.BROKERS.length, 6 + (count % 8)),
        ),
      };
    });
  }

  getInstitutionalOwnership(symbol: string): Promise<InstitutionalOwnership> {
    const t = tickerOf(symbol);
    const empty: InstitutionalOwnership = { symbol: t };
    return this.gate<InstitutionalOwnership>(empty, () => {
      const r = rng(`ownership:${t}`);
      const model = modelFinancials(t, fiscalPeriods(10, "annual"));
      const shares = model[model.length - 1].dilutedShares;
      const ownedPct = round(58 + r() * 26);
      const increasedShares = Math.round(shares * (0.1 + r() * 0.04));
      return {
        symbol: t,
        institutionalOwnershipPct: ownedPct,
        sharesOutstanding: shares,
        totalHoldingsValue: Math.round(
          shares * (ownedPct / 100) * equityPriceFor(symbol),
        ),
        increasedHolders: 2_800 + Math.floor(r() * 900),
        increasedShares,
        decreasedHolders: 2_100 + Math.floor(r() * 700),
        // Accumulation, clearly: buyers add several times what sellers trim, so
        // a frame drawing the two against each other has an obvious winner
        // rather than two bars a reader has to measure.
        decreasedShares: Math.round(increasedShares * (0.14 + r() * 0.12)),
      };
    });
  }

  // ── news ──────────────────────────────────────────────────────────────────
  getNews(query: NewsQuery): Promise<NewsItem[]> {
    return this.gate<NewsItem[]>([], () => {
      const n = query.limit ?? 12;
      const source = query.feed.charAt(0).toUpperCase() + query.feed.slice(1);
      const heads = [
        "Markets steady as traders weigh rate path",
        "Bitcoin holds key level into the weekly close",
        "Tech megacaps lead a broad equity rally",
        "Treasury yields drift lower after auction",
        "DeFi TVL ticks higher as stables expand",
        "Options desks brace for a busy expiry",
        "Liquidity returns to majors after quiet session",
        "Funding turns positive across perp venues",
        "Analysts revise year-end targets higher",
        "On-chain volume rebounds week over week",
        "Volatility compresses to a multi-month low",
        "Risk appetite improves on macro data",
      ];
      return Array.from({ length: n }, (_, i) => ({
        title: heads[i % heads.length],
        url: `https://example.com/article-${i}`,
        source,
        publishedAt: BASELINE_NOW - i * 2_400_000,
        summary: "A short synthetic summary for the Storybook mock feed.",
      }));
    });
  }

  // ── derivatives / OI ────────────────────────────────────────────────────
  getOpenInterest(symbols?: string[]): Promise<OpenInterestEntry[]> {
    return this.gate<OpenInterestEntry[]>([], () => {
      const requested =
        symbols && symbols.length
          ? symbols.flatMap((s) => (s.endsWith(":*") ? STOCKS : [s]))
          : UNIVERSE;
      return requested.map((symbol) => ({
        symbol,
        openInterestUsd: round(rng(`oi:${symbol}`)() * 2_000_000_000, 0),
      }));
    });
  }

  getOptionsSummary(currency: string): Promise<OptionsSummary> {
    const cur = currency.toUpperCase();
    const underlying = priceFor(cur);
    const empty: OptionsSummary = {
      currency: cur,
      underlyingPrice: underlying,
      putCallRatioOi: 0,
      putCallRatioVolume: 0,
      callOi: 0,
      putOi: 0,
      callVolume: 0,
      putVolume: 0,
      avgIv: 0,
      nearestExpiry: { expiry: "—", expiryMs: BASELINE_NOW, strikes: [] },
      asOf: BASELINE_NOW,
    };
    return this.gate<OptionsSummary>(empty, () => {
      const r = rng(`opts:${cur}`);
      const step = underlying > 1000 ? 2000 : underlying > 100 ? 100 : 5;
      const atm = Math.round(underlying / step) * step;
      const strikes = Array.from({ length: 13 }, (_, i) => {
        const strike = atm + (i - 6) * step;
        const dist = Math.abs(i - 6);
        return {
          strike,
          callOi: Math.round((6 - dist + 1) * 800 * r() + 200),
          putOi: Math.round((6 - dist + 1) * 760 * r() + 200),
        };
      });
      const callOi = strikes.reduce((a, s) => a + s.callOi, 0);
      const putOi = strikes.reduce((a, s) => a + s.putOi, 0);
      return {
        currency: cur,
        underlyingPrice: underlying,
        putCallRatioOi: round(putOi / callOi),
        putCallRatioVolume: round(0.7 + r() * 0.8),
        callOi,
        putOi,
        callVolume: Math.round(callOi * (0.3 + r() * 0.4)),
        putVolume: Math.round(putOi * (0.3 + r() * 0.4)),
        avgIv: round(40 + r() * 30),
        nearestExpiry: {
          expiry: "27JUN26",
          expiryMs: BASELINE_NOW + 7 * DAY,
          strikes,
        },
        asOf: BASELINE_NOW,
      };
    });
  }

  /**
   * At-the-money implied vol for an expiry `dte` days out. A gently downward
   * term structure — the front is the jumpiest — so a term-structure card has a
   * slope to draw instead of a flat line.
   */
  private static atmIv(dte: number): number {
    return 0.3 + 0.06 * Math.exp(-dte / 60);
  }

  /**
   * The smile: implied vol at log-moneyness `m` (negative = strike below spot).
   *
   * Two shapes on purpose. The quadratic lifts BOTH wings above the money, and
   * the linear skew lifts the downside further than the upside — that asymmetry
   * is the whole point of plotting an equity smile, and a symmetric parabola
   * would let a frame look correct while showing nothing real. The small
   * put-side offset keeps the two curves from landing exactly on top of each
   * other, as same-strike quotes in a real chain rarely do.
   */
  private static smileIv(dte: number, m: number, side: "call" | "put"): number {
    const iv =
      MockMarketDataProvider.atmIv(dte) +
      1.4 * m * m -
      0.18 * m +
      (side === "put" ? 0.004 : -0.004);
    return round(Math.max(0.05, iv), 4);
  }

  getOptionsChain(symbol: string): Promise<OptionsChain> {
    const t = tickerOf(symbol);
    // A real envelope with no contracts in it: `delayMinutes` is a property of
    // the feed, not of any quote, so it survives having nothing to report.
    const empty: OptionsChain = { symbol: t, delayMinutes: 15, contracts: [] };
    return this.gate<OptionsChain>(empty, () => {
      const spot = equityPriceFor(symbol);
      const step = strikeStepFor(spot);
      const atm = Math.round(spot / step) * step;
      const half = (STRIKES_PER_EXPIRY - 1) / 2;
      const contracts: OptionContract[] = [];

      // Built expiry-ascending → strike-ascending → call before put, which is
      // the order OptionsChain documents and every frame indexes against.
      for (const expiry of OPTION_EXPIRIES) {
        const expiryMs = BASELINE_NOW + expiry.days * DAY;
        const expiryIso = isoDay(expiryMs);
        const years = expiry.days / 365;
        const sqrtT = Math.sqrt(years);

        for (let k = -half; k <= half; k++) {
          const strike = round(atm + k * step, 2);
          if (strike <= 0) continue;
          const m = Math.log(strike / spot);

          for (const side of ["call", "put"] as const) {
            const iv = MockMarketDataProvider.smileIv(expiry.days, m, side);
            const d1 =
              (Math.log(spot / strike) +
                (OPTION_RATE + (iv * iv) / 2) * years) /
              (iv * sqrtT);
            const d2 = d1 - iv * sqrtT;
            const discount = Math.exp(-OPTION_RATE * years);
            const callDelta = normCdf(d1);
            const price =
              side === "call"
                ? spot * callDelta - strike * discount * normCdf(d2)
                : strike * discount * normCdf(-d2) - spot * normCdf(-d1);

            // Open interest humps around the money and decays out the wings —
            // flat OI would give an OI-by-strike chart nothing to show and hand
            // max-pain a plateau with no minimum in it. The call hump sits a
            // touch above spot and the put hump a touch below, the way real
            // positioning splits, so max pain lands near spot without sitting
            // exactly on the ATM strike by construction.
            const centre = side === "call" ? 0.02 : -0.03;
            const offset = (m - centre) / 0.11;
            const oi = Math.round(
              9_000 * expiry.oiScale * Math.exp((-offset * offset) / 2),
            );
            const r = rng(`chain:${t}:${expiryIso}:${side}:${strike}`);

            // Far enough OTM on its own side, the feed carries no IV at all.
            // The greeks still come through — a near-zero gamma out there is
            // genuine, so unlike IV there is no value that means "absent".
            const quoted =
              side === "call" ? k < UNQUOTED_STEPS : k > -UNQUOTED_STEPS;
            const contract: OptionContract = {
              contract: occSymbol(t, expiryMs, side, strike),
              expiry: expiryIso,
              strike,
              side,
              openInterest: oi,
              volume: Math.round(oi * (0.05 + r() * 0.35)),
              bid: round(Math.max(0.01, price * 0.985)),
              ask: round(Math.max(0.02, price * 1.015)),
              delta: round(side === "call" ? callDelta : callDelta - 1, 4),
              gamma: round(normPdf(d1) / (spot * iv * sqrtT), 6),
              vega: round((spot * normPdf(d1) * sqrtT) / 100, 4),
              theta: round(
                -(spot * normPdf(d1) * iv) / (2 * sqrtT) / 365 -
                  (side === "call"
                    ? OPTION_RATE * strike * discount * normCdf(d2)
                    : -OPTION_RATE * strike * discount * normCdf(-d2)) /
                    365,
                4,
              ),
              rho: round(
                (side === "call"
                  ? strike * years * discount * normCdf(d2)
                  : -strike * years * discount * normCdf(-d2)) / 100,
                4,
              ),
            };
            if (quoted) {
              contract.iv = iv;
              contract.lastPrice = round(Math.max(0.01, price));
            }
            contracts.push(contract);
          }
        }
      }

      return {
        symbol: t,
        underlyingPrice: spot,
        iv30: round(MockMarketDataProvider.atmIv(30), 4),
        // The listed-equity feeds are 15 minutes behind, and every card built on
        // this data says so.
        delayMinutes: 15,
        contracts,
      };
    });
  }

  getVolatilityIndex(
    currency: string,
    startTimeMs: number,
    resolutionSec: number,
  ): Promise<VolatilityPoint[]> {
    return this.gate<VolatilityPoint[]>([], () => {
      const stepMs = Math.max(3_600_000, resolutionSec * 1000);
      const count = Math.min(
        500,
        Math.max(2, Math.round((BASELINE_NOW - startTimeMs) / stepMs)),
      );
      const r = rng(`dvol:${currency}`);
      let v = 45 + r() * 20;
      return Array.from({ length: count }, (_, i) => {
        v = Math.max(20, Math.min(120, v + (r() - 0.5) * 4));
        return { time: startTimeMs + i * stepMs, value: round(v) };
      });
    });
  }

  getCoinMovers(limit?: number): Promise<CoinMover[]> {
    return this.gate<CoinMover[]>([], () => {
      const n = limit ?? 50;
      const base = [...CRYPTO];
      return Array.from({ length: n }, (_, i) => {
        const symbol = base[i % base.length] + (i >= base.length ? `${i}` : "");
        const r = rng(`mover:${symbol}`);
        return {
          symbol,
          name: NAMES[base[i % base.length]] ?? symbol,
          rank: i + 1,
          priceUsd: round(priceFor(base[i % base.length]) * (0.5 + r()), 4),
          marketCapUsd: round((1_000_000_000_000 / (i + 1)) * (0.5 + r()), 0),
          volume24hUsd: round(r() * 40_000_000_000, 0),
          changePct: {
            "1h": round((r() * 2 - 1) * 3),
            "24h": round((r() * 2 - 1) * 12),
            "7d": round((r() * 2 - 1) * 30),
            "30d": round((r() * 2 - 1) * 60),
          },
        };
      });
    });
  }

  // ── bitcoin network ───────────────────────────────────────────────────────
  getBtcFees(): Promise<BtcFees> {
    const empty: BtcFees = {
      fastest: 0,
      halfHour: 0,
      hour: 0,
      economy: 0,
      minimum: 0,
    };
    return this.gate<BtcFees>(empty, () => {
      const r = rng("btcfees");
      const fastest = Math.round(8 + r() * 40);
      return {
        fastest,
        halfHour: Math.max(2, Math.round(fastest * 0.8)),
        hour: Math.max(2, Math.round(fastest * 0.6)),
        economy: Math.max(1, Math.round(fastest * 0.3)),
        minimum: 1,
      };
    });
  }

  getMempoolState(): Promise<MempoolState> {
    const empty: MempoolState = {
      count: 0,
      vsize: 0,
      totalFee: 0,
      projected: [],
    };
    return this.gate<MempoolState>(empty, () => {
      const r = rng("mempool");
      const projected = Array.from({ length: 6 }, (_, i) => {
        const medianFee = Math.round((40 - i * 5) * (0.8 + r() * 0.4));
        return {
          medianFee: Math.max(2, medianFee),
          feeRange: [Math.max(1, medianFee - 8), medianFee + 30],
          totalFees: Math.round((0.4 + r() * 0.3) * 1e8),
          nTx: Math.round(2500 + r() * 1500),
          blockVSize: 998_000,
        };
      });
      return {
        count: Math.round(8_000 + r() * 60_000),
        vsize: Math.round(40_000_000 + r() * 80_000_000),
        totalFee: Math.round((3 + r() * 6) * 1e8),
        projected,
      };
    });
  }

  getBtcBlocks(limit?: number): Promise<BtcBlock[]> {
    return this.gate<BtcBlock[]>([], () => {
      const n = limit ?? 12;
      const pools = [
        ["Foundry USA", "foundryusa"],
        ["AntPool", "antpool"],
        ["ViaBTC", "viabtc"],
        ["F2Pool", "f2pool"],
        ["MARA Pool", "marapool"],
      ];
      const height = 905_400;
      return Array.from({ length: n }, (_, i) => {
        const r = rng(`block:${i}`);
        const [poolName, poolSlug] = pools[i % pools.length];
        return {
          id: `0000000000000000000${hashString(`block:${i}`).toString(16)}`,
          height: height - i,
          time: BASELINE_NOW - i * 600_000,
          txCount: Math.round(2000 + r() * 2000),
          size: Math.round(1_200_000 + r() * 400_000),
          totalFees: Math.round((0.1 + r() * 0.4) * 1e8),
          medianFee: Math.round(5 + r() * 40),
          poolName,
          poolSlug,
        };
      });
    });
  }

  getNetworkHashrate(
    window: string,
  ): Promise<import("@zframes/core").NetworkHashrate> {
    const empty = {
      currentHashrate: 0,
      currentDifficulty: 0,
      hashrates: [],
      difficulty: [],
    };
    return this.gate(empty, () => {
      const days = window === "3y" ? 1095 : window === "2y" ? 730 : 365;
      const step = Math.max(1, Math.round(days / 180));
      const r = rng(`hashrate:${window}`);
      let h = 5.5e20;
      let d = 9e13;
      const hashrates = [];
      const difficulty = [];
      for (let i = 0; i < days; i += step) {
        h *= 1 + (r() - 0.42) * 0.02;
        d *= 1 + (r() - 0.42) * 0.02;
        const t = BASELINE_NOW - (days - 1 - i) * DAY;
        hashrates.push({ time: t, hashrate: round(h, 0) });
        difficulty.push({ time: t, difficulty: round(d, 0) });
      }
      return {
        currentHashrate: hashrates[hashrates.length - 1].hashrate,
        currentDifficulty: difficulty[difficulty.length - 1].difficulty,
        hashrates,
        difficulty,
      };
    });
  }

  getDifficultyAdjustment(): Promise<DifficultyAdjustment> {
    const empty: DifficultyAdjustment = {
      progressPercent: 0,
      difficultyChange: 0,
      previousRetarget: 0,
      remainingBlocks: 0,
      remainingTimeMs: 0,
      estimatedRetargetDate: BASELINE_NOW,
      nextRetargetHeight: 0,
      avgBlockTimeMs: 600_000,
    };
    return this.gate<DifficultyAdjustment>(empty, () => {
      const r = rng("diffadj");
      const remainingBlocks = Math.round(r() * 2016);
      return {
        progressPercent: round((1 - remainingBlocks / 2016) * 100),
        difficultyChange: round((r() * 2 - 1) * 6),
        previousRetarget: round((r() * 2 - 1) * 5),
        remainingBlocks,
        remainingTimeMs: remainingBlocks * 600_000,
        estimatedRetargetDate: BASELINE_NOW + remainingBlocks * 600_000,
        nextRetargetHeight: 907_200,
        avgBlockTimeMs: Math.round(560_000 + r() * 80_000),
      };
    });
  }

  getMiningPools(window: string): Promise<MiningPools> {
    const empty: MiningPools = { window, totalBlocks: 0, pools: [] };
    return this.gate<MiningPools>(empty, () => {
      const names = [
        ["Foundry USA", "foundryusa"],
        ["AntPool", "antpool"],
        ["ViaBTC", "viabtc"],
        ["F2Pool", "f2pool"],
        ["Binance Pool", "binancepool"],
        ["MARA Pool", "marapool"],
        ["SpiderPool", "spiderpool"],
        ["Luxor", "luxor"],
      ];
      const totalBlocks = 1008;
      let remaining = 100;
      const pools = names.map(([name, slug], i) => {
        const share =
          i === names.length - 1
            ? remaining
            : round(remaining * (0.3 + rng(`pool:${slug}`)() * 0.2));
        remaining = Math.max(0, round(remaining - share));
        return {
          name,
          slug,
          blockCount: Math.round((share / 100) * totalBlocks),
          sharePct: share,
          rank: i + 1,
        };
      });
      return { window, totalBlocks, pools };
    });
  }

  getLightningStats(): Promise<LightningStats> {
    const empty: LightningStats = {
      nodeCount: 0,
      channelCount: 0,
      totalCapacity: 0,
      torNodes: 0,
      clearnetNodes: 0,
      medCapacity: 0,
    };
    return this.gate<LightningStats>(empty, () => {
      const r = rng("lightning");
      const nodeCount = Math.round(14_000 + r() * 2_000);
      return {
        nodeCount,
        channelCount: Math.round(48_000 + r() * 6_000),
        totalCapacity: Math.round((4_800 + r() * 400) * 1e8),
        torNodes: Math.round(nodeCount * 0.55),
        clearnetNodes: Math.round(nodeCount * 0.45),
        medCapacity: Math.round(4_000_000 + r() * 1_000_000),
        prevNodeCount: nodeCount - 40,
        prevChannelCount: 47_800,
        prevTotalCapacity: Math.round(4_750 * 1e8),
      };
    });
  }

  // ── metals ────────────────────────────────────────────────────────────────
  /**
   * A seeded daily fix series that starts where the metal really started and
   * lands on today's real price — so the long-history frames (drawdown,
   * milestones, seasonality, 58-year charts) have something with the right
   * SHAPE to render, not a flat line around one number. Weekdays only, like a
   * London fix. The walk is rescaled so its last point is exactly `end`.
   */
  private fixSeries(
    seed: string,
    startYear: number,
    start: number,
    end: number,
  ): SeriesPoint[] {
    const r = rng(`fix:${seed}`);
    const startMs = Date.UTC(startYear, 0, 2);
    const days = Math.floor((BASELINE_NOW - startMs) / DAY);
    const out: SeriesPoint[] = [];
    let price = start;
    for (let i = 0; i <= days; i++) {
      const time = startMs + i * DAY;
      const weekday = new Date(time).getUTCDay();
      if (weekday === 0 || weekday === 6) continue;
      // Mean-reverting drift toward the target: enough wander for real peaks
      // and drawdowns, without the walk escaping to an absurd level.
      price *= 1 + (r() - 0.5) * 0.02;
      price = Math.max(start * 0.5, price);
      out.push({ time, value: price });
    }
    if (out.length === 0) return out;
    // Blend in an exponential glide so the series actually travels from `start`
    // to `end` over the window instead of random-walking nowhere, plus a smooth
    // pullback over the last ~12% of the window. The taper is what makes the
    // drawdown / ATH-watch frames show something: without it the newest fix is
    // almost always the record, and every one of those cards reads "0.0% below
    // record" in Storybook — a mock artifact that looks like a broken frame.
    const n = out.length;
    const growth = Math.pow(end / start, 1 / (n - 1));
    const taperFrom = Math.floor(n * 0.97);
    let trend = start;
    for (let i = 0; i < n; i++) {
      const t = i <= taperFrom ? 0 : (i - taperFrom) / (n - 1 - taperFrom);
      // Half a cosine: 1 at the peak, easing to 0.70 at the last print. The
      // window is short (the last ~3%) because the exponential glide is still
      // climbing underneath it — a longer, gentler taper is simply outrun and
      // the newest fix ends up the record again.
      const taper = 1 - 0.3 * (0.5 - Math.cos(Math.PI * t) / 2);
      out[i] = {
        time: out[i].time,
        value: (out[i].value / start) * trend * taper,
      };
      trend *= growth;
    }
    // Rescale so the last print IS the quoted spot — the board and the chart
    // have to agree — without the discontinuity a hard overwrite would leave
    // (which the fix table would faithfully report as a fake +20% day).
    const scale = end / out[n - 1].value;
    return out.map((p) => ({ time: p.time, value: round(p.value * scale, 2) }));
  }

  /** Today's quote per metal — the anchors every metals frame is calibrated on. */
  private static readonly METAL_QUOTES: Record<
    string,
    { name: string; price: number; start: number; startYear: number }
  > = {
    XAU: { name: "Gold", price: 4055.3, start: 35.2, startYear: 1968 },
    XAG: { name: "Silver", price: 58.31, start: 2.17, startYear: 1968 },
    XPT: { name: "Platinum", price: 1596, start: 470.5, startYear: 1990 },
    XPD: { name: "Palladium", price: 1264, start: 127.65, startYear: 1990 },
    HG: { name: "Copper", price: 6.2, start: 1.1, startYear: 1990 },
  };

  /**
   * Contract sizes for the US futures contracts (copper is per pound), plus the
   * reporting-trader count and the contract-unit string the disaggregated report
   * publishes verbatim.
   */
  private static readonly METAL_CONTRACTS: Record<
    string,
    {
      market: string;
      size: number;
      baseOi: number;
      baseTraders: number;
      units: string;
    }
  > = {
    XAU: {
      market: "GOLD - COMMODITY EXCHANGE INC.",
      size: 100,
      baseOi: 383_000,
      baseTraders: 286,
      units: "(CONTRACTS OF 100 TROY OUNCES)",
    },
    XAG: {
      market: "SILVER - COMMODITY EXCHANGE INC.",
      size: 5_000,
      baseOi: 145_000,
      baseTraders: 232,
      units: "(CONTRACTS OF 5,000 TROY OUNCES)",
    },
    XPT: {
      market: "PLATINUM - NEW YORK MERCANTILE EXCHANGE",
      size: 50,
      baseOi: 78_000,
      baseTraders: 108,
      units: "(CONTRACTS OF 50 TROY OUNCES)",
    },
    XPD: {
      market: "PALLADIUM - NEW YORK MERCANTILE EXCHANGE",
      size: 100,
      baseOi: 19_000,
      baseTraders: 64,
      units: "(CONTRACTS OF 100 TROY OUNCES)",
    },
    HG: {
      market: "COPPER- #1 - COMMODITY EXCHANGE INC.",
      size: 25_000,
      baseOi: 210_000,
      baseTraders: 244,
      units: "(CONTRACTS OF 25,000 POUNDS)",
    },
  };

  getMetalSpot(symbols?: string[]): Promise<MetalSpot[]> {
    const wanted = symbols?.length
      ? symbols.filter((s) => MockMarketDataProvider.METAL_QUOTES[s])
      : Object.keys(MockMarketDataProvider.METAL_QUOTES);
    return this.gate<MetalSpot[]>([], () =>
      wanted.map((symbol) => {
        const q = MockMarketDataProvider.METAL_QUOTES[symbol];
        const r = rng(`spot:${symbol}`);
        const changePct = round((r() * 2 - 1) * 1.4);
        return {
          symbol,
          name: q.name,
          price: q.price,
          updatedAt: BASELINE_NOW,
          changePct,
          prevFix: round(q.price / (1 + changePct / 100), 2),
        };
      }),
    );
  }

  getMetalHistory(
    symbols: string[],
    currency = "USD",
  ): Promise<MetalHistory[]> {
    // The LBMA quotes GBP/EUR at rough long-run averages against the dollar;
    // one scalar is enough for a mock, and it keeps the currency switch visible.
    const fxScale = currency === "GBP" ? 0.78 : currency === "EUR" ? 0.92 : 1;
    const wanted = symbols.filter(
      (s) => s !== "HG" && MockMarketDataProvider.METAL_QUOTES[s],
    );
    return this.gate<MetalHistory[]>([], () =>
      wanted.map((symbol) => {
        const q = MockMarketDataProvider.METAL_QUOTES[symbol];
        return {
          symbol,
          currency,
          points: this.fixSeries(
            `${symbol}:${currency}`,
            q.startYear,
            q.start * fxScale,
            q.price * fxScale,
          ),
        };
      }),
    );
  }

  getMetalPositioning(symbol: string): Promise<MetalPositioning> {
    const key = MockMarketDataProvider.METAL_CONTRACTS[symbol] ? symbol : "XAU";
    const contract = MockMarketDataProvider.METAL_CONTRACTS[key];
    const empty: MetalPositioning = {
      symbol: key,
      market: contract.market,
      contractSize: contract.size,
      weeks: [],
    };
    return this.gate<MetalPositioning>(empty, () => {
      const r = rng(`cot:${key}`);
      // ~30 years of Tuesdays, so the window genuinely straddles 2006-06-13 and
      // the oldest weeks carry legacy fields ONLY — the mixed series a frame
      // reading `disaggregated` has to cope with.
      const n = 1560;
      const growth = Math.pow(1 / 0.45, 1 / (n - 1));
      let level = contract.baseOi * 0.45;
      let wob = 1;
      const splits: { time: number; oi: number; split: CotSplit }[] = [];
      for (let i = 0; i < n; i++) {
        // COT reports for a Tuesday; the weekly cadence is what matters here.
        const time = BASELINE_NOW - (n - 1 - i) * 7 * DAY;
        level *= growth;
        wob += (1 - wob) * 0.08 + (r() - 0.5) * 0.06;
        const oi = Math.round(level * wob);
        // Spreading comes off the top, because it counts on BOTH sides: the long
        // and short pools are what is left of open interest once it is set aside.
        let spreadTotal = 0;
        const spread: Record<CotClassKey, number> = {
          producerMerchant: 0,
          swapDealer: 0,
          managedMoney: 0,
          otherReportable: 0,
          nonReportable: 0,
        };
        for (const cls of COT_CLASSES) {
          const share = COT_SPREAD_SHARES[cls];
          if (share == null) continue;
          spread[cls] = Math.round(oi * share * (0.85 + r() * 0.3));
          spreadTotal += spread[cls];
        }
        const pool = Math.max(0, oi - spreadTotal);
        // Tilt each class week to week, then re-normalise so a side's
        // non-spreading positions total exactly `pool` — which is what makes
        // long + spread === short + spread === open interest, on both the
        // disaggregated classes and the legacy buckets rolled up from them.
        const draw = (weights: Record<CotClassKey, number>) => {
          const raw: Record<CotClassKey, number> = { ...weights };
          let total = 0;
          for (const cls of COT_CLASSES) {
            raw[cls] = weights[cls] * (0.8 + r() * 0.4);
            total += raw[cls];
          }
          const out: Record<CotClassKey, number> = { ...raw };
          let assigned = 0;
          COT_CLASSES.forEach((cls, idx) => {
            // The last class absorbs the rounding remainder, so the side is exact.
            out[cls] =
              idx === COT_CLASSES.length - 1
                ? pool - assigned
                : Math.round((raw[cls] / total) * pool);
            assigned += out[cls];
          });
          return out;
        };
        const longs = draw(COT_LONG_WEIGHTS);
        const shorts = draw(COT_SHORT_WEIGHTS);
        splits.push({
          time,
          oi,
          split: {
            producerMerchant: {
              long: longs.producerMerchant,
              short: shorts.producerMerchant,
              spread: spread.producerMerchant,
            },
            swapDealer: {
              long: longs.swapDealer,
              short: shorts.swapDealer,
              spread: spread.swapDealer,
            },
            managedMoney: {
              long: longs.managedMoney,
              short: shorts.managedMoney,
              spread: spread.managedMoney,
            },
            otherReportable: {
              long: longs.otherReportable,
              short: shorts.otherReportable,
              spread: spread.otherReportable,
            },
            nonReportable: {
              long: longs.nonReportable,
              short: shorts.nonReportable,
              spread: spread.nonReportable,
            },
          },
        });
      }
      const weeks: CotWeek[] = splits.map(({ time, oi, split }, i) => {
        const week: CotWeek = {
          time,
          openInterest: oi,
          // The legacy buckets ARE the disaggregated classes rolled up, so a
          // card showing both cannot contradict itself: legacy "commercial" is
          // producer/merchant + swap dealer, "non-commercial" is managed money +
          // other reportables, and spreading is every class's spreading.
          noncommercialLong:
            split.managedMoney.long + split.otherReportable.long,
          noncommercialShort:
            split.managedMoney.short + split.otherReportable.short,
          noncommercialSpread:
            split.swapDealer.spread +
            split.managedMoney.spread +
            split.otherReportable.spread,
          commercialLong: split.producerMerchant.long + split.swapDealer.long,
          commercialShort:
            split.producerMerchant.short + split.swapDealer.short,
          nonreportableLong: split.nonReportable.long,
          nonreportableShort: split.nonReportable.short,
        };
        if (time < DISAGG_START_MS) return week;
        const prev = splits[i - 1];
        return {
          ...week,
          disaggregated: this.disaggregated(
            contract,
            oi,
            split,
            prev && prev.time >= DISAGG_START_MS ? prev.split : undefined,
          ),
        };
      });
      return {
        symbol: key,
        market: contract.market,
        contractSize: contract.size,
        weeks,
      };
    });
  }

  /**
   * One week of the disaggregated report, derived from the same split the legacy
   * fields roll up from — so the two halves of a card can never disagree.
   *
   * `changeLong`/`changeShort`/`changeSpread` are the ACTUAL week-over-week
   * differences (the frames prefer the published change over differencing the
   * series, and a mismatch would show), and they are absent on the first
   * published week: the CFTC had nothing to difference against on 2006-06-13
   * either. Trader counts and concentration are derived from the split rather
   * than reseeded, so they move WITH the series instead of flickering — real
   * concentration drifts, it doesn't jump every Tuesday.
   */
  private disaggregated(
    contract: { baseOi: number; baseTraders: number; units: string },
    oi: number,
    split: CotSplit,
    prev: CotSplit | undefined,
  ): CotDisaggregated {
    // A bigger book has more reporting traders in it.
    const size = 0.7 + 0.5 * (oi / contract.baseOi);
    const scale = (size * contract.baseTraders) / 286;
    const traders = (n: number) => Math.max(1, Math.round(n * scale));
    const cls = (
      key: CotClassKey,
      tradersLong?: number,
      tradersShort?: number,
    ): CotTraderClass => {
      const cur = split[key];
      const before = prev?.[key];
      return {
        long: cur.long,
        short: cur.short,
        ...(cur.spread > 0 ? { spread: cur.spread } : {}),
        ...(before
          ? {
              changeLong: cur.long - before.long,
              changeShort: cur.short - before.short,
              ...(cur.spread > 0 || before.spread > 0
                ? { changeSpread: cur.spread - before.spread }
                : {}),
            }
          : {}),
        pctOfOiLong: round((cur.long / oi) * 100, 1),
        pctOfOiShort: round((cur.short / oi) * 100, 1),
        ...(tradersLong != null ? { tradersLong } : {}),
        ...(tradersShort != null ? { tradersShort } : {}),
      };
    };
    // Concentration tracks how lopsided each side is, which puts gold's 4-trader
    // gross short in its real 30–55% band without a second random series.
    const shortShare =
      (split.producerMerchant.short + split.swapDealer.short) / oi;
    const grossShort4 = round(Math.min(62, Math.max(18, shortShare * 62)), 1);
    const grossLong4 = round(
      Math.min(45, Math.max(12, (split.managedMoney.long / oi) * 52)),
      1,
    );
    const grossShort8 = round(Math.min(88, grossShort4 * 1.45), 1);
    const grossLong8 = round(Math.min(88, grossLong4 * 1.55), 1);
    return {
      producerMerchant: cls("producerMerchant", traders(26), traders(48)),
      swapDealer: cls("swapDealer", traders(9), traders(15)),
      managedMoney: cls("managedMoney", traders(118), traders(58)),
      otherReportable: cls("otherReportable", traders(82), traders(52)),
      // Below the reporting threshold, so the CFTC publishes neither a trader
      // count nor a spreading column for this class — a frame must handle that.
      nonReportable: cls("nonReportable"),
      totalTraders: Math.round(contract.baseTraders * size),
      concentration: {
        grossLong4,
        grossShort4,
        grossLong8,
        grossShort8,
        // Netting can only ever reduce a concentration, never raise it.
        netLong4: round(grossLong4 * 0.84, 1),
        netShort4: round(grossShort4 * 0.86, 1),
        netLong8: round(grossLong8 * 0.87, 1),
        netShort8: round(grossShort8 * 0.89, 1),
      },
      contractUnits: contract.units,
    };
  }

  getGoldReserve(): Promise<GoldReserve> {
    const empty: GoldReserve = {
      asOf: BASELINE_NOW,
      totalOunces: 0,
      totalBookValueUsd: 0,
      entries: [],
    };
    return this.gate<GoldReserve>(empty, () => {
      // The real shape of the Treasury's monthly report: four vaults plus
      // working stock and the Fed's display cases. Gold is carried at the
      // statutory $42.2222/oz, which is the whole point of the frame.
      const raw: [string, string, string, number][] = [
        [
          "Mint Held Gold - Deep Storage",
          "Gold Bullion",
          "Fort Knox, KY",
          147_341_858.382,
        ],
        [
          "Mint Held Gold - Deep Storage",
          "Gold Bullion",
          "West Point, NY",
          54_067_331.379,
        ],
        [
          "Mint Held Gold - Deep Storage",
          "Gold Bullion",
          "Denver, CO",
          43_853_707.279,
        ],
        [
          "Federal Reserve Bank Held Gold",
          "Gold Bullion",
          "Federal Reserve Banks - NY Vault",
          13_376_987.724,
        ],
        [
          "Mint Held Gold - Working Stock",
          "Gold Coins",
          "All Locations- Coins, blanks, miscellaneous",
          2_783_218.656,
        ],
        [
          "Federal Reserve Bank Held Gold",
          "Gold Coins",
          "Federal Reserve Banks - NY Vault",
          73_452.066,
        ],
        [
          "Federal Reserve Bank Held Gold",
          "Gold Bullion",
          "Federal Reserve Banks - Display",
          1_993.321,
        ],
      ];
      const entries = raw.map(([facility, form, location, ounces]) => ({
        facility,
        form,
        location,
        ounces,
        bookValueUsd: round(ounces * 42.2222, 2),
      }));
      return {
        asOf: BASELINE_NOW,
        totalOunces: entries.reduce((sum, e) => sum + e.ounces, 0),
        totalBookValueUsd: round(
          entries.reduce((sum, e) => sum + e.bookValueUsd, 0),
          2,
        ),
        entries,
      };
    });
  }

  getTokenizedGold(): Promise<TokenizedGold[]> {
    return this.gate<TokenizedGold[]>([], () => {
      const spot = MockMarketDataProvider.METAL_QUOTES.XAU.price;
      const r = rng("tokenized-gold");
      return [
        {
          id: "tether-gold",
          symbol: "XAUT",
          name: "Tether Gold",
          marketCap: 2_482_000_000,
          volume24h: 146_600_000,
          ounces: 612_823,
        },
        {
          id: "pax-gold",
          symbol: "PAXG",
          name: "PAX Gold",
          marketCap: 1_800_000_000,
          volume24h: 90_500_000,
          ounces: 444_865,
        },
      ].map((token) => {
        const premiumPct = round((r() * 2 - 1) * 0.6);
        return {
          ...token,
          price: round(spot * (1 + premiumPct / 100), 2),
          changePct: round((r() * 2 - 1) * 1.2),
          premiumPct,
        };
      });
    });
  }

  // ── official published series (FRED / Zillow / FHFA) ──────────────────────
  /**
   * A seeded series on a fixed publication cadence, travelling from `start` to
   * `end` over `count` prints ending at the latest one. Daily prints skip
   * weekends so a windowed chart's x-axis reads like a real trading calendar.
   */
  private officialPoints(
    seed: string,
    frequency: OfficialSeries["frequency"],
    count: number,
    start: number,
    end: number,
    // Default ±2% around the glide gives a level series texture. A series whose
    // own drift is smaller than that — monthly CPI compounds ~0.3% — must pass a
    // smaller one or the noise swamps the trend and the line stops rising.
    wobble = 0.04,
  ): SeriesPoint[] {
    const r = rng(`official:${seed}`);
    const step = STEP_MS[frequency];
    const growth = count > 1 ? Math.pow(end / start, 1 / (count - 1)) : 1;
    const out: SeriesPoint[] = [];
    for (let i = 0; i < count; i++) {
      const time = BASELINE_NOW - (count - 1 - i) * step;
      const trend = start * Math.pow(growth, i);
      out.push({ time, value: round(trend * (1 + (r() - 0.5) * wobble), 3) });
      if (frequency !== "daily") continue;
      const weekday = new Date(time).getUTCDay();
      if (weekday === 0 || weekday === 6) out.pop();
    }
    if (out.length > 0)
      out[out.length - 1] = { time: BASELINE_NOW, value: end };
    return out;
  }

  /**
   * A seeded mean-reverting series with a slow regime swing and occasional
   * spikes — the shape a vol index or a yield actually has.
   *
   * Deliberately not {@link officialPoints}: that generator's exponential glide
   * needs both ends positive and only ever travels one way, so it would render
   * a vol index (which goes nowhere on average, in bursts) as a diagonal line
   * and cannot express a real yield crossing zero at all.
   */
  private meanRevertPoints(
    seed: string,
    frequency: OfficialSeries["frequency"],
    count: number,
    opts: {
      /** Level the walk is pulled back toward. */
      mean: number;
      /** Fraction of the gap to the mean closed each step. */
      revert: number;
      /** Per-step shock, in the series' own units. */
      vol: number;
      min: number;
      max: number;
      /** Slow multi-year swing: amplitude in the series' units, cycles across the window. */
      cycle?: { amp: number; count: number };
      /** Chance per step of a spike, and its size in `vol` units. */
      spikeProb?: number;
      spikeSize?: number;
      /** Decimal places (2 for a vol index or a yield in percent). */
      dp?: number;
    },
  ): SeriesPoint[] {
    const r = rng(`revert:${seed}`);
    const step = STEP_MS[frequency];
    const dp = opts.dp ?? 2;
    const spikeProb = opts.spikeProb ?? 0;
    const spikeSize = opts.spikeSize ?? 0;
    const phase = r() * Math.PI * 2;
    let base = opts.mean;
    // A spike is a separate additive component decaying back over ~a week, so a
    // shock leaves an elevated tail behind it instead of a one-print blip.
    let spike = 0;
    const out: SeriesPoint[] = [];
    for (let i = 0; i < count; i++) {
      const time = BASELINE_NOW - (count - 1 - i) * step;
      base += (opts.mean - base) * opts.revert + (r() - 0.5) * 2 * opts.vol;
      if (r() < spikeProb) spike += opts.vol * spikeSize;
      spike *= 0.9;
      const swing = opts.cycle
        ? opts.cycle.amp *
          Math.sin(phase + (2 * Math.PI * opts.cycle.count * i) / count)
        : 0;
      if (frequency === "daily") {
        const weekday = new Date(time).getUTCDay();
        if (weekday === 0 || weekday === 6) continue;
      }
      out.push({
        time,
        value: round(
          Math.min(opts.max, Math.max(opts.min, base + spike + swing)),
          dp,
        ),
      });
    }
    return out;
  }

  /**
   * Wrap an already-generated point set as an {@link OfficialSeries}. Split out
   * of {@link officialSeries} because the vol and yield series come off
   * {@link meanRevertPoints} instead of the glide.
   */
  private seriesFromPoints(
    seriesId: string,
    label: string,
    unit: OfficialSeries["unit"],
    frequency: OfficialSeries["frequency"],
    points: SeriesPoint[],
    source = "FRED",
  ): OfficialSeries {
    const latest = points[points.length - 1];
    const previous = points[points.length - 2]?.value ?? latest.value;
    return {
      seriesId,
      label,
      unit,
      frequency,
      latest: latest.value,
      date: new Date(latest.time).toISOString().slice(0, 10),
      // Percentage POINTS for a rate/spread/vol index, percent for a level —
      // matching the real providers, so a frame's formatting is exercised the
      // same way.
      change:
        unit === "percent"
          ? round(latest.value - previous, 3)
          : round(((latest.value - previous) / previous) * 100, 2),
      points,
      source,
    };
  }

  /** Assemble one mock {@link OfficialSeries} off the glide generator. */
  private officialSeries(
    seriesId: string,
    label: string,
    unit: OfficialSeries["unit"],
    frequency: OfficialSeries["frequency"],
    count: number,
    start: number,
    end: number,
    wobble?: number,
  ): OfficialSeries {
    return this.seriesFromPoints(
      seriesId,
      label,
      unit,
      frequency,
      this.officialPoints(seriesId, frequency, count, start, end, wobble),
    );
  }

  /**
   * The `empty` mode's stand-in for a series: real metadata, no observations.
   * Built literally rather than through {@link officialSeries} because `gate`'s
   * first argument is evaluated eagerly on EVERY call — asking the generator for
   * a zero-point series would read `points[-1].value` and throw in every mode.
   */
  private emptySeries(
    seriesId: string,
    label: string,
    unit: OfficialSeries["unit"],
    frequency: OfficialSeries["frequency"],
    source = "FRED",
  ): OfficialSeries {
    return {
      seriesId,
      label,
      unit,
      frequency,
      latest: 0,
      date: "",
      change: 0,
      points: [],
      source,
    };
  }

  /** Series metadata for the market indices the `index-level` capability serves. */
  private static readonly INDEX_SERIES: Record<
    string,
    { label: string; start: number; end: number }
  > = {
    SP500: { label: "S&P 500", start: 2170, end: 7489.72 },
    VIXCLS: { label: "VIX", start: 17.2, end: 17.09 },
    NASDAQCOM: { label: "Nasdaq Composite", start: 5200, end: 25373.85 },
  };

  getIndexSeries(seriesId: string): Promise<OfficialSeries> {
    const def =
      MockMarketDataProvider.INDEX_SERIES[seriesId] ??
      MockMarketDataProvider.INDEX_SERIES.SP500;
    return this.gate<OfficialSeries>(
      this.emptySeries(seriesId, def.label, "index", "daily"),
      () =>
        this.officialSeries(
          seriesId,
          def.label,
          "index",
          "daily",
          2600,
          def.start,
          def.end,
        ),
    );
  }

  /**
   * The listed commodity vol indices and the regime each one actually sits in.
   * A vol index needs mean reversion plus bursts: a random walk drifts off its
   * plausible band, and a glide draws a diagonal — neither looks like vol.
   */
  private static readonly VOL_INDICES: Record<
    string,
    { label: string; mean: number; vol: number; min: number; max: number }
  > = {
    GVZ: {
      label: "Cboe Gold ETF Volatility Index",
      mean: 20.5,
      vol: 0.5,
      min: 10.5,
      max: 62,
    },
    VXSLV: {
      label: "Cboe Silver ETF Volatility Index",
      mean: 35,
      vol: 0.85,
      min: 19,
      max: 95,
    },
    VXGDX: {
      label: "Cboe Gold Miners ETF Volatility Index",
      mean: 41,
      vol: 0.9,
      min: 24,
      max: 110,
    },
    OVX: {
      label: "Cboe Crude Oil ETF Volatility Index",
      mean: 37,
      vol: 1.1,
      min: 15,
      max: 130,
    },
  };

  getCommodityVolIndex(indexId: string): Promise<OfficialSeries> {
    const key = MockMarketDataProvider.VOL_INDICES[indexId] ? indexId : "GVZ";
    const def = MockMarketDataProvider.VOL_INDICES[key];
    return this.gate<OfficialSeries>(
      this.emptySeries(key, def.label, "percent", "daily", "Cboe"),
      () =>
        this.seriesFromPoints(
          key,
          def.label,
          // Annualised vol in percent, like the VIX — so `change` is a move in
          // percentage POINTS, not a percent change.
          "percent",
          "daily",
          this.meanRevertPoints(`vol:${key}`, "daily", 3900, {
            mean: def.mean,
            revert: 0.035,
            vol: def.vol,
            min: def.min,
            max: def.max,
            spikeProb: 0.012,
            spikeSize: 13,
          }),
          "Cboe",
        ),
    );
  }

  /** The macro reference series a commodity price gets measured against. */
  private static readonly MACRO_REFERENCE: Record<string, MacroRefDef> = {
    CPIAUCSL: {
      shape: "glide",
      label: "CPI (All Urban Consumers)",
      unit: "index",
      frequency: "monthly",
      // ~79 years of monthly prints: 21.5 in 1947 to ~332 today. The wobble is
      // an order of magnitude under the ~0.29%/month drift, so the series rises
      // monotonically and a real (deflated) price series stays meaningful.
      count: 948,
      start: 21.48,
      end: 332.4,
      wobble: 0.0012,
    },
    DFII10: {
      shape: "revert",
      label: "10Y TIPS Real Yield",
      unit: "percent",
      frequency: "daily",
      count: 3900,
      mean: 0.72,
      revert: 0.01,
      vol: 0.035,
      min: -1.05,
      max: 2.55,
      dp: 2,
      cycle: { amp: 1.2, count: 1.5 },
    },
    DTWEXBGS: {
      shape: "revert",
      label: "Nominal Broad Dollar Index",
      unit: "index",
      frequency: "daily",
      count: 3900,
      mean: 112,
      revert: 0.01,
      vol: 0.3,
      min: 95,
      max: 126,
      dp: 4,
      cycle: { amp: 9, count: 1.5 },
    },
    T10YIE: {
      shape: "revert",
      label: "10Y Inflation Breakeven",
      unit: "percent",
      frequency: "daily",
      count: 3900,
      mean: 2.25,
      revert: 0.01,
      vol: 0.024,
      min: 1.45,
      max: 3.05,
      dp: 2,
      cycle: { amp: 0.45, count: 2 },
    },
    REAINTRATREARAT10Y: {
      shape: "revert",
      label: "10Y Real Interest Rate",
      unit: "percent",
      frequency: "monthly",
      count: 520,
      mean: 1.7,
      revert: 0.05,
      vol: 0.14,
      min: -0.4,
      max: 4.2,
      dp: 2,
      cycle: { amp: 1.5, count: 2.5 },
    },
  };

  getMacroReferenceSeries(seriesId: string): Promise<OfficialSeries> {
    const key = MockMarketDataProvider.MACRO_REFERENCE[seriesId]
      ? seriesId
      : "CPIAUCSL";
    const def = MockMarketDataProvider.MACRO_REFERENCE[key];
    return this.gate<OfficialSeries>(
      this.emptySeries(key, def.label, def.unit, def.frequency),
      () =>
        this.seriesFromPoints(
          key,
          def.label,
          def.unit,
          def.frequency,
          def.shape === "glide"
            ? this.officialPoints(
                `macroref:${key}`,
                def.frequency,
                def.count,
                def.start,
                def.end,
                def.wobble,
              )
            : this.meanRevertPoints(
                `macroref:${key}`,
                def.frequency,
                def.count,
                {
                  mean: def.mean,
                  revert: def.revert,
                  vol: def.vol,
                  min: def.min,
                  max: def.max,
                  dp: def.dp,
                  cycle: def.cycle,
                },
              ),
        ),
    );
  }

  getCreditSpreads(): Promise<OfficialSeries[]> {
    return this.gate<OfficialSeries[]>([], () => [
      this.officialSeries(
        "BAMLH0A0HYM2",
        "US High Yield OAS",
        "percent",
        "daily",
        780,
        3.82,
        2.84,
      ),
      this.officialSeries(
        "BAMLC0A0CM",
        "US Investment Grade OAS",
        "percent",
        "daily",
        780,
        1.19,
        0.8,
      ),
    ]);
  }

  getHousingPriceIndex(): Promise<OfficialSeries> {
    return this.gate<OfficialSeries>(
      this.emptySeries(
        "CSUSHPINSA",
        "Case-Shiller US National",
        "index",
        "monthly",
      ),
      () =>
        this.officialSeries(
          "CSUSHPINSA",
          "Case-Shiller US National",
          "index",
          "monthly",
          470,
          63.73,
          335.1,
        ),
    );
  }

  getMortgageRates(): Promise<OfficialSeries> {
    return this.gate<OfficialSeries>(
      this.emptySeries(
        "MORTGAGE30US",
        "30Y Fixed Mortgage",
        "percent",
        "weekly",
      ),
      () =>
        this.officialSeries(
          "MORTGAGE30US",
          "30Y Fixed Mortgage",
          "percent",
          "weekly",
          1200,
          7.33,
          6.66,
        ),
    );
  }

  /** Typical home value per region, seeded off the region name. */
  private static readonly ZHVI_REGIONS = [
    "United States",
    "New York, NY",
    "Los Angeles, CA",
    "Chicago, IL",
    "Dallas, TX",
    "Houston, TX",
    "Washington, DC",
    "Miami, FL",
    "Atlanta, GA",
    "Phoenix, AZ",
    "Boston, MA",
    "San Francisco, CA",
    "Seattle, WA",
    "Denver, CO",
    "Austin, TX",
  ];

  getHomeValueIndex(regions?: string[]): Promise<HomeValueIndex> {
    const wanted = regions?.length
      ? regions
      : MockMarketDataProvider.ZHVI_REGIONS;
    const empty: HomeValueIndex = { entries: [], asOf: "", source: "Zillow" };
    return this.gate<HomeValueIndex>(empty, () => {
      const entries: HomeValueEntry[] = wanted.map((region, i) => {
        const r = rng(`zhvi:${region}`);
        const value = round(230_000 + r() * 900_000, 2);
        const points = this.officialPoints(
          `zhvi:${region}`,
          "monthly",
          318,
          value * 0.36,
          value,
        );
        return {
          region,
          kind: region === "United States" ? "country" : "msa",
          ...(region === "United States"
            ? {}
            : { state: region.slice(-2).toUpperCase() }),
          sizeRank: region === "United States" ? 0 : i,
          value,
          changePctMoM: round((r() * 2 - 0.7) * 1.2),
          changePctYoY: round((r() * 2 - 0.5) * 6),
          points,
        };
      });
      return {
        entries,
        asOf: new Date(BASELINE_NOW).toISOString().slice(0, 10),
        source: "Zillow",
      };
    });
  }

  getRegionalHousingPrice(
    regions: string[],
    level = "state",
  ): Promise<RegionalHousingPrice> {
    const resolved: RegionalHousingPrice["level"] =
      level === "metro" ? "metro" : "state";
    const empty: RegionalHousingPrice = {
      series: [],
      level: resolved,
      source: "FHFA",
    };
    return this.gate<RegionalHousingPrice>(empty, () => {
      const series: RegionalHousingSeries[] = regions.map((region) => {
        const r = rng(`hpi:${region}`);
        const latest = round(280 + r() * 380, 2);
        const points = this.officialPoints(
          `hpi:${region}`,
          "quarterly",
          205,
          60,
          latest,
        );
        const newest = points[points.length - 1];
        const date = new Date(newest.time);
        return {
          region,
          latest: newest.value,
          period: `${date.getUTCFullYear()} Q${Math.floor(date.getUTCMonth() / 3) + 1}`,
          changePctYoY: round((r() * 2 - 0.4) * 5),
          points,
        };
      });
      return { series, level: resolved, source: "FHFA" };
    });
  }

  // ── portfolio ─────────────────────────────────────────────────────────────
  getPortfolio(source: PortfolioSource): Promise<Portfolio> {
    const empty: Portfolio = {
      source: source.kind,
      holdings: [],
      asOf: BASELINE_NOW,
    };
    return this.gate<Portfolio>(empty, () => {
      const r = rng(`portfolio:${source.kind}:${source.address ?? ""}`);
      const picks = ["BTC", "ETH", "SOL", "HYPE", "LINK", "AVAX"];
      const holdings = picks.map((symbol) => {
        const amount = round(r() * 20, 4);
        const price = priceFor(symbol);
        return {
          symbol,
          amount,
          valueUsd: round(amount * price, 2),
          costBasisUsd: round(price * (0.6 + r() * 0.6), 2),
          changePct24h: round((r() * 2 - 1) * 8),
        };
      });
      return {
        source: source.kind,
        label:
          source.kind === "binance"
            ? "Binance · main"
            : (source.address ?? "0x12…ab"),
        holdings,
        totalUsd: round(
          holdings.reduce((a, h) => a + (h.valueUsd ?? 0), 0),
          2,
        ),
        asOf: BASELINE_NOW,
      };
    });
  }
}
