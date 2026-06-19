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
} satisfies Record<string, FrameSource>;

export const clockMeta = defineFrameMeta({
  name: "clock",
  iconUrl: widgetIcon("clock"),
  layout: { w: 3, h: 2, minW: 2, minH: 1 },
  description:
    "Digital clock showing the current time, ticking every second. Configurable IANA timezone (defaults to the viewer's local zone), 12/24-hour format, optional seconds and date, and a caption label. Drop several with different timezones for a trading-desk world clock. Needs no data provider.",
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
  }),
});

export const marketHoursMeta = defineFrameMeta({
  name: "market-hours",
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

export const filingsFeedMeta = defineFrameMeta({
  name: "filings-feed",
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
  iconUrl: widgetIcon("funding-heatmap"),
  layout: { w: 6, h: 3, minW: 4, minH: 3 },
  description:
    "Heatmap of perp funding rates — symbols as rows, 4h time buckets over the last 3 days as columns, green positive / red negative. Spots persistent funding regimes at a glance.",
  capabilities: ["funding-history"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbols: z
      .array(z.string())
      .min(1)
      .max(8)
      .describe(
        'Hyperliquid symbols as heatmap rows, e.g. ["xyz:TSLA", "xyz:NVDA", "xyz:AAPL"].',
      ),
  }),
});

export const dinoGameMeta = defineFrameMeta({
  name: "dino-game",
  iconUrl: widgetIcon("dino-game"),
  layout: { w: 4, h: 3, minW: 3, minH: 3 },
  description:
    "Chrome-dino style runner game on canvas — jump cacti with SPACE or tap. High score persists locally. For when the market is boring. Needs no data provider.",
  capabilities: [],
  schema: z.object({}),
});

export const imageMeta = defineFrameMeta({
  name: "image",
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

export const allocationMeta = defineFrameMeta({
  name: "allocation",
  iconUrl: widgetIcon("allocation"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Donut of a portfolio's live allocation — list holdings (symbol + amount) and each slice is sized by current USD value off the Hyperliquid mid stream, with total portfolio value in the center. A live 'where is my money right now' view.",
  capabilities: ["quote-stream"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    holdings: z
      .array(
        z.object({
          symbol: z
            .string()
            .min(1)
            .describe('Hyperliquid symbol, e.g. "BTC", "ETH", "xyz:TSLA".'),
          amount: z
            .number()
            .positive()
            .describe(
              "Units held (e.g. 0.5 BTC, 10 shares). Weights the slice by USD value = amount × live price.",
            ),
        }),
      )
      .min(2)
      .max(8)
      .describe("The holdings to chart. 2 to 8 positions."),
  }),
});

/** Every built-in frame's metadata — what the CLI and skill read. */
export const frameMetas: FrameMeta[] = [
  allocationMeta,
  bitcoinDominanceMeta,
  clockMeta,
  dailyAnalysisMeta,
  dinoGameMeta,
  fearGreedMeta,
  filingsFeedMeta,
  fundamentalsMeta,
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
];
