import {
  defineFrameMeta,
  type FrameMeta,
  type FrameSource,
} from "@zframes/spec/frame";
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
  frankfurter: { name: "Frankfurter (ECB)", url: "https://frankfurter.dev" },
  coinMetrics: { name: "Coin Metrics", url: "https://coinmetrics.io" },
  bitcoinData: { name: "bitcoin-data.com", url: "https://bitcoin-data.com" },
  ultrasound: { name: "ultrasound.money", url: "https://ultrasound.money" },
  polymarket: { name: "Polymarket", url: "https://polymarket.com" },
  sosovalue: { name: "SoSoValue", url: "https://sosovalue.com" },
  geckoterminal: {
    name: "GeckoTerminal",
    url: "https://www.geckoterminal.com",
  },
  blockchair: { name: "Blockchair", url: "https://blockchair.com" },
} satisfies Record<string, FrameSource>;

export const clockMeta = defineFrameMeta({
  name: "clock",
  label: "Clock",
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
  label: "Market Hours",
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
  label: "Fear & Greed",
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
  label: "Funding Rate Chart",
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
  label: "Note",
  category: "layout",
  iconUrl: widgetIcon("note"),
  layout: { w: 4, h: 3, minW: 2, minH: 2 },
  description:
    "Free-form text note pinned to the dashboard — trading plans, reminders, watch levels. Renders a safe Markdown subset: **bold**, *italic*, `inline code`, [links](https://…), #/##/### headings, and - / 1. lists. Plain text still renders as written. Needs no data provider.",
  capabilities: [],
  chrome: "plain",
  schema: z.object({
    text: z
      .string()
      .min(1)
      .describe(
        "The note's text content. Supports a Markdown subset — **bold**, *italic*, `code`, [text](https://url), #/##/### headings, and unordered (-) / ordered (1.) lists. Blank lines start new paragraphs; single newlines become line breaks. Plain text works too.",
      ),
    align: z
      .enum(["left", "center"])
      .default("left")
      .describe("Text alignment inside the card."),
  }),
});

export const priceChartMeta = defineFrameMeta({
  name: "price-chart",
  label: "Price Chart",
  category: "markets",
  iconUrl: widgetIcon("price-chart"),
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Live animated price chart (candlestick or line) for one symbol — canvas-rendered at 60fps via liveline, streaming live off the Hyperliquid WebSocket. Works for any HIP-3 perp — stocks (xyz:TSLA), indices (xyz:SP500), commodities (xyz:GOLD) — and crypto (BTC). The centerpiece frame.",
  capabilities: ["ohlcv", "quote-stream"],
  source: SOURCES.hyperliquid,
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
  }),
});

export const priceLivelineMeta = defineFrameMeta({
  name: "price-liveline",
  label: "Price Liveline",
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
        'Hyperliquid symbols to track — mix asset classes, e.g. ["xyz:NVDA", "xyz:SP500", "xyz:GOLD", "xyz:EUR"] or all-equity ["xyz:TSLA", "xyz:NVDA", "xyz:AAPL"]. Crypto works too: "BTC", "ETH".',
      ),
  }),
});

export const topMoversMeta = defineFrameMeta({
  name: "top-movers",
  label: "Top Movers",
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
  label: "TVL Treemap",
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
  label: "Bitcoin Dominance",
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
  label: "Rates Board",
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

export const fxBoardMeta = defineFrameMeta({
  name: "fx-board",
  label: "FX Board",
  category: "macro",
  iconUrl: widgetIcon("fx-board"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Foreign-exchange board from the ECB's free daily reference rates (via Frankfurter, no key): each currency's latest rate vs a base, its day-over-day change, and a short trend sparkline. Daily reference data with broader currency coverage than the handful of FX perps — not a live intraday quote feed.",
  capabilities: ["fx-rates"],
  source: SOURCES.frankfurter,
  schema: z.object({
    base: z
      .string()
      .length(3)
      .default("USD")
      .describe(
        'Base currency (ISO 4217 code) each rate is quoted against, e.g. "USD". One unit of the base buys the shown amount of each listed currency.',
      ),
    symbols: z
      .array(z.string().length(3))
      .min(1)
      .max(12)
      .default(["EUR", "GBP", "JPY", "CHF", "CAD", "AUD"])
      .describe(
        'Currencies to show (ISO 4217 codes), e.g. ["EUR","GBP","JPY"]. The ECB publishes ~30; a code equal to the base is skipped.',
      ),
    showSparkline: z
      .boolean()
      .default(true)
      .describe("Show a small ~30-day trend sparkline next to each rate."),
  }),
});

export const inflationPulseMeta = defineFrameMeta({
  name: "inflation-pulse",
  label: "Inflation Pulse",
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
  label: "Financial Stress",
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
  label: "National Debt",
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
  label: "Labor Market",
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
  label: "Treasury Auctions",
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
  label: "Filings Feed",
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
  label: "Yield Curve",
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
  label: "Fundamentals",
  category: "equities",
  iconUrl: widgetIcon("fundamentals"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
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
  label: "Short Volume",
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
  label: "Funding Heatmap",
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
  label: "Dino Game",
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
  label: "Image",
  category: "layout",
  iconUrl: widgetIcon("image"),
  layout: { w: 3, h: 3, minW: 1, minH: 1 },
  description:
    "Displays an image from a URL — logos, memes, chart screenshots, banners. Needs no data provider.",
  capabilities: [],
  chrome: "plain",
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

export const heroNumberMeta = defineFrameMeta({
  name: "hero-number",
  label: "Hero Number",
  category: "layout",
  iconUrl: widgetIcon("hero-number"),
  layout: { w: 3, h: 2, minW: 2, minH: 1 },
  description:
    "A big manual KPI card you fill in yourself — one headline number, a caption, and an optional signed change. Static text, not a live feed: use it to pin a figure that has no provider (a target, a personal goal, a fact from elsewhere), e.g. '$39.6T' national debt or '127 EH/s' hashrate. Needs no data provider.",
  capabilities: [],
  chrome: "plain",
  schema: z.object({
    value: z
      .string()
      .min(1)
      .describe(
        'The headline figure, shown large. Free text so you can include units/symbols, e.g. "$39.6T", "127 EH/s", "4.25%".',
      ),
    label: z
      .string()
      .default("")
      .describe(
        'Caption naming what the number is, e.g. "US National Debt". Empty hides it.',
      ),
    delta: z
      .string()
      .default("")
      .describe(
        'Optional change chip shown under the number, e.g. "+1.5%" or "-3 blocks". Empty hides it.',
      ),
    deltaDir: z
      .enum(["up", "down", "neutral"])
      .default("neutral")
      .describe(
        "Tint for the delta chip: up = gain color, down = loss color, neutral = muted. Purely cosmetic — it does not parse the delta text.",
      ),
    sublabel: z
      .string()
      .default("")
      .describe(
        'Optional small line under the delta for context, e.g. "as of Jul 2026". Empty hides it.',
      ),
  }),
});

export const imageGalleryMeta = defineFrameMeta({
  name: "image-gallery",
  label: "Image Gallery",
  category: "layout",
  iconUrl: widgetIcon("image-gallery"),
  layout: { w: 4, h: 3, minW: 2, minH: 2 },
  description:
    "A rotating gallery that cross-fades through a list of images on a timer — chart screenshots, memes, banners, a mood board. Needs no data provider.",
  capabilities: [],
  chrome: "plain",
  schema: z.object({
    images: z
      .array(
        z.object({
          url: z.string().min(1).describe("Image URL (https)."),
          alt: z.string().default("").describe("Alt text for accessibility."),
        }),
      )
      .min(1)
      .describe("The images to rotate through, in order. At least one."),
    intervalSec: z
      .number()
      .int()
      .min(0)
      .default(6)
      .describe(
        "Seconds between cross-fades when there is more than one image. 0 shows the first image, fixed.",
      ),
    fit: z
      .enum(["cover", "contain"])
      .default("cover")
      .describe(
        "How each image fills the frame: cover crops to fill, contain letterboxes.",
      ),
  }),
});

export const headingMeta = defineFrameMeta({
  name: "heading",
  label: "Heading",
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
    accent: z
      .number()
      .min(0)
      .max(360)
      .optional()
      .describe(
        "Optional hue (0–360) that tints the marker dot, the rule, and the title. Omit to use the dashboard's own accent (the default look).",
      ),
    align: z
      .enum(["left", "center"])
      .default("left")
      .describe(
        "Left aligns the label with a trailing rule (default); center places the label between rules on both sides.",
      ),
  }),
});

export const dailyAnalysisMeta = defineFrameMeta({
  name: "daily-analysis",
  label: "Daily Analysis",
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

// The decision-journal frames are a FAMILY sharing one journal: Log captures a
// read, Open tracks the live calls, Results shows them graded, Scoreboard reads
// the aggregate. Split apart (not one mega-frame) so each does one calm job and
// the user composes the ones they want. (Scaffold: backed by a shared in-memory
// mock store; production round-trips a journal.json like the daily brief.)
export const journalLogMeta = defineFrameMeta({
  name: "journal-log",
  label: "Journal · Log",
  category: "journal",
  iconUrl: widgetIcon("journal-log"),
  layout: { w: 4, h: 5, minW: 3, minH: 4 },
  source: SOURCES.hyperliquid,
  description:
    "Log a market read in seconds: pick a supported ticker (with its live Hyperliquid price), Long or Short, the reason (a quick pick + optional note), and how sure you are (a slider). That's it — a falsifiable call, captured at the live price, that the Open/Results frames then track and grade. The simple front door to your decision journal; pairs with the zAI orb for conversational capture. Add one alongside Journal · Open and Journal · Results.",
  capabilities: ["quote-stream", "day-stats"],
  schema: z.object({}),
});

export const journalOpenMeta = defineFrameMeta({
  name: "journal-open",
  label: "Journal · Open",
  category: "journal",
  iconUrl: widgetIcon("journal-open"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Your open calls from the decision journal, each marking to the live Hyperliquid price — direction, confidence, unrealized % return, a live entry→target track, and a countdown. Calls auto-grade at their horizon (or close one early). The 'watch it play out' frame. Reads the journal you write with Journal · Log.",
  source: SOURCES.hyperliquid,
  capabilities: ["quote-stream"],
  schema: z.object({
    max: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(8)
      .describe("How many open calls to show (newest first)."),
  }),
});

export const journalResultsMeta = defineFrameMeta({
  name: "journal-results",
  label: "Journal · Results",
  category: "journal",
  iconUrl: widgetIcon("journal-results"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Your resolved calls from the decision journal, graded on TWO axes: did it hit, AND did the thesis actually play out — so a lucky hit reads differently from earned skill, and a near-miss from a clean miss. The reflection frame. Reads the journal you write with Journal · Log.",
  capabilities: [],
  schema: z.object({
    max: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(8)
      .describe("How many resolved calls to show (newest first)."),
  }),
});

export const journalScoreMeta = defineFrameMeta({
  name: "journal-score",
  label: "Journal · Scoreboard",
  category: "journal",
  iconUrl: widgetIcon("journal-score"),
  layout: { w: 4, h: 3, minW: 3, minH: 3 },
  description:
    "The decision-journal scoreboard — a story, not a spreadsheet: where your judgment has an edge, where it leaks, and how calibrated your confidence is, plus a one-line read from zAI. Aggregates the calls logged via Journal · Log.",
  capabilities: [],
  schema: z.object({}),
});

export const priceCompareMeta = defineFrameMeta({
  name: "price-compare",
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
  label: "Portfolio Value",
  category: "portfolio",
  iconUrl: widgetIcon("portfolio-value"),
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
  label: "Portfolio Allocation",
  category: "portfolio",
  iconUrl: widgetIcon("portfolio-allocation"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Donut of your connected portfolio's allocation — each slice sized by live USD value, total in the center. Source is a connected Binance account (read-only key, in-app) or a public on-chain wallet address. Renders a connect prompt until a source is set.",
  capabilities: ["portfolio", "quote-stream"],
  account: true,
  schema: z.object({ ...portfolioConfigShape }),
});

export const portfolioHoldingsMeta = defineFrameMeta({
  name: "portfolio-holdings",
  label: "Portfolio Holdings",
  category: "portfolio",
  iconUrl: widgetIcon("portfolio-holdings"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Table of your connected portfolio's positions — asset, amount, live USD value, share of total, 24h change. Source is a connected Binance account (read-only key, in-app) or a public on-chain wallet address. Renders a connect prompt until a source is set.",
  capabilities: ["portfolio", "quote-stream"],
  account: true,
  schema: z.object({ ...portfolioConfigShape }),
});

export const newsFeedMeta = defineFrameMeta({
  name: "news-feed",
  label: "News Feed",
  category: "sentiment",
  iconUrl: widgetIcon("news-feed"),
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
  label: "DEX Volume Treemap",
  category: "crypto",
  iconUrl: widgetIcon("dex-volume-treemap"),
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
  label: "DEX Volume Chart",
  category: "crypto",
  iconUrl: widgetIcon("dex-volume-chart"),
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
  label: "Protocol TVL Treemap",
  category: "crypto",
  iconUrl: widgetIcon("protocol-tvl-treemap"),
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
  label: "Protocol TVL Chart",
  category: "crypto",
  iconUrl: widgetIcon("protocol-tvl-chart"),
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
  label: "Protocol Fees Treemap",
  category: "crypto",
  iconUrl: widgetIcon("protocol-fees-treemap"),
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
  label: "Market Cap Treemap",
  category: "crypto",
  iconUrl: widgetIcon("market-cap-treemap"),
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
  label: "Open Interest",
  category: "derivatives",
  iconUrl: widgetIcon("open-interest"),
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
  label: "Snake",
  category: "games",
  iconUrl: widgetIcon("snake"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Classic snake game on canvas — steer with the arrow keys (or swipe), eat dots to grow, avoid the walls and your own tail. High score persists locally. For when the market is flat. Needs no data provider.",
  capabilities: [],
  schema: z.object({}),
});

export const flappyBirdMeta = defineFrameMeta({
  name: "flappy-bird",
  label: "Flappy Bird",
  category: "games",
  iconUrl: widgetIcon("flappy-bird"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Flappy-bird style game on canvas — tap or press SPACE to flap through the gaps between pipes. High score persists locally. Needs no data provider.",
  capabilities: [],
  schema: z.object({}),
});

export const videoMeta = defineFrameMeta({
  name: "video",
  label: "Video",
  category: "layout",
  iconUrl: widgetIcon("video"),
  layout: { w: 4, h: 3, minW: 2, minH: 2 },
  description:
    "Embeds a video from a YouTube or Vimeo link (or any direct embed URL) as an iframe — a livestream, a market-news clip, a focus playlist. Needs no data provider.",
  capabilities: [],
  chrome: "plain",
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
  label: "Drawdy",
  category: "layout",
  iconUrl: widgetIcon("drawdy"),
  layout: { w: 8, h: 6, minW: 2, minH: 2 },
  description:
    "Embeds drawdy.io as an interactive whiteboard canvas. No configuration needed.",
  capabilities: [],
  schema: z.object({}),
});

export const countdownMeta = defineFrameMeta({
  name: "countdown",
  label: "Countdown",
  category: "tools",
  iconUrl: widgetIcon("countdown"),
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
  label: "Quick Links",
  category: "tools",
  iconUrl: widgetIcon("link-grid"),
  layout: { w: 3, h: 2, minW: 2, minH: 1 },
  description:
    "A grid of quick-launch tiles linking to your favourite sites — TradingView, exchanges, news, docs, your own dashboards. Each tile opens in a new tab and shows the destination site's favicon by default (fetched keyless from a public favicon service), with an optional per-link icon override and a first-letter fallback. Needs no data provider.",
  capabilities: [],
  chrome: "plain",
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
  label: "Position Calculator",
  category: "tools",
  iconUrl: widgetIcon("calculator"),
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
  label: "Quote",
  category: "layout",
  iconUrl: widgetIcon("quote"),
  layout: { w: 4, h: 2, minW: 2, minH: 1 },
  description:
    'Displays a market or trading quote, centered — set one or rotate through several. A calm bit of wall-art for the dashboard: trading maxims, reminders of your own rules, mantras. Write any attribution into the text itself (e.g. "… — Buffett"). Needs no data provider.',
  capabilities: [],
  chrome: "plain",
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
  label: "Divider",
  category: "layout",
  iconUrl: widgetIcon("divider"),
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
    accent: z
      .number()
      .min(0)
      .max(360)
      .optional()
      .describe(
        "Optional hue (0–360) that tints the rule and its label. Omit for the default subtle hairline.",
      ),
    thickness: z
      .number()
      .int()
      .min(1)
      .max(8)
      .default(1)
      .describe("Rule thickness in pixels. 1 is the default hairline."),
  }),
});

export const diceMeta = defineFrameMeta({
  name: "dice",
  label: "Dice",
  category: "tools",
  iconUrl: widgetIcon("dice"),
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
  label: "Risk / Reward",
  category: "tools",
  iconUrl: widgetIcon("risk-reward"),
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
  label: "Marquee",
  category: "layout",
  iconUrl: widgetIcon("marquee"),
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
  label: "Stopwatch",
  layout: { w: 3, h: 2, minW: 2, minH: 1 },
  category: "tools",
  iconUrl: widgetIcon("stopwatch"),
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
  label: "Session Progress",
  category: "tools",
  iconUrl: widgetIcon("session-progress"),
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
  label: "Holiday Calendar",
  category: "tools",
  iconUrl: widgetIcon("holiday-calendar"),
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
  label: "Day Meter",
  category: "tools",
  iconUrl: widgetIcon("day-meter"),
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

export const returnsProjectorMeta = defineFrameMeta({
  name: "returns-projector",
  label: "Returns Projector",
  category: "tools",
  iconUrl: widgetIcon("returns-projector"),
  layout: { w: 3, h: 4, minW: 2, minH: 3 },
  description:
    "A compound-growth projector — enter a starting principal, a percent return per period, the number of periods, and an optional per-period contribution; it charts the projected balance curve and shows the ending value and total gain. Pure client-side math, no data provider; complements the position-size/risk `calculator`.",
  capabilities: [],
  schema: z.object({
    principal: z.number().default(1000).describe("Starting balance."),
    ratePct: z
      .number()
      .default(5)
      .describe("Return per period, in percent (e.g. 5 = 5%)."),
    periods: z
      .number()
      .int()
      .min(1)
      .max(600)
      .default(12)
      .describe("Number of compounding periods to project."),
    contribution: z
      .number()
      .default(0)
      .describe("Amount added at the end of each period."),
    label: z.string().default("").describe("Optional caption."),
  }),
});

export const breakevenMeta = defineFrameMeta({
  name: "breakeven",
  label: "Break-even",
  category: "tools",
  iconUrl: widgetIcon("breakeven"),
  layout: { w: 3, h: 4, minW: 2, minH: 2 },
  description:
    "A break-even / average-cost calculator — add your fills (price + size) and it computes the size-weighted average entry; set an optional current price to see the unrealized P&L %. Pure client-side math, no data provider.",
  capabilities: [],
  schema: z.object({
    fills: z
      .array(
        z.object({
          price: z.number().describe("Fill price."),
          size: z.number().describe("Fill size, in units."),
        }),
      )
      .default([{ price: 100, size: 1 }])
      .describe(
        "Your entry fills; their size-weighted average is the break-even.",
      ),
    currentPrice: z
      .number()
      .default(0)
      .describe(
        "Optional current price; greater than 0 shows the unrealized P&L %.",
      ),
    label: z.string().default("").describe("Optional caption."),
  }),
});

export const checklistMeta = defineFrameMeta({
  name: "checklist",
  label: "Checklist",
  category: "tools",
  iconUrl: widgetIcon("checklist"),
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "A tickable checklist — a pre-trade routine, a daily ritual, anything. Tap items to check them off; the checked state persists across reloads (saved into the dashboard). Client-side only, no data provider.",
  capabilities: [],
  schema: z.object({
    title: z
      .string()
      .default("Pre-trade checklist")
      .describe("Heading shown above the list."),
    items: z
      .array(z.string())
      .default([
        "Trend & bias aligned",
        "Stop level set",
        "Risk sized correctly",
      ])
      .describe("The checklist items, top to bottom."),
    checked: z
      .array(z.boolean())
      .default([])
      .describe(
        "Per-item checked state (by index); persisted automatically by the frame.",
      ),
  }),
});

export const pomodoroMeta = defineFrameMeta({
  name: "pomodoro",
  label: "Pomodoro",
  category: "tools",
  iconUrl: widgetIcon("pomodoro"),
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "A Pomodoro focus timer — alternating work and break intervals with Start / Pause / Reset and a cycle counter, counting down in MM:SS. Runs entirely client-side with no data provider; timer state is in-session (not persisted).",
  capabilities: [],
  schema: z.object({
    workMin: z
      .number()
      .min(1)
      .max(180)
      .default(25)
      .describe("Work interval length, in minutes."),
    breakMin: z
      .number()
      .min(1)
      .max(120)
      .default(5)
      .describe("Break interval length, in minutes."),
    cycles: z
      .number()
      .int()
      .min(1)
      .max(20)
      .default(4)
      .describe("Work/break cycles before the counter loops."),
    label: z.string().default("").describe("Optional caption."),
  }),
});

export const rulesCardMeta = defineFrameMeta({
  name: "rules-card",
  label: "Rules",
  category: "layout",
  iconUrl: widgetIcon("rules-card"),
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "A pinned, auto-numbered list of your trading rules (or any principles) — always fully visible, unlike the rotating `quote` frame. Static text, client-side, no data provider.",
  capabilities: [],
  schema: z.object({
    title: z
      .string()
      .default("My rules")
      .describe("Heading shown above the list."),
    rules: z
      .array(z.string())
      .default([
        "Cut losers fast, let winners run",
        "No trade without a stop",
        "One setup at a time",
      ])
      .describe("The rules, in order; rendered as a numbered list."),
  }),
});

export const breathingMeta = defineFrameMeta({
  name: "breathing",
  label: "Breathing",
  category: "layout",
  iconUrl: widgetIcon("breathing"),
  chrome: "bare",
  layout: { w: 2, h: 2, minW: 1, minH: 1 },
  description:
    "A chrome-less breathing pacer — a circle that expands and contracts through configurable inhale / hold / exhale / hold phases to steady your breathing between trades. Renders with no card; client-side only, no data provider.",
  capabilities: [],
  schema: z.object({
    inhale: z.number().min(1).max(60).default(4).describe("Inhale seconds."),
    hold: z
      .number()
      .min(0)
      .max(60)
      .default(4)
      .describe("Hold-after-inhale seconds."),
    exhale: z.number().min(1).max(60).default(4).describe("Exhale seconds."),
    holdAfter: z
      .number()
      .min(0)
      .max(60)
      .default(4)
      .describe("Hold-after-exhale seconds."),
  }),
});

export const spotifyEmbedMeta = defineFrameMeta({
  name: "spotify-embed",
  label: "Spotify",
  category: "layout",
  iconUrl: widgetIcon("spotify-embed"),
  layout: { w: 3, h: 4, minW: 2, minH: 2 },
  description:
    "Embeds a Spotify track, album, playlist, artist, or show from its public open.spotify.com share link (same embed approach as the `video` frame), using Spotify's official keyless iframe player. Needs an internet connection to play.",
  capabilities: [],
  schema: z.object({
    url: z
      .string()
      .default("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M")
      .describe(
        "A Spotify share URL (open.spotify.com/track|album|playlist|artist/…).",
      ),
    compact: z
      .boolean()
      .default(false)
      .describe("Use Spotify's compact (single-row) player height."),
  }),
});

export const btcFeesMeta = defineFrameMeta({
  name: "btc-fees",
  label: "BTC Fees",
  category: "bitcoin",
  iconUrl: widgetIcon("btc-fees"),
  layout: { w: 3, h: 3, minW: 2, minH: 3 },
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
  label: "BTC Mempool",
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
  label: "BTC Blocks",
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
  label: "BTC Hashrate",
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
  label: "BTC Difficulty",
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
  label: "Mining Pools",
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
  label: "Lightning Network",
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
  label: "Put / Call Ratio",
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
  label: "Implied Volatility",
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
  label: "OI by Strike",
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
  label: "Coin Movers",
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

// ── On-chain valuation & cycle frames (Coin Metrics + bitcoin-data.com) ──────

export const mvrvMeta = defineFrameMeta({
  name: "mvrv",
  label: "MVRV Ratio",
  category: "onchain",
  iconUrl: widgetIcon("mvrv"),
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "Bitcoin MVRV ratio — market cap ÷ realized cap. Above ~3 historically marks cycle tops (overvalued); below ~1 marks deep value near bottoms. Shows the current ratio, its valuation zone, the MVRV Z-score, and a history sparkline. Keyless on-chain data from Coin Metrics.",
  capabilities: ["onchain-valuation"],
  source: SOURCES.coinMetrics,
  schema: z.object({
    window: z
      .enum(["1Y", "2Y", "4Y", "all"])
      .default("all")
      .describe("How much history the sparkline shows."),
  }),
});

export const nuplMeta = defineFrameMeta({
  name: "nupl",
  label: "NUPL",
  category: "onchain",
  iconUrl: widgetIcon("nupl"),
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "Net Unrealized Profit/Loss — the share of Bitcoin's market cap held in unrealized profit. Maps to cycle sentiment phases: Capitulation (<0), Hope/Fear (0–25%), Optimism (25–50%), Belief (50–75%), Euphoria/Greed (>75%). Derived from MVRV; keyless Coin Metrics data.",
  capabilities: ["onchain-valuation"],
  source: SOURCES.coinMetrics,
  schema: z.object({
    window: z
      .enum(["1Y", "2Y", "4Y", "all"])
      .default("all")
      .describe("How much history the sparkline shows."),
  }),
});

export const soprMeta = defineFrameMeta({
  name: "sopr",
  label: "SOPR",
  category: "onchain",
  iconUrl: widgetIcon("sopr"),
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "Spent Output Profit Ratio — whether coins moving on-chain are, on average, being sold in profit (>1) or loss (<1). Sustained dips below 1 mark capitulation; resets to ~1 in bull markets are healthy. Keyless full-history data from bitcoin-data.com (polled once daily).",
  capabilities: ["onchain-cycle-extras"],
  source: SOURCES.bitcoinData,
  schema: z.object({
    window: z
      .enum(["90D", "180D", "1Y"])
      .default("1Y")
      .describe("How much history the sparkline shows."),
  }),
});

export const puellMultipleMeta = defineFrameMeta({
  name: "puell-multiple",
  label: "Puell Multiple",
  category: "onchain",
  iconUrl: widgetIcon("puell-multiple"),
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "Puell Multiple — daily miner issuance in USD ÷ its 365-day average. High values (>4) mark cycle tops where miner revenue is stretched; low values (≤0.5) mark miner capitulation near bottoms. Keyless data from bitcoin-data.com (polled once daily).",
  capabilities: ["onchain-cycle-extras"],
  source: SOURCES.bitcoinData,
  schema: z.object({
    window: z
      .enum(["90D", "180D", "1Y"])
      .default("1Y")
      .describe("How much history the sparkline shows."),
  }),
});

export const mayerMultipleMeta = defineFrameMeta({
  name: "mayer-multiple",
  label: "Mayer Multiple",
  category: "onchain",
  iconUrl: widgetIcon("mayer-multiple"),
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "Mayer Multiple — BTC price ÷ its 200-day moving average. Above ~2.4 has historically been overheated; below ~0.8 marks value zones. Computed in-browser from a keyless long daily price series (Coin Metrics).",
  capabilities: ["price-history-daily"],
  source: SOURCES.coinMetrics,
  schema: z.object({
    window: z
      .enum(["1Y", "2Y", "4Y", "all"])
      .default("2Y")
      .describe("How much history the sparkline shows."),
  }),
});

export const piCycleMeta = defineFrameMeta({
  name: "pi-cycle",
  label: "Pi Cycle Top",
  category: "onchain",
  iconUrl: widgetIcon("pi-cycle"),
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "Pi Cycle Top indicator — the ratio of the 111-day MA to 2× the 350-day MA. When it crosses 1 (the 111DMA overtakes 2×350DMA) it has historically pinpointed cycle tops within days. Computed in-browser from a keyless long daily price series (Coin Metrics).",
  capabilities: ["price-history-daily"],
  source: SOURCES.coinMetrics,
  schema: z.object({
    window: z
      .enum(["1Y", "2Y", "4Y", "all"])
      .default("2Y")
      .describe("How much history the sparkline shows."),
  }),
});

export const maMultiplierMeta = defineFrameMeta({
  name: "ma-multiplier",
  label: "MA Multiplier",
  category: "onchain",
  iconUrl: widgetIcon("ma-multiplier"),
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "Long moving-average multiplier — BTC price ÷ its multi-year moving average (2-year or 4-year). The 2Y band flags a buy zone below ÷1.5 and sell tiers at ×2–×5; the 4Y multiple marks tops above ~3.5×. Computed in-browser from a keyless long daily price series (Coin Metrics).",
  capabilities: ["price-history-daily"],
  source: SOURCES.coinMetrics,
  schema: z.object({
    years: z
      .enum(["2", "4"])
      .default("2")
      .describe("Moving-average window in years."),
    window: z
      .enum(["2Y", "4Y", "all"])
      .default("all")
      .describe("How much history the sparkline shows."),
  }),
});

export const rsiMomentumMeta = defineFrameMeta({
  name: "rsi-momentum",
  label: "RSI Momentum",
  category: "markets",
  iconUrl: widgetIcon("rsi-momentum"),
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "Wilder RSI on BTC daily closes with a 55/45 momentum regime: above 55 = risk-on, below 45 = risk-off, in between = neutral. Also flags classic overbought (≥80) / oversold (≤30) extremes. Computed in-browser from a keyless long daily price series (Coin Metrics).",
  capabilities: ["price-history-daily"],
  source: SOURCES.coinMetrics,
  schema: z.object({
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
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
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

export const dxyMeta = defineFrameMeta({
  name: "dxy",
  label: "Dollar Index (DXY)",
  category: "macro",
  iconUrl: widgetIcon("dxy"),
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "US Dollar Index (DXY) — the dollar's strength vs a basket of six major currencies. A rising DXY is a macro headwind for risk assets (incl. BTC); a falling DXY a tailwind. Computed as the ICE-weighted geometric mean of keyless ECB reference rates (daily granularity).",
  capabilities: ["dollar-index"],
  source: SOURCES.frankfurter,
  schema: z.object({}),
});

export const cycleSignalsMeta = defineFrameMeta({
  name: "cycle-signals",
  label: "Cycle Signals",
  category: "onchain",
  iconUrl: widgetIcon("cycle-signals"),
  layout: { w: 4, h: 5, minW: 3, minH: 3 },
  description:
    "A cycle top- or bottom-signal checklist — MVRV, MVRV Z-score, NUPL, Mayer Multiple, Puell, RSI, and Pi Cycle each checked against its historical extreme, with a live 'X of N firing' tally. A capstone that aggregates the on-chain and cycle metrics into one 'how late in the cycle are we' read. Keyless (Coin Metrics + bitcoin-data.com).",
  capabilities: [
    "onchain-valuation",
    "onchain-cycle-extras",
    "price-history-daily",
  ],
  source: [SOURCES.coinMetrics, SOURCES.bitcoinData],
  schema: z.object({
    mode: z
      .enum(["peak", "bottom"])
      .default("peak")
      .describe(
        "Which checklist to show: cycle-top ('peak') or cycle-bottom ('bottom') signals.",
      ),
  }),
});

// ── Market-data expansion: liquidity, yields, funding, ETH, ETF, sentiment ──

export const stablecoinSupplyMeta = defineFrameMeta({
  name: "stablecoin-supply",
  label: "Stablecoin Supply",
  category: "crypto",
  iconUrl: widgetIcon("stablecoin-supply"),
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "Total USD-stablecoin circulating supply — a market-wide liquidity gauge. Rising supply = fresh capital entering crypto (risk-on dry powder); contraction = risk-off. Shows the total, 1d/7d/30d change, and the largest chains. Keyless (DeFiLlama).",
  capabilities: ["stablecoins"],
  source: SOURCES.defillama,
  schema: z.object({}),
});

export const yieldScannerMeta = defineFrameMeta({
  name: "yield-scanner",
  label: "Yield Scanner",
  category: "crypto",
  iconUrl: widgetIcon("yield-scanner"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Top DeFi yield pools ranked by APY, across every chain and protocol — the 'where's the yield' board. Filter to stablecoin pools or a TVL floor. Shows APY (base + reward), TVL, chain, and IL risk. Keyless (DeFiLlama yields).",
  capabilities: ["yields"],
  source: SOURCES.defillama,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(20)
      .default(8)
      .describe("How many pools to list."),
    stablecoinOnly: z
      .boolean()
      .default(false)
      .describe("Only show stablecoin pools (lower impermanent-loss risk)."),
    minTvlUsd: z
      .number()
      .min(0)
      .default(1_000_000)
      .describe("Minimum pool TVL in USD — a liquidity floor to hide dust."),
  }),
});

export const defiRevenueMeta = defineFrameMeta({
  name: "defi-revenue",
  label: "DeFi Fees & Revenue",
  category: "crypto",
  iconUrl: widgetIcon("defi-revenue"),
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "Aggregate DeFi protocol fees across all of crypto — trailing-24h total with a daily trend. A read on real on-chain economic activity. Keyless (DeFiLlama).",
  capabilities: ["fees-overview"],
  source: SOURCES.defillama,
  schema: z.object({}),
});

export const fundingComparisonMeta = defineFrameMeta({
  name: "funding-comparison",
  label: "Cross-Venue Funding",
  category: "derivatives",
  iconUrl: widgetIcon("funding-comparison"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Predicted perpetual funding rates compared across venues (Hyperliquid vs Binance vs Bybit), annualized, per coin — ranked by the cross-venue spread. A large spread flags a funding-arbitrage or crowded-positioning signal. Keyless (Hyperliquid predicted fundings).",
  capabilities: ["funding-comparison"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(20)
      .default(8)
      .describe("How many coins (by funding spread) to show."),
  }),
});

export const ethSupplyMeta = defineFrameMeta({
  name: "eth-supply",
  label: "ETH Ultrasound",
  category: "crypto",
  iconUrl: widgetIcon("eth-supply"),
  layout: { w: 4, h: 3, minW: 2, minH: 2 },
  description:
    "Ethereum supply economics — EIP-1559 burn vs PoS issuance and the resulting net annual supply growth. Negative growth = deflationary ('ultrasound money'). Shows the net rate, burn/issuance, and vs the counterfactual PoW issuance. Keyless (ultrasound.money).",
  capabilities: ["eth-supply"],
  source: SOURCES.ultrasound,
  schema: z.object({}),
});

export const ethStakingMeta = defineFrameMeta({
  name: "eth-staking",
  label: "ETH Staking APR",
  category: "crypto",
  iconUrl: widgetIcon("eth-staking"),
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "Ethereum staking yield — total validator APR broken into consensus issuance, MEV, and priority tips. The 'risk-free' ETH rate. Keyless (ultrasound.money).",
  capabilities: ["eth-supply"],
  source: SOURCES.ultrasound,
  schema: z.object({}),
});

export const predictionMarketsMeta = defineFrameMeta({
  name: "prediction-markets",
  label: "Prediction Markets",
  category: "sentiment",
  iconUrl: widgetIcon("prediction-markets"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Live Polymarket odds — the highest-volume open prediction markets with their market-implied probabilities (macro, rates, crypto, politics). A real-money sentiment gauge. Keyless (Polymarket Gamma API).",
  capabilities: ["prediction-markets"],
  source: SOURCES.polymarket,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(20)
      .default(6)
      .describe("How many markets (by volume) to show."),
  }),
});

export const etfFlowsMeta = defineFrameMeta({
  name: "etf-flows",
  label: "Spot ETF Flows",
  category: "crypto",
  iconUrl: widgetIcon("etf-flows"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Spot Bitcoin or Ethereum ETF daily net flows — per-issuer (IBIT, FBTC, GBTC, …) plus the total, with a recent trend. The biggest institutional-demand signal. Keyless (SoSoValue); best-effort, may show empty if the source is unavailable.",
  capabilities: ["etf-flows"],
  source: SOURCES.sosovalue,
  schema: z.object({
    asset: z
      .enum(["btc", "eth"])
      .default("btc")
      .describe("Which spot-ETF complex to show."),
    limit: z
      .number()
      .int()
      .min(3)
      .max(15)
      .default(8)
      .describe("How many issuers to list."),
  }),
});

export const trendingCoinsMeta = defineFrameMeta({
  name: "trending-coins",
  label: "Trending Coins",
  category: "crypto",
  iconUrl: widgetIcon("trending-coins"),
  layout: { w: 3, h: 4, minW: 2, minH: 3 },
  description:
    "The coins with the most search interest right now on CoinGecko — a retail-attention gauge. Shows rank, price, and 24h change. Keyless (CoinGecko).",
  capabilities: ["trending-coins"],
  source: SOURCES.coingecko,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(15)
      .default(7)
      .describe("How many trending coins to show."),
  }),
});

export const sectorPerformanceMeta = defineFrameMeta({
  name: "sector-performance",
  label: "Sector Performance",
  category: "crypto",
  iconUrl: widgetIcon("sector-performance"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Crypto sector rotation — market categories (L1s, DeFi, AI, memes, RWA, …) ranked by 24h market-cap change. Shows where capital is rotating. Keyless (CoinGecko categories).",
  capabilities: ["sector-performance"],
  source: SOURCES.coingecko,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(4)
      .max(30)
      .default(10)
      .describe("How many sectors to show."),
  }),
});

export const macroCalendarMeta = defineFrameMeta({
  name: "macro-calendar",
  label: "Macro Calendar",
  category: "macro",
  iconUrl: widgetIcon("macro-calendar"),
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
  description:
    "Countdown to upcoming scheduled macro events — defaults to the 2026 FOMC rate decisions, fully editable. No data feed; the dates are known in advance.",
  capabilities: [],
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(12)
      .default(5)
      .describe("How many upcoming events to show."),
    events: z
      .array(
        z.object({
          date: z.string().describe("Event date, ISO YYYY-MM-DD."),
          label: z.string().describe("Event name, e.g. 'FOMC decision'."),
        }),
      )
      .default([
        { date: "2026-07-29", label: "FOMC decision" },
        { date: "2026-09-16", label: "FOMC decision" },
        { date: "2026-10-28", label: "FOMC decision" },
        { date: "2026-12-09", label: "FOMC decision" },
        { date: "2027-01-27", label: "FOMC decision" },
      ])
      .describe(
        "Scheduled events (date + label). Defaults to the 2026 FOMC meetings; edit to add CPI/NFP/earnings dates.",
      ),
  }),
});

// ── Second-view frames over data already fetched (treemaps / history charts) ──

export const stablecoinChainsMeta = defineFrameMeta({
  name: "stablecoin-chains",
  label: "Stablecoin Chains",
  category: "crypto",
  iconUrl: widgetIcon("stablecoin-chains"),
  layout: { w: 5, h: 4, minW: 4, minH: 3 },
  description:
    "Where stablecoin liquidity sits — a treemap of the largest chains by stablecoin circulating supply. Complements the Stablecoin Supply total with the cross-chain distribution. Keyless (DeFiLlama).",
  capabilities: ["stablecoins"],
  source: SOURCES.defillama,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(4)
      .max(16)
      .default(12)
      .describe("How many chains to show in the treemap."),
  }),
});

export const sectorTreemapMeta = defineFrameMeta({
  name: "sector-treemap",
  label: "Sector Treemap",
  category: "crypto",
  iconUrl: widgetIcon("sector-treemap"),
  layout: { w: 6, h: 4, minW: 4, minH: 3 },
  description:
    "Crypto sector rotation as a treemap — each category sized by market cap and colored by 24h change (green up / red down). The at-a-glance view of where capital is flowing. Keyless (CoinGecko categories).",
  capabilities: ["sector-performance"],
  source: SOURCES.coingecko,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(6)
      .max(30)
      .default(16)
      .describe("How many sectors to show."),
  }),
});

export const etfFlowsChartMeta = defineFrameMeta({
  name: "etf-flows-chart",
  label: "ETF Flows Chart",
  category: "crypto",
  iconUrl: widgetIcon("etf-flows-chart"),
  layout: { w: 6, h: 3, minW: 3, minH: 3 },
  description:
    "Spot BTC or ETH ETF daily net flows over time — the inflow/outflow trend as a line, complementing the per-issuer snapshot. Keyless (SoSoValue); best-effort, may be empty if the source is unavailable.",
  capabilities: ["etf-flows"],
  source: SOURCES.sosovalue,
  schema: z.object({
    asset: z
      .enum(["btc", "eth"])
      .default("btc")
      .describe("Which spot-ETF complex to chart."),
    lookback: z
      .enum(["1M", "3M", "6M"])
      .default("3M")
      .describe("History window for the flow chart."),
  }),
});

export const realizedPriceMeta = defineFrameMeta({
  name: "realized-price",
  label: "Realized Price",
  category: "onchain",
  iconUrl: widgetIcon("realized-price"),
  layout: { w: 6, h: 3, minW: 4, minH: 3 },
  description:
    "Bitcoin market price vs realized price — the on-chain cost basis of all coins. Market above realized = aggregate profit; crossing below realized has marked cycle bottoms. Keyless (Coin Metrics).",
  capabilities: ["onchain-valuation"],
  source: SOURCES.coinMetrics,
  schema: z.object({
    window: z
      .enum(["1Y", "2Y", "4Y", "all"])
      .default("2Y")
      .describe("How much history the chart shows."),
  }),
});

export const reserveRiskMeta = defineFrameMeta({
  name: "reserve-risk",
  label: "Reserve Risk",
  category: "onchain",
  iconUrl: widgetIcon("reserve-risk"),
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "Reserve Risk — long-term-holder conviction relative to price. Low values = strong conviction at a low price (attractive risk/reward, cycle-bottom territory); high values = conviction spent into a high price. Keyless (bitcoin-data.com).",
  capabilities: ["onchain-cycle-extras"],
  source: SOURCES.bitcoinData,
  schema: z.object({
    window: z
      .enum(["90D", "180D", "1Y"])
      .default("1Y")
      .describe("How much history the sparkline shows."),
  }),
});

export const nftCollectionsMeta = defineFrameMeta({
  name: "nft-collections",
  label: "NFT Collections",
  category: "crypto",
  iconUrl: widgetIcon("nft-collections"),
  layout: { w: 3, h: 4, minW: 2, minH: 3 },
  description:
    "Blue-chip NFT collections ranked by 24h trading volume — floor price (USD), 24h floor change, and volume, for a hand-picked set of majors (Bored Ape, Pudgy Penguins, CryptoPunks, Azuki, …). Keyless (CoinGecko free tier). A quick read on where the top NFT market is trading.",
  capabilities: ["nft-market"],
  source: SOURCES.coingecko,
  schema: z.object({
    topN: z
      .number()
      .int()
      .min(4)
      .max(10)
      .default(8)
      .describe("How many collections to show (up to 10 curated majors)."),
  }),
});

export const dexHotPoolsMeta = defineFrameMeta({
  name: "dex-hot-pools",
  label: "Hot DEX Pools",
  category: "onchain",
  iconUrl: widgetIcon("dex-hot-pools"),
  layout: { w: 3, h: 4, minW: 2, minH: 3 },
  description:
    "Trending DEX liquidity pools on a chain, ranked by 24h volume — each pool's pair, base-token price, 24h price change, and 24h volume. Surfaces what's hot on-chain (new listings, momentum pairs) across Ethereum, Solana, Base and more. Keyless (GeckoTerminal free tier).",
  capabilities: ["dex-pools"],
  source: SOURCES.geckoterminal,
  schema: z.object({
    network: z
      .enum(["eth", "solana", "base", "arbitrum", "bsc", "polygon_pos"])
      .default("eth")
      .describe("Which chain's trending pools to show."),
    count: z
      .number()
      .int()
      .min(5)
      .max(15)
      .default(10)
      .describe("How many trending pools to list (up to 15)."),
  }),
});

export const chainActivityMeta = defineFrameMeta({
  name: "chain-activity",
  label: "Chain Activity",
  category: "onchain",
  iconUrl: widgetIcon("chain-activity"),
  layout: { w: 3, h: 4, minW: 2, minH: 3 },
  description:
    "Cross-chain network activity for major layer-1s (Bitcoin, Ethereum, Litecoin, …), ranked by 24h transaction count — with blocks mined and mempool backlog per chain. A side-by-side pulse of which chains are busiest right now. Keyless (Blockchair).",
  capabilities: ["chain-activity"],
  source: SOURCES.blockchair,
  schema: z.object({}),
});

export const nftTreemapMeta = defineFrameMeta({
  name: "nft-treemap",
  label: "NFT Treemap",
  category: "crypto",
  iconUrl: widgetIcon("nft-treemap"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Treemap of blue-chip NFT collections sized by market capitalisation, tiles colored green/red by 24h floor-price change. A heat-map of the top NFT market at a glance. Keyless (CoinGecko free tier).",
  capabilities: ["nft-market"],
  source: SOURCES.coingecko,
  schema: z.object({
    topN: z
      .number()
      .int()
      .min(4)
      .max(10)
      .default(8)
      .describe("How many collections to show (up to 10 curated majors)."),
  }),
});

export const dexPoolTreemapMeta = defineFrameMeta({
  name: "dex-pool-treemap",
  label: "DEX Pool Treemap",
  category: "onchain",
  iconUrl: widgetIcon("dex-pool-treemap"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Treemap of trending DEX pools on a chain sized by 24h trading volume, tiles colored green/red by 24h price change. Shows at a glance which pairs are pulling the most on-chain volume. Keyless (GeckoTerminal free tier).",
  capabilities: ["dex-pools"],
  source: SOURCES.geckoterminal,
  schema: z.object({
    network: z
      .enum(["eth", "solana", "base", "arbitrum", "bsc", "polygon_pos"])
      .default("eth")
      .describe("Which chain's trending pools to show."),
    count: z
      .number()
      .int()
      .min(5)
      .max(15)
      .default(12)
      .describe("How many trending pools to include (up to 15)."),
  }),
});

export const sectorBarsMeta = defineFrameMeta({
  name: "sector-bars",
  label: "Sector Bars",
  category: "crypto",
  iconUrl: widgetIcon("sector-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Crypto sector rotation as a diverging bar chart — market categories (L1s, DeFi, AI, memes, RWA, …) ranked by 24h market-cap change, gains right in green, losses left in red. The chart-first sibling of the Sector Performance list. Keyless (CoinGecko categories).",
  capabilities: ["sector-performance"],
  source: SOURCES.coingecko,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(4)
      .max(20)
      .default(10)
      .describe("How many sectors (by absolute 24h change) to chart."),
  }),
});

export const fundingBarsMeta = defineFrameMeta({
  name: "funding-bars",
  label: "Funding by Venue",
  category: "derivatives",
  iconUrl: widgetIcon("funding-bars"),
  layout: { w: 4, h: 3, minW: 3, minH: 2 },
  description:
    "One coin's predicted perpetual funding rate compared across venues (Hyperliquid vs Binance vs Bybit) as a diverging bar chart of annualized rates — positive funding (longs pay) in green, negative in red. Makes a funding-arb spread visible at a glance. Keyless (Hyperliquid predicted fundings).",
  capabilities: ["funding-comparison"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    coin: z
      .string()
      .min(1)
      .default("BTC")
      .describe('Coin to compare across venues, e.g. "BTC", "ETH", "SOL".'),
  }),
});

export const etfFlowBarsMeta = defineFrameMeta({
  name: "etf-flow-bars",
  label: "ETF Flow Bars",
  category: "crypto",
  iconUrl: widgetIcon("etf-flow-bars"),
  layout: { w: 6, h: 3, minW: 3, minH: 3 },
  description:
    "Spot BTC or ETH ETF daily net flows as diverging bars — one bar per day, inflows up in green, outflows down in red. The classic ETF-flow chart; complements the cumulative line and per-issuer snapshot. Keyless (SoSoValue); best-effort, may be empty if the source is unavailable.",
  capabilities: ["etf-flows"],
  source: SOURCES.sosovalue,
  schema: z.object({
    asset: z
      .enum(["btc", "eth"])
      .default("btc")
      .describe("Which spot-ETF complex to chart."),
    lookback: z
      .enum(["1M", "3M", "6M"])
      .default("1M")
      .describe("History window for the daily-flow bars."),
  }),
});

export const chainActivityBarsMeta = defineFrameMeta({
  name: "chain-activity-bars",
  label: "Chain Activity Bars",
  category: "onchain",
  iconUrl: widgetIcon("chain-activity-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "24h confirmed transactions per major L1 (Bitcoin, Ethereum, Litecoin, Dogecoin, …) as a horizontal bar chart, ranked busiest-first — cross-chain usage compared at a glance. The chart-first sibling of the Chain Activity table. Keyless (Blockchair).",
  capabilities: ["chain-activity"],
  source: SOURCES.blockchair,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(12)
      .default(8)
      .describe("How many chains (by 24h transactions) to chart."),
  }),
});

export const marketScatterMeta = defineFrameMeta({
  name: "market-scatter",
  label: "Market Scatter",
  category: "crypto",
  iconUrl: widgetIcon("market-scatter"),
  layout: { w: 6, h: 4, minW: 4, minH: 3 },
  description:
    "Top coins as a bubble scatter — 24h price change on the x-axis, market cap on a log y-axis, bubble size by market cap. Shows in one view whether large caps or small caps are moving, and who's the outlier. Keyless (CoinGecko top-50 by market cap).",
  capabilities: ["coin-markets"],
  source: SOURCES.coingecko,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(10)
      .max(50)
      .default(30)
      .describe("How many top coins (by market cap) to plot."),
  }),
});

export const sentimentGaugeMeta = defineFrameMeta({
  name: "sentiment-gauge",
  label: "Sentiment Gauge",
  category: "crypto",
  iconUrl: widgetIcon("sentiment-gauge"),
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "Crypto fear & greed index as a radial gauge — the arc fills from extreme fear (0) to extreme greed (100) in the mood color, with the reading and classification in the center. A dial-style alternative to the Fear & Greed sparkline card. Keyless (alternative.me).",
  capabilities: ["sentiment"],
  source: SOURCES.alternativeMe,
  schema: z.object({}),
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
  heroNumberMeta,
  imageMeta,
  imageGalleryMeta,
  inflationPulseMeta,
  marketHoursMeta,
  noteMeta,
  priceChartMeta,
  priceCompareMeta,
  priceLivelineMeta,
  priceTickerMeta,
  ratesBoardMeta,
  fxBoardMeta,
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
  mvrvMeta,
  nuplMeta,
  soprMeta,
  puellMultipleMeta,
  mayerMultipleMeta,
  piCycleMeta,
  maMultiplierMeta,
  rsiMomentumMeta,
  volumeProfileMeta,
  dxyMeta,
  cycleSignalsMeta,
  stablecoinSupplyMeta,
  yieldScannerMeta,
  defiRevenueMeta,
  fundingComparisonMeta,
  ethSupplyMeta,
  ethStakingMeta,
  predictionMarketsMeta,
  etfFlowsMeta,
  trendingCoinsMeta,
  sectorPerformanceMeta,
  macroCalendarMeta,
  stablecoinChainsMeta,
  sectorTreemapMeta,
  etfFlowsChartMeta,
  realizedPriceMeta,
  reserveRiskMeta,
  nftCollectionsMeta,
  dexHotPoolsMeta,
  chainActivityMeta,
  nftTreemapMeta,
  dexPoolTreemapMeta,
  sectorBarsMeta,
  fundingBarsMeta,
  etfFlowBarsMeta,
  chainActivityBarsMeta,
  marketScatterMeta,
  sentimentGaugeMeta,
];

/**
 * Every renderable frame's metadata — the full set the runtime registers (the
 * React-free twin of `allFrames`), in contrast to `frameMetas` above, which is
 * the *curated* subset the AI catalogue + CLI/skill expose so the generating
 * agent only picks data/market frames. The runtime must render all 76 (a human
 * adds games/journal/tools/layout frames from the editor palette, and saved
 * specs reference them), so the runtime registry builds from THIS list. Keep in
 * lockstep with `allFrames` / `frameLoaders` — the parity test in
 * `frames.test.ts` fails the build if they drift.
 */
export const allFrameMetas: FrameMeta[] = [
  ...frameMetas,
  breakevenMeta,
  breathingMeta,
  checklistMeta,
  dayMeterMeta,
  diceMeta,
  holidayCalendarMeta,
  journalLogMeta,
  journalOpenMeta,
  journalResultsMeta,
  journalScoreMeta,
  marqueeMeta,
  pomodoroMeta,
  returnsProjectorMeta,
  riskRewardMeta,
  rulesCardMeta,
  sessionProgressMeta,
  spotifyEmbedMeta,
  stopwatchMeta,
];
