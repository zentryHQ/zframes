import type {
  BtcBlock,
  BtcFees,
  Candle,
  Capability,
  CoinMarketEntry,
  CoinMover,
  CompanyFacts,
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
    "news",
    "fundamentals",
    "filings",
    "short-volume",
    "dex-volume",
    "protocol-tvl",
    "protocol-fees",
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

  /** Contract sizes for the US futures contracts (copper is per pound). */
  private static readonly METAL_CONTRACTS: Record<
    string,
    { market: string; size: number; baseOi: number }
  > = {
    XAU: {
      market: "GOLD - COMMODITY EXCHANGE INC.",
      size: 100,
      baseOi: 383_000,
    },
    XAG: {
      market: "SILVER - COMMODITY EXCHANGE INC.",
      size: 5_000,
      baseOi: 145_000,
    },
    XPT: {
      market: "PLATINUM - NEW YORK MERCANTILE EXCHANGE",
      size: 50,
      baseOi: 78_000,
    },
    XPD: {
      market: "PALLADIUM - NEW YORK MERCANTILE EXCHANGE",
      size: 100,
      baseOi: 19_000,
    },
    HG: {
      market: "COPPER- #1 - COMMODITY EXCHANGE INC.",
      size: 25_000,
      baseOi: 210_000,
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
      const weeks: CotWeek[] = [];
      let oi = contract.baseOi;
      let specLong = contract.baseOi * 0.55;
      let specShort = contract.baseOi * 0.12;
      for (let i = 519; i >= 0; i--) {
        oi *= 1 + (r() - 0.5) * 0.05;
        specLong *= 1 + (r() - 0.5) * 0.09;
        specShort *= 1 + (r() - 0.5) * 0.14;
        const spread = specLong * 0.15;
        const commLong = oi * 0.2 * (0.8 + r() * 0.4);
        // Producers hedge, so commercials sit structurally short in metals.
        const commShort = specLong + specShort * 0.3;
        weeks.push({
          // COT reports for a Tuesday; weekly cadence is what matters here.
          time: BASELINE_NOW - i * 7 * DAY,
          openInterest: Math.round(oi),
          noncommercialLong: Math.round(specLong),
          noncommercialShort: Math.round(specShort),
          noncommercialSpread: Math.round(spread),
          commercialLong: Math.round(commLong),
          commercialShort: Math.round(commShort),
          nonreportableLong: Math.round(oi * 0.12),
          nonreportableShort: Math.round(oi * 0.045),
        });
      }
      return {
        symbol: key,
        market: contract.market,
        contractSize: contract.size,
        weeks,
      };
    });
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
  ): SeriesPoint[] {
    const r = rng(`official:${seed}`);
    const step =
      frequency === "daily"
        ? DAY
        : frequency === "weekly"
          ? 7 * DAY
          : frequency === "monthly"
            ? 30 * DAY
            : 91 * DAY;
    const growth = count > 1 ? Math.pow(end / start, 1 / (count - 1)) : 1;
    const out: SeriesPoint[] = [];
    for (let i = 0; i < count; i++) {
      const time = BASELINE_NOW - (count - 1 - i) * step;
      const trend = start * Math.pow(growth, i);
      // ±2% wobble around the glide so the line has texture but still lands on
      // `end` — the same shape the metals fix mock uses.
      out.push({ time, value: round(trend * (1 + (r() - 0.5) * 0.04), 3) });
      if (frequency !== "daily") continue;
      const weekday = new Date(time).getUTCDay();
      if (weekday === 0 || weekday === 6) out.pop();
    }
    if (out.length > 0)
      out[out.length - 1] = { time: BASELINE_NOW, value: end };
    return out;
  }

  /** Assemble one mock {@link OfficialSeries}, change included. */
  private officialSeries(
    seriesId: string,
    label: string,
    unit: OfficialSeries["unit"],
    frequency: OfficialSeries["frequency"],
    count: number,
    start: number,
    end: number,
  ): OfficialSeries {
    const points = this.officialPoints(seriesId, frequency, count, start, end);
    const latest = points[points.length - 1];
    const previous = points[points.length - 2]?.value ?? latest.value;
    return {
      seriesId,
      label,
      unit,
      frequency,
      latest: latest.value,
      date: new Date(latest.time).toISOString().slice(0, 10),
      // Percentage POINTS for a rate/spread, percent for a level — matching the
      // real providers, so a frame's formatting is exercised the same way.
      change:
        unit === "percent"
          ? round(latest.value - previous, 3)
          : round(((latest.value - previous) / previous) * 100, 2),
      points,
      source: "FRED",
    };
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
      source: "FRED",
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
