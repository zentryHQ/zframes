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
  NewsItem,
  NewsQuery,
  OnchainExtras,
  OnchainValuation,
  OpenInterestEntry,
  OptionsSummary,
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
