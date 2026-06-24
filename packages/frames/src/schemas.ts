import {
  defineFrameMeta,
  type FrameMeta,
  type FrameSource,
} from "@zframes/core/frame";
import { z } from "zod";

/**
 * Frame metadata, separated from components so React-free tooling (the
 * zframes CLI, catalogue export, the /zframes skill) can import this module
 * without charts, liveline, or CSS. Each frame's .tsx imports its meta from
 * here — this file is the single source of truth for the AI catalogue.
 */

const widgetIcon = (name: string) => `/widget-icons/${name}.png`;

/**
 * Canonical data-source credits. Each frame links its provider from the card
 * chrome (see core's FrameContent); the URL lives here in exactly one place.
 */
const SOURCES = {
  hyperliquid: { name: "Hyperliquid", url: "https://hyperliquid.xyz" },
  defillama: { name: "DeFiLlama", url: "https://defillama.com" },
  coingecko: { name: "CoinGecko", url: "https://www.coingecko.com" },
  alternativeMe: {
    name: "alternative.me",
    url: "https://alternative.me/crypto/fear-and-greed-index/",
  },
  bls: { name: "BLS", url: "https://www.bls.gov" },
  nyFed: {
    name: "NY Fed",
    url: "https://www.newyorkfed.org/markets/reference-rates",
  },
  treasury: { name: "U.S. Treasury", url: "https://fiscaldata.treasury.gov" },
  secEdgar: { name: "SEC EDGAR", url: "https://www.sec.gov/edgar" },
  finra: {
    name: "FINRA",
    url: "https://www.finra.org/finra-data/browse-catalog/short-sale-volume-data",
  },
  ofr: {
    name: "OFR",
    url: "https://www.financialresearch.gov/financial-stress-index/",
  },
  mempool: { name: "mempool.space", url: "https://mempool.space" },
  deribit: { name: "Deribit", url: "https://www.deribit.com" },
  coinpaprika: { name: "Coinpaprika", url: "https://coinpaprika.com" },
} satisfies Record<string, FrameSource>;

export const clockMeta = defineFrameMeta({
  name: "clock",
  category: "tools",
  iconUrl: widgetIcon("clock"),
  layout: { w: 3, h: 2, minW: 2, minH: 1 },
  description:
    "Digital clock showing the current time, ticking every second. Configurable IANA timezone (defaults to the viewer's local zone), 12/24-hour format, optional seconds and date, the timezone abbreviation, and a caption label. Drop several with different timezones for a trading-desk world clock. Needs no data provider.",
  capabilities: [],
  schema: z.object({
    timezone: z
      .string()
      .default("")
      .describe(
        'IANA timezone, e.g. "America/New_York", "Europe/London", "Asia/Tokyo", "UTC". Empty = the viewer\'s local timezone.',
      ),
    label: z
      .string()
      .default("")
      .describe(
        'Caption under the time, e.g. "New York" or "Local". Empty hides it.',
      ),
    hour12: z
      .boolean()
      .default(false)
      .describe("12-hour clock with AM/PM (true) or 24-hour (false)."),
    showSeconds: z
      .boolean()
      .default(true)
      .describe("Show seconds (HH:MM:SS) instead of just HH:MM."),
    showMillis: z
      .boolean()
      .default(false)
      .describe(
        "Show milliseconds (HH:MM:SS.mmm), updated smoothly each animation frame. Implies seconds.",
      ),
    showDate: z
      .boolean()
      .default(false)
      .describe("Show the weekday and date under the time."),
    showTimezone: z
      .boolean()
      .default(true)
      .describe(
        'Show the timezone abbreviation (e.g. "EST", "GMT+7", "UTC") in the caption. Combines with the label when set, e.g. "New York · EST".',
      ),
  }),
});

export const marketHoursMeta = defineFrameMeta({
  name: "market-hours",
  category: "tools",
  iconUrl: widgetIcon("market-hours"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Which world stock exchanges are open right now — each row shows an open / closed / holiday status dot and a live countdown to the next open or close. Computed entirely client-side from each exchange's timezone and regular trading hours (no API); a bundled 2026 holiday list keeps the major Western exchanges accurate on market holidays. Intraday lunch breaks and half-day early closes are not modelled. Needs no data provider.",
  capabilities: [],
  schema: z.object({
    exchanges: z
      .array(z.string())
      .default([])
      .describe(
        'Exchange codes to show, e.g. ["NYSE","LSE","TSE","HKEX","SET"]. Empty = a global default set. Known codes: NYSE, NASDAQ, TSX, B3, LSE, XETRA, EURONEXT, SIX, TSE, HKEX, SSE, NSE, KRX, SGX, SET, ASX, JSE, TADAWUL.',
      ),
    sort: z
      .enum(["region", "status", "name"])
      .default("region")
      .describe(
        "Order rows by world region (Americas → Europe → Asia-Pacific → Middle East/Africa), by status (open first), or alphabetically by name.",
      ),
  }),
});

export const fearGreedMeta = defineFrameMeta({
  name: "fear-greed",
  category: "sentiment",
  iconUrl: widgetIcon("fear-greed"),
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "Crypto Fear & Greed index (0 = extreme fear, 100 = extreme greed) with a recent-history sparkline. A one-number market mood gauge from alternative.me.",
  capabilities: ["sentiment"],
  source: SOURCES.alternativeMe,
  schema: z.object({
    sparklineDays: z
      .number()
      .int()
      .min(7)
      .max(90)
      .default(30)
      .describe("How many days of index history to show in the sparkline."),
  }),
});

export const fundingRateChartMeta = defineFrameMeta({
  name: "funding-rate-chart",
  category: "derivatives",
  iconUrl: widgetIcon("funding-rate-chart"),
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Multi-series line chart comparing hourly perp funding rates across symbols over a configurable lookback window. Positive funding = longs pay shorts. Useful for spotting crowded trades.",
  capabilities: ["funding-history"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbols: z
      .array(z.string())
      .min(1)
      .max(6)
      .describe(
        'Hyperliquid symbols to compare funding for, e.g. ["xyz:TSLA", "xyz:NVDA"]. Up to 6.',
      ),
    lookback: z
      .enum(["24h", "7D", "1M"])
      .default("7D")
      .describe("History window for the funding chart."),
  }),
});

export const noteMeta = defineFrameMeta({
  name: "note",
  category: "layout",
  iconUrl: widgetIcon("note"),
  layout: { w: 4, h: 3, minW: 2, minH: 2 },
  description:
    "Free-form text note pinned to the dashboard — trading plans, reminders, watch levels. Needs no data provider.",
  capabilities: [],
  schema: z.object({
    text: z
      .string()
      .min(1)
      .describe("The note's text content. Plain text; newlines are preserved."),
    align: z
      .enum(["left", "center"])
      .default("left")
      .describe("Text alignment inside the card."),
  }),
});

export const priceChartMeta = defineFrameMeta({
  name: "price-chart",
  category: "markets",
  iconUrl: widgetIcon("price-chart"),
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Live animated price chart (candlestick or line) for one symbol — canvas-rendered at 60fps via liveline, streaming live off the Hyperliquid WebSocket. Works for HIP-3 stock perps (xyz:TSLA) and crypto (BTC). The centerpiece frame.",
  capabilities: ["ohlcv", "quote-stream"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbol: z
      .string()
      .min(1)
      .describe(
        'Hyperliquid symbol to chart. Stocks/HIP-3: "xyz:TSLA", "xyz:NVDA", "xyz:AAPL". Crypto: "BTC", "ETH".',
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
  }),
});

export const priceLivelineMeta = defineFrameMeta({
  name: "price-liveline",
  category: "markets",
  iconUrl: widgetIcon("price-liveline"),
  layout: { w: 6, h: 3, minW: 4, minH: 2 },
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
        'Hyperliquid symbols to stream together, e.g. ["xyz:TSLA", "xyz:NVDA", "xyz:AAPL"] or ["BTC", "ETH", "SOL"]. 2 to 8.',
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
  category: "markets",
  iconUrl: widgetIcon("price-ticker"),
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "Live watchlist streaming mid prices over the Hyperliquid WebSocket with 24h change per symbol. The bread-and-butter frame for any dashboard.",
  capabilities: ["quote-stream", "day-stats"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbols: z
      .array(z.string())
      .min(1)
      .describe(
        'Hyperliquid symbols to track, e.g. ["xyz:TSLA", "xyz:NVDA", "xyz:AAPL"]. Crypto works too: "BTC", "ETH".',
      ),
  }),
});

export const topMoversMeta = defineFrameMeta({
  name: "top-movers",
  category: "markets",
  iconUrl: widgetIcon("top-movers"),
  layout: { w: 5, h: 3, minW: 3, minH: 3 },
  description:
    "Today's biggest stock and commodity HIP-3 gainers and losers (no bare crypto), side by side with current price and 24h change.",
  capabilities: ["day-stats"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    count: z
      .number()
      .int()
      .min(3)
      .max(10)
      .default(5)
      .describe("How many gainers and losers to list (each)."),
  }),
});

export const tvlTreemapMeta = defineFrameMeta({
  name: "tvl-treemap",
  category: "crypto",
  iconUrl: widgetIcon("tvl-treemap"),
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "Treemap of total value locked (TVL) across the largest blockchain ecosystems, sized by TVL. Data from DeFiLlama. Good single-glance answer to 'where does on-chain capital live right now'.",
  capabilities: ["tvl"],
  source: SOURCES.defillama,
  schema: z.object({
    topN: z
      .number()
      .int()
      .min(3)
      .max(30)
      .default(12)
      .describe("How many of the largest chains to show in the treemap."),
  }),
});

export const bitcoinDominanceMeta = defineFrameMeta({
  name: "bitcoin-dominance",
  category: "crypto",
  iconUrl: widgetIcon("bitcoin-dominance"),
  layout: { w: 4, h: 2, minW: 3, minH: 2 },
  description:
    "BTC / ETH / Others market-cap dominance as a segmented bar, with optional total marketcap line. Shifts in BTC dominance hint at where the market rotates next.",
  capabilities: ["global-market"],
  source: SOURCES.coingecko,
  schema: z.object({
    showTotalMarketCap: z
      .boolean()
      .default(true)
      .describe(
        "Show total crypto marketcap and its 24h change below the bar.",
      ),
  }),
});

export const ratesBoardMeta = defineFrameMeta({
  name: "rates-board",
  category: "macro",
  iconUrl: widgetIcon("rates-board"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Official US rates board from free public APIs: New York Fed reference rates (SOFR, effective fed funds, repo rates) plus Treasury average interest rates by security class. Daily/reference data, not a real-time stock quote feed.",
  capabilities: ["reference-rates", "treasury-rates"],
  source: [SOURCES.nyFed, SOURCES.treasury],
  schema: z.object({
    maxReferenceRates: z
      .number()
      .int()
      .min(2)
      .max(8)
      .default(5)
      .describe("How many New York Fed reference rates to show."),
    showTreasuryAverageRates: z
      .boolean()
      .default(true)
      .describe(
        "Also show Treasury average interest rates by security class from Fiscal Data.",
      ),
    maxTreasuryRates: z
      .number()
      .int()
      .min(1)
      .max(8)
      .default(4)
      .describe("How many Treasury average-rate rows to show."),
  }),
});

export const inflationPulseMeta = defineFrameMeta({
  name: "inflation-pulse",
  category: "macro",
  iconUrl: widgetIcon("inflation-pulse"),
  layout: { w: 4, h: 3, minW: 3, minH: 2 },
  description:
    "BLS CPI pulse from the public no-key API: latest CPI-U all-items index with month-over-month and year-over-year changes plus a small trend sparkline. Monthly macro context for stock dashboards; not a live price feed.",
  capabilities: ["macro-series"],
  source: SOURCES.bls,
  schema: z.object({
    months: z
      .number()
      .int()
      .min(13)
      .max(36)
      .default(18)
      .describe("How many monthly CPI observations to show in the trend."),
  }),
});

export const financialStressMeta = defineFrameMeta({
  name: "financial-stress",
  category: "macro",
  iconUrl: widgetIcon("financial-stress"),
  layout: { w: 4, h: 3, minW: 3, minH: 2 },
  description:
    "The OFR Financial Stress Index — a daily, market-based gauge of systemic financial stress from the U.S. Office of Financial Research. One headline value where 0 is the long-run average (positive = elevated stress, negative = calmer than normal), an optional breakdown of the five contributing categories (credit, equity valuation, safe assets, funding, volatility), and a trend line. Keyless official data, updated each business day; needs the zframes runtime's data proxy (ships with `zframes serve` / `vite dev`). Not a price feed.",
  capabilities: ["financial-stress"],
  source: SOURCES.ofr,
  schema: z.object({
    trendDays: z
      .number()
      .int()
      .min(20)
      .max(90)
      .default(60)
      .describe("How many recent daily readings to plot in the trend line."),
    showCategories: z
      .boolean()
      .default(true)
      .describe(
        "Show the five category contributions (credit, equity valuation, safe assets, funding, volatility) under the headline.",
      ),
  }),
});

export const nationalDebtMeta = defineFrameMeta({
  name: "national-debt",
  category: "macro",
  iconUrl: widgetIcon("national-debt"),
  layout: { w: 4, h: 3, minW: 3, minH: 2 },
  description:
    "U.S. total public debt outstanding from the Treasury's keyless 'Debt to the Penny' dataset — the headline total in trillions, the change over the chosen window, an optional split into debt held by the public vs intragovernmental holdings, and a trend line. Official data updated each business day; CORS-safe (no proxy needed). Macro context, not a live price feed.",
  capabilities: ["national-debt"],
  source: SOURCES.treasury,
  schema: z.object({
    trendDays: z
      .number()
      .int()
      .min(30)
      .max(365)
      .default(180)
      .describe(
        "How many business days of history to load for the trend and the change figure.",
      ),
    showSplit: z
      .boolean()
      .default(true)
      .describe(
        "Show the debt-held-by-the-public vs intragovernmental-holdings split.",
      ),
  }),
});

export const laborMarketMeta = defineFrameMeta({
  name: "labor-market",
  category: "macro",
  iconUrl: widgetIcon("labor-market"),
  layout: { w: 4, h: 3, minW: 3, minH: 2 },
  description:
    "U.S. labor-market snapshot from the BLS keyless public API: the headline unemployment rate, the latest monthly change in nonfarm payrolls (jobs added or lost), the total payroll level, and an unemployment-rate trend line. Monthly macro context for stock dashboards; updates on the BLS jobs-report schedule, not a live feed.",
  capabilities: ["macro-series"],
  source: SOURCES.bls,
  schema: z.object({
    months: z
      .number()
      .int()
      .min(13)
      .max(36)
      .default(18)
      .describe("How many monthly observations to show in the trend."),
  }),
});

export const treasuryAuctionsMeta = defineFrameMeta({
  name: "treasury-auctions",
  category: "macro",
  iconUrl: widgetIcon("treasury-auctions"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Recent completed U.S. Treasury auctions from the keyless Fiscal Data API — each row shows the security (bill/note/bond + term), the high awarded yield, and the bid-to-cover ratio (demand: total bids ÷ amount accepted; higher = stronger). Newest first. Official market-plumbing data, CORS-safe; updates as auctions settle, not a live price feed.",
  capabilities: ["treasury-auctions"],
  source: SOURCES.treasury,
  schema: z.object({
    count: z
      .number()
      .int()
      .min(3)
      .max(20)
      .default(8)
      .describe("How many recent auctions to list (newest first)."),
  }),
});

export const filingsFeedMeta = defineFrameMeta({
  name: "filings-feed",
  category: "equities",
  iconUrl: widgetIcon("filings-feed"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Recent SEC EDGAR filings for one US-listed company — each row shows the form type (10-K, 10-Q, 8-K, Form 4…), a plain-English label, the filing date, and a click-through to the document on sec.gov, under a header with the company name, exchange, and filer category. Official data from SEC's free, CORS-safe submissions endpoint; event-driven (updates when the company files), not a price feed. Resolve by ticker (a bundled snapshot of the ~500 largest US issuers) or by raw SEC CIK for anything else.",
  capabilities: ["filings"],
  source: SOURCES.secEdgar,
  schema: z.object({
    symbol: z
      .string()
      .min(1)
      .describe(
        'Company to show filings for — a ticker ("AAPL", "NVDA"), a HIP-3 symbol ("xyz:TSLA"), or a raw SEC CIK ("320193"). Tickers outside the bundled top-500 map need a CIK.',
      ),
    forms: z
      .enum(["important", "all", "insider"])
      .default("important")
      .describe(
        'Which filings to surface: "important" = periodic & material reports (10-K, 10-Q, 8-K, S-1, proxies, 13D/G…); "insider" = ownership forms (3/4/5/144); "all" = unfiltered. Always newest first.',
      ),
    count: z
      .number()
      .int()
      .min(3)
      .max(25)
      .default(8)
      .describe("How many filings to list (newest first)."),
  }),
});

export const yieldCurveMeta = defineFrameMeta({
  name: "yield-curve",
  category: "macro",
  iconUrl: widgetIcon("yield-curve"),
  layout: { w: 4, h: 3, minW: 3, minH: 3 },
  description:
    "The U.S. Treasury daily par yield curve — a line from 1-month to 30-year yields, the headline 2s10s spread (10Y minus 2Y; negative = inverted, the classic recession signal), and a configurable row of key maturities. Keyless official data from the U.S. Treasury, updated each business day; not a live intraday feed.",
  capabilities: ["yield-curve"],
  source: SOURCES.treasury,
  schema: z.object({
    maturities: z
      .array(
        z.enum([
          "1M",
          "2M",
          "3M",
          "4M",
          "6M",
          "1Y",
          "2Y",
          "3Y",
          "5Y",
          "7Y",
          "10Y",
          "20Y",
          "30Y",
        ]),
      )
      .min(2)
      .max(8)
      .default(["3M", "2Y", "5Y", "10Y", "30Y"])
      .describe(
        "Maturities to show as labelled cells under the curve (the full curve line always shows every maturity).",
      ),
  }),
});

export const fundamentalsMeta = defineFrameMeta({
  name: "fundamentals",
  category: "equities",
  iconUrl: widgetIcon("fundamentals"),
  layout: { w: 4, h: 3, minW: 3, minH: 3 },
  description:
    "Headline financials for one US-listed company from SEC EDGAR XBRL company facts — revenue, net income, total assets, shareholders' equity, diluted EPS, and shares outstanding, each labelled with its fiscal period. Income-statement figures are the latest full fiscal year; balance-sheet figures are the latest reported quarter. Keyless official data that updates only when the company files (annual/quarterly), not a live feed. Requires the zframes runtime's data proxy (it ships with `zframes serve` / `vite dev`); resolve by ticker (bundled top-500 map) or raw SEC CIK.",
  capabilities: ["fundamentals"],
  source: SOURCES.secEdgar,
  schema: z.object({
    symbol: z
      .string()
      .min(1)
      .describe(
        'Company to show financials for — a ticker ("AAPL", "NVDA"), a HIP-3 symbol ("xyz:NVDA"), or a raw SEC CIK ("320193"). Tickers outside the bundled top-500 map need a CIK.',
      ),
  }),
});

export const shortVolumeMeta = defineFrameMeta({
  name: "short-volume",
  category: "equities",
  iconUrl: widgetIcon("short-volume"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Daily reported short-sale volume for a watchlist of US-listed stocks, from FINRA's free consolidated file — each row shows the % of the day's reported volume that was sold short, with a bar and the raw short/total share counts. IMPORTANT: this is reported short volume (sell-side short flow, which includes market-maker hedging), NOT short interest (outstanding short positions), and is not a directional signal on its own. Daily data published the next business day; not a live feed. US equities only.",
  capabilities: ["short-volume"],
  source: SOURCES.finra,
  schema: z.object({
    symbols: z
      .array(z.string())
      .min(1)
      .max(12)
      .describe(
        'US-listed stock tickers to show, e.g. ["TSLA","NVDA","AAPL"]. HIP-3 symbols ("xyz:TSLA") work too — the dex prefix is stripped. Crypto has no SEC/FINRA short-volume and is ignored.',
      ),
    sort: z
      .enum(["shortPct", "volume", "symbol"])
      .default("shortPct")
      .describe(
        "Order rows by short % of volume (highest first), by total volume (highest first), or alphabetically by symbol.",
      ),
  }),
});

export const fundingHeatmapMeta = defineFrameMeta({
  name: "funding-heatmap",
  category: "derivatives",
  iconUrl: widgetIcon("funding-heatmap"),
  layout: { w: 6, h: 3, minW: 4, minH: 3 },
  description:
    "Heatmap of perp funding rates — symbols as rows, daily average over the last 7 days as columns, green positive / red negative. Spots persistent funding regimes at a glance.",
  capabilities: ["funding-history"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbols: z
      .array(z.string())
      .min(2)
      .max(8)
      .describe(
        'Hyperliquid symbols as heatmap rows — at least 2, since the heatmap compares funding across symbols, e.g. ["xyz:TSLA", "xyz:NVDA", "xyz:AAPL"].',
      ),
  }),
});

export const dinoGameMeta = defineFrameMeta({
  name: "dino-game",
  category: "games",
  iconUrl: widgetIcon("dino-game"),
  layout: { w: 4, h: 3, minW: 3, minH: 3 },
  description:
    "Chrome-dino style runner game on canvas — jump cacti with SPACE or tap. High score persists locally. For when the market is boring. Needs no data provider.",
  capabilities: [],
  schema: z.object({}),
});

export const imageMeta = defineFrameMeta({
  name: "image",
  category: "layout",
  iconUrl: widgetIcon("image"),
  layout: { w: 3, h: 3, minW: 1, minH: 1 },
  description:
    "Displays an image from a URL — logos, memes, chart screenshots, banners. Needs no data provider.",
  capabilities: [],
  schema: z.object({
    url: z.string().min(1).describe("Image URL (https)."),
    alt: z.string().default("").describe("Alt text for accessibility."),
    fit: z
      .enum(["cover", "contain"])
      .default("cover")
      .describe(
        "How the image fills the frame: cover crops, contain letterboxes.",
      ),
  }),
});

export const headingMeta = defineFrameMeta({
  name: "heading",
  category: "layout",
  iconUrl: widgetIcon("heading"),
  layout: { w: 12, h: 1, minW: 2, minH: 1, maxH: 1 },
  description:
    "Section divider that titles a region of the dashboard ('Markets', 'On-chain', 'Desk'). Renders as a label with a hairline rule — no card. Use to group frames into zones: place full-width (w: 12) and 1 row tall (h: 1) above each group. Needs no data provider.",
  capabilities: [],
  chrome: "bare",
  schema: z.object({
    title: z.string().min(1).describe("The heading text."),
    subtitle: z
      .string()
      .optional()
      .describe("Smaller supporting line under the title."),
  }),
});

export const dailyAnalysisMeta = defineFrameMeta({
  name: "daily-analysis",
  category: "tools",
  iconUrl: widgetIcon("daily-analysis"),
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Daily market brief written by the /zframes-brief loop — a dated analysis of the symbols on your dashboard, the calls it is making today, and how yesterday's calls scored (with a running hit-rate). Reads a local log file the loop appends to; needs no market data provider. Add one per dashboard.",
  capabilities: [],
  schema: z.object({
    src: z
      .string()
      .default("/daily-analysis.json")
      .describe(
        "URL of the analysis log the loop writes, served from the app's public/ dir. Leave as the default unless you renamed the file.",
      ),
    entries: z
      .number()
      .int()
      .min(1)
      .max(5)
      .default(1)
      .describe(
        "How many of the most recent daily entries to show (newest first).",
      ),
    refreshSec: z
      .number()
      .int()
      .min(30)
      .default(300)
      .describe(
        "How often (seconds) to re-fetch the log so a fresh brief appears without a manual reload.",
      ),
  }),
});

export const priceCompareMeta = defineFrameMeta({
  name: "price-compare",
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

// Shared config for the source-agnostic portfolio frames. The source is chosen
// per instance; the keyed Binance source needs a one-time in-app connect (its
// read-only key is stored locally, never in this spec), the wallet source just
// needs a public address.
const portfolioConfigShape = {
  source: z
    .enum(["binance", "wallet"])
    .default("binance")
    .describe(
      'Where the holdings come from: "binance" (a connected Binance account — a read-only API key is entered in-app and stored locally, never in this file) or "wallet" (a public on-chain address, keyless).',
    ),
  address: z
    .string()
    .default("")
    .describe(
      'For source "wallet": the public Ethereum address (0x…) or ENS name to track. Public on-chain data, no keys. Ignored for "binance".',
    ),
};

export const portfolioValueMeta = defineFrameMeta({
  name: "portfolio-value",
  category: "portfolio",
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Your connected portfolio's total USD value as a live equity line, ticking with the market. Source is a connected Binance account (read-only key, entered in-app) or a public on-chain wallet address. Shows total value + session change. Renders a connect prompt until a source is set.",
  capabilities: ["portfolio", "quote-stream"],
  account: true,
  schema: z.object({
    ...portfolioConfigShape,
    windowSec: z
      .number()
      .int()
      .positive()
      .default(300)
      .describe(
        "Seconds of live history the equity line shows; it accumulates from when the dashboard opens.",
      ),
  }),
});

export const portfolioAllocationMeta = defineFrameMeta({
  name: "portfolio-allocation",
  category: "portfolio",
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Donut of your connected portfolio's allocation — each slice sized by live USD value, total in the center. Source is a connected Binance account (read-only key, in-app) or a public on-chain wallet address. Renders a connect prompt until a source is set.",
  capabilities: ["portfolio", "quote-stream"],
  account: true,
  schema: z.object({ ...portfolioConfigShape }),
});

export const portfolioHoldingsMeta = defineFrameMeta({
  name: "portfolio-holdings",
  category: "portfolio",
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Table of your connected portfolio's positions — asset, amount, live USD value, share of total, 24h change. Source is a connected Binance account (read-only key, in-app) or a public on-chain wallet address. Renders a connect prompt until a source is set.",
  capabilities: ["portfolio", "quote-stream"],
  account: true,
  schema: z.object({ ...portfolioConfigShape }),
});

export const newsFeedMeta = defineFrameMeta({
  name: "news-feed",
  category: "sentiment",
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    'Scrolling feed of the latest news headlines from a chosen outlet — each row is a clickable headline with its publish time, newest first. Free, keyless RSS sources: crypto press (CoinDesk, Cointelegraph, Decrypt), broad markets/macro (CNBC, Nasdaq), or — source "stocks" — per-company headlines (via Google News) scoped to the specific tickers in `symbols`. IMPORTANT: news feeds are CORS-blocked, so this frame reads them through the zframes runtime\'s data proxy (it ships with `zframes serve` / `vite dev`); on a fully static host with no runtime it shows an empty state.',
  capabilities: ["news"],
  schema: z.object({
    source: z
      .enum([
        "coindesk",
        "cointelegraph",
        "decrypt",
        "cnbc",
        "nasdaq",
        "stocks",
      ])
      .default("coindesk")
      .describe(
        'Which feed to show. Crypto press: "coindesk", "cointelegraph", "decrypt". Markets/macro: "cnbc", "nasdaq". "stocks" = per-company headlines (Google News) for the tickers in `symbols`.',
      ),
    symbols: z
      .array(z.string())
      .default([])
      .describe(
        'Only used when source is "stocks": stock tickers to pull headlines for, e.g. ["TSLA","NVDA","AAPL"]. HIP-3 symbols ("xyz:TSLA") work too — the dex prefix is stripped. Ignored for the other sources.',
      ),
    count: z
      .number()
      .int()
      .min(3)
      .max(20)
      .default(8)
      .describe("How many headlines to list (newest first)."),
  }),
});

export const dexVolumeTreemapMeta = defineFrameMeta({
  name: "dex-volume-treemap",
  category: "crypto",
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "Treemap of decentralized-exchange (DEX) protocols sized by trailing-24h trading volume, tiles colored green/red by 1-day change. Data from DeFiLlama. One-glance read on where on-chain trading flow is concentrated right now.",
  capabilities: ["dex-volume"],
  source: SOURCES.defillama,
  schema: z.object({
    topN: z
      .number()
      .int()
      .min(3)
      .max(30)
      .default(12)
      .describe("How many of the highest-volume DEX protocols to show."),
  }),
});

export const dexVolumeChartMeta = defineFrameMeta({
  name: "dex-volume-chart",
  category: "crypto",
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Multi-series line chart of daily DEX trading volume for several protocols over a lookback window — compare how Uniswap, PancakeSwap, Aerodrome etc. trend against each other. Data from DeFiLlama (daily granularity).",
  capabilities: ["dex-volume"],
  source: SOURCES.defillama,
  schema: z.object({
    protocols: z
      .array(z.string())
      .min(1)
      .max(6)
      .describe(
        'DeFiLlama DEX protocol slugs (lowercase, hyphenated), e.g. ["uniswap", "pancakeswap", "aerodrome-slipstream"]. 1 to 6.',
      ),
    lookback: z
      .enum(["7D", "1M", "3M"])
      .default("1M")
      .describe("History window for the chart."),
  }),
});

export const protocolTvlTreemapMeta = defineFrameMeta({
  name: "protocol-tvl-treemap",
  category: "crypto",
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "Treemap of DeFi protocols sized by current total value locked (TVL), tiles colored green/red by 1-day change. Data from DeFiLlama. Unlike tvl-treemap (which groups by blockchain), this ranks individual protocols (Lido, Aave, EigenLayer…).",
  capabilities: ["protocol-tvl"],
  source: SOURCES.defillama,
  schema: z.object({
    topN: z
      .number()
      .int()
      .min(3)
      .max(30)
      .default(12)
      .describe("How many of the largest protocols by TVL to show."),
  }),
});

export const protocolTvlChartMeta = defineFrameMeta({
  name: "protocol-tvl-chart",
  category: "crypto",
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Multi-series line chart of total value locked (TVL) for several DeFi protocols over a lookback window. Data from DeFiLlama (daily granularity).",
  capabilities: ["protocol-tvl"],
  source: SOURCES.defillama,
  schema: z.object({
    protocols: z
      .array(z.string())
      .min(1)
      .max(6)
      .describe(
        'DeFiLlama protocol slugs (lowercase, hyphenated), e.g. ["lido", "aave", "eigenlayer"]. 1 to 6.',
      ),
    lookback: z
      .enum(["7D", "1M", "3M"])
      .default("1M")
      .describe("History window for the chart."),
  }),
});

export const protocolFeesTreemapMeta = defineFrameMeta({
  name: "protocol-fees-treemap",
  category: "crypto",
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "Treemap of protocols sized by the fees they generated in the last 24h, tiles colored green/red by 1-day change. Data from DeFiLlama. Shows where on-chain users are actually paying for blockspace and services right now.",
  capabilities: ["protocol-fees"],
  source: SOURCES.defillama,
  schema: z.object({
    topN: z
      .number()
      .int()
      .min(3)
      .max(30)
      .default(12)
      .describe("How many of the highest fee-earning protocols to show."),
  }),
});

export const marketCapTreemapMeta = defineFrameMeta({
  name: "market-cap-treemap",
  category: "crypto",
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "Treemap of the largest cryptocurrencies sized by market capitalisation, tiles colored green/red by 24h price change. Data from CoinGecko (free tier). A heat-map of the whole crypto market at a glance.",
  capabilities: ["coin-markets"],
  source: SOURCES.coingecko,
  schema: z.object({
    topN: z
      .number()
      .int()
      .min(5)
      .max(50)
      .default(12)
      .describe(
        "How many of the largest coins by market cap to show (up to 50).",
      ),
  }),
});

export const openInterestMeta = defineFrameMeta({
  name: "open-interest",
  category: "derivatives",
  layout: { w: 4, h: 3, minW: 3, minH: 2 },
  description:
    'Live open interest across a watchlist of Hyperliquid perps — each symbol is a horizontal bar sized by USD notional, largest first, refreshed on a ~30s poll. Single-venue (Hyperliquid only), so read it as a relative gauge across your symbols, not a market-wide total. Stocks (HIP-3, e.g. "xyz:TSLA") and crypto both work.',
  capabilities: ["open-interest"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbols: z
      .array(z.string())
      .min(1)
      .max(20)
      .describe(
        'Hyperliquid symbols to compare open interest for, e.g. ["BTC", "ETH", "xyz:TSLA"]. A "<dex>:*" wildcard (e.g. "xyz:*") pulls that dex\'s entire universe.',
      ),
  }),
});

export const snakeMeta = defineFrameMeta({
  name: "snake",
  category: "games",
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Classic snake game on canvas — steer with the arrow keys (or swipe), eat dots to grow, avoid the walls and your own tail. High score persists locally. For when the market is flat. Needs no data provider.",
  capabilities: [],
  schema: z.object({}),
});

export const flappyBirdMeta = defineFrameMeta({
  name: "flappy-bird",
  category: "games",
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Flappy-bird style game on canvas — tap or press SPACE to flap through the gaps between pipes. High score persists locally. Needs no data provider.",
  capabilities: [],
  schema: z.object({}),
});

export const videoMeta = defineFrameMeta({
  name: "video",
  category: "layout",
  layout: { w: 4, h: 3, minW: 2, minH: 2 },
  description:
    "Embeds a video from a YouTube or Vimeo link (or any direct embed URL) as an iframe — a livestream, a market-news clip, a focus playlist. Needs no data provider.",
  capabilities: [],
  schema: z.object({
    url: z
      .string()
      .min(1)
      .describe(
        "Video URL — a YouTube watch/share link, a Vimeo link, or a direct embeddable URL (https).",
      ),
    title: z
      .string()
      .default("Video")
      .describe("Accessible title for the embedded player (iframe title)."),
  }),
});

export const drawdyMeta = defineFrameMeta({
  name: "drawdy",
  category: "layout",
  layout: { w: 8, h: 6, minW: 2, minH: 2 },
  description:
    "Embeds drawdy.io as an interactive whiteboard canvas. No configuration needed.",
  capabilities: [],
  schema: z.object({}),
});

export const countdownMeta = defineFrameMeta({
  name: "countdown",
  category: "tools",
  layout: { w: 3, h: 2, minW: 2, minH: 1 },
  description:
    "Live countdown to a target date and time — FOMC decisions, CPI prints, options expiry, earnings, a token unlock, the next market open. Counts down in days / hours / minutes / seconds, ticking every second, and flips to a 'reached' state once the moment passes. Needs no data provider.",
  capabilities: [],
  schema: z.object({
    target: z
      .string()
      .default("")
      .describe(
        'The moment to count down to, as an ISO 8601 string. Add a timezone for an unambiguous instant, e.g. "2026-07-30T18:00:00-04:00" or "2026-12-31T23:59:59Z"; a bare "2026-07-30T18:00" is read in the viewer\'s local timezone. Empty shows a "set a target" prompt.',
      ),
    label: z
      .string()
      .default("")
      .describe(
        'Caption above the countdown, e.g. "FOMC Decision". Empty hides it.',
      ),
    showTarget: z
      .boolean()
      .default(true)
      .describe("Show the formatted target date and time under the countdown."),
  }),
});

export const linkGridMeta = defineFrameMeta({
  name: "link-grid",
  category: "tools",
  layout: { w: 3, h: 2, minW: 2, minH: 1 },
  description:
    "A grid of quick-launch tiles linking to your favourite sites — TradingView, exchanges, news, docs, your own dashboards. Each tile opens in a new tab and shows the destination site's favicon by default (fetched keyless from a public favicon service), with an optional per-link icon override and a first-letter fallback. Needs no data provider.",
  capabilities: [],
  schema: z.object({
    links: z
      .array(
        z.object({
          label: z
            .string()
            .min(1)
            .describe('Tile caption, e.g. "TradingView".'),
          url: z
            .string()
            .min(1)
            .describe("Destination URL (https). Opens in a new tab."),
          icon: z
            .string()
            .default("")
            .describe(
              "Optional icon override: an emoji (e.g. \"📈\") or an https image URL. Empty uses the destination site's favicon, falling back to the label's first letter.",
            ),
        }),
      )
      .min(1)
      .default([
        {
          label: "TradingView",
          url: "https://www.tradingview.com",
          icon: "📈",
        },
        {
          label: "Hyperliquid",
          url: "https://app.hyperliquid.xyz",
          icon: "⚡",
        },
      ])
      .describe("The links to show as tiles. At least one."),
    columns: z
      .number()
      .int()
      .min(1)
      .max(4)
      .default(2)
      .describe("How many tiles per row."),
  }),
});

export const calculatorMeta = defineFrameMeta({
  name: "calculator",
  category: "tools",
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "Position-size & risk calculator. Enter account size, risk-per-trade %, entry and stop price; it computes the dollars at risk, the per-unit risk, the position size (units) that respects that risk budget, the resulting position value, and whether the setup is long or short. All math runs client-side — no data provider. Inputs are editable live; the configured values are the starting point.",
  capabilities: [],
  schema: z.object({
    account: z
      .number()
      .positive()
      .default(10000)
      .describe("Account size used as the risk base, in the quote currency."),
    riskPct: z
      .number()
      .positive()
      .max(100)
      .default(1)
      .describe("Percent of the account risked on the trade, e.g. 1 = 1%."),
    entry: z.number().positive().default(100).describe("Entry price."),
    stop: z
      .number()
      .positive()
      .default(95)
      .describe(
        "Stop-loss price. Its distance from entry sets the per-unit risk; below entry = long, above = short.",
      ),
    currency: z
      .string()
      .default("$")
      .describe("Currency symbol shown next to money values."),
  }),
});

export const quoteMeta = defineFrameMeta({
  name: "quote",
  category: "layout",
  layout: { w: 4, h: 2, minW: 2, minH: 1 },
  description:
    'Displays a market or trading quote, centered — set one or rotate through several. A calm bit of wall-art for the dashboard: trading maxims, reminders of your own rules, mantras. Write any attribution into the text itself (e.g. "… — Buffett"). Needs no data provider.',
  capabilities: [],
  schema: z.object({
    quotes: z
      .array(z.string().min(1))
      .min(1)
      .default([
        "Be fearful when others are greedy, and greedy when others are fearful. — Warren Buffett",
        "The trend is your friend until the end when it bends.",
        "Plan the trade, trade the plan.",
      ])
      .describe(
        "One or more quotes. With more than one, the frame rotates through them.",
      ),
    intervalSec: z
      .number()
      .int()
      .min(0)
      .default(12)
      .describe(
        "Seconds between rotations when there are multiple quotes. 0 shows the first quote, fixed.",
      ),
  }),
});

export const dividerMeta = defineFrameMeta({
  name: "divider",
  category: "layout",
  layout: { w: 12, h: 1, minW: 1, minH: 1 },
  description:
    "A plain rule that separates regions of the dashboard, with an optional centered label. Renders chrome-less (no card) — lighter than a heading. Use a horizontal divider full-width between stacked zones, or set orientation to vertical for a 1-column-wide column separator. Needs no data provider.",
  capabilities: [],
  chrome: "bare",
  schema: z.object({
    label: z
      .string()
      .default("")
      .describe(
        "Optional text shown in the middle of the rule. Empty = a clean line.",
      ),
    orientation: z
      .enum(["horizontal", "vertical"])
      .default("horizontal")
      .describe(
        "Horizontal rule (spans the width) or vertical rule (spans the height).",
      ),
    style: z
      .enum(["solid", "dashed", "dotted"])
      .default("solid")
      .describe("Line style."),
  }),
});

export const diceMeta = defineFrameMeta({
  name: "dice",
  category: "tools",
  layout: { w: 2, h: 2, minW: 1, minH: 1 },
  description:
    "A click-to-decide widget — a random decision-maker with no data provider. Flip a coin (heads/tails), roll a die (1–6), or pick at random from your own list of options. Click the surface to re-roll. Use it to break a tie, pick what to trade, or settle any small decision.",
  capabilities: [],
  schema: z.object({
    mode: z
      .enum(["coin", "dice", "list"])
      .default("coin")
      .describe(
        "coin = heads/tails, dice = 1–6, list = random pick from options.",
      ),
    options: z
      .array(z.string())
      .default(["Yes", "No"])
      .describe("Choices used in list mode."),
    label: z
      .string()
      .default("")
      .describe("Optional caption, e.g. the question being decided."),
  }),
});

export const riskRewardMeta = defineFrameMeta({
  name: "risk-reward",
  category: "tools",
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "Risk:reward planner. Enter entry, stop-loss and profit-target prices; it computes the per-unit risk and reward, their percentages of entry, and the resulting R:R ratio, shown large above a two-segment bar (red risk leg vs green reward leg, sized to scale). Pure client-side math — no data provider. Complements the calculator frame by adding the target/reward leg the position sizer leaves out.",
  capabilities: [],
  schema: z.object({
    entry: z.number().default(100).describe("Planned entry price."),
    stop: z.number().default(95).describe("Stop-loss price."),
    target: z.number().default(115).describe("Profit target price."),
    direction: z
      .enum(["long", "short"])
      .default("long")
      .describe(
        "Trade direction. Long expects stop < entry < target; short expects target < entry < stop — used for labels and to flag a mismatched setup.",
      ),
    label: z.string().default("").describe("Optional caption."),
  }),
});

export const marqueeMeta = defineFrameMeta({
  name: "marquee",
  category: "layout",
  layout: { w: 6, h: 1, minW: 2, minH: 1 },
  description:
    "A chrome-less scrolling banner that glides custom text continuously right-to-left across the frame (think stadium ticker / news crawl). Renders with no card — it fills the whole frame. Use for a slogan, a reminder, or a hype line. Needs no data provider.",
  capabilities: [],
  chrome: "bare",
  schema: z.object({
    text: z
      .string()
      .default("LFG")
      .describe("The text that scrolls across the banner."),
    speed: z
      .enum(["slow", "normal", "fast"])
      .default("normal")
      .describe("Scroll speed."),
    accent: z
      .boolean()
      .default(true)
      .describe("Tint the text with the dashboard accent color."),
  }),
});

export const stopwatchMeta = defineFrameMeta({
  name: "stopwatch",
  layout: { w: 3, h: 2, minW: 2, minH: 1 },
  category: "tools",
  description:
    "A count-up stopwatch — time-in-trade, a focus session, how long a setup has been live. Start / Pause / Reset, ticking up in H:MM:SS, and it persists across reloads (the running state is saved into the dashboard, so it keeps counting where it left off). Runs entirely client-side — needs no data provider.",
  capabilities: [],
  schema: z.object({
    label: z.string().default("Session").describe("Caption above the timer."),
    startedAt: z
      .number()
      .default(0)
      .describe(
        "Epoch ms when the timer was last started; 0 = paused. Persisted automatically by the frame.",
      ),
    accumulatedMs: z
      .number()
      .default(0)
      .describe(
        "Milliseconds banked before the current run. Persisted automatically by the frame.",
      ),
  }),
});

export const sessionProgressMeta = defineFrameMeta({
  name: "session-progress",
  category: "tools",
  layout: { w: 3, h: 2, minW: 2, minH: 1 },
  description:
    "A horizontal progress bar showing how far through today's trading session an exchange is — fills from open to close with a percent readout, and a 'closes in …' / 'opens in …' countdown. Pick any exchange code (NYSE, NASDAQ, LSE, TSX, B3, …); sessions are computed client-side from the exchange's timezone and hours, so it needs no data provider.",
  capabilities: [],
  schema: z.object({
    exchange: z
      .string()
      .default("NYSE")
      .describe("Exchange code: NYSE, NASDAQ, LSE, TSX, B3, …"),
    label: z
      .string()
      .default("")
      .describe("Optional caption shown by the exchange code."),
    showCountdown: z
      .boolean()
      .default(true)
      .describe("Show the time-to-open / time-to-close countdown."),
  }),
});

export const holidayCalendarMeta = defineFrameMeta({
  name: "holiday-calendar",
  category: "tools",
  layout: { w: 3, h: 4, minW: 2, minH: 2 },
  description:
    "Upcoming market holidays (full closures) for a chosen exchange — the next few dates with their weekday and a countdown ('in 9d'). Pick any exchange code (NYSE, NASDAQ, LSE, TSX, B3, …); dates come from a bundled holiday table and are computed client-side, so it needs no data provider. Note: the bundled table currently covers 2026.",
  capabilities: [],
  schema: z.object({
    exchange: z
      .string()
      .default("NYSE")
      .describe("Exchange code: NYSE, NASDAQ, LSE, TSX, B3, …"),
    count: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(5)
      .describe("How many upcoming holidays to list."),
    label: z
      .string()
      .default("")
      .describe("Optional caption shown above the list."),
  }),
});

export const dayMeterMeta = defineFrameMeta({
  name: "day-meter",
  category: "tools",
  layout: { w: 4, h: 2, minW: 2, minH: 1 },
  description:
    "A strip of the current week's days for a chosen exchange — today highlighted, market holidays flagged in amber, and (optionally) non-trading days greyed. Computed client-side from the exchange's trading days + a bundled holiday table; needs no data provider.",
  capabilities: [],
  schema: z.object({
    exchange: z
      .string()
      .default("NYSE")
      .describe("Exchange code: NYSE, NASDAQ, LSE, TSX, B3, …"),
    weekdaysOnly: z
      .boolean()
      .default(true)
      .describe(
        "Show only the exchange's trading days; off shows the full 7-day week with weekends greyed.",
      ),
    label: z
      .string()
      .default("")
      .describe("Optional caption shown by the strip."),
  }),
});

export const btcFeesMeta = defineFrameMeta({
  name: "btc-fees",
  category: "bitcoin",
  iconUrl: widgetIcon("btc-fees"),
  layout: { w: 3, h: 2, minW: 2, minH: 2 },
  description:
    "Recommended Bitcoin on-chain fee rates (sat/vB) from mempool.space — the next-block ('fastest'), ~30-minute, ~1-hour, economy, and minimum tiers, as a compact gauge. Live mempool data, keyless; updates every ~30s.",
  capabilities: ["btc-fees"],
  source: SOURCES.mempool,
  schema: z.object({
    tiers: z
      .array(z.enum(["fastest", "halfHour", "hour", "economy", "minimum"]))
      .min(1)
      .max(5)
      .default(["fastest", "halfHour", "hour", "economy"])
      .describe(
        'Which fee tiers to show, in order. "fastest" = next block, "halfHour"/"hour" = within ~30/60 min, "economy"/"minimum" = cheapest relayable.',
      ),
  }),
});

export const btcMempoolMeta = defineFrameMeta({
  name: "btc-mempool",
  category: "bitcoin",
  iconUrl: widgetIcon("btc-mempool"),
  layout: { w: 5, h: 3, minW: 3, minH: 2 },
  description:
    "Bitcoin mempool congestion at a glance — unconfirmed transaction count, total pending vsize, and a row of projected ('template') blocks the network will likely mine next, each labelled with its median fee rate (sat/vB) and tx count. Live mempool data from mempool.space, keyless.",
  capabilities: ["btc-mempool"],
  source: SOURCES.mempool,
  schema: z.object({
    projectedBlocks: z
      .number()
      .int()
      .min(1)
      .max(8)
      .default(5)
      .describe(
        "How many projected (yet-to-be-mined) blocks to show, next-to-mine first.",
      ),
  }),
});

export const btcBlocksMeta = defineFrameMeta({
  name: "btc-blocks",
  category: "bitcoin",
  iconUrl: widgetIcon("btc-blocks"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Feed of the most recently mined Bitcoin blocks — each row shows the height, how long ago it was mined, transaction count, the mining pool that found it, total fees (BTC), and size. Live data from mempool.space, keyless; newest first.",
  capabilities: ["btc-blocks"],
  source: SOURCES.mempool,
  schema: z.object({
    count: z
      .number()
      .int()
      .min(3)
      .max(15)
      .default(8)
      .describe("How many recent blocks to list (newest first)."),
  }),
});

export const btcHashrateMeta = defineFrameMeta({
  name: "btc-hashrate",
  category: "bitcoin",
  iconUrl: widgetIcon("btc-hashrate"),
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Bitcoin network hashrate over time as a line chart, with the current hashrate (EH/s) and difficulty as headline figures. Shows the long-run security trend of the network. Data from mempool.space (daily granularity), keyless.",
  capabilities: ["btc-hashrate"],
  source: SOURCES.mempool,
  schema: z.object({
    window: z
      .enum(["1y", "2y", "3y"])
      .default("1y")
      .describe("History window for the hashrate line."),
  }),
});

export const btcDifficultyMeta = defineFrameMeta({
  name: "btc-difficulty",
  category: "bitcoin",
  iconUrl: widgetIcon("btc-difficulty"),
  layout: { w: 4, h: 3, minW: 3, minH: 2 },
  description:
    "Countdown to the next Bitcoin difficulty adjustment — a progress bar through the current 2016-block epoch, the estimated change (+ = mining gets harder), blocks remaining, and the estimated retarget date. Also shows the previous adjustment. Data from mempool.space, keyless.",
  capabilities: ["btc-difficulty"],
  source: SOURCES.mempool,
  schema: z.object({
    showPrevious: z
      .boolean()
      .default(true)
      .describe(
        "Also show the percentage change applied at the previous retarget.",
      ),
  }),
});

export const miningPoolsMeta = defineFrameMeta({
  name: "mining-pools",
  category: "bitcoin",
  iconUrl: widgetIcon("mining-pools"),
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "Treemap of Bitcoin mining-pool dominance over a window — each tile is a pool sized by the share of blocks it mined, so you can see how concentrated hashpower is right now (Foundry, AntPool, ViaBTC…). Data from mempool.space, keyless.",
  capabilities: ["mining-pools"],
  source: SOURCES.mempool,
  schema: z.object({
    window: z
      .enum(["24h", "3d", "1w", "1m"])
      .default("1w")
      .describe("Window over which to measure each pool's block share."),
    topN: z
      .number()
      .int()
      .min(3)
      .max(25)
      .default(12)
      .describe(
        "How many of the largest pools to show; the rest fold into 'Other'.",
      ),
  }),
});

export const lightningStatsMeta = defineFrameMeta({
  name: "lightning-stats",
  category: "bitcoin",
  iconUrl: widgetIcon("lightning-stats"),
  layout: { w: 4, h: 3, minW: 3, minH: 2 },
  description:
    "Bitcoin Lightning Network snapshot — public node count, channel count, and total network capacity (BTC), with a day-over-day delta and the Tor/clearnet node split. Data from mempool.space, keyless; updates roughly daily.",
  capabilities: ["lightning-stats"],
  source: SOURCES.mempool,
  schema: z.object({
    showSplit: z
      .boolean()
      .default(true)
      .describe(
        "Show the Tor vs clearnet node split under the headline stats.",
      ),
  }),
});

export const optionsPutCallMeta = defineFrameMeta({
  name: "options-put-call",
  category: "derivatives",
  iconUrl: widgetIcon("options-put-call"),
  layout: { w: 4, h: 3, minW: 3, minH: 2 },
  description:
    "Deribit options put/call ratio for BTC or ETH — the headline ratio (by open interest or 24h volume), a call-vs-put open-interest split bar, and the open-interest-weighted average implied volatility. A ratio above 1 means puts outweigh calls (defensive positioning). Keyless Deribit market data.",
  capabilities: ["options-summary"],
  source: SOURCES.deribit,
  schema: z.object({
    currency: z
      .enum(["BTC", "ETH"])
      .default("BTC")
      .describe(
        "Which Deribit options book to summarise — BTC or ETH (the only deeply liquid books).",
      ),
    basis: z
      .enum(["oi", "volume"])
      .default("oi")
      .describe(
        'Headline put/call ratio basis: "oi" = by open interest (positioning), "volume" = by 24h traded volume (flow). The other is shown smaller.',
      ),
  }),
});

export const optionsIvMeta = defineFrameMeta({
  name: "options-iv",
  category: "derivatives",
  iconUrl: widgetIcon("options-iv"),
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Deribit DVOL implied-volatility index for BTC or ETH over time — the crypto equivalent of the VIX, as a line chart with the current reading and its change over the window. Rising DVOL = the market is pricing bigger expected swings. Keyless Deribit market data.",
  capabilities: ["volatility-index"],
  source: SOURCES.deribit,
  schema: z.object({
    currency: z
      .enum(["BTC", "ETH"])
      .default("BTC")
      .describe("Which DVOL volatility index to plot — BTC or ETH."),
    lookback: z
      .enum(["7D", "1M", "3M"])
      .default("1M")
      .describe("History window for the volatility-index line."),
  }),
});

export const optionsOiStrikeMeta = defineFrameMeta({
  name: "options-oi-strike",
  category: "derivatives",
  iconUrl: widgetIcon("options-oi-strike"),
  layout: { w: 6, h: 4, minW: 4, minH: 3 },
  description:
    "Open interest by strike for the nearest Deribit options expiry (BTC or ETH) — a grouped histogram of call vs put open interest across strikes, with the current spot marked. Surfaces the strike 'walls' where positioning is concentrated. Keyless Deribit market data.",
  capabilities: ["options-summary"],
  source: SOURCES.deribit,
  schema: z.object({
    currency: z
      .enum(["BTC", "ETH"])
      .default("BTC")
      .describe("Which Deribit options book — BTC or ETH."),
    strikes: z
      .number()
      .int()
      .min(6)
      .max(30)
      .default(14)
      .describe(
        "How many strikes nearest the current spot to show (centered on the underlying price).",
      ),
  }),
});

export const coinMoversMeta = defineFrameMeta({
  name: "coin-movers",
  category: "markets",
  iconUrl: widgetIcon("coin-movers"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
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

/** Every built-in frame's metadata — what the CLI and skill read. */
export const frameMetas: FrameMeta[] = [
  newsFeedMeta,
  portfolioValueMeta,
  portfolioAllocationMeta,
  portfolioHoldingsMeta,
  bitcoinDominanceMeta,
  clockMeta,
  dailyAnalysisMeta,
  dinoGameMeta,
  fearGreedMeta,
  filingsFeedMeta,
  fundamentalsMeta,
  financialStressMeta,
  laborMarketMeta,
  nationalDebtMeta,
  treasuryAuctionsMeta,
  fundingHeatmapMeta,
  fundingRateChartMeta,
  headingMeta,
  imageMeta,
  inflationPulseMeta,
  marketHoursMeta,
  noteMeta,
  priceChartMeta,
  priceCompareMeta,
  priceLivelineMeta,
  priceTickerMeta,
  ratesBoardMeta,
  shortVolumeMeta,
  topMoversMeta,
  tvlTreemapMeta,
  yieldCurveMeta,
  dexVolumeTreemapMeta,
  dexVolumeChartMeta,
  protocolTvlTreemapMeta,
  protocolTvlChartMeta,
  protocolFeesTreemapMeta,
  marketCapTreemapMeta,
  openInterestMeta,
  snakeMeta,
  flappyBirdMeta,
  videoMeta,
  drawdyMeta,
  countdownMeta,
  linkGridMeta,
  calculatorMeta,
  quoteMeta,
  dividerMeta,
  btcFeesMeta,
  btcMempoolMeta,
  btcBlocksMeta,
  btcHashrateMeta,
  btcDifficultyMeta,
  miningPoolsMeta,
  lightningStatsMeta,
  optionsPutCallMeta,
  optionsIvMeta,
  optionsOiStrikeMeta,
  coinMoversMeta,
];
