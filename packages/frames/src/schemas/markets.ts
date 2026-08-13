import { defineFrameMeta } from "@zframes/spec/frame";
import { z } from "zod";
import {
  widgetIcon,
  sourceField,
  SOURCES,
  INDEX_SERIES,
  INDEX_SERIES_NOTE,
} from "./shared";

export const priceChartMeta = defineFrameMeta({
  name: "price-chart",
  label: "Price Chart",
  category: "markets",
  iconUrl: widgetIcon("price-chart"),
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Live animated price chart (candlestick or line) for one symbol — canvas-rendered at 60fps via liveline, streaming live off the Hyperliquid WebSocket. Works for any HIP-3 perp — stocks (xyz:TSLA), indices (xyz:SP500), commodities (xyz:GOLD) — and crypto (BTC). The centerpiece frame.",
  capabilities: ["ohlcv", "quote-stream"],
  // Any of these can back this card (see `source`), so all are credited — the
  // renderer narrows the badge to the one this instance pinned by matching the
  // config value against each credit's id. Nasdaq serves daily bars only and
  // has no `quote-stream`, so a card pinned there charts polled candles with no
  // live tick — the real listing rather than its perp.
  source: [SOURCES.hyperliquid, SOURCES.bitkub, SOURCES.nasdaq],
  schema: z.object({
    symbol: z
      .string()
      .min(1)
      .describe(
        'Hyperliquid symbol to chart. HIP-3 cross-asset: stocks "xyz:TSLA"/"xyz:NVDA", indices "xyz:SP500"/"xyz:XYZ100", commodities "xyz:GOLD"/"xyz:CL", FX "xyz:EUR". Crypto: "BTC", "ETH".',
      ),
    interval: z
      .enum(["1m", "5m", "15m", "1h", "4h", "1d"])
      .default("1h")
      .describe("Candle interval."),
    mode: z
      .enum(["candle", "line"])
      .default("candle")
      .describe("Candlestick or smooth line rendering."),
    color: z
      .string()
      .default("#8b8df9")
      .describe("Accent color (hex). The whole palette derives from it."),
    source: sourceField(),
  }),
});

export const priceLivelineMeta = defineFrameMeta({
  name: "price-liveline",
  label: "Price Liveline",
  category: "markets",
  iconUrl: widgetIcon("price-liveline"),
  layout: { w: 6, h: 3, minW: 3, minH: 3 },
  description:
    "Multi-asset live price liveline — several Hyperliquid symbols streaming in one canvas chart. Defaults to normalized % movement so stocks and crypto can share one axis, while the legend still shows each asset's live raw price. Use when the dashboard needs one compact live race view instead of several single-symbol charts.",
  capabilities: ["quote-stream", "day-stats"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbols: z
      .array(z.string())
      .min(2)
      .max(8)
      .describe(
        'Hyperliquid symbols to stream together — great cross-asset (the normalized view races a stock vs the index vs gold vs crude), e.g. ["xyz:NVDA", "xyz:SP500", "xyz:GOLD", "xyz:CL"], or all-equity ["xyz:TSLA", "xyz:NVDA", "xyz:AAPL"], or crypto ["BTC", "ETH", "SOL"]. 2 to 8.',
      ),
    windowSec: z
      .number()
      .int()
      .min(10)
      .max(300)
      .default(30)
      .describe(
        "Rolling live window in seconds. 30 mirrors the zhive liveline view; use 60–300 for slower dashboards.",
      ),
    normalize: z
      .boolean()
      .default(true)
      .describe(
        "Show each asset as % movement from its first live tick (recommended when prices differ). Off = raw price overlay.",
      ),
  }),
});

export const priceTickerMeta = defineFrameMeta({
  name: "price-ticker",
  label: "Price Ticker",
  category: "markets",
  iconUrl: widgetIcon("price-ticker"),
  layout: { w: 3, h: 3, minW: 1, minH: 1, maxH: 4 },
  description:
    "Live watchlist streaming mid prices over the Hyperliquid WebSocket with 24h change per symbol. The bread-and-butter frame for any dashboard.",
  capabilities: ["quote-stream", "day-stats"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbols: z
      .array(z.string())
      .min(1)
      .describe(
        'Hyperliquid symbols to track — mix asset classes, e.g. ["xyz:NVDA", "xyz:SP500", "xyz:GOLD", "xyz:EUR"] or all-equity ["xyz:TSLA", "xyz:NVDA", "xyz:AAPL"]. Crypto works too: "BTC", "ETH".',
      ),
  }),
});

export const topMoversMeta = defineFrameMeta({
  name: "top-movers",
  label: "Top Movers",
  category: "markets",
  iconUrl: widgetIcon("top-movers"),
  layout: { w: 5, h: 3, minW: 4, minH: 2, maxH: 4 },
  description:
    "Today's biggest stock and commodity HIP-3 gainers and losers (no bare crypto), side by side with current price and 24h change.",
  capabilities: ["day-stats"],
  // Either source can back this card (see `source`) — both are credited.
  source: [SOURCES.hyperliquid, SOURCES.bitkub],
  schema: z.object({
    count: z
      .number()
      .int()
      .min(3)
      .max(10)
      .default(5)
      .describe("How many gainers and losers to list (each)."),
    source: sourceField(),
  }),
});

export const priceCompareMeta = defineFrameMeta({
  name: "price-compare",
  annotatable: true,
  label: "Price Compare",
  category: "markets",
  iconUrl: widgetIcon("price-compare"),
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Multi-series line chart overlaying the price history of several symbols over a lookback window — see how TSLA, NVDA and BTC moved against each other. Normalized by default to % change from the window start so symbols at very different price levels (BTC vs a $20 stock) stay comparable on one axis. Candles from Hyperliquid.",
  capabilities: ["ohlcv"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbols: z
      .array(z.string())
      .min(2)
      .max(6)
      .describe(
        'Hyperliquid symbols to overlay, e.g. ["xyz:TSLA", "xyz:NVDA", "BTC"]. 2 to 6.',
      ),
    lookback: z
      .enum(["24h", "7D", "1M"])
      .default("7D")
      .describe("History window for the comparison."),
    normalize: z
      .boolean()
      .default(true)
      .describe(
        "Rebase each series to % change from the window start (recommended — lets symbols at different price levels share one axis). Off = raw price, only sensible when comparing similarly-priced symbols.",
      ),
  }),
});

export const priceEventsMeta = defineFrameMeta({
  name: "price-events",
  annotatable: true,
  label: "Price & Events",
  category: "markets",
  iconUrl: widgetIcon("price-compare"),
  layout: { w: 6, h: 4, minW: 3, minH: 2 },
  description:
    "Price history for one symbol with the dashboard's event markers drawn on the time axis — the card for reading cause and effect: where the rate cut, the hack, the earnings beat actually landed on the chart. Markers come from the dashboard-wide `events` list (and any this card adds via its own `events`); hovering a flag shows the date, label, note and source link. Longer windows than the live Price Chart, since the point is past events.",
  capabilities: ["ohlcv"],
  source: [SOURCES.hyperliquid, SOURCES.bitkub, SOURCES.nasdaq],
  schema: z.object({
    symbol: z
      .string()
      .min(1)
      .describe(
        'Symbol to chart. HIP-3 cross-asset on Hyperliquid: stocks "xyz:TSLA", indices "xyz:SP500", commodities "xyz:GOLD". Crypto: "BTC", "ETH".',
      ),
    lookback: z
      .enum(["7D", "1M", "3M", "1Y"])
      .default("3M")
      .describe(
        "How far back to plot. Events outside this window aren't drawn, so widen it to reach older annotations.",
      ),
    source: sourceField(),
  }),
});

export const coinMoversMeta = defineFrameMeta({
  name: "coin-movers",
  label: "Coin Movers",
  category: "markets",
  iconUrl: widgetIcon("coin-movers"),
  layout: { w: 5, h: 4, minW: 4, minH: 2, maxH: 4 },
  description:
    "Broad-market crypto gainers and losers across the top ~300 coins by market cap, over a selectable window (1h / 24h / 7d / 30d) — the biggest movers side by side with price and % change. Unlike a top-coins heatmap, this surfaces mid- and small-caps that ripped or dumped, not just the megacaps. Keyless data from Coinpaprika. Crypto only.",
  capabilities: ["coin-movers"],
  source: SOURCES.coinpaprika,
  schema: z.object({
    window: z
      .enum(["1h", "24h", "7d", "30d"])
      .default("24h")
      .describe(
        "Which price-change window ranks the movers: 1h (intraday momentum), 24h (daily), 7d (weekly), 30d (monthly).",
      ),
    count: z
      .number()
      .int()
      .min(3)
      .max(15)
      .default(6)
      .describe("How many gainers and how many losers to list (each side)."),
    minRank: z
      .number()
      .int()
      .min(20)
      .max(300)
      .default(150)
      .describe(
        "Only consider coins ranked at or above this market-cap rank — a liquidity floor that keeps illiquid micro-cap dust (which posts absurd % moves on no volume) out of the list. Lower = stricter (megacaps only); higher = includes more small-caps.",
      ),
  }),
});

export const breadthHistogramMeta = defineFrameMeta({
  name: "breadth-histogram",
  label: "Market Breadth",
  category: "markets",
  iconUrl: widgetIcon("breadth-histogram"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Histogram of how far every coin moved over the window — the whole market's dispersion in one shape, not just the top gainers and losers. Answers whether a green day was broad-based or a handful of megacaps carrying a flat field: a narrow spike straddling zero is a quiet tape, a wide left-skewed spread is a real risk-off day. Marks the median and Bitcoin's own move, so you can see at a glance whether BTC led or lagged the field, and reports the advancing share (the classic advance/decline read). Keyless (Coinpaprika), across the top coins by market cap.",
  capabilities: ["coin-movers"],
  source: SOURCES.coinpaprika,
  schema: z.object({
    window: z
      .enum(["1h", "24h", "7d", "30d"])
      .default("24h")
      .describe(
        "Which price-change window the distribution is built from: 1h (intraday), 24h (daily), 7d, 30d.",
      ),
    minRank: z
      .number()
      .int()
      .min(20)
      .max(300)
      .default(200)
      .describe(
        "Only include coins ranked at or above this market-cap rank — a liquidity floor, since illiquid micro-caps post absurd % moves on no volume and would fatten both tails with noise.",
      ),
    showNormalCurve: z
      .boolean()
      .default(false)
      .describe(
        "Overlay the fitted normal distribution. Off by default: a day's cross-section of coin returns is usually far more peaked than normal, and the curve can crowd a narrow histogram.",
      ),
  }),
});

export const rsiMomentumMeta = defineFrameMeta({
  name: "rsi-momentum",
  label: "RSI Momentum",
  category: "markets",
  iconUrl: widgetIcon("rsi-momentum"),
  layout: { w: 3, h: 3, minW: 3, minH: 2, maxH: 3 },
  description:
    'Wilder RSI on daily closes with a 55/45 momentum regime: above 55 = risk-on, below 45 = risk-off, in between = neutral. Also flags classic overbought (≥80) / oversold (≤30) extremes. Computed in-browser. With no `symbol` it reads BTC\'s deep keyless daily series (Coin Metrics, years of history); set `symbol` to run the same indicator on any traded symbol\'s daily candles instead — a stock (`"NVDA"` with source "nasdaq" for the real tape, or `"xyz:NVDA"` for its HIP-3 perp) or a coin.',
  capabilities: ["price-history-daily", "ohlcv"],
  // Coin Metrics first: it backs the default (no `symbol`) BTC path, and the
  // renderer falls back to the first credit when nothing is pinned.
  source: [
    SOURCES.coinMetrics,
    SOURCES.hyperliquid,
    SOURCES.bitkub,
    SOURCES.nasdaq,
  ],
  schema: z.object({
    symbol: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Symbol to compute RSI on. Omit for BTC read from the deep Coin Metrics daily series — that path has the longest history. Set it (e.g. "NVDA", "xyz:NVDA", "ETH") to use that symbol\'s daily candles from the venue in `source`; candle history is shorter than the BTC series, so a long window may not fill.',
      ),
    source: sourceField(),
    period: z
      .number()
      .int()
      .min(2)
      .max(50)
      .default(14)
      .describe("RSI lookback period in days."),
    window: z
      .enum(["90D", "180D", "1Y", "2Y"])
      .default("180D")
      .describe("How much history the sparkline shows."),
  }),
});

export const volumeProfileMeta = defineFrameMeta({
  name: "volume-profile",
  label: "Volume Profile",
  category: "markets",
  iconUrl: widgetIcon("volume-profile"),
  layout: { w: 4, h: 4, minW: 3, minH: 3, maxH: 4 },
  description:
    "Volume-by-price histogram over a lookback window — the Point of Control (POC, highest-volume price) and the 70% Value Area (VAH/VAL) that frame support/resistance. Computed in-browser from OHLCV candles. Pass any tradable symbol (crypto or a HIP-3 equity like 'xyz:TSLA').",
  capabilities: ["ohlcv"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbol: z
      .string()
      .default("BTC")
      .describe(
        "Symbol to profile, e.g. 'BTC', 'ETH', or a HIP-3 equity 'xyz:TSLA'.",
      ),
    interval: z
      .enum(["1h", "4h", "1d"])
      .default("1d")
      .describe("Candle interval."),
    lookbackDays: z
      .number()
      .int()
      .min(7)
      .max(365)
      .default(90)
      .describe("How many days of candles to build the profile from."),
    bins: z
      .number()
      .int()
      .min(8)
      .max(48)
      .default(24)
      .describe("Number of price buckets in the histogram."),
  }),
});

export const returnCalendarMeta = defineFrameMeta({
  name: "return-calendar",
  label: "Return Calendar",
  category: "markets",
  iconUrl: widgetIcon("return-calendar"),
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "A GitHub-contribution-style calendar heatmap of daily activity — one square per calendar day, weeks running left to right and weekdays top to bottom. Answers *when*, which a line chart cannot: seasonality, day-of-week rhythm, clustered volatility, and the holes where the market was shut (weekends stripe across an equity's grid; crypto's is solid). Daily returns are tinted green/red from zero; volume and range use a single-hue ramp. Intensity is ranked by quantile, so one crash day cannot wash out every other square. Computed in-browser from OHLCV candles — pass any tradable symbol (crypto or a HIP-3 equity like 'xyz:TSLA').",
  capabilities: ["ohlcv"],
  source: [SOURCES.hyperliquid, SOURCES.bitkub, SOURCES.nasdaq],
  schema: z.object({
    symbol: z
      .string()
      .default("BTC")
      .describe(
        "Symbol to chart, e.g. 'BTC', 'ETH', or a HIP-3 equity 'xyz:TSLA'.",
      ),
    metric: z
      .enum(["return", "volume", "range"])
      .default("return")
      .describe(
        "What each square measures. 'return' = close-to-close percent change, tinted green above zero and red below. 'volume' = the day's traded volume. 'range' = the day's high-low span as a percent of its close, i.e. realised intraday volatility. Volume and range are one-sided, so they use a single-hue ramp.",
      ),
    lookback: z
      .enum(["3M", "6M", "1Y"])
      .default("6M")
      .describe(
        "How much history the grid covers. A year fits in a wide card; 3 months gives noticeably larger squares in a narrow one.",
      ),
    weekStart: z
      .enum(["sunday", "monday"])
      .default("sunday")
      .describe(
        "Which weekday is the top row. 'monday' puts Saturday and Sunday together at the bottom, which reads better for an equity whose weekends are empty.",
      ),
    source: sourceField(),
  }),
});

export const returnDistributionMeta = defineFrameMeta({
  name: "return-distribution",
  label: "Return Histogram",
  category: "markets",
  iconUrl: widgetIcon("return-distribution"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Histogram of the symbol's periodic returns — how often a move of each size actually happens, rather than where the price is now. Optionally overlays the normal curve implied by the sample's own mean and standard deviation: the gap between the bars and that curve is the fat tail a risk model assuming normality would underprice. Marks the mean and the latest return so you can see where today sits in its own history, with a mean / σ / win-rate / last stat row underneath. The extreme tails are folded into the end bars (marked « ») so one outlier can't flatten the middle; the true best and worst are still reported. Computed in-browser from OHLCV candles — pass any tradable symbol (crypto or a HIP-3 equity like 'xyz:TSLA').",
  capabilities: ["ohlcv"],
  source: [SOURCES.hyperliquid, SOURCES.bitkub, SOURCES.nasdaq],
  schema: z.object({
    symbol: z
      .string()
      .default("BTC")
      .describe(
        "Symbol to analyse, e.g. 'BTC', 'ETH', or a HIP-3 equity 'xyz:TSLA'.",
      ),
    period: z
      .enum(["daily", "weekly", "monthly"])
      .default("daily")
      .describe(
        "Bucket returns by trading day, calendar week or calendar month. Daily exposes the tails; weekly and monthly are smoother but need a longer lookback to have enough observations to shape a histogram.",
      ),
    lookback: z
      .enum(["6M", "1Y", "2Y", "5Y"])
      .default("1Y")
      .describe(
        "How much history to bucket. Longer is a better-shaped distribution but mixes regimes; monthly returns need '2Y' or more to be worth plotting.",
      ),
    showNormalCurve: z
      .boolean()
      .default(true)
      .describe(
        "Overlay the fitted normal distribution as a dashed curve — the reference the fat tails are read against.",
      ),
    source: sourceField(),
  }),
});

export const orderBookDepthMeta = defineFrameMeta({
  name: "order-book-depth",
  label: "Order Book",
  category: "markets",
  iconUrl: widgetIcon("order-book-depth"),
  layout: { w: 4, h: 4, minW: 1, minH: 2 },
  description:
    "Live two-sided order book for one Bitkub market — bid and ask ladders with cumulative resting size, plus the mid price and spread. Shows where the resting liquidity actually sits, which a price feed alone can't. Prices in Thai baht. Keyless (Bitkub public API).",
  capabilities: ["order-book"],
  source: SOURCES.bitkub,
  schema: z.object({
    symbol: z
      .string()
      .min(1)
      .default("KUB")
      .describe(
        'Base asset ticker as listed on the venue, e.g. "KUB", "BTC", "ETH" — the quote asset is implied (THB on Bitkub).',
      ),
    source: sourceField(),
    levels: z
      .number()
      .int()
      .min(3)
      .max(25)
      .default(10)
      .describe("How many price levels to show per side."),
  }),
});

export const dominanceBarsMeta = defineFrameMeta({
  name: "dominance-bars",
  label: "Dominance Bars",
  category: "markets",
  iconUrl: widgetIcon("dominance-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
  description:
    "Market-cap dominance for every asset in CoinGecko's global snapshot — not just BTC and ETH — as a horizontal bar chart, ranked largest-first. Surfaces the next tier (USDT, BNB, SOL, …) the segmented Bitcoin Dominance bar collapses into 'Others'. Keyless (CoinGecko).",
  capabilities: ["global-market"],
  source: SOURCES.coingecko,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(15)
      .default(8)
      .describe("How many assets (by market-cap dominance) to chart."),
  }),
});

export const indexLevelChartMeta = defineFrameMeta({
  name: "index-level-chart",
  annotatable: true,
  label: "Index Level Chart",
  category: "markets",
  iconUrl: widgetIcon("index-level-chart"),
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "Daily level history for a major US market index — the S&P 500, the VIX, or the Nasdaq Composite — as a line chart with its latest print and move. Read from FRED's keyless public CSV, so it needs no market-data key; use it for the long-run index picture rather than a live intraday tick.",
  capabilities: ["index-level"],
  source: SOURCES.fred,
  schema: z.object({
    series: z
      .enum(INDEX_SERIES)
      .default("SP500")
      .describe(`Which index to chart. ${INDEX_SERIES_NOTE}`),
    years: z
      .number()
      .int()
      .min(1)
      .max(60)
      .default(5)
      .describe(
        "How many years of history to chart. Longer than the series carries just shows all of it.",
      ),
    logScale: z
      .boolean()
      .default(false)
      .describe(
        "Use a logarithmic axis — the honest way to read a multi-decade index, where 1,000→2,000 and 10,000→20,000 are the same doubling.",
      ),
  }),
});

export const indexLevelMeta = defineFrameMeta({
  name: "index-level",
  label: "Index Level",
  category: "markets",
  iconUrl: widgetIcon("index-level"),
  layout: { w: 3, h: 3, minW: 3, minH: 2, maxH: 3 },
  description:
    "One market index as a headline number — the S&P 500, VIX or Nasdaq Composite's latest level, its move, and a sparkline of recent history. The compact card sibling of the Index Level Chart, for a board that wants the number rather than the shape. Keyless (FRED).",
  capabilities: ["index-level"],
  source: SOURCES.fred,
  schema: z.object({
    series: z
      .enum(INDEX_SERIES)
      .default("SP500")
      .describe(`Which index to show. ${INDEX_SERIES_NOTE}`),
    trendDays: z
      .number()
      .int()
      .min(7)
      .max(730)
      .default(90)
      .describe("How many recent observations the sparkline covers."),
  }),
});

export const indexDrawdownMeta = defineFrameMeta({
  name: "index-drawdown",
  annotatable: true,
  label: "Index Drawdown",
  category: "markets",
  iconUrl: widgetIcon("index-drawdown"),
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "How far a market index sits below its own record, charted over time — the underwater curve. Every trough is a bear market and the flat stretches at zero are the runs at new highs; on the Nasdaq's full history the dot-com drawdown bottoms near −78%. Reads honestly on any window because the peak is tracked as the series runs. Keyless (FRED).",
  capabilities: ["index-level"],
  source: SOURCES.fred,
  schema: z.object({
    series: z
      .enum(INDEX_SERIES)
      .default("NASDAQCOM")
      .describe(
        `Which index to chart underwater. ${INDEX_SERIES_NOTE} A licensed short window can't show a drawdown it never contained, so NASDAQCOM is the default here.`,
      ),
    years: z
      .number()
      .int()
      .min(1)
      .max(60)
      .default(30)
      .describe(
        "How many years to chart. The record is measured WITHIN the window, so a short window reads as 'below the window's high', not the all-time high.",
      ),
  }),
});

export const indexAnnualReturnsMeta = defineFrameMeta({
  name: "index-annual-returns",
  label: "Index Annual Returns",
  category: "markets",
  iconUrl: widgetIcon("index-annual-returns"),
  layout: { w: 6, h: 4, minW: 3, minH: 2 },
  description:
    "Calendar-year percent returns for a market index as diverging bars — green up years, red down ones, one bar per year. Shows how lumpy equity returns actually are, and how rare the down years look next to the up ones. Keyless (FRED).",
  capabilities: ["index-level"],
  source: SOURCES.fred,
  schema: z.object({
    series: z
      .enum(INDEX_SERIES)
      .default("SP500")
      .describe(`Which index's annual returns to chart. ${INDEX_SERIES_NOTE}`),
    years: z
      .number()
      .int()
      .min(3)
      .max(60)
      .default(20)
      .describe("How many recent calendar years to show."),
  }),
});

export const vixGaugeMeta = defineFrameMeta({
  name: "vix-gauge",
  label: "VIX Gauge",
  category: "markets",
  iconUrl: widgetIcon("vix-gauge"),
  layout: { w: 3, h: 4, minW: 2, minH: 2, maxW: 6 },
  description:
    "The VIX as a volatility-regime dial — the index level on an arc with its regime named: calm (under 15), normal (15–20), elevated (20–30), stressed (30–40) or panic (above 40). The options market's price of the next 30 days of S&P movement, read as a state rather than a number. Keyless (FRED).",
  capabilities: ["index-level"],
  source: SOURCES.fred,
  schema: z.object({
    max: z
      .number()
      .int()
      .min(30)
      .max(90)
      .default(50)
      .describe(
        "Top of the dial. 50 keeps the everyday 12–25 range readable; raise it only to leave headroom for a crisis print (the VIX has closed above 80).",
      ),
  }),
});
