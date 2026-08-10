import {
  defineFrameMeta,
  type FrameMeta,
  type FrameSource,
} from "@zframes/spec/frame";
import { z } from "zod";
import { validateCustomUrl } from "./custom-data-shared";

/**
 * Frame metadata, separated from components so React-free tooling (the
 * zframes CLI, catalogue export, the /zframes skill) can import this module
 * without charts, liveline, or CSS. Each frame's .tsx imports its meta from
 * here — this file is the single source of truth for the AI catalogue.
 */

const widgetIcon = (name: string) => `/widget-icons/${name}.png`;

/**
 * Optional provider pin for frames whose capability more than one exchange
 * can serve. Capability routing is first-match, so without this a second
 * source (e.g. Bitkub) is never reached; naming it here routes THIS card to
 * that provider. Symbols are source-native, so they change with the source:
 * Hyperliquid wants "BTC"/"xyz:TSLA", Bitkub wants "BTC"/"KUB".
 */
const sourceField = () =>
  z
    .enum(["hyperliquid", "bitkub", "nasdaq"])
    .optional()
    .describe(
      'Which venue to source this card from — "hyperliquid" (default: crypto + HIP-3 stock/commodity perps, USD), "bitkub" (Thailand\'s largest exchange, THB-quoted, the source where KUB trades), or "nasdaq" (the real consolidated tape for US-listed stocks, DAILY bars only — no intraday, no crypto). Omit for the default. Use source-native symbols: Bitkub lists bare tickers like "KUB"/"BTC" and has no HIP-3 stock perps; Nasdaq wants a plain US ticker like "NVDA". Pin "nasdaq" when a stock card should show the actual listing rather than its perp: the HIP-3 perp tracks direction but its volume and open interest are Hyperliquid\'s book, not the listing\'s. Nasdaq only answers for symbols a card names, so it cannot back a card that scans a whole universe (top movers).',
    );

/**
 * Stamp each credit with its record key as `id`. Done structurally rather than
 * per entry so a new source cannot forget one — the chrome uses the id to credit
 * only the provider a pick-one card is actually reading, and a missing id would
 * silently fall back to the first-declared entry.
 */
function withSourceIds<T extends Record<string, Omit<FrameSource, "id">>>(
  map: T,
): { [K in keyof T]: T[K] & { id: K & string } } {
  return Object.fromEntries(
    Object.entries(map).map(([id, source]) => [id, { ...source, id }]),
  ) as { [K in keyof T]: T[K] & { id: K & string } };
}

/**
 * Canonical data-source credits. Each frame links its provider from the card
 * chrome (see core's FrameContent); the URL lives here in exactly one place.
 * The record key doubles as the credit's `id`, and for the exchanges it matches
 * `sourceField()`'s enum values — that pairing is what lets a card crediting
 * several exchanges narrow to the one it is reading.
 */
const SOURCES = withSourceIds({
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
  bitkub: { name: "Bitkub", url: "https://www.bitkub.com" },
  goldApi: { name: "gold-api.com", url: "https://gold-api.com" },
  lbma: {
    name: "LBMA",
    url: "https://www.lbma.org.uk/prices-and-data/precious-metal-prices",
  },
  cftc: {
    name: "CFTC",
    url: "https://www.cftc.gov/MarketReports/CommitmentsofTraders/index.htm",
  },
  fred: { name: "FRED", url: "https://fred.stlouisfed.org" },
  zillow: {
    name: "Zillow Research",
    url: "https://www.zillow.com/research/data/",
  },
  fhfa: {
    name: "FHFA",
    url: "https://www.fhfa.gov/data/hpi",
  },
  nasdaq: { name: "Nasdaq", url: "https://www.nasdaq.com" },
  cboe: { name: "Cboe", url: "https://www.cboe.com" },
});

/**
 * The one company a deep-dive card is about. Shared so every equity-research
 * frame spells the field identically and the editor offers the same help — a
 * board about NVDA sets the same string on a dozen cards.
 */
const companySymbolField = () =>
  z
    .string()
    .min(1)
    .describe(
      'US-listed company to analyse — a ticker ("NVDA", "AAPL"). A HIP-3 symbol ("xyz:NVDA") works too; the dex prefix is stripped.',
    );

export const clockMeta = defineFrameMeta({
  name: "clock",
  label: "Clock",
  category: "tools",
  iconUrl: widgetIcon("clock"),
  layout: { w: 3, h: 2, minW: 3, minH: 2, maxW: 4, maxH: 3 },
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
  layout: { w: 4, h: 4, minW: 4, minH: 3 },
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
  layout: { w: 3, h: 3, minW: 2, minH: 3, maxW: 4, maxH: 3 },
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
  annotatable: true,
  label: "Funding Rate Chart",
  category: "derivatives",
  iconUrl: widgetIcon("funding-rate-chart"),
  layout: { w: 6, h: 4, minW: 3, minH: 4, maxH: 5 },
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

export const fundingCalendarMeta = defineFrameMeta({
  name: "funding-calendar",
  label: "Funding Calendar",
  category: "derivatives",
  iconUrl: widgetIcon("funding-calendar"),
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "Each day's total perp funding as a calendar heatmap — one square per day, green where longs paid shorts and red where shorts paid longs, so a carry position's income reads as a pattern instead of a squiggle. Surfaces what the funding line chart hides: whether the carry is a steady drip or a few violent days, and how long the flips last. Intensity is ranked within the window, so one funding spike can't wash out every ordinary day. Keyless (Hyperliquid), summed from the hourly prints.",
  capabilities: ["funding-history"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbol: z
      .string()
      .default("BTC")
      .describe(
        "Symbol to chart funding for, e.g. 'BTC', 'ETH', or a HIP-3 equity 'xyz:TSLA'.",
      ),
    lookback: z
      .enum(["1M", "3M", "6M"])
      .default("3M")
      .describe("How much history the grid covers."),
    weekStart: z
      .enum(["sunday", "monday"])
      .default("monday")
      .describe("Which weekday is the top row."),
  }),
});

export const fundingDistributionMeta = defineFrameMeta({
  name: "funding-distribution",
  label: "Funding Histogram",
  category: "derivatives",
  iconUrl: widgetIcon("funding-distribution"),
  layout: { w: 5, h: 4, minW: 3, minH: 3, maxH: 4 },
  description:
    "Histogram of every hourly funding print over the window — how often longs pay versus get paid, and how extreme it gets. The question a funding line chart can't answer: a carry trade is priced off the whole distribution, not the current rate. Reports the share of hours funding was positive and the annualised carry implied by the mean, plus markers at the mean and the latest print. Keyless (Hyperliquid).",
  capabilities: ["funding-history"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbol: z
      .string()
      .default("BTC")
      .describe(
        "Symbol to analyse funding for, e.g. 'BTC', 'ETH', or a HIP-3 equity 'xyz:TSLA'.",
      ),
    lookback: z
      .enum(["7D", "1M", "3M"])
      .default("1M")
      .describe(
        "How much funding history to bucket. Hourly prints, so even '7D' is ~168 observations.",
      ),
  }),
});

export const noteMeta = defineFrameMeta({
  name: "note",
  label: "Note",
  category: "layout",
  iconUrl: widgetIcon("note"),
  layout: { w: 4, h: 3, minW: 1, minH: 1, maxH: 4 },
  description:
    "Free-form text note pinned to the dashboard — trading plans, reminders, watch levels. Renders a safe Markdown subset: **bold**, *italic*, `inline code`, [links](https://…), #/##/### headings, and - / 1. lists. Plain text still renders as written. Needs no data provider.",
  capabilities: [],
  chrome: "plain",
  schema: z.object({
    text: z
      .string()
      .min(1)
      .describe(
        "The note's text content. Renders a safe Markdown subset — **bold**, *italic*, `code`, [text](https://url), #/##/### headings, and unordered (-) / ordered (1.) lists (raw HTML is never executed). Blank lines start new paragraphs; single newlines become line breaks. Plain text works too.",
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
  layout: { w: 5, h: 3, minW: 4, minH: 2, maxH: 3 },
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

export const tvlTreemapMeta = defineFrameMeta({
  name: "tvl-treemap",
  label: "TVL Treemap",
  category: "crypto",
  iconUrl: widgetIcon("tvl-treemap"),
  layout: { w: 6, h: 4, minW: 2, minH: 2 },
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
  layout: { w: 4, h: 2, minW: 3, minH: 2, maxW: 7, maxH: 3 },
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
  // Stays in USD whatever the board asks for: US-macro: an official U.S. rate board.
  usdOnly: true,
  label: "Rates Board",
  category: "macro",
  iconUrl: widgetIcon("rates-board"),
  layout: { w: 4, h: 4, minW: 3, minH: 4 },
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
  layout: { w: 4, h: 4, minW: 3, minH: 2, maxH: 5 },
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
  layout: { w: 4, h: 3, minW: 3, minH: 3, maxH: 4 },
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
  layout: { w: 4, h: 3, minW: 3, minH: 3, maxH: 5 },
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
  // Stays in USD whatever the board asks for: US-macro: nobody quotes the U.S. national debt in another currency.
  usdOnly: true,
  label: "National Debt",
  category: "macro",
  iconUrl: widgetIcon("national-debt"),
  layout: { w: 4, h: 3, minW: 3, minH: 3, maxH: 4 },
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
  layout: { w: 4, h: 3, minW: 3, minH: 3, maxH: 4 },
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
  layout: { w: 5, h: 4, minW: 3, minH: 2 },
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
  layout: { w: 5, h: 4, minW: 3, minH: 3, maxH: 7 },
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
  layout: { w: 4, h: 3, minW: 3, minH: 2, maxH: 4 },
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
  // Stays in USD whatever the board asks for: SEC filing figures, shown as reported.
  usdOnly: true,
  label: "Fundamentals",
  category: "equities",
  iconUrl: widgetIcon("fundamentals"),
  layout: { w: 4, h: 4, minW: 3, minH: 3, maxH: 5 },
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
  layout: { w: 5, h: 4, minW: 2, minH: 2, maxH: 4 },
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
  layout: { w: 6, h: 3, minW: 5, minH: 2 },
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
  layout: { w: 4, h: 3, minW: 3, minH: 2 },
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
  layout: { w: 3, h: 2, minW: 2, minH: 1, maxW: 4, maxH: 2 },
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
  layout: { w: 4, h: 3, minW: 2, minH: 1 },
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

export const groupMeta = defineFrameMeta({
  name: "group",
  label: "Group",
  category: "layout",
  // No iconUrl yet — the palette renders the card text-only rather than a broken
  // <img>; drop a `group.png` into the runtime's widget-icons and add
  // `iconUrl: widgetIcon("group")` when one exists.
  layout: { w: 6, h: 4, minW: 1, minH: 1, maxH: 5 },
  description:
    "A container that holds OTHER frames as its own little grid, so a cluster of related cards occupies one board slot and moves/resizes as a single unit. Use it to build a composite panel — a 2x2 of sparklines, a chart with its own stat strip beneath, a side-by-side split — that stays together when the board is rearranged. The nested frames go in the instance's `children` array (not in `config`), each with a `position` in this group's own `columns` x `rows` units. Groups cannot contain other groups. Needs no data provider of its own; each child declares its own.",
  capabilities: [],
  // No card and no auto-title of its own: the children carry the titles, while
  // the group's surrounding surface comes from `panel` (on by default).
  chrome: "bare",
  container: true,
  schema: z.object({
    columns: z
      .number()
      .int()
      .min(1)
      .max(12)
      .default(2)
      .describe(
        "How many columns the group's INNER grid is divided into (1-12). A child's position x/w are in these units — so with columns: 2, a child at x: 0, w: 1 fills the left half. Keep it small: a group is a cluster, not a second dashboard.",
      ),
    rows: z
      .number()
      .int()
      .min(1)
      .max(12)
      .default(2)
      .describe(
        "How many rows the group's INNER grid is divided into (1-12). Unlike the board's rows these are FRACTIONS of the group's own height, so the cluster always fills the slot exactly — a child's position y/h are in these units.",
      ),
    gap: z
      .number()
      .min(0)
      .max(48)
      .default(8)
      .describe(
        "Pixels between the child frames. Defaults tighter than the board gutter so a group reads as one object; 0 makes the children flush.",
      ),
    panel: z
      .boolean()
      .default(true)
      .describe(
        "Draw a surrounding surface (tinted panel + border) around the whole group. On by default — a group is one composite object and the surface is what says so; without it a cluster reads as loose cards that happen to sit near each other. Set it to false for a group used purely as invisible scaffolding, where the children's own cards should be the only surfaces.",
      ),
  }),
});

export const headingMeta = defineFrameMeta({
  name: "heading",
  label: "Heading",
  category: "layout",
  iconUrl: widgetIcon("heading"),
  layout: { w: 12, h: 1, minW: 1, minH: 1, maxH: 1 },
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
  layout: { w: 4, h: 5, minW: 4, minH: 3 },
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
  layout: { w: 4, h: 4, minW: 2, minH: 1 },
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
  layout: { w: 4, h: 4, minW: 2, minH: 3, maxH: 7 },
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
  layout: { w: 4, h: 3, minW: 3, minH: 3, maxH: 3 },
  description:
    "The decision-journal scoreboard — a story, not a spreadsheet: where your judgment has an edge, where it leaks, and how calibrated your confidence is, plus a one-line read from zAI. Aggregates the calls logged via Journal · Log.",
  capabilities: [],
  schema: z.object({}),
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
  layout: { w: 6, h: 4, minW: 3, minH: 3, maxH: 5 },
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
  layout: { w: 5, h: 4, minW: 2, minH: 3, maxH: 4 },
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
  layout: { w: 4, h: 4, minW: 2, minH: 3, maxH: 4 },
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
  layout: { w: 4, h: 4, minW: 2, minH: 3, maxH: 4 },
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
  layout: { w: 4, h: 4, minW: 4, minH: 2 },
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
  layout: { w: 6, h: 4, minW: 4, minH: 2 },
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
  annotatable: true,
  label: "DEX Volume Chart",
  category: "crypto",
  iconUrl: widgetIcon("dex-volume-chart"),
  layout: { w: 6, h: 3, minW: 4, minH: 2 },
  description:
    "Multi-series line chart of daily DEX trading volume for several protocols over a lookback window — compare how Uniswap, PancakeSwap, Aerodrome etc. trend against each other. Data from DeFiLlama (daily granularity).",
  capabilities: ["dex-volume"],
  source: SOURCES.defillama,
  schema: z.object({
    protocols: z
      .array(z.string())
      .min(1)
      .max(6)
      .default(["uniswap", "pancakeswap", "aerodrome-slipstream"])
      .describe(
        'DeFiLlama DEX protocol slugs (lowercase, hyphenated), e.g. ["uniswap", "pancakeswap", "aerodrome-slipstream"]. 1 to 6. Defaults to those three — a slug is an upstream identifier no generic seeder can invent, so the field carries its own default rather than letting an added-from-the-palette card fetch a 400.',
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
  layout: { w: 6, h: 4, minW: 4, minH: 1, maxH: 4 },
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
  annotatable: true,
  label: "Protocol TVL Chart",
  category: "crypto",
  iconUrl: widgetIcon("protocol-tvl-chart"),
  layout: { w: 6, h: 3, minW: 4, minH: 2 },
  description:
    "Multi-series line chart of total value locked (TVL) for several DeFi protocols over a lookback window. Data from DeFiLlama (daily granularity).",
  capabilities: ["protocol-tvl"],
  source: SOURCES.defillama,
  schema: z.object({
    protocols: z
      .array(z.string())
      .min(1)
      .max(6)
      .default(["lido", "aave", "eigenlayer"])
      .describe(
        'DeFiLlama protocol slugs (lowercase, hyphenated), e.g. ["lido", "aave", "eigenlayer"]. 1 to 6. Defaults to those three — a slug is an upstream identifier no generic seeder can invent, so the field carries its own default rather than letting an added-from-the-palette card fetch a 400.',
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
  layout: { w: 6, h: 4, minW: 2, minH: 2 },
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
  layout: { w: 6, h: 4, minW: 1, minH: 1, maxH: 4 },
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
  layout: { w: 4, h: 3, minW: 2, minH: 1, maxH: 4 },
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
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
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
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
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
  layout: { w: 4, h: 3, minW: 1, minH: 1, maxW: 8, maxH: 5 },
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
  layout: { w: 8, h: 6, minW: 1, minH: 2, maxH: 6 },
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
  layout: { w: 3, h: 2, minW: 3, minH: 2, maxW: 4, maxH: 3 },
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
  layout: { w: 3, h: 2, minW: 2, minH: 1, maxH: 3 },
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
  layout: { w: 3, h: 4, minW: 2, minH: 4, maxH: 5 },
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
  layout: { w: 4, h: 2, minW: 1, minH: 1, maxW: 11, maxH: 3 },
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
  layout: { w: 12, h: 1, minW: 1, minH: 1, maxH: 1 },
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
  layout: { w: 2, h: 2, minW: 2, minH: 2, maxW: 2, maxH: 2 },
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
  // Stays in USD whatever the board asks for: user-typed trade levels.
  usdOnly: true,
  label: "Risk / Reward",
  category: "tools",
  iconUrl: widgetIcon("risk-reward"),
  layout: { w: 3, h: 3, minW: 2, minH: 2, maxH: 5 },
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
  layout: { w: 6, h: 1, minW: 3, minH: 1, maxH: 1 },
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
  layout: { w: 3, h: 2, minW: 2, minH: 2, maxW: 3, maxH: 2 },
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
  layout: { w: 3, h: 2, minW: 2, minH: 2, maxH: 2 },
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
  layout: { w: 3, h: 4, minW: 2, minH: 2, maxH: 4 },
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
  layout: { w: 4, h: 2, minW: 3, minH: 2, maxH: 2 },
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
  // Stays in USD whatever the board asks for: user-typed projection inputs.
  usdOnly: true,
  label: "Returns Projector",
  category: "tools",
  iconUrl: widgetIcon("returns-projector"),
  layout: { w: 3, h: 4, minW: 3, minH: 3 },
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
  // Stays in USD whatever the board asks for: user-typed fills — a number must read back as entered.
  usdOnly: true,
  label: "Break-even",
  category: "tools",
  iconUrl: widgetIcon("breakeven"),
  layout: { w: 3, h: 4, minW: 2, minH: 3 },
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
  layout: { w: 3, h: 3, minW: 1, minH: 2, maxH: 4 },
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
  layout: { w: 3, h: 3, minW: 2, minH: 2, maxW: 3, maxH: 4 },
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
  layout: { w: 3, h: 3, minW: 2, minH: 2, maxH: 4 },
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
  layout: { w: 2, h: 3, minW: 2, minH: 3, maxW: 5, maxH: 5 },
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
  layout: { w: 3, h: 4, minW: 1, minH: 1, maxW: 3, maxH: 4 },
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
  layout: { w: 3, h: 3, minW: 2, minH: 3, maxH: 3 },
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
  layout: { w: 5, h: 3, minW: 2, minH: 2, maxH: 3 },
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
  layout: { w: 5, h: 4, minW: 3, minH: 2 },
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
  layout: { w: 6, h: 3, minW: 3, minH: 2, maxH: 4 },
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
  layout: { w: 4, h: 3, minW: 3, minH: 2, maxH: 3 },
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
  layout: { w: 6, h: 4, minW: 1, minH: 1 },
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
  layout: { w: 4, h: 3, minW: 2, minH: 2, maxH: 4 },
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
  layout: { w: 4, h: 3, minW: 2, minH: 2, maxH: 3 },
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
  layout: { w: 6, h: 3, minW: 3, minH: 2, maxH: 3 },
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
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
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
  layout: { w: 5, h: 4, minW: 4, minH: 3, maxH: 4 },
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
  layout: { w: 3, h: 3, minW: 3, minH: 2, maxH: 3 },
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
  layout: { w: 3, h: 3, minW: 3, minH: 2, maxH: 3 },
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
  layout: { w: 3, h: 3, minW: 3, minH: 2, maxH: 3 },
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
  layout: { w: 3, h: 3, minW: 3, minH: 2, maxH: 3 },
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
  layout: { w: 3, h: 3, minW: 3, minH: 2, maxH: 3 },
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
  layout: { w: 3, h: 3, minW: 3, minH: 2, maxH: 3 },
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
  layout: { w: 3, h: 3, minW: 3, minH: 2, maxH: 3 },
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

export const breadthHistogramMeta = defineFrameMeta({
  name: "breadth-histogram",
  label: "Market Breadth",
  category: "markets",
  iconUrl: widgetIcon("breadth-histogram"),
  layout: { w: 5, h: 4, minW: 3, minH: 3, maxH: 5 },
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
  layout: { w: 5, h: 4, minW: 3, minH: 3, maxH: 5 },
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

export const dxyMeta = defineFrameMeta({
  name: "dxy",
  label: "Dollar Index (DXY)",
  category: "macro",
  iconUrl: widgetIcon("dxy"),
  layout: { w: 3, h: 3, minW: 3, minH: 2, maxH: 3 },
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
  layout: { w: 4, h: 5, minW: 2, minH: 2, maxH: 7 },
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
  layout: { w: 3, h: 3, minW: 3, minH: 2, maxH: 3 },
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
  layout: { w: 5, h: 4, minW: 4, minH: 2, maxH: 7 },
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

export const yieldDistributionMeta = defineFrameMeta({
  name: "yield-distribution",
  label: "Yield Histogram",
  category: "crypto",
  iconUrl: widgetIcon("yield-distribution"),
  layout: { w: 5, h: 4, minW: 3, minH: 3, maxH: 4 },
  description:
    "Histogram of APY across every DeFi pool that clears the TVL floor — what yield is actually on offer, rather than the ten headline pools. The yield scanner's top-8 list is by construction the extreme right tail; this shows the distribution it was drawn from, so a '40% APY' can be read as remarkable or ordinary. Marks the median, and the far tail is folded into the end bar so a handful of 5000% incentive pools can't flatten the rest. Keyless (DeFiLlama yields).",
  capabilities: ["yields"],
  source: SOURCES.defillama,
  schema: z.object({
    stablecoinOnly: z
      .boolean()
      .default(false)
      .describe(
        "Only include stablecoin pools — a much tighter distribution, since there is no impermanent-loss premium in it.",
      ),
    minTvlUsd: z
      .number()
      .min(0)
      .default(1_000_000)
      .describe(
        "Minimum pool TVL in USD. A liquidity floor: tiny pools carry the most extreme quoted APYs and would dominate the tail.",
      ),
    maxApy: z
      .number()
      .min(10)
      .max(100_000)
      .default(200)
      .describe(
        "Drop pools quoting more than this APY before binning. Unlike the tail fold, this removes them from the sample entirely — a 900,000% incentive quote is a data artefact, not a yield.",
      ),
  }),
});

export const optionsChainTableMeta = defineFrameMeta({
  name: "options-chain-table",
  label: "Options Chain",
  category: "derivatives",
  iconUrl: widgetIcon("options-chain-table"),
  layout: { w: 8, h: 5, minW: 2, minH: 3 },
  description:
    "The full option chain for one underlying as the conventional strike ladder — calls and puts side by side for a chosen expiry, with implied volatility, open interest, volume, bid/ask and optional greeks. Deliberately asset-class-agnostic: the same card reads a crypto venue's book, a listed equity and a metal ETF, so it is the one options surface that works whatever the board is about. Greeks depend on the feed — a delayed exchange chain publishes them, a crypto book-summary call does not, and the greek columns hide themselves when the chain carries none. The header states the quote delay, because reading a 15-minute-old chain as live is the real hazard here. Absent quotes render as a dash, never as zero: a zero bid is a different and real statement.",
  capabilities: ["options-chain"],
  source: SOURCES.deribit,
  schema: z.object({
    symbol: z
      .string()
      .min(1)
      .default("BTC")
      .describe(
        "Underlying to read the chain for. Source-native: the crypto venue lists only 'BTC' and 'ETH' (every other currency returns an empty book, which renders as 'no listed options' rather than an error), while an exchange feed takes an equity or ETF ticker like 'NVDA' or 'GLD'.",
      ),
    expiry: z
      .string()
      .default("")
      .describe(
        "Which expiry to ladder, as an ISO date ('2026-08-28'). Leave empty for the nearest expiry, which is what a chain is normally read at. An expiry the feed does not list falls back to the nearest rather than emptying the card.",
      ),
    strikes: z
      .number()
      .int()
      .min(4)
      .max(40)
      .default(12)
      .describe(
        "How many strikes to show around the money, split either side of the underlying. A real chain runs to thousands of contracts (7,600 on a liquid ETF), so this is a window, not a filter — raise it to see the wings, lower it for a compact card.",
      ),
    greeks: z
      .array(z.enum(["delta", "gamma", "vega", "theta", "rho"]))
      .max(3)
      .default(["delta", "gamma"])
      .describe(
        "Which greek columns to show, at most three so the ladder stays readable. Ignored entirely when the feed publishes no greeks — the crypto book-summary endpoint does not, and fetching them per contract would cost one request per strike.",
      ),
    source: z
      .enum(["deribit", "cboe"])
      .default("deribit")
      .describe(
        "Which feed to read the chain from — 'deribit' for the crypto book (BTC and ETH only, live, no greeks), 'cboe' for a listed equity or ETF chain (delayed ~15 minutes, full greeks). Capability routing is first-match and the equity feed registers first, so this is what actually decides the venue, not the symbol: an equity or ETF ticker needs 'cboe' pinned here or the chain comes back empty. Defaults to the crypto book to match the default symbol.",
      ),
  }),
});

export const tokenUnlockScheduleMeta = defineFrameMeta({
  name: "token-unlock-schedule",
  annotatable: true,
  label: "Unlock Schedule",
  category: "crypto",
  iconUrl: widgetIcon("token-unlock-schedule"),
  layout: { w: 6, h: 4, minW: 3, minH: 4, maxH: 7 },
  description:
    "How much supply is about to hit the market, and who gets it — the crypto equivalent of a share-lockup expiry, and the only forward-looking supply data available keylessly. Charts cumulative unlocked supply with the observed history and the SCHEDULED future drawn as separate lines, so a projection can never be misread as history, and lists the next unlock events with their dates, categories and token amounts. Also states the insider share now against its fully-vested end state, and how far through the documented schedule the token is. A fully-vested token legitimately has no upcoming events, which the card says rather than rendering empty. Keyless (DeFiLlama's published emissions dataset). Keyed by protocol SLUG, and only around 366 protocols publish a schedule at all.",
  capabilities: ["token-unlocks"],
  source: SOURCES.defillama,
  schema: z.object({
    protocol: z
      .string()
      .min(1)
      .default("arbitrum")
      .describe(
        "DeFiLlama protocol slug — 'arbitrum', 'optimism', 'celestia'. NOT a token ticker, and only about 366 protocols publish an emissions schedule; one that does not gets a clean 'no published schedule' state, distinct from loading. Most informative on a recent listing whose team and investor tranches are still vesting.",
      ),
    events: z
      .number()
      .int()
      .min(1)
      .max(12)
      .default(4)
      .describe(
        "How many upcoming unlock events to list under the chart. Past events are never listed — the point of the card is what has not happened yet.",
      ),
    showChart: z
      .boolean()
      .default(true)
      .describe(
        "Draw the cumulative supply curve. Turn it off for a compact card showing only the insider shares, schedule progress and the next unlocks.",
      ),
  }),
});

export const cryptoProfileMeta = defineFrameMeta({
  name: "crypto-profile",
  label: "Crypto Profile",
  category: "crypto",
  iconUrl: widgetIcon("crypto-profile"),
  layout: { w: 5, h: 5, minW: 4, minH: 3 },
  description:
    "One crypto asset's research card — the token equivalent of a company profile, since a token has no filings. Shows name, ticker and market-cap rank; live price with the 24h/7d/30d/1y returns the publisher covers; market cap, fully diluted valuation and 24h volume; the supply triple (circulating / total / max, where an absent max reads as 'uncapped' and never as zero); all-time high and low with their dates and how far price now sits from each; the publisher's category tags; a compact public-repository activity readout; and optional links to site, source and whitepaper. Coverage thins fast below the majors — a mid-cap legitimately publishes no FDV, no whitepaper and a near-empty repo block — so the card renders what exists rather than erroring. Keyless (CoinGecko free tier). Resolve by ticker ('BTC', 'SOL', 'HYPE').",
  capabilities: ["crypto-profile"],
  source: SOURCES.coingecko,
  schema: z.object({
    symbol: z
      .string()
      .min(1)
      .default("BTC")
      .describe(
        "Crypto asset to profile, by ticker — 'BTC', 'ETH', 'SOL'. Crypto only: this reads a token's identity and supply, so a HIP-3 equity symbol ('xyz:TSLA') has no profile and renders the empty state.",
      ),
    showDescription: z
      .boolean()
      .default(false)
      .describe(
        "Append the publisher's prose description, clamped to three lines. Off by default because the published text runs to ~2,000 characters for a major and turns the card into a wall of prose; turn it on for a card given enough height to carry it.",
      ),
    showLinks: z
      .boolean()
      .default(true)
      .describe(
        "Show the outbound link pills (site, source code, whitepaper) for the links the publisher lists. Only links that exist are rendered, so this is a no-op on an asset that publishes none.",
      ),
    showDeveloper: z
      .boolean()
      .default(true)
      .describe(
        "Show the public-repository activity line (stars, forks, commits in the last four weeks, merged PRs, contributors). It measures ONE public repo, so a monorepo or a rename distorts it, and below the majors it is often empty — only non-zero counts render, and an empty block collapses to a single quiet line.",
      ),
  }),
});

export const cryptoDilutionMeta = defineFrameMeta({
  name: "crypto-dilution",
  label: "Supply & Dilution",
  category: "crypto",
  iconUrl: widgetIcon("crypto-dilution"),
  layout: { w: 5, h: 4, minW: 4, minH: 3 },
  description:
    "How much of a token's supply is not circulating yet — the question a price chart cannot answer. Shows the share of supply already circulating, market cap against fully diluted valuation (the gap in money, as a percentage of FDV, and as an FDV/mcap multiple), and the supply composition as a horizontal bar: circulating, minted-but-locked (team, investors, vesting, treasury), and any unminted headroom left under a hard cap. Handles the three genuinely different supply regimes with different copy rather than collapsing them: a CAPPED asset, where FDV is a real ceiling; an UNCAPPED asset with a known total, where FDV is only a floor because more can always be minted; and an asset that publishes neither, where the card says dilution cannot be measured instead of inventing a denominator. FDV is derived from price × supply when the publisher omits it, and labelled 'derived' when it is. Keyless (CoinGecko free tier).",
  capabilities: ["crypto-profile"],
  source: SOURCES.coingecko,
  schema: z.object({
    symbol: z
      .string()
      .min(1)
      .default("BTC")
      .describe(
        "Crypto asset to measure, by ticker — 'BTC', 'ETH', 'ARB'. Crypto only: a HIP-3 equity symbol ('xyz:TSLA') has no token supply and renders the empty state. Most interesting on a recent listing with a long unlock schedule ahead of it.",
      ),
    basis: z
      .enum(["auto", "max", "total"])
      .default("auto")
      .describe(
        "Which supply figure dilution is measured against. 'auto' prefers the hard cap and falls back to total supply; 'max' pins to the hard cap (the true fully-diluted end state); 'total' pins to tokens already issued, which measures only the locked/vesting overhang and ignores future minting. Each falls back to the other when its figure is unpublished, and the card's wording follows the figure actually used.",
      ),
    showChart: z
      .boolean()
      .default(true)
      .describe(
        "Draw the supply-composition bar under the figures. Turn it off for a compact tile that shows only the circulating share and the mcap-vs-FDV gap. The bar is skipped automatically when there is nothing to compare — a fully-circulating asset, or one whose supply is unpublished.",
      ),
  }),
});

export const protocolRevenueMeta = defineFrameMeta({
  name: "protocol-revenue",
  annotatable: true,
  label: "Protocol Fees & Revenue",
  category: "crypto",
  iconUrl: widgetIcon("protocol-revenue"),
  layout: { w: 6, h: 4, minW: 4, minH: 3 },
  description:
    "One protocol's income statement — daily fees paid by users against the revenue the protocol itself kept, charted together, with trailing 30-day and 365-day totals and the implied take rate. The distinction is the point: fees are what users paid, revenue is only the share not passed through to liquidity providers, suppliers or stakers, so Uniswap's ~845M of trailing fees became ~30M of revenue. A valuation multiple built on fees flatters a pass-through protocol; this is the card that shows which kind you are looking at. Keyless (DeFiLlama). Keyed by DeFiLlama protocol SLUG, not a token ticker.",
  capabilities: ["protocol-fundamentals"],
  source: SOURCES.defillama,
  schema: z.object({
    protocol: z
      .string()
      .min(1)
      .default("uniswap")
      .describe(
        "DeFiLlama protocol slug — 'uniswap', 'aave', 'lido', 'hyperliquid', 'ethereum', 'solana'. NOT a token ticker: the publisher keys fees by its own slug, and the two genuinely differ ('lido', not 'lido-dao'). Some assets have several valid slugs that report different numbers — 'arbitrum' (the chain) and 'arbitrum-foundation' (the app) both resolve and their revenue differs by more than half — so pick deliberately.",
      ),
    show: z
      .enum(["both", "fees", "revenue"])
      .default("both")
      .describe(
        "Which lines to draw. 'both' is the useful default because the gap between them IS the take rate; 'fees' alone reads gross user spend; 'revenue' alone reads what the protocol kept, and is the line a price-to-sales multiple should use.",
      ),
    lookback: z
      .enum(["3M", "1Y", "3Y", "MAX"])
      .default("1Y")
      .describe(
        "How much daily history to chart. MAX uses the whole published series, which reaches 2015 for Ethereum but only a few hundred days for a recent protocol — the card charts what exists rather than padding.",
      ),
  }),
});

export const protocolMultiplesMeta = defineFrameMeta({
  name: "protocol-multiples",
  label: "Protocol Multiples",
  category: "crypto",
  iconUrl: widgetIcon("protocol-multiples"),
  layout: { w: 5, h: 4, minW: 4, minH: 3 },
  description:
    "Is the token expensive relative to what the protocol actually earns? Divides market cap by trailing-year revenue and fees to give a token's price-to-sales and price-to-fees, and repeats both against fully diluted valuation — the FDV multiple being the honest one for a token with a large locked supply. The crypto answer to a P/E, and the only keyless one available. Reads two publishers that key differently, so it takes BOTH a DeFiLlama protocol slug and the token's ticker; a mismatched pair produces a silently wrong multiple, so the two fields are deliberately separate. A zero or unpublished revenue line reads as 'not meaningful' rather than infinity.",
  capabilities: ["protocol-fundamentals", "crypto-profile"],
  source: [SOURCES.defillama, SOURCES.coingecko],
  schema: z.object({
    protocol: z
      .string()
      .min(1)
      .default("uniswap")
      .describe(
        "DeFiLlama protocol slug supplying the fees and revenue denominator — 'uniswap', 'aave', 'lido', 'hyperliquid'. NOT a ticker, and not automatically derivable from one: 'lido-dao' (the CoinGecko id) is not a valid slug, while 'arbitrum' and 'arbitrum-foundation' are both valid and report different revenue.",
      ),
    symbol: z
      .string()
      .min(1)
      .default("UNI")
      .describe(
        "Ticker of the token supplying the market cap and FDV numerator — 'UNI', 'AAVE', 'LDO', 'HYPE'. Must be the token of the SAME protocol named above; pairing one protocol's revenue with another token's market cap yields a plausible-looking multiple that means nothing.",
      ),
  }),
});

export const defiRevenueMeta = defineFrameMeta({
  name: "defi-revenue",
  label: "DeFi Fees & Revenue",
  category: "crypto",
  iconUrl: widgetIcon("defi-revenue"),
  layout: { w: 3, h: 3, minW: 3, minH: 2, maxH: 4 },
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
  layout: { w: 5, h: 4, minW: 4, minH: 2, maxH: 5 },
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
  layout: { w: 4, h: 3, minW: 3, minH: 2, maxH: 3 },
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
  layout: { w: 3, h: 3, minW: 2, minH: 2, maxH: 3 },
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
  layout: { w: 4, h: 4, minW: 3, minH: 2, maxH: 5 },
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
  layout: { w: 4, h: 4, minW: 3, minH: 3, maxH: 5 },
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
  layout: { w: 3, h: 4, minW: 2, minH: 2, maxH: 5 },
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
  layout: { w: 4, h: 4, minW: 2, minH: 2 },
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
  layout: { w: 4, h: 4, minW: 2, minH: 2, maxH: 4 },
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
  layout: { w: 5, h: 4, minW: 1, minH: 1, maxH: 4 },
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
  layout: { w: 6, h: 4, minW: 1, minH: 1, maxH: 4 },
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
  annotatable: true,
  label: "ETF Flows Chart",
  category: "crypto",
  iconUrl: widgetIcon("etf-flows-chart"),
  layout: { w: 6, h: 3, minW: 4, minH: 2 },
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
  annotatable: true,
  label: "Realized Price",
  category: "onchain",
  iconUrl: widgetIcon("realized-price"),
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
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
  layout: { w: 3, h: 3, minW: 3, minH: 2, maxH: 3 },
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
  layout: { w: 3, h: 4, minW: 3, minH: 2, maxH: 7 },
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
  layout: { w: 3, h: 4, minW: 3, minH: 2 },
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
  layout: { w: 3, h: 4, minW: 3, minH: 2, maxH: 6 },
  description:
    "Cross-chain network activity for major layer-1s (Bitcoin, Ethereum, Litecoin, …), ranked by 24h transaction count — with blocks mined and mempool backlog per chain. A side-by-side pulse of which chains are busiest right now. Keyless (Blockchair).",
  capabilities: ["chain-activity"],
  source: SOURCES.blockchair,
  schema: z.object({}),
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

export const nftTreemapMeta = defineFrameMeta({
  name: "nft-treemap",
  label: "NFT Treemap",
  category: "crypto",
  iconUrl: widgetIcon("nft-treemap"),
  layout: { w: 4, h: 4, minW: 4, minH: 3 },
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
  layout: { w: 5, h: 4, minW: 5, minH: 2 },
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
  layout: { w: 4, h: 4, minW: 3, minH: 3, maxH: 5 },
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
  layout: { w: 4, h: 3, minW: 3, minH: 2, maxH: 3 },
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
  layout: { w: 6, h: 3, minW: 3, minH: 3, maxH: 4 },
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
  layout: { w: 4, h: 4, minW: 3, minH: 3, maxH: 4 },
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
  layout: { w: 6, h: 4, minW: 3, minH: 3, maxH: 4 },
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

export const marketBubblesMeta = defineFrameMeta({
  name: "market-bubbles",
  label: "Market Bubbles",
  category: "crypto",
  iconUrl: widgetIcon("market-bubbles"),
  layout: { w: 6, h: 5, minW: 3, minH: 2 },
  description:
    "Top coins as a floating bubble cloud — one logo bubble per coin, area by market cap, ring tinted green/red by 24h change. A playful at-a-glance map of where the market's weight sits; bubbles are draggable. Keyless (CoinGecko top-50 by market cap).",
  capabilities: ["coin-markets"],
  source: SOURCES.coingecko,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(5)
      .max(50)
      .default(25)
      .describe("How many top coins (by market cap) to show."),
    sizeBy: z
      .enum(["market-cap", "change"])
      .default("market-cap")
      .describe(
        "Bubble sizing — 'market-cap' weights by market cap, 'change' weights by absolute 24h % move (today's action, not size).",
      ),
  }),
});

const bubbleTopN = (max: number, def: number, what: string) =>
  z
    .number()
    .int()
    .min(3)
    .max(max)
    .default(def)
    .describe(`How many of the largest ${what} to show.`);

export const tvlBubblesMeta = defineFrameMeta({
  name: "tvl-bubbles",
  label: "TVL Bubbles",
  category: "crypto",
  iconUrl: widgetIcon("tvl-bubbles"),
  layout: { w: 6, h: 4, minW: 3, minH: 2 },
  description:
    "Blockchain ecosystems as a floating bubble cloud, area by total value locked (TVL) — the bubble-chart sibling of the TVL treemap. Data from DeFiLlama. Draggable, playful answer to 'where does on-chain capital live'.",
  capabilities: ["tvl"],
  source: SOURCES.defillama,
  schema: z.object({
    topN: bubbleTopN(30, 14, "chains"),
  }),
});

export const protocolTvlBubblesMeta = defineFrameMeta({
  name: "protocol-tvl-bubbles",
  label: "Protocol TVL Bubbles",
  category: "crypto",
  iconUrl: widgetIcon("protocol-tvl-bubbles"),
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "DeFi protocols as a bubble cloud — area by total value locked (TVL), ring tinted green/red by 1-day change. Data from DeFiLlama. Unlike tvl-bubbles (chains), this ranks individual protocols (Lido, Aave, EigenLayer…).",
  capabilities: ["protocol-tvl"],
  source: SOURCES.defillama,
  schema: z.object({
    topN: bubbleTopN(30, 14, "protocols by TVL"),
  }),
});

export const dexVolumeBubblesMeta = defineFrameMeta({
  name: "dex-volume-bubbles",
  label: "DEX Volume Bubbles",
  category: "crypto",
  iconUrl: widgetIcon("dex-volume-bubbles"),
  layout: { w: 6, h: 4, minW: 3, minH: 2 },
  description:
    "Decentralized exchanges as a bubble cloud — area by trailing-24h trading volume, ring tinted green/red by 1-day change. Data from DeFiLlama. Where on-chain trading flow is concentrated right now.",
  capabilities: ["dex-volume"],
  source: SOURCES.defillama,
  schema: z.object({
    topN: bubbleTopN(30, 14, "DEX protocols by 24h volume"),
  }),
});

export const protocolFeesBubblesMeta = defineFrameMeta({
  name: "protocol-fees-bubbles",
  label: "Protocol Fees Bubbles",
  category: "crypto",
  iconUrl: widgetIcon("protocol-fees-bubbles"),
  layout: { w: 6, h: 4, minW: 3, minH: 2 },
  description:
    "Protocols as a bubble cloud — area by fees generated in the last 24h, ring tinted green/red by 1-day change. Data from DeFiLlama. Where users are actually paying for blockspace and services.",
  capabilities: ["protocol-fees"],
  source: SOURCES.defillama,
  schema: z.object({
    topN: bubbleTopN(30, 14, "fee-earning protocols"),
  }),
});

export const sectorBubblesMeta = defineFrameMeta({
  name: "sector-bubbles",
  label: "Sector Bubbles",
  category: "crypto",
  iconUrl: widgetIcon("sector-bubbles"),
  layout: { w: 6, h: 4, minW: 3, minH: 2 },
  description:
    "Crypto sector rotation as a bubble cloud — each category's area by market cap, ring tinted green/red by 24h change. The bubble-chart sibling of the sector treemap. Keyless (CoinGecko categories).",
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

export const nftBubblesMeta = defineFrameMeta({
  name: "nft-bubbles",
  label: "NFT Bubbles",
  category: "crypto",
  iconUrl: widgetIcon("nft-bubbles"),
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
  description:
    "Blue-chip NFT collections as a bubble cloud — area by market capitalisation, ring tinted green/red by 24h floor-price change. Keyless (CoinGecko free tier).",
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

export const dexPoolBubblesMeta = defineFrameMeta({
  name: "dex-pool-bubbles",
  label: "DEX Pool Bubbles",
  category: "onchain",
  iconUrl: widgetIcon("dex-pool-bubbles"),
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
  description:
    "Trending DEX pools on a chain as a bubble cloud — area by 24h trading volume, ring tinted green/red by 24h price change. Which pairs are pulling the most on-chain volume. Keyless (GeckoTerminal free tier).",
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

export const moversBubblesMeta = defineFrameMeta({
  name: "movers-bubbles",
  label: "Movers Bubbles",
  category: "crypto",
  iconUrl: widgetIcon("movers-bubbles"),
  layout: { w: 6, h: 5, minW: 4, minH: 2 },
  description:
    "The broad market's biggest movers as a bubble cloud — logo bubbles sized by the magnitude of the move over a chosen window, green for gainers, red for losers. Today's action at a glance, regardless of coin size. Keyless (CoinPaprika, ~2000 coins).",
  capabilities: ["coin-movers"],
  source: SOURCES.coinpaprika,
  schema: z.object({
    window: z
      .enum(["1h", "24h", "7d", "30d"])
      .default("24h")
      .describe("Price-change window the movers are ranked by."),
    limit: z
      .number()
      .int()
      .min(6)
      .max(30)
      .default(18)
      .describe("Total bubbles — split evenly into top gainers and losers."),
  }),
});

export const sentimentGaugeMeta = defineFrameMeta({
  name: "sentiment-gauge",
  label: "Sentiment Gauge",
  category: "crypto",
  iconUrl: widgetIcon("sentiment-gauge"),
  layout: { w: 3, h: 3, minW: 2, minH: 3, maxW: 3, maxH: 5 },
  description:
    "Crypto fear & greed index as a radial gauge — the arc fills from extreme fear (0) to extreme greed (100) in the mood color, with the reading and classification in the center. A dial-style alternative to the Fear & Greed sparkline card. Keyless (alternative.me).",
  capabilities: ["sentiment"],
  source: SOURCES.alternativeMe,
  schema: z.object({}),
});

export const moversBarsMeta = defineFrameMeta({
  name: "movers-bars",
  label: "Movers Bars",
  category: "crypto",
  iconUrl: widgetIcon("movers-bars"),
  layout: { w: 4, h: 5, minW: 3, minH: 4, maxH: 5 },
  description:
    "Top gainers and losers across the broad crypto market as a diverging bar chart — the biggest movers over a chosen window, gains right in green, losses left in red, ranked by size. The chart-first sibling of the Coin Movers list. Keyless (CoinPaprika, ~2000 coins).",
  capabilities: ["coin-movers"],
  source: SOURCES.coinpaprika,
  schema: z.object({
    window: z
      .enum(["1h", "24h", "7d", "30d"])
      .default("24h")
      .describe("Price-change window the movers are ranked by."),
    limit: z
      .number()
      .int()
      .min(6)
      .max(20)
      .default(12)
      .describe("Total bars — split evenly into top gainers and top losers."),
  }),
});

export const tvlBarsMeta = defineFrameMeta({
  name: "tvl-bars",
  label: "TVL by Chain Bars",
  category: "crypto",
  iconUrl: widgetIcon("tvl-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 4, maxH: 5 },
  description:
    "Total value locked (TVL) per blockchain as a horizontal bar chart, ranked largest-first — DeFi capital compared across chains at a glance. The chart-first sibling of the TVL treemap. Keyless (DeFiLlama).",
  capabilities: ["tvl"],
  source: SOURCES.defillama,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(4)
      .max(20)
      .default(10)
      .describe("How many chains (by TVL) to chart."),
  }),
});

export const yieldScatterMeta = defineFrameMeta({
  name: "yield-scatter",
  label: "Yield Scatter",
  category: "crypto",
  iconUrl: widgetIcon("yield-scatter"),
  layout: { w: 6, h: 4, minW: 3, minH: 3, maxH: 5 },
  description:
    "DeFi yield pools as a risk/reward bubble scatter — total APY on the x-axis, pool TVL on a log y-axis, bubble size by TVL. Surfaces the deep, high-yield pools (top-right) versus thin outliers in one view. The chart-first sibling of the Yield Scanner list. Keyless (DeFiLlama).",
  capabilities: ["yields"],
  source: SOURCES.defillama,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(10)
      .max(60)
      .default(40)
      .describe("How many pools (by TVL) to plot."),
    maxApy: z
      .number()
      .min(10)
      .max(1000)
      .default(100)
      .describe(
        "Hide pools whose APY exceeds this, so extreme incentive outliers don't crush the x-axis.",
      ),
    stablecoinOnly: z
      .boolean()
      .default(false)
      .describe("Restrict to stablecoin pools only."),
  }),
});

export const nftScatterMeta = defineFrameMeta({
  name: "nft-scatter",
  label: "NFT Scatter",
  category: "crypto",
  iconUrl: widgetIcon("nft-scatter"),
  layout: { w: 6, h: 4, minW: 3, minH: 3, maxH: 4 },
  description:
    "Blue-chip NFT collections as a bubble scatter — 24h floor change on the x-axis, 24h trading volume on a log y-axis, bubble size by market cap. Shows which collections are moving on real volume versus thin floors. The chart-first sibling of the NFT Collections list. Keyless (CoinGecko, curated slugs).",
  capabilities: ["nft-market"],
  source: SOURCES.coingecko,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(5)
      .max(15)
      .default(12)
      .describe("How many collections (by market cap) to plot."),
  }),
});

export const dominanceGaugeMeta = defineFrameMeta({
  name: "dominance-gauge",
  label: "Dominance Gauge",
  category: "crypto",
  iconUrl: widgetIcon("dominance-gauge"),
  layout: { w: 3, h: 3, minW: 2, minH: 3, maxW: 3, maxH: 4 },
  description:
    "One asset's share of total crypto market cap as a radial gauge — the arc fills from 0% to 100% dominance with the reading in the center. A dial-style alternative to the segmented Bitcoin Dominance bar. Keyless (CoinGecko global).",
  capabilities: ["global-market"],
  source: SOURCES.coingecko,
  schema: z.object({
    coin: z
      .enum(["btc", "eth"])
      .default("btc")
      .describe("Which asset's market-cap dominance to gauge."),
  }),
});

export const putCallGaugeMeta = defineFrameMeta({
  name: "put-call-gauge",
  label: "Put/Call Gauge",
  category: "derivatives",
  iconUrl: widgetIcon("put-call-gauge"),
  layout: { w: 3, h: 3, minW: 2, minH: 3, maxW: 4, maxH: 4 },
  description:
    "Options put/call ratio as a radial gauge — the arc reads from 0 (all calls, bullish) through 1 (balanced) toward 2 (put-heavy, defensive), colored green below 1 and red above. A dial-style alternative to the Put/Call Ratio card. Keyless (Deribit).",
  capabilities: ["options-summary"],
  source: SOURCES.deribit,
  schema: z.object({
    currency: z
      .enum(["BTC", "ETH"])
      .default("BTC")
      .describe("Options underlying to read the ratio for."),
    basis: z
      .enum(["oi", "volume"])
      .default("oi")
      .describe("Ratio basis — open interest or 24h contract volume."),
  }),
});

export const customDataMeta = defineFrameMeta({
  name: "custom-data",
  label: "Custom Data",
  category: "tools",
  iconUrl: widgetIcon("custom-data"),
  layout: { w: 4, h: 3, minW: 2, minH: 2, maxW: 5, maxH: 4 },
  description:
    "The escape hatch: renders ANY keyless HTTPS JSON API as a stat, line chart, bars, or label→value table — for data no built-in frame covers (weather, sports, public stats, niche feeds). Fetches browser-direct, so the API must be CORS-open, need no key, and be public https (localhost/private hosts are refused). Point `values` at the JSON with a dot/bracket path — e.g. 'hourly.temperature_2m', 'data[0].price', 'items[*].name'. A path resolving to an array charts as a series; a scalar shows as a stat. Verify the URL and path against a real response before emitting them.",
  capabilities: [],
  schema: z.object({
    url: z
      .string()
      .min(1)
      .refine((u) => validateCustomUrl(u) === null, {
        message:
          "must be a public https:// URL (no credentials, no localhost/private hosts)",
      })
      .default(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      )
      .describe(
        "The JSON endpoint, public https only. Must be CORS-open and keyless — never embed an API key or token; the spec is shareable. Include query params in the URL.",
      ),
    values: z
      .string()
      .min(1)
      .max(200)
      .default("bitcoin.usd")
      .describe(
        "Dot/bracket path to the value(s) inside the response, e.g. 'hourly.temperature_2m' (array → series), 'data[0].price' (scalar → stat), 'items[*].volume' ([*] maps over an array). No expressions — keys, [indices], and [*] only.",
      ),
    labels: z
      .string()
      .max(200)
      .default("")
      .describe(
        "Optional path to a parallel array of labels — x-axis ticks for bars, row names for the table, e.g. 'hourly.time' or 'items[*].name'. Empty = positional indices.",
      ),
    display: z
      .enum(["stat", "line", "bars", "table"])
      .default("stat")
      .describe(
        "How to render: stat = big headline number (last value) with sparkline history; line = the series as a line chart; bars = labelled bar chart; table = label → value rows.",
      ),
    label: z
      .string()
      .max(80)
      .default("")
      .describe(
        'Caption naming the metric, e.g. "Bangkok Temp (°C)". Empty shows only the API hostname.',
      ),
    unit: z
      .string()
      .max(12)
      .default("")
      .describe(
        'Unit suffix appended to numeric values, e.g. "°C", "%", "km".',
      ),
    refreshMinutes: z
      .number()
      .int()
      .min(1)
      .max(1440)
      .default(15)
      .describe(
        "Re-fetch interval in minutes. Be polite to free APIs — 15+ unless the data genuinely moves faster.",
      ),
  }),
});

// ===== +70 chart frames (A+B expansion) =====

// ===== hl =====
export const oiTreemapMeta = defineFrameMeta({
  name: "oi-treemap",
  label: "OI Treemap",
  category: "derivatives",
  iconUrl: widgetIcon("oi-treemap"),
  layout: { w: 6, h: 4, minW: 1, minH: 1, maxH: 4 },
  description:
    "Treemap of live Hyperliquid open interest, sized by USD notional — largest markets first, the long tail rolled into a single 'Other' tile. A single-glance map of where perp capital concentrates right now. Keyless (Hyperliquid).",
  capabilities: ["open-interest"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(30)
      .default(12)
      .describe(
        "How many of the largest open-interest markets to show as individual tiles before rolling the rest into a single 'Other' tile.",
      ),
  }),
});

export const ohlcvVolumeBarsMeta = defineFrameMeta({
  name: "ohlcv-volume-bars",
  label: "OHLCV Volume Bars",
  category: "derivatives",
  iconUrl: widgetIcon("ohlcv-volume-bars"),
  layout: { w: 6, h: 3, minW: 3, minH: 3, maxH: 4 },
  description:
    "Per-candle trading volume for one Hyperliquid symbol as vertical bars over time, each bar tinted green when that candle closed up and red when it closed down. Works for any HIP-3 perp (stocks, indices, commodities) and crypto. Keyless (Hyperliquid).",
  capabilities: ["ohlcv"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbol: z
      .string()
      .min(1)
      .describe(
        'Hyperliquid symbol to chart volume for. HIP-3 cross-asset: stocks "xyz:TSLA"/"xyz:NVDA", indices "xyz:SP500", commodities "xyz:GOLD". Crypto: "BTC", "ETH".',
      ),
    interval: z
      .enum(["1m", "5m", "15m", "1h", "4h", "1d"])
      .default("1h")
      .describe("Candle interval each volume bar represents."),
  }),
});

export const fundingSpreadBarsMeta = defineFrameMeta({
  name: "funding-spread-bars",
  label: "Funding Spread Bars",
  category: "derivatives",
  iconUrl: widgetIcon("funding-spread-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 3, maxH: 4 },
  description:
    "Cross-venue predicted funding-rate spread per coin (max − min annualized rate across Hyperliquid/Binance/Bybit) as a ranked horizontal bar chart — the widest spreads are the clearest funding-arbitrage or crowded-positioning candidates. The bars-first sibling of Cross-Venue Funding. Keyless (Hyperliquid predicted fundings).",
  capabilities: ["funding-comparison"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(20)
      .default(10)
      .describe("How many coins (by cross-venue funding spread) to chart."),
  }),
});

export const fundingVenueHeatmapMeta = defineFrameMeta({
  name: "funding-venue-heatmap",
  label: "Funding Venue Heatmap",
  category: "derivatives",
  iconUrl: widgetIcon("funding-venue-heatmap"),
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Heatmap of predicted annualized funding rates — coins as rows, venues (Hyperliquid/Binance/Bybit) as columns, green positive / red negative. Spots which venue is paying up (or charging) for a given coin at a glance. Keyless (Hyperliquid predicted fundings).",
  capabilities: ["funding-comparison"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(15)
      .default(8)
      .describe(
        "How many coins (by cross-venue funding spread) to include as heatmap rows.",
      ),
  }),
});

export const fundingCarryAreaMeta = defineFrameMeta({
  name: "funding-carry-area",
  label: "Funding Carry",
  category: "derivatives",
  iconUrl: widgetIcon("funding-carry-area"),
  layout: { w: 6, h: 3, minW: 3, minH: 3, maxH: 5 },
  description:
    "Stacked area of each symbol's running cumulative funding cost or benefit over a configurable lookback — the running total a position would have paid or earned in funding, symbol by symbol. Shows whether carry has been a persistent drag or tailwind. Keyless (Hyperliquid).",
  capabilities: ["funding-history"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbols: z
      .array(z.string())
      .min(1)
      .max(6)
      .describe(
        'Hyperliquid symbols to compare cumulative funding carry for, e.g. ["BTC", "ETH"]. Up to 6.',
      ),
    lookback: z
      .enum(["24h", "7D", "1M"])
      .default("7D")
      .describe("History window for the cumulative funding-carry chart."),
  }),
});

export const volumeShareDonutMeta = defineFrameMeta({
  name: "volume-share-donut",
  label: "Volume Share Donut",
  category: "derivatives",
  iconUrl: widgetIcon("volume-share-donut"),
  layout: { w: 4, h: 4, minW: 2, minH: 1 },
  description:
    "Donut of 24h Hyperliquid trading volume share across the busiest symbols, top symbols as slices with the long tail rolled into 'Other'. Shows where perp trading activity concentrates right now. Keyless (Hyperliquid).",
  capabilities: ["day-stats"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(15)
      .default(7)
      .describe(
        "How many top symbols (by 24h notional volume) to show as individual slices before rolling the rest into a single 'Other' slice.",
      ),
  }),
});

export const volumeMoversScatterMeta = defineFrameMeta({
  name: "volume-movers-scatter",
  label: "Volume Movers Scatter",
  category: "derivatives",
  iconUrl: widgetIcon("volume-movers-scatter"),
  layout: { w: 6, h: 4, minW: 2, minH: 1 },
  description:
    "Hyperliquid perps as a bubble scatter — 24h price change on the x-axis, 24h notional volume on a log y-axis, bubble size by volume. Shows whether the busiest markets are also the biggest movers, or diverging. Keyless (Hyperliquid).",
  capabilities: ["day-stats"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(10)
      .max(60)
      .default(40)
      .describe(
        "How many of the busiest symbols (by 24h notional volume) to plot.",
      ),
  }),
});

export const fundingLeaderboardBarsMeta = defineFrameMeta({
  name: "funding-leaderboard-bars",
  label: "Funding Leaderboard",
  category: "derivatives",
  iconUrl: widgetIcon("funding-leaderboard-bars"),
  layout: { w: 4, h: 4, minW: 2, minH: 1 },
  description:
    "Predicted hourly funding rate ranked across the whole Hyperliquid universe — crypto and HIP-3 equities together — as a diverging bar chart, largest absolute rates first. Surfaces the most expensive (or most rewarded) side to hold right now. Keyless (Hyperliquid).",
  capabilities: ["day-stats"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(20)
      .default(10)
      .describe("How many symbols (by absolute funding rate) to chart."),
  }),
});

export const fundingCrowdingScatterMeta = defineFrameMeta({
  name: "funding-crowding-scatter",
  label: "Funding Crowding Scatter",
  category: "derivatives",
  iconUrl: widgetIcon("funding-crowding-scatter"),
  layout: { w: 6, h: 4, minW: 2, minH: 1 },
  description:
    "24h price change (x) vs predicted funding rate (y) across Hyperliquid perps, bubble size by open interest — the combination of a stretched funding rate and heavy open interest flags a crowded, squeeze-prone position. Keyless (Hyperliquid).",
  capabilities: ["day-stats", "open-interest"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(10)
      .max(60)
      .default(40)
      .describe("How many symbols (by open interest) to plot."),
  }),
});

export const liquidityBasisBarsMeta = defineFrameMeta({
  name: "liquidity-basis-bars",
  label: "Liquidity & Basis Bars",
  category: "derivatives",
  iconUrl: widgetIcon("liquidity-basis-bars"),
  layout: { w: 4, h: 4, minW: 2, minH: 1 },
  description:
    "Ranked horizontal bars of a chosen liquidity/pricing metric across Hyperliquid perps — either the bid/ask impact-price spread (% of mark price) or the mark-vs-oracle basis (bps). Surfaces the least liquid or most stretched markets at a glance. Keyless (Hyperliquid).",
  capabilities: ["day-stats"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    metric: z
      .enum(["spread", "basis"])
      .default("spread")
      .describe(
        'Which liquidity metric to rank by: "spread" (bid/ask impact-price spread as a % of mark price) or "basis" (mark-vs-oracle premium in basis points).',
      ),
    limit: z
      .number()
      .int()
      .min(3)
      .max(20)
      .default(10)
      .describe(
        "How many symbols (by the chosen metric's magnitude) to chart.",
      ),
  }),
});

// ===== cg =====
export const coinMomentumHeatmapMeta = defineFrameMeta({
  name: "coin-momentum-heatmap",
  label: "Coin Momentum Heatmap",
  category: "crypto",
  iconUrl: widgetIcon("coin-momentum-heatmap"),
  layout: { w: 5, h: 5, minW: 3, minH: 2 },
  description:
    "Top coins by market-cap rank as a momentum heatmap — rows are coins, columns are 1h/24h/7d/30d change windows, colored diverging green/red by magnitude. Spot which coins are heating up (or cooling off) across every timeframe at a glance. Keyless (CoinPaprika, ~2000 coins).",
  capabilities: ["coin-movers"],
  source: SOURCES.coinpaprika,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(5)
      .max(30)
      .default(15)
      .describe("How many top coins (by market-cap rank) to include as rows."),
  }),
});

export const coinMomentumScatterMeta = defineFrameMeta({
  name: "coin-momentum-scatter",
  label: "Coin Momentum Scatter",
  category: "crypto",
  iconUrl: widgetIcon("coin-momentum-scatter"),
  layout: { w: 6, h: 4, minW: 3, minH: 3, maxH: 5 },
  description:
    "Broad-market coins as a momentum scatter — 24h change on the x-axis, 7d change on the y-axis, bubble size by market cap, colored by 24h direction. Reveals whether today's move is a continuation or a reversal of the week's trend. Keyless (CoinPaprika, ~2000 coins).",
  capabilities: ["coin-movers"],
  source: SOURCES.coinpaprika,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(10)
      .max(100)
      .default(50)
      .describe("How many top coins (by market-cap rank) to plot."),
  }),
});

export const trendingBarsMeta = defineFrameMeta({
  name: "trending-bars",
  label: "Trending Bars",
  category: "crypto",
  iconUrl: widgetIcon("trending-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 2, maxH: 5 },
  description:
    "The coins with the most search interest right now on CoinGecko as a diverging bar chart — 24h change per trending coin, gains right in green, losses left in red. The chart-first sibling of the Trending Coins list. Keyless (CoinGecko).",
  capabilities: ["trending-coins"],
  source: SOURCES.coingecko,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(15)
      .default(7)
      .describe("How many trending coins to chart."),
  }),
});

export const nftActivityBarsMeta = defineFrameMeta({
  name: "nft-activity-bars",
  label: "NFT Activity Bars",
  category: "crypto",
  iconUrl: widgetIcon("nft-activity-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 3, maxH: 4 },
  description:
    "Blue-chip NFT collections ranked by 24h sales count as a horizontal bar chart — which collections are actually trading, not just holding a floor price. The chart-first sibling of the NFT Collections list. Keyless (CoinGecko, curated slugs).",
  capabilities: ["nft-market"],
  source: SOURCES.coingecko,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(5)
      .max(15)
      .default(10)
      .describe("How many collections (by 24h sales) to chart."),
  }),
});

export const dominanceBarsMeta = defineFrameMeta({
  name: "dominance-bars",
  label: "Dominance Bars",
  category: "markets",
  iconUrl: widgetIcon("dominance-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 2, maxH: 4 },
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

export const trendingBubblesMeta = defineFrameMeta({
  name: "trending-bubbles",
  label: "Trending Bubbles",
  category: "crypto",
  iconUrl: widgetIcon("trending-bubbles"),
  layout: { w: 6, h: 5, minW: 3, minH: 2 },
  description:
    "The coins with the most search interest right now on CoinGecko as a floating bubble cloud — bubble area by |24h change|, ring tinted green/red by direction. A movement-first alternative to the Trending Coins list. Keyless (CoinGecko).",
  capabilities: ["trending-coins"],
  source: SOURCES.coingecko,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(15)
      .default(10)
      .describe("How many trending coins to show."),
  }),
});

// ===== defi =====
export const yieldRiskPieMeta = defineFrameMeta({
  name: "yield-risk-pie",
  label: "Yield Risk Pie",
  category: "crypto",
  iconUrl: widgetIcon("yield-risk-pie"),
  layout: { w: 4, h: 4, minW: 3, minH: 3, maxW: 6, maxH: 5 },
  description:
    "DeFi yield pools grouped by impermanent-loss risk as a donut, sliced by total value locked (TVL) — no-IL-risk, IL-risk, and unknown, summed across every pool. A quick read on how much yield-seeking capital carries IL exposure. Keyless (DeFiLlama).",
  capabilities: ["yields"],
  source: SOURCES.defillama,
  schema: z.object({}),
});

export const dexPoolLiquidityScatterMeta = defineFrameMeta({
  name: "dex-pool-liquidity-scatter",
  label: "DEX Pool Liquidity Scatter",
  category: "onchain",
  iconUrl: widgetIcon("dex-pool-liquidity-scatter"),
  layout: { w: 6, h: 4, minW: 3, minH: 3, maxH: 4 },
  description:
    "Trending DEX pools on a chain as a liquidity-vs-volume bubble scatter — pool reserves on a log x-axis, 24h trading volume on a log y-axis, bubble size by 24h trade count, tinted green/red by 24h price change. Surfaces deep, active pools versus thin or quiet ones. Keyless (GeckoTerminal free tier).",
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
      .describe("How many trending pools to plot (up to 15)."),
  }),
});

export const protocolFeesVsTvlScatterMeta = defineFrameMeta({
  name: "protocol-fees-vs-tvl-scatter",
  label: "Protocol Fees vs TVL Scatter",
  category: "crypto",
  iconUrl: widgetIcon("protocol-fees-vs-tvl-scatter"),
  layout: { w: 6, h: 4, minW: 3, minH: 3, maxH: 4 },
  description:
    "DeFi protocols as a fees-vs-TVL bubble scatter — total value locked on a log x-axis, trailing-24h fees on a log y-axis, bubble size by fees. Surfaces capital-efficient protocols earning outsized fees on their TVL versus large-but-quiet ones. Only protocols DeFiLlama reports both a TVL and a fees figure for are plotted. Keyless (DeFiLlama).",
  capabilities: ["protocol-tvl", "protocol-fees"],
  source: SOURCES.defillama,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(5)
      .max(40)
      .default(20)
      .describe("How many protocols (by 24h fees) to plot."),
  }),
});

export const yieldCompositionScatterMeta = defineFrameMeta({
  name: "yield-composition-scatter",
  label: "Yield Composition Scatter",
  category: "crypto",
  iconUrl: widgetIcon("yield-composition-scatter"),
  layout: { w: 6, h: 4, minW: 3, minH: 3, maxH: 5 },
  description:
    "DeFi yield pools as a base-vs-reward APY scatter — organic (base) APY on the x-axis, incentive (reward) APY on the y-axis, bubble size by TVL. Separates pools earning real organic yield from ones propped up by token incentives. Keyless (DeFiLlama).",
  capabilities: ["yields"],
  source: SOURCES.defillama,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(10)
      .max(60)
      .default(40)
      .describe("How many pools (by TVL) to plot."),
    stablecoinOnly: z
      .boolean()
      .default(false)
      .describe("Restrict to stablecoin pools only."),
  }),
});

export const protocolTvlByCategoryMeta = defineFrameMeta({
  name: "protocol-tvl-by-category",
  label: "Protocol TVL by Category",
  category: "crypto",
  iconUrl: widgetIcon("protocol-tvl-by-category"),
  layout: { w: 4, h: 4, minW: 3, minH: 3, maxH: 4 },
  description:
    "Total value locked (TVL) summed by DeFiLlama category — Dexes, Lending, Liquid Staking, and more — as a horizontal bar chart ranked largest-first. Shows which slice of DeFi actually holds the capital. Keyless (DeFiLlama).",
  capabilities: ["protocol-tvl"],
  source: SOURCES.defillama,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(4)
      .max(20)
      .default(10)
      .describe("How many DeFi categories (by summed TVL) to chart."),
  }),
});

export const protocolTvlShareAreaMeta = defineFrameMeta({
  name: "protocol-tvl-share-area",
  label: "Protocol TVL Share Area",
  category: "crypto",
  iconUrl: widgetIcon("protocol-tvl-share-area"),
  layout: { w: 6, h: 3, minW: 3, minH: 3, maxH: 5 },
  description:
    "Stacked area chart of total value locked (TVL) for several DeFi protocols over a lookback window, each protocol's slice stacked to show the combined total and how the mix shifts over time. The composition-focused sibling of the Protocol TVL Chart's overlaid lines. Data from DeFiLlama (daily granularity).",
  capabilities: ["protocol-tvl"],
  source: SOURCES.defillama,
  schema: z.object({
    protocols: z
      .array(z.string())
      .min(1)
      .max(6)
      .default(["lido", "aave", "eigenlayer"])
      .describe(
        'DeFiLlama protocol slugs (lowercase, hyphenated), e.g. ["lido", "aave", "eigenlayer"]. 1 to 6. Defaults to those three — a slug is an upstream identifier no generic seeder can invent, so the field carries its own default rather than letting an added-from-the-palette card fetch a 400.',
      ),
    lookback: z
      .enum(["7D", "1M", "3M"])
      .default("1M")
      .describe("History window for the chart."),
  }),
});

export const dexVolumeShareAreaMeta = defineFrameMeta({
  name: "dex-volume-share-area",
  label: "DEX Volume Share Area",
  category: "crypto",
  iconUrl: widgetIcon("dex-volume-share-area"),
  layout: { w: 6, h: 3, minW: 3, minH: 3, maxH: 5 },
  description:
    "Stacked area chart of daily DEX trading volume for several protocols over a lookback window, stacked to show combined volume and how each DEX's share shifts over time. The composition-focused sibling of the DEX Volume Chart's overlaid lines. Data from DeFiLlama (daily granularity).",
  capabilities: ["dex-volume"],
  source: SOURCES.defillama,
  schema: z.object({
    protocols: z
      .array(z.string())
      .min(1)
      .max(6)
      .default(["uniswap", "pancakeswap", "aerodrome-slipstream"])
      .describe(
        'DeFiLlama DEX protocol slugs (lowercase, hyphenated), e.g. ["uniswap", "pancakeswap", "aerodrome-slipstream"]. 1 to 6. Defaults to those three — a slug is an upstream identifier no generic seeder can invent, so the field carries its own default rather than letting an added-from-the-palette card fetch a 400.',
      ),
    lookback: z
      .enum(["7D", "1M", "3M"])
      .default("1M")
      .describe("History window for the chart."),
  }),
});

export const yieldMomentumBarsMeta = defineFrameMeta({
  name: "yield-momentum-bars",
  label: "Yield Momentum Bars",
  category: "crypto",
  iconUrl: widgetIcon("yield-momentum-bars"),
  layout: { w: 4, h: 5, minW: 3, minH: 4, maxH: 5 },
  description:
    "DeFi yield pools ranked by 7-day APY change as a diverging bar chart — the biggest APY gains and drops over the past week, filtered above a TVL floor to skip dust pools. Surfaces where yields are heating up or cooling off. Keyless (DeFiLlama).",
  capabilities: ["yields"],
  source: SOURCES.defillama,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(6)
      .max(20)
      .default(12)
      .describe(
        "How many pools to chart, split into the largest 7-day APY gains and drops.",
      ),
    minTvlUsd: z
      .number()
      .min(0)
      .default(1_000_000)
      .describe("Minimum pool TVL in USD — a liquidity floor to hide dust."),
  }),
});

// ===== chain =====
export const btcDifficultyChartMeta = defineFrameMeta({
  name: "btc-difficulty-chart",
  label: "BTC Difficulty Chart",
  category: "bitcoin",
  iconUrl: widgetIcon("btc-difficulty-chart"),
  layout: { w: 6, h: 3, minW: 3, minH: 2, maxH: 4 },
  description:
    "Bitcoin network difficulty over time as a line chart, with the current difficulty and hashrate as headline figures — the long-run mining-cost trend, charted rather than a single retarget countdown. Keyless (mempool.space).",
  capabilities: ["btc-hashrate"],
  source: SOURCES.mempool,
  schema: z.object({
    window: z
      .enum(["1y", "2y", "3y"])
      .default("1y")
      .describe("History window for the difficulty line."),
  }),
});

export const btcBlockSizeBarsMeta = defineFrameMeta({
  name: "btc-block-size-bars",
  label: "BTC Block Size Bars",
  category: "bitcoin",
  iconUrl: widgetIcon("btc-block-size-bars"),
  layout: { w: 5, h: 4, minW: 3, minH: 3, maxH: 4 },
  description:
    "Recent Bitcoin block sizes as a vertical bar chart, oldest to newest — spot when blocks are running full (near the ~4MB weight limit) versus half-empty. The chart-first sibling of the BTC Blocks feed. Keyless (mempool.space).",
  capabilities: ["btc-blocks"],
  source: SOURCES.mempool,
  schema: z.object({
    count: z
      .number()
      .int()
      .min(3)
      .max(15)
      .default(8)
      .describe("How many recent blocks to chart (oldest → newest)."),
  }),
});

export const chainPriceMoversMeta = defineFrameMeta({
  name: "chain-price-movers",
  label: "Chain Price Movers",
  category: "onchain",
  iconUrl: widgetIcon("chain-price-movers"),
  layout: { w: 4, h: 4, minW: 3, minH: 3, maxH: 4 },
  description:
    "24h native-asset price change per major L1 (Bitcoin, Ethereum, Litecoin, Dogecoin, …) as a diverging bar chart, gains right in green, losses left in red. The price-led sibling of the Chain Activity Bars transaction chart. Keyless (Blockchair).",
  capabilities: ["chain-activity"],
  source: SOURCES.blockchair,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(12)
      .default(8)
      .describe("How many chains (by absolute 24h price change) to chart."),
  }),
});

export const chainActivityScatterMeta = defineFrameMeta({
  name: "chain-activity-scatter",
  label: "Chain Activity Scatter",
  category: "onchain",
  iconUrl: widgetIcon("chain-activity-scatter"),
  layout: { w: 6, h: 4, minW: 3, minH: 3, maxH: 4 },
  description:
    "Major L1s as a bubble scatter — 24h native-asset price change on the x-axis, 24h confirmed transactions on a log y-axis, bubble size by current mempool backlog. Shows which chains are both moving in price and busy on-chain. Keyless (Blockchair).",
  capabilities: ["chain-activity"],
  source: SOURCES.blockchair,
  schema: z.object({}),
});

export const mempoolFeeCurveMeta = defineFrameMeta({
  name: "mempool-fee-curve",
  label: "Mempool Fee Curve",
  category: "bitcoin",
  iconUrl: widgetIcon("mempool-fee-curve"),
  layout: { w: 5, h: 3, minW: 3, minH: 3, maxH: 4 },
  description:
    "Bitcoin mempool's projected next-to-mine blocks as a fee-decay bar chart — median sat/vB per block, tinted by urgency, showing how fast fees drop as you're willing to wait a block or two longer. The chart-first sibling of the BTC Mempool card. Keyless (mempool.space).",
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
        "How many projected (yet-to-be-mined) blocks to chart, next-to-mine first.",
      ),
  }),
});

export const miningPoolsShareMeta = defineFrameMeta({
  name: "mining-pools-share",
  label: "Mining Pools Share",
  category: "bitcoin",
  iconUrl: widgetIcon("mining-pools-share"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Bitcoin mining-pool dominance as a donut — top pools by block share over a window plus an 'Other' slice, with the top-3 combined share in the center as a quick hashpower-concentration read. The chart-first sibling of the Mining Pools treemap. Keyless (mempool.space).",
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
      .max(8)
      .default(5)
      .describe(
        "How many of the largest pools to show as slices; the rest fold into 'Other'.",
      ),
  }),
});

// ===== deribit =====
export const optionsMaxPainMeta = defineFrameMeta({
  name: "options-max-pain",
  label: "Max Pain by Strike",
  category: "derivatives",
  iconUrl: widgetIcon("options-max-pain"),
  layout: { w: 6, h: 4, minW: 5, minH: 3, maxH: 4 },
  description:
    "Max pain for the nearest Deribit options expiry (BTC or ETH) — the aggregate payout option writers would owe at each candidate settlement strike, as a bar chart, with the strike that minimizes it (where the most contracts expire worthless) highlighted against the current spot. Keyless (Deribit).",
  capabilities: ["options-summary"],
  source: SOURCES.deribit,
  schema: z.object({
    currency: z
      .enum(["BTC", "ETH"])
      .default("BTC")
      .describe("Which Deribit options book — BTC or ETH."),
  }),
});

export const optionsOiSkewMeta = defineFrameMeta({
  name: "options-oi-skew",
  label: "OI Skew by Strike",
  category: "derivatives",
  iconUrl: widgetIcon("options-oi-skew"),
  layout: { w: 6, h: 4, minW: 5, minH: 3, maxH: 4 },
  description:
    "Net call-minus-put open interest by strike for the nearest Deribit options expiry (BTC or ETH) — a single diverging bar per strike showing where positioning skews call-heavy (green, above zero) versus put-heavy (red, below zero) near spot. The netted sibling of OI by Strike. Keyless (Deribit).",
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

export const optionsVolSpreadMeta = defineFrameMeta({
  name: "options-vol-spread",
  annotatable: true,
  label: "BTC/ETH Vol Spread",
  category: "derivatives",
  iconUrl: widgetIcon("options-vol-spread"),
  layout: { w: 6, h: 4, minW: 4, minH: 4, maxH: 5 },
  description:
    "BTC DVOL and ETH DVOL implied-volatility indices plotted together over time — the spread between crypto's two most liquid vol benchmarks, and which one is pricing bigger expected swings. Keyless (Deribit).",
  capabilities: ["volatility-index"],
  source: SOURCES.deribit,
  schema: z.object({
    lookback: z
      .enum(["7D", "1M", "3M"])
      .default("1M")
      .describe("History window for both volatility-index lines."),
  }),
});

export const optionsFlowSkewMeta = defineFrameMeta({
  name: "options-flow-skew",
  label: "Positioning vs Flow Skew",
  category: "derivatives",
  iconUrl: widgetIcon("options-flow-skew"),
  layout: { w: 4, h: 3, minW: 3, minH: 2, maxH: 4 },
  description:
    "Call/put skew for BTC or ETH options across two bases at once — open interest (standing positioning) and 24h volume (today's flow) — as two diverging bars. Green = call-heavy, red = put-heavy; the two diverging signals fresh flow fighting stale positioning. Keyless (Deribit).",
  capabilities: ["options-summary"],
  source: SOURCES.deribit,
  schema: z.object({
    currency: z
      .enum(["BTC", "ETH"])
      .default("BTC")
      .describe("Which Deribit options book — BTC or ETH."),
  }),
});

export const optionsVolSmileMeta = defineFrameMeta({
  name: "options-vol-smile",
  label: "Vol Smile",
  category: "derivatives",
  iconUrl: widgetIcon("options-vol-smile"),
  layout: { w: 6, h: 4, minW: 2, minH: 1 },
  description:
    "Implied volatility by strike for the nearest Deribit options expiry (BTC or ETH) — a call-IV line and a put-IV line across the strike range, the classic 'vol smile' shape that shows where the market prices tail risk richest. Keyless (Deribit).",
  capabilities: ["options-summary"],
  source: SOURCES.deribit,
  schema: z.object({
    currency: z
      .enum(["BTC", "ETH"])
      .default("BTC")
      .describe("Which Deribit options book — BTC or ETH."),
  }),
});

export const optionsOiLadderHeatmapMeta = defineFrameMeta({
  name: "options-oi-ladder-heatmap",
  label: "OI Ladder Heatmap",
  category: "derivatives",
  iconUrl: widgetIcon("options-oi-ladder-heatmap"),
  layout: { w: 8, h: 5, minW: 2, minH: 1 },
  description:
    "Open interest across strike and expiry for BTC or ETH options, as a heatmap — expiries as rows (nearest first), strike bands as columns, cell shade by total call+put OI. Surfaces where positioning concentrates across the whole term structure, not just the nearest expiry. Keyless (Deribit).",
  capabilities: ["options-summary"],
  source: SOURCES.deribit,
  schema: z.object({
    currency: z
      .enum(["BTC", "ETH"])
      .default("BTC")
      .describe("Which Deribit options book — BTC or ETH."),
    expiries: z
      .number()
      .int()
      .min(3)
      .max(16)
      .default(8)
      .describe("How many upcoming expiries (nearest-first) to show as rows."),
    buckets: z
      .number()
      .int()
      .min(6)
      .max(20)
      .default(10)
      .describe(
        "How many strike bands (columns) to bin open interest into, spanning the shown expiries' strike range.",
      ),
  }),
});

export const optionsMaxPainMultiMeta = defineFrameMeta({
  name: "options-max-pain-multi",
  label: "Max Pain by Expiry",
  category: "derivatives",
  iconUrl: widgetIcon("options-max-pain-multi"),
  layout: { w: 6, h: 4, minW: 2, minH: 1 },
  description:
    "Max pain strike for each upcoming Deribit options expiry (BTC or ETH), plotted as % deviation from spot — one bar per expiry, showing which dated books are pinned above versus below the current price. The term-structure sibling of Max Pain by Strike. Keyless (Deribit).",
  capabilities: ["options-summary"],
  source: SOURCES.deribit,
  schema: z.object({
    currency: z
      .enum(["BTC", "ETH"])
      .default("BTC")
      .describe("Which Deribit options book — BTC or ETH."),
    expiries: z
      .number()
      .int()
      .min(3)
      .max(16)
      .default(8)
      .describe("How many upcoming expiries (nearest-first) to chart."),
  }),
});

// ===== cycle =====
// ── Cycle chart & composite frames (Coin Metrics + bitcoin-data.com + ultrasound.money) ──

export const mvrvZscoreChartMeta = defineFrameMeta({
  name: "mvrv-zscore-chart",
  annotatable: true,
  label: "MVRV Z-Score Chart",
  category: "onchain",
  iconUrl: widgetIcon("mvrv-zscore-chart"),
  layout: { w: 6, h: 3, minW: 3, minH: 3, maxH: 5 },
  description:
    "Bitcoin MVRV Z-Score plotted as a full daily time-series line, not just a sparkline — how many standard deviations market cap sits above realized cap across the whole available history. Historically, spikes above ~7 have marked cycle tops and dips below 0 mark deep-value bottoms. The chart-first sibling of the MVRV gauge. Keyless (Coin Metrics).",
  capabilities: ["onchain-valuation"],
  source: SOURCES.coinMetrics,
  schema: z.object({
    window: z
      .enum(["1Y", "2Y", "4Y", "all"])
      .default("all")
      .describe("How much history the chart shows."),
  }),
});

export const nuplCycleChartMeta = defineFrameMeta({
  name: "nupl-cycle-chart",
  annotatable: true,
  label: "NUPL Cycle Chart",
  category: "onchain",
  iconUrl: widgetIcon("nupl-cycle-chart"),
  layout: { w: 6, h: 3, minW: 3, minH: 3, maxH: 5 },
  description:
    "Net Unrealized Profit/Loss plotted as a full daily time-series line across Bitcoin's cycle sentiment bands — Capitulation, Hope/Fear, Optimism, Belief, Euphoria/Greed. The chart-first sibling of the NUPL gauge. Keyless (Coin Metrics).",
  capabilities: ["onchain-valuation"],
  source: SOURCES.coinMetrics,
  schema: z.object({
    window: z
      .enum(["1Y", "2Y", "4Y", "all"])
      .default("all")
      .describe("How much history the chart shows."),
  }),
});

export const cycleValuationCompositeMeta = defineFrameMeta({
  name: "cycle-valuation-composite",
  annotatable: true,
  label: "Cycle Valuation Composite",
  category: "onchain",
  iconUrl: widgetIcon("cycle-valuation-composite"),
  layout: { w: 6, h: 4, minW: 3, minH: 4, maxH: 5 },
  description:
    "Three cycle-valuation signals — MVRV Z-Score, NUPL, and BTC's 14-day RSI — overlaid on one chart, each independently min-max normalized to 0–100% over the selected window so their unrelated native scales become directly comparable. All three near the top together reads late-cycle euphoria; all three near the bottom reads capitulation. Keyless (Coin Metrics).",
  capabilities: ["onchain-valuation", "price-history-daily"],
  source: SOURCES.coinMetrics,
  schema: z.object({
    window: z
      .enum(["1Y", "2Y", "4Y", "all"])
      .default("2Y")
      .describe("How much history each signal is normalized and charted over."),
  }),
});

export const onchainOscillatorOverlayMeta = defineFrameMeta({
  name: "onchain-oscillator-overlay",
  annotatable: true,
  label: "On-Chain Oscillator Overlay",
  category: "onchain",
  iconUrl: widgetIcon("onchain-oscillator-overlay"),
  layout: { w: 6, h: 4, minW: 3, minH: 4, maxH: 5 },
  description:
    "SOPR, Puell Multiple, and Reserve Risk overlaid on one chart, each independently min-max normalized to 0–100% over the selected window — three on-chain cycle oscillators with unrelated native scales made directly comparable. Keyless (bitcoin-data.com; polled once daily, best-effort per metric).",
  capabilities: ["onchain-cycle-extras"],
  source: SOURCES.bitcoinData,
  schema: z.object({
    window: z
      .enum(["90D", "180D", "1Y"])
      .default("1Y")
      .describe("How much history each signal is normalized and charted over."),
  }),
});

export const ethIssuanceImpactMeta = defineFrameMeta({
  name: "eth-issuance-impact",
  label: "ETH Issuance Impact",
  category: "onchain",
  iconUrl: widgetIcon("eth-issuance-impact"),
  layout: { w: 4, h: 3, minW: 3, minH: 2, maxH: 4 },
  description:
    "Ethereum's actual net annual supply growth (post-Merge PoS issuance minus EIP-1559 burn) vs the counterfactual pre-Merge PoW issuance rate, as diverging bars — how much leaner ETH's inflation is under proof-of-stake. Negative (deflationary) growth in green, positive (inflationary) in red. Keyless (ultrasound.money).",
  capabilities: ["eth-supply"],
  source: SOURCES.ultrasound,
  schema: z.object({}),
});

// ===== rates =====
export const treasuryAvgRateBarsMeta = defineFrameMeta({
  name: "treasury-avg-rate-bars",
  label: "Treasury Avg Rate Bars",
  category: "macro",
  iconUrl: widgetIcon("treasury-avg-rate-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 1, maxH: 4 },
  description:
    "U.S. Treasury average interest rates across the full set of security classes as a horizontal bar chart, ranked highest-first. The chart-first sibling of the Rates Board's Treasury-rates section. Keyless (U.S. Treasury).",
  capabilities: ["treasury-rates"],
  source: SOURCES.treasury,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(5)
      .max(25)
      .default(20)
      .describe(
        "How many security classes (by average rate, highest first) to chart.",
      ),
  }),
});

export const treasuryAuctionDemandScatterMeta = defineFrameMeta({
  name: "treasury-auction-demand-scatter",
  label: "Treasury Auction Demand",
  category: "macro",
  iconUrl: widgetIcon("treasury-auction-demand-scatter"),
  layout: { w: 6, h: 4, minW: 3, minH: 3, maxH: 5 },
  description:
    "Recent completed U.S. Treasury auctions as a bubble scatter — awarded rate on the x-axis, bid-to-cover ratio (demand) on the y-axis, one dot per auction labelled by term. Reveals whether richer (lower-yield) auctions also draw stronger demand. Keyless (U.S. Treasury).",
  capabilities: ["treasury-auctions"],
  source: SOURCES.treasury,
  schema: z.object({
    count: z
      .number()
      .int()
      .min(5)
      .max(30)
      .default(20)
      .describe(
        "How many recent completed auctions (with a reported rate and bid-to-cover) to plot.",
      ),
  }),
});

export const treasuryAuctionSizeBarsMeta = defineFrameMeta({
  name: "treasury-auction-size-bars",
  // Stays in USD whatever the board asks for: US-macro: Treasury auction sizes as offered.
  usdOnly: true,
  label: "Treasury Auction Size",
  category: "macro",
  iconUrl: widgetIcon("treasury-auction-size-bars"),
  layout: { w: 6, h: 3, minW: 3, minH: 3, maxH: 4 },
  description:
    "Recent completed U.S. Treasury auctions as paired bars — the offering amount beside the amount actually accepted, per auction, oldest to newest. Shows at a glance how close each auction came to being fully subscribed. Keyless (U.S. Treasury).",
  capabilities: ["treasury-auctions"],
  source: SOURCES.treasury,
  schema: z.object({
    count: z
      .number()
      .int()
      .min(3)
      .max(20)
      .default(8)
      .describe(
        "How many recent completed auctions to chart (oldest to newest).",
      ),
  }),
});

export const nyfedReferenceRateBarsMeta = defineFrameMeta({
  name: "nyfed-reference-rate-bars",
  // Stays in USD whatever the board asks for: US-macro: official NY Fed rates, published in USD.
  usdOnly: true,
  label: "NY Fed Rate Bars",
  category: "macro",
  iconUrl: widgetIcon("nyfed-reference-rate-bars"),
  layout: { w: 4, h: 3, minW: 3, minH: 2, maxH: 4 },
  description:
    "The six official New York Fed reference rates (effective fed funds, SOFR, tri-party and broad general collateral repo, overnight bank funding, and SOFR averages) as a horizontal bar chart — level or reported volume. The chart-first sibling of the Rates Board's NY Fed section. Keyless (NY Fed).",
  capabilities: ["reference-rates"],
  source: SOURCES.nyFed,
  schema: z.object({
    metric: z
      .enum(["rate", "volume"])
      .default("rate")
      .describe(
        '"rate" charts each reference rate\'s level (%); "volume" charts its reported trading volume in USD (SOFR averages report no volume and are skipped in this mode).',
      ),
    limit: z
      .number()
      .int()
      .min(2)
      .max(6)
      .default(6)
      .describe("How many of the six official reference rates to chart."),
  }),
});

export const nyfedSofrTermAveragesBarsMeta = defineFrameMeta({
  name: "nyfed-sofr-term-averages-bars",
  label: "SOFR Term Averages",
  category: "macro",
  iconUrl: widgetIcon("nyfed-sofr-term-averages-bars"),
  layout: { w: 3, h: 3, minW: 2, minH: 1 },
  description:
    "SOFR compounded average rates over the trailing 30, 90, and 180 days as a simple bar comparison — a quick read on where short-term secured funding costs have been trending. Keyless (NY Fed).",
  capabilities: ["reference-rates"],
  source: SOURCES.nyFed,
  schema: z.object({}),
});

export const nyfedFedFundsBandGaugeMeta = defineFrameMeta({
  name: "nyfed-fed-funds-band-gauge",
  label: "Fed Funds Band Gauge",
  category: "macro",
  iconUrl: widgetIcon("nyfed-fed-funds-band-gauge"),
  layout: { w: 3, h: 3, minW: 2, minH: 3, maxW: 4, maxH: 4 },
  description:
    "The effective fed funds rate as a radial gauge inside the FOMC's current target band — the arc fills from the band's lower bound to its upper bound, with the live EFFR reading in the center. Makes it visible at a glance whether the effective rate is trading near the top, bottom, or middle of the target range. Keyless (NY Fed).",
  capabilities: ["reference-rates"],
  source: SOURCES.nyFed,
  schema: z.object({}),
});

export const treasuryDebtCompositionAreaMeta = defineFrameMeta({
  name: "treasury-debt-composition-area",
  // Stays in USD whatever the board asks for: US-macro: the Treasury debt split as published.
  usdOnly: true,
  label: "Debt Composition",
  category: "macro",
  iconUrl: widgetIcon("treasury-debt-composition-area"),
  layout: { w: 6, h: 4, minW: 2, minH: 1 },
  description:
    "U.S. total public debt outstanding split into debt held by the public vs. intragovernmental holdings, as a stacked area chart over time — the two components that sum to the National Debt card's headline total. Keyless (U.S. Treasury).",
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
        "How many business days of history to load for the stacked area.",
      ),
  }),
});

export const ofrStressCategoryAreaMeta = defineFrameMeta({
  name: "ofr-stress-category-area",
  label: "FSI by Category",
  category: "macro",
  iconUrl: widgetIcon("ofr-stress-category-area"),
  layout: { w: 6, h: 5, minW: 2, minH: 1 },
  description:
    "The OFR Financial Stress Index decomposed into its five contributing categories (credit, equity valuation, safe assets, funding, volatility) as a stacked area chart over time — each category can be positive or negative and they sum to the overall index shown on the Financial Stress card. Keyless (OFR).",
  capabilities: ["financial-stress"],
  source: SOURCES.ofr,
  schema: z.object({
    trendDays: z
      .number()
      .int()
      .min(20)
      .max(90)
      .default(60)
      .describe("How many recent daily readings to plot in the stacked area."),
  }),
});

// ===== macro =====
export const miseryIndexMeta = defineFrameMeta({
  name: "misery-index",
  label: "Misery Index",
  category: "macro",
  iconUrl: widgetIcon("misery-index"),
  layout: { w: 6, h: 4, minW: 2, minH: 1 },
  description:
    "The classic 'Misery Index' — CPI year-over-year inflation stacked with the unemployment rate — as a two-series stacked area chart, month-aligned, plus the combined headline score. Monthly macro context for stock dashboards, not a live feed. Keyless (BLS).",
  capabilities: ["macro-series"],
  source: SOURCES.bls,
  schema: z.object({
    months: z
      .number()
      .int()
      .min(13)
      .max(36)
      .default(18)
      .describe("How many recent monthly observations to chart."),
  }),
});

export const realWagesMeta = defineFrameMeta({
  name: "real-wages",
  annotatable: true,
  label: "Real Wages",
  category: "macro",
  iconUrl: widgetIcon("real-wages"),
  layout: { w: 6, h: 3, minW: 1, minH: 1 },
  description:
    "Are paychecks outrunning inflation? A two-line chart comparing year-over-year average hourly earnings growth against year-over-year CPI inflation — when earnings run above CPI, real (inflation-adjusted) pay is rising. Monthly macro context, not a live feed. Keyless (BLS).",
  capabilities: ["macro-series"],
  source: SOURCES.bls,
  schema: z.object({
    months: z
      .number()
      .int()
      .min(13)
      .max(36)
      .default(18)
      .describe(
        "How many recent monthly year-over-year observations to chart.",
      ),
  }),
});

export const laborForceFlowMeta = defineFrameMeta({
  name: "labor-force-flow",
  annotatable: true,
  label: "Labor Force Flow",
  category: "macro",
  iconUrl: widgetIcon("labor-force-flow"),
  layout: { w: 6, h: 4, minW: 3, minH: 4, maxH: 5 },
  description:
    "The unemployment rate and the labor-force participation rate plotted together over time — a rising unemployment rate alongside a falling participation rate points to people leaving the workforce rather than finding jobs. Monthly macro context, not a live feed. Keyless (BLS).",
  capabilities: ["macro-series"],
  source: SOURCES.bls,
  schema: z.object({
    months: z
      .number()
      .int()
      .min(13)
      .max(36)
      .default(18)
      .describe("How many recent monthly observations to chart."),
  }),
});

export const payrollsBarsMeta = defineFrameMeta({
  name: "payrolls-bars",
  label: "Payrolls Bars",
  category: "macro",
  iconUrl: widgetIcon("payrolls-bars"),
  layout: { w: 6, h: 3, minW: 3, minH: 3, maxH: 4 },
  description:
    "Monthly nonfarm payrolls net change as a diverging bar chart — jobs added up in green, jobs cut down in red. The chart-first sibling of the Labor Market frame's headline figure. Monthly macro data, not a live feed. Keyless (BLS).",
  capabilities: ["macro-series"],
  source: SOURCES.bls,
  schema: z.object({
    months: z
      .number()
      .int()
      .min(6)
      .max(36)
      .default(18)
      .describe("How many recent months of net payroll change to chart."),
  }),
});

export const shortVolumeBarsMeta = defineFrameMeta({
  name: "short-volume-bars",
  label: "Short Volume Bars",
  category: "equities",
  iconUrl: widgetIcon("short-volume-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 2, maxH: 4 },
  description:
    "Daily reported short-sale volume for a watchlist of US-listed stocks, ranked highest-first as a horizontal bar chart — the chart-first sibling of the Short Volume list. IMPORTANT: this is reported short volume (sell-side short flow, including market-maker hedging), NOT short interest, and is not a directional signal on its own. Daily data published the next business day; not a live feed. US equities only. (FINRA).",
  capabilities: ["short-volume"],
  source: SOURCES.finra,
  schema: z.object({
    symbols: z
      .array(z.string())
      .min(1)
      .max(12)
      .describe(
        'US-listed stock tickers to rank, e.g. ["TSLA","NVDA","AAPL"]. HIP-3 symbols ("xyz:TSLA") work too — the dex prefix is stripped. Crypto has no SEC/FINRA short-volume and is ignored.',
      ),
  }),
});

export const capitalStructureBarsMeta = defineFrameMeta({
  name: "capital-structure-bars",
  // Stays in USD whatever the board asks for: SEC filing figures, shown as reported.
  usdOnly: true,
  label: "Capital Structure Bars",
  category: "equities",
  iconUrl: widgetIcon("capital-structure-bars"),
  layout: { w: 4, h: 3, minW: 2, minH: 1 },
  description:
    "One company's balance-sheet shape as a horizontal bar chart — total assets, shareholders' equity, and liabilities (derived as assets minus equity) — from SEC EDGAR XBRL company facts. Updates only when the company files (annual/quarterly), not a live feed. Requires the zframes runtime's data proxy (ships with `zframes serve` / `vite dev`); resolve by ticker (bundled top-500 map) or raw SEC CIK. (SEC EDGAR).",
  capabilities: ["fundamentals"],
  source: SOURCES.secEdgar,
  schema: z.object({
    symbol: z
      .string()
      .min(1)
      .describe(
        'Company to chart — a ticker ("AAPL", "NVDA"), a HIP-3 symbol ("xyz:NVDA"), or a raw SEC CIK ("320193"). Tickers outside the bundled top-500 map need a CIK.',
      ),
  }),
});

export const filingsMixMeta = defineFrameMeta({
  name: "filings-mix",
  label: "Filings Mix",
  category: "equities",
  iconUrl: widgetIcon("filings-mix"),
  layout: { w: 4, h: 4, minW: 3, minH: 3, maxW: 4, maxH: 5 },
  description:
    "What kind of paper is one company actually filing? A donut of recent SEC EDGAR filings bucketed into periodic & material reports (10-K, 10-Q, 8-K, registrations, proxies, activist stakes…), insider ownership forms (3/4/5/144), and everything else — the chart-first sibling of the Filings Feed. Official data from SEC's free, CORS-safe submissions endpoint; event-driven, not a price feed. Resolve by ticker (bundled top-500 map) or raw SEC CIK. (SEC EDGAR).",
  capabilities: ["filings"],
  source: SOURCES.secEdgar,
  schema: z.object({
    symbol: z
      .string()
      .min(1)
      .describe(
        'Company to show filing mix for — a ticker ("AAPL", "NVDA"), a HIP-3 symbol ("xyz:TSLA"), or a raw SEC CIK ("320193"). Tickers outside the bundled top-500 map need a CIK.',
      ),
  }),
});

// ===== mixed =====
export const fxCrossHeatmapMeta = defineFrameMeta({
  name: "fx-cross-heatmap",
  label: "FX Cross Heatmap",
  category: "macro",
  iconUrl: widgetIcon("fx-cross-heatmap"),
  layout: { w: 6, h: 4, minW: 4, minH: 2 },
  description:
    "A full currency × currency cross-rate matrix as a heatmap — each cell is the day-over-day % change of that specific cross, derived from every listed currency's rate vs a common pivot, green up / red down. Spots which cross is moving hardest across an entire currency set, not just one pair at a time. Keyless (Frankfurter/ECB).",
  capabilities: ["fx-rates"],
  source: SOURCES.frankfurter,
  schema: z.object({
    symbols: z
      .array(z.string().length(3))
      .min(3)
      .max(8)
      .default(["USD", "EUR", "GBP", "JPY", "CHF", "CAD"])
      .describe(
        'Currencies (ISO 4217 codes) forming both axes of the matrix, e.g. ["USD","EUR","GBP","JPY"]. At least 3, so the grid shows more than one cross.',
      ),
  }),
});

export const etfIssuerTreemapMeta = defineFrameMeta({
  name: "etf-issuer-treemap",
  label: "ETF Issuer Treemap",
  category: "crypto",
  iconUrl: widgetIcon("etf-issuer-treemap"),
  layout: { w: 5, h: 4, minW: 2, minH: 3 },
  description:
    "Spot BTC or ETH ETF issuers as a treemap — tile size by assets under management, tint green/red by that issuer's net flow today. Shows who holds the most AND who's gathering or losing assets right now, in one view. Best-effort; may be empty if the source is unavailable. Keyless (SoSoValue).",
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
      .default(10)
      .describe("How many issuers (by AUM) to show in the treemap."),
  }),
});

export const fxTrendChartMeta = defineFrameMeta({
  name: "fx-trend-chart",
  annotatable: true,
  label: "FX Trend Chart",
  category: "macro",
  iconUrl: widgetIcon("fx-trend-chart"),
  layout: { w: 6, h: 3, minW: 5, minH: 3, maxH: 5 },
  description:
    "Several currencies' recent trend vs a base, each indexed to 0% at the start of the window so wildly different-magnitude pairs (JPY vs CHF) compare cleanly on one chart. The multi-line sibling of the FX Board. Keyless (Frankfurter/ECB).",
  capabilities: ["fx-rates"],
  source: SOURCES.frankfurter,
  schema: z.object({
    base: z
      .string()
      .length(3)
      .default("USD")
      .describe(
        'Base currency (ISO 4217 code) each line is quoted against, e.g. "USD".',
      ),
    symbols: z
      .array(z.string().length(3))
      .min(1)
      .max(8)
      .default(["EUR", "GBP", "JPY", "CHF"])
      .describe(
        'Currencies to chart (ISO 4217 codes), e.g. ["EUR","GBP","JPY"]. A code equal to the base is skipped.',
      ),
  }),
});

export const fearGreedChartMeta = defineFrameMeta({
  name: "fear-greed-chart",
  annotatable: true,
  label: "Fear & Greed Chart",
  category: "sentiment",
  iconUrl: widgetIcon("fear-greed-chart"),
  layout: { w: 6, h: 3, minW: 3, minH: 3, maxH: 5 },
  description:
    "Crypto Fear & Greed index over time as a line chart — the mood swing from extreme fear to extreme greed across a wide window, the line tinted by the latest reading. The chart-first sibling of the Fear & Greed card. Keyless (alternative.me).",
  capabilities: ["sentiment"],
  source: SOURCES.alternativeMe,
  schema: z.object({
    days: z
      .number()
      .int()
      .min(30)
      .max(365)
      .default(180)
      .describe("How many days of index history to chart."),
  }),
});

export const sentimentCalendarMeta = defineFrameMeta({
  name: "sentiment-calendar",
  label: "Sentiment Calendar",
  category: "sentiment",
  iconUrl: widgetIcon("sentiment-calendar"),
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "The Fear & Greed index as a calendar heatmap — one square per day, red below the neutral 50 and green above, so a year of market mood reads as blocks of regime rather than a wandering line. Shows what the line chart makes hard: how long fear actually persisted, and whether greed arrived gradually or overnight. Intensity is ranked within the window, so the calmest and most extreme days in view are always distinguishable. Keyless (alternative.me).",
  capabilities: ["sentiment"],
  source: SOURCES.alternativeMe,
  schema: z.object({
    days: z
      .number()
      .int()
      .min(60)
      .max(730)
      .default(270)
      .describe(
        "How many days of index history the grid covers. Beyond ~400 the squares get small in a narrow card.",
      ),
    weekStart: z
      .enum(["sunday", "monday"])
      .default("sunday")
      .describe(
        "Which weekday is the top row. The index prints every day including weekends, so neither leaves a gap.",
      ),
  }),
});

export const predictionMarketBarsMeta = defineFrameMeta({
  name: "prediction-market-bars",
  label: "Prediction Market Bars",
  category: "sentiment",
  iconUrl: widgetIcon("prediction-market-bars"),
  layout: { w: 5, h: 5, minW: 3, minH: 3, maxH: 5 },
  description:
    "Live Polymarket odds as a horizontal bar chart — the highest-volume open prediction markets ranked by trailing-24h volume. The chart-first sibling of the Prediction Markets list. Keyless (Polymarket).",
  capabilities: ["prediction-markets"],
  source: SOURCES.polymarket,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(15)
      .default(8)
      .describe("How many markets (by volume) to chart."),
  }),
});

export const dxyChartMeta = defineFrameMeta({
  name: "dxy-chart",
  annotatable: true,
  label: "Dollar Index Chart",
  category: "macro",
  iconUrl: widgetIcon("dxy-chart"),
  layout: { w: 6, h: 3, minW: 4, minH: 3, maxH: 5 },
  description:
    "US Dollar Index (DXY) as a line chart over time — the dollar's trend vs a basket of six major currencies, tinted green/red by its own direction. The chart-first sibling of the Dollar Index card. Keyless (Frankfurter/ECB).",
  capabilities: ["dollar-index"],
  source: SOURCES.frankfurter,
  schema: z.object({}),
});

export const fxMoversBarsMeta = defineFrameMeta({
  name: "fx-movers-bars",
  label: "FX Movers Bars",
  category: "macro",
  iconUrl: widgetIcon("fx-movers-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 3, maxH: 4 },
  description:
    "A currency set's day-over-day % change vs a base as a diverging bar chart — strengthening currencies right in green, weakening left in red, ranked by move. The chart-first sibling of the FX Board. Keyless (Frankfurter/ECB).",
  capabilities: ["fx-rates"],
  source: SOURCES.frankfurter,
  schema: z.object({
    base: z
      .string()
      .length(3)
      .default("USD")
      .describe(
        'Base currency (ISO 4217 code) each bar is quoted against, e.g. "USD".',
      ),
    symbols: z
      .array(z.string().length(3))
      .min(1)
      .max(12)
      .default(["EUR", "GBP", "JPY", "CHF", "CAD", "AUD"])
      .describe(
        'Currencies to chart (ISO 4217 codes), e.g. ["EUR","GBP","JPY"]. A code equal to the base is skipped.',
      ),
  }),
});

export const predictionMarketScatterMeta = defineFrameMeta({
  name: "prediction-market-scatter",
  label: "Prediction Market Scatter",
  category: "sentiment",
  iconUrl: widgetIcon("prediction-market-scatter"),
  layout: { w: 6, h: 4, minW: 3, minH: 3, maxH: 5 },
  description:
    "Live Polymarket odds as a bubble scatter — each market's top-outcome probability on the x-axis, trailing-24h volume on a log y-axis, bubble size by volume. Surfaces high-conviction, high-volume markets versus thin long shots. The chart-first sibling of the Prediction Markets list. Keyless (Polymarket).",
  capabilities: ["prediction-markets"],
  source: SOURCES.polymarket,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(5)
      .max(30)
      .default(15)
      .describe("How many markets (by volume) to plot."),
  }),
});

export const etfIssuerBarsMeta = defineFrameMeta({
  name: "etf-issuer-bars",
  label: "ETF Issuer Bars",
  category: "crypto",
  iconUrl: widgetIcon("etf-issuer-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 2, maxH: 4 },
  description:
    "Spot BTC or ETH ETF issuers' daily net flow as a diverging bar chart — inflows right in green, outflows left in red, ranked by size. The chart-first sibling of the Spot ETF Flows list. Best-effort; may be empty if the source is unavailable. Keyless (SoSoValue).",
  capabilities: ["etf-flows"],
  source: SOURCES.sosovalue,
  schema: z.object({
    asset: z
      .enum(["btc", "eth"])
      .default("btc")
      .describe("Which spot-ETF complex to chart."),
    limit: z
      .number()
      .int()
      .min(3)
      .max(15)
      .default(10)
      .describe("How many issuers (by |net flow|) to chart."),
  }),
});

// ===== port =====
export const portfolioMoversMeta = defineFrameMeta({
  name: "portfolio-movers",
  label: "Portfolio Movers",
  category: "portfolio",
  iconUrl: widgetIcon("portfolio-movers"),
  layout: { w: 4, h: 5, minW: 2, minH: 3, maxH: 5 },
  description:
    "Your connected portfolio's holdings as a diverging bar chart of 24h price change — gainers right in green, losers left in red. Source is a connected Binance account (read-only key, in-app) or a public on-chain wallet address. Only holdings the source reports a 24h change for are shown — currently that's on-chain wallet holdings (priced via CoinGecko); a Binance-only portfolio will show its empty state until the account layer adds a price-change feed. Renders a connect prompt until a source is set.",
  capabilities: ["portfolio"],
  account: true,
  schema: z.object({
    ...portfolioConfigShape,
    limit: z
      .number()
      .int()
      .min(4)
      .max(30)
      .default(15)
      .describe("How many holdings (by absolute 24h change) to chart."),
  }),
});

export const portfolioValueBarsMeta = defineFrameMeta({
  name: "portfolio-value-bars",
  label: "Portfolio Value Bars",
  category: "portfolio",
  iconUrl: widgetIcon("portfolio-value-bars"),
  layout: { w: 4, h: 5, minW: 2, minH: 3, maxH: 5 },
  description:
    "Your connected portfolio's positions as a horizontal bar chart ranked by live USD value, largest first. The chart-first sibling of the Portfolio Holdings table. Source is a connected Binance account (read-only key, in-app) or a public on-chain wallet address. Renders a connect prompt until a source is set.",
  capabilities: ["portfolio", "quote-stream"],
  account: true,
  schema: z.object({
    ...portfolioConfigShape,
    limit: z
      .number()
      .int()
      .min(3)
      .max(25)
      .default(12)
      .describe("How many holdings (by USD value, descending) to chart."),
  }),
});

export const etfFlowCalendarMeta = defineFrameMeta({
  name: "etf-flow-calendar",
  label: "ETF Flow Calendar",
  category: "crypto",
  iconUrl: widgetIcon("etf-flow-calendar"),
  layout: { w: 6, h: 5, minW: 3, minH: 3 },
  description:
    "Spot BTC or ETH ETF daily net flows as a GitHub-style calendar heatmap — one square per day, weeks running left to right, green for inflow days and red for outflow days (intensity ranked within the window, so one record day can't wash out the rest). Surfaces the weekly inflow/outflow rhythm the daily bar chart doesn't show at a glance, and the market holidays where there is simply no print. Keyless (SoSoValue); best-effort, may be empty if the source is unavailable.",
  capabilities: ["etf-flows"],
  source: SOURCES.sosovalue,
  schema: z.object({
    asset: z
      .enum(["btc", "eth"])
      .default("btc")
      .describe("Which spot-ETF complex to chart."),
    lookback: z
      .enum(["1M", "3M", "6M", "1Y"])
      .default("3M")
      .describe("History window for the calendar grid."),
  }),
});

export const predictionMarketsBubbleMeta = defineFrameMeta({
  name: "prediction-markets-bubble",
  label: "Prediction Markets Bubbles",
  category: "sentiment",
  iconUrl: widgetIcon("prediction-markets-bubble"),
  layout: { w: 6, h: 5, minW: 4, minH: 2 },
  description:
    "Live Polymarket odds as a floating bubble cloud — one bubble per open market, sized by 24h volume, tinted by how confident the leading outcome is (muted near a toss-up, vivid green near certain). The chart-first sibling of the Prediction Markets list. Keyless (Polymarket Gamma API).",
  capabilities: ["prediction-markets"],
  source: SOURCES.polymarket,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(20)
      .default(10)
      .describe("How many markets (by volume) to show."),
  }),
});

// ── Metals ──────────────────────────────────────────────────────────────
// Every metals frame speaks the same two vocabularies, so they're declared once
// here: the spot universe (what gold-api quotes) and the subset the LBMA
// publishes a daily London fix for (copper has no fix, so history/ratio frames
// can't offer it).
const METAL_SYMBOLS = ["XAU", "XAG", "XPT", "XPD", "HG"] as const;
const FIXED_METALS = ["XAU", "XAG", "XPT", "XPD"] as const;
const METAL_NAMES =
  "XAU gold, XAG silver, XPT platinum, XPD palladium, HG copper (copper is quoted per pound; the rest per troy ounce)";
const FIXED_METAL_NAMES =
  "XAU gold, XAG silver, XPT platinum, XPD palladium. Gold and silver go back to 1968, platinum and palladium to 1990.";

/** Years of fix history a chart frame reads — shared bounds and wording. */
const yearsField = (dflt: number, describe: string) =>
  z.number().int().min(1).max(58).default(dflt).describe(describe);

export const metalsBoardMeta = defineFrameMeta({
  name: "metals-board",
  label: "Metals Board",
  category: "metals",
  iconUrl: widgetIcon("metals-board"),
  layout: { w: 3, h: 4, minW: 2, minH: 2 },
  description:
    "Live spot board for the metals complex — gold, silver, platinum, palladium and copper — each with its current price and its move against the most recent London fix. Keyless spot quotes; the metals equivalent of a crypto ticker list.",
  capabilities: ["metal-spot"],
  source: SOURCES.goldApi,
  schema: z.object({
    symbols: z
      .array(z.enum(METAL_SYMBOLS))
      .min(1)
      .max(5)
      .default([...METAL_SYMBOLS])
      .describe(`Metals to list, in display order. ${METAL_NAMES}.`),
    showChange: z
      .boolean()
      .default(true)
      .describe(
        "Show each metal's percent move against the latest London fix. The change appears once the fix history has loaded (a few seconds after first paint).",
      ),
  }),
});

export const metalPriceMeta = defineFrameMeta({
  name: "metal-price",
  label: "Metal Price",
  category: "metals",
  iconUrl: widgetIcon("metal-price"),
  layout: { w: 3, h: 2, minW: 2, minH: 2, maxW: 3, maxH: 2 },
  description:
    "One metal's live spot price as a headline number, in the weight unit you pick (troy ounce, gram, kilogram or tola). The single-asset hero card for a gold or silver dashboard.",
  capabilities: ["metal-spot"],
  source: SOURCES.goldApi,
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(`Metal to price. ${METAL_NAMES}.`),
    unit: z
      .enum(["ounce", "gram", "kilogram", "tola"])
      .default("ounce")
      .describe(
        "Weight unit the headline price is quoted in. Troy ounce is the market convention; gram and kilogram suit retail bullion, tola is the South Asian bar unit (11.6638 g). Ignored for copper, which quotes per pound.",
      ),
    showFix: z
      .boolean()
      .default(true)
      .describe(
        "Show the latest London fix underneath as the reference the change is measured from.",
      ),
  }),
});

export const metalValueMeta = defineFrameMeta({
  name: "metal-value",
  label: "Metal Holding Value",
  category: "metals",
  iconUrl: widgetIcon("metal-value"),
  layout: { w: 3, h: 2, minW: 2, minH: 2, maxW: 3, maxH: 2 },
  description:
    "What a physical holding is worth right now: a weight you own, multiplied by live spot. Set the weight and unit once and the card revalues itself as the metal moves.",
  capabilities: ["metal-spot"],
  source: SOURCES.goldApi,
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(`Metal held. ${METAL_NAMES}.`),
    weight: z
      .number()
      .positive()
      .default(1)
      .describe("How much of the metal is held, in `unit`."),
    unit: z
      .enum(["ounce", "gram", "kilogram", "tola"])
      .default("ounce")
      .describe(
        "Unit the weight is expressed in — troy ounce, gram, kilogram, or tola (11.6638 g).",
      ),
  }),
});

export const metalPriceChartMeta = defineFrameMeta({
  name: "metal-price-chart",
  annotatable: true,
  label: "Metal Price Chart",
  category: "metals",
  iconUrl: widgetIcon("metal-price-chart"),
  layout: { w: 6, h: 4, minW: 4, minH: 4, maxH: 5 },
  description:
    "Daily London fix history for one or more metals — the benchmark price the physical market settles against, published by the LBMA and running back to 1968 for gold and silver. Set the window in years and switch to a log axis for multi-decade views.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbols: z
      .array(z.enum(FIXED_METALS))
      .min(1)
      .max(4)
      .default(["XAU"])
      .describe(`Metals to chart. ${FIXED_METAL_NAMES}`),
    currency: z
      .enum(["USD", "GBP", "EUR"])
      .default("USD")
      .describe(
        "Which published fix SERIES to read — the LBMA fixes each metal in all three, and they are separate prints, not conversions of one another (EUR only exists from 1999). This is a data choice, not a display one: to change what the card renders money in, set the frame instance's own `currency` (sibling of `config`) or the dashboard's. A USD fix follows that display currency; a GBP/EUR fix is shown as published.",
      ),
    years: yearsField(5, "How many years of daily fixes to chart."),
    logScale: z
      .boolean()
      .default(false)
      .describe(
        "Use a logarithmic price axis — the honest way to read a multi-decade series, where a move from $35 to $350 is the same tenfold step as $350 to $3,500.",
      ),
  }),
});

export const metalDrawdownMeta = defineFrameMeta({
  name: "metal-drawdown",
  annotatable: true,
  label: "Metal Drawdown",
  category: "metals",
  iconUrl: widgetIcon("metal-drawdown"),
  layout: { w: 5, h: 4, minW: 3, minH: 4, maxH: 5 },
  description:
    "How far a metal sits below its running all-time high, charted through history. Gold's decades-long post-1980 underwater stretch is the clearest picture of what a real bear market in bullion looks like.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal to chart. ${FIXED_METAL_NAMES}`),
    years: yearsField(20, "How many years of drawdown history to chart."),
  }),
});

export const metalAnnualReturnsMeta = defineFrameMeta({
  name: "metal-annual-returns",
  label: "Metal Annual Returns",
  category: "metals",
  iconUrl: widgetIcon("metal-annual-returns"),
  layout: { w: 6, h: 4, minW: 6, minH: 3, maxH: 4 },
  description:
    "Calendar-year percent return per year as diverging bars — green up years, red down years — from the LBMA fix history. The at-a-glance record of how often, and how hard, a metal actually delivers.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal to chart. ${FIXED_METAL_NAMES}`),
    years: z
      .number()
      .int()
      .min(3)
      .max(58)
      .default(15)
      .describe(
        "How many calendar years of returns to show, most recent last.",
      ),
  }),
});

export const metalSeasonalityMeta = defineFrameMeta({
  name: "metal-seasonality",
  label: "Metal Seasonality",
  category: "metals",
  iconUrl: widgetIcon("metal-seasonality"),
  layout: { w: 6, h: 4, minW: 6, minH: 3 },
  description:
    "Month-by-year heatmap of monthly percent returns, with each month's long-run average underneath — the standard way to look for seasonal patterns in gold and silver without eyeballing a price chart.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal to analyse. ${FIXED_METAL_NAMES}`),
    years: z
      .number()
      .int()
      .min(5)
      .max(58)
      .default(20)
      .describe("How many years of monthly returns to include in the grid."),
  }),
});

export const metalVolatilityMeta = defineFrameMeta({
  name: "metal-volatility",
  annotatable: true,
  label: "Metal Volatility",
  category: "metals",
  iconUrl: widgetIcon("metal-volatility"),
  layout: { w: 5, h: 4, minW: 3, minH: 3, maxH: 5 },
  description:
    "Rolling annualised realised volatility from daily fixes — how violent the metal has actually been, not what options imply. Quiet gold sits near 10%; a crisis takes it past 30%.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal to analyse. ${FIXED_METAL_NAMES}`),
    window: z
      .number()
      .int()
      .min(20)
      .max(365)
      .default(90)
      .describe(
        "Rolling window in trading days. 30 is twitchy, 90 is the common standard, 252 is a year.",
      ),
    years: yearsField(10, "How many years of the volatility series to chart."),
  }),
});

export const goldSilverRatioMeta = defineFrameMeta({
  name: "gold-silver-ratio",
  label: "Gold/Silver Ratio",
  category: "metals",
  iconUrl: widgetIcon("gold-silver-ratio"),
  layout: { w: 4, h: 3, minW: 3, minH: 3, maxH: 4 },
  description:
    "How many ounces of silver one ounce of gold buys — the oldest relative-value gauge in metals. Shows the live ratio, where it sits in its own historical range, and the trend.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    years: yearsField(
      20,
      "How many years of ratio history to chart and rank against.",
    ),
    showPercentile: z
      .boolean()
      .default(true)
      .describe(
        "Show where today's ratio ranks within the charted window — 100% means silver has never been cheaper against gold over that span.",
      ),
  }),
});

export const metalRatioChartMeta = defineFrameMeta({
  name: "metal-ratio-chart",
  annotatable: true,
  label: "Metal Ratio Chart",
  category: "metals",
  iconUrl: widgetIcon("metal-ratio-chart"),
  layout: { w: 5, h: 4, minW: 3, minH: 3, maxH: 5 },
  description:
    "The price of any metal divided by any other, charted over time — gold/silver, gold/platinum, platinum/palladium. Relative value between two metals, free of the dollar's own trend.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    numerator: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal on top of the ratio. ${FIXED_METAL_NAMES}`),
    denominator: z
      .enum(FIXED_METALS)
      .default("XAG")
      .describe(
        "Metal on the bottom of the ratio. Must differ from the numerator.",
      ),
    years: yearsField(20, "How many years of ratio history to chart."),
  }),
});

export const metalCompareChartMeta = defineFrameMeta({
  name: "metal-compare-chart",
  annotatable: true,
  label: "Metal Compare",
  category: "metals",
  iconUrl: widgetIcon("metal-compare-chart"),
  layout: { w: 6, h: 4, minW: 5, minH: 4, maxH: 5 },
  description:
    "Several metals rebased to 0% at the start of the window so a $4,000 gold and a $58 silver compare on one axis. The relative-performance race across the complex.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbols: z
      .array(z.enum(FIXED_METALS))
      .min(2)
      .max(4)
      .default([...FIXED_METALS])
      .describe(`Metals to race against each other. ${FIXED_METAL_NAMES}`),
    years: yearsField(10, "How many years the race runs over."),
  }),
});

export const metalPerformanceMeta = defineFrameMeta({
  name: "metal-performance",
  label: "Metal Performance",
  category: "metals",
  iconUrl: widgetIcon("metal-performance"),
  layout: { w: 4, h: 4, minW: 3, minH: 3, maxH: 4 },
  description:
    "One metal's return across standard horizons — 1M, 3M, 6M, YTD, 1Y, 5Y, 10Y, 20Y — as diverging bars. Switch to annualised to compare long horizons honestly instead of letting a 20-year number dwarf everything.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal to measure. ${FIXED_METAL_NAMES}`),
    mode: z
      .enum(["cumulative", "annualized"])
      .default("cumulative")
      .describe(
        "cumulative = total return over each horizon; annualized = the compound annual rate, which makes long and short horizons comparable.",
      ),
  }),
});

export const metalAthMeta = defineFrameMeta({
  name: "metal-ath",
  label: "Metal ATH Watch",
  category: "metals",
  iconUrl: widgetIcon("metal-ath"),
  layout: { w: 3, h: 3, minW: 2, minH: 3, maxH: 4 },
  description:
    "All-time-high watch from the full fix history: the record price and when it was set, how far below it the metal trades now, and how long it has been since the last record.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal to watch. ${FIXED_METAL_NAMES}`),
  }),
});

export const metalFixTableMeta = defineFrameMeta({
  name: "metal-fix-table",
  label: "London Fix Table",
  category: "metals",
  iconUrl: widgetIcon("metal-fix-table"),
  layout: { w: 3, h: 4, minW: 3, minH: 2, maxH: 7 },
  description:
    "The most recent daily London fixes as a table — date, fix price and the day-over-day change. The settlement prints themselves, for anyone who prices contracts off the fix rather than off spot.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal whose fixes to list. ${FIXED_METAL_NAMES}`),
    currency: z
      .enum(["USD", "GBP", "EUR"])
      .default("USD")
      .describe(
        "Which published fix SERIES to list — the LBMA publishes all three as separate prints, not conversions of one another. This is a data choice, not a display one: to change what the card renders money in, set the frame instance's own `currency` (sibling of `config`) or the dashboard's. A USD fix follows that display currency; a GBP/EUR fix is shown as published.",
      ),
    rows: z
      .number()
      .int()
      .min(5)
      .max(40)
      .default(12)
      .describe("How many recent fixes to list, newest first."),
  }),
});

export const metalMilestonesMeta = defineFrameMeta({
  name: "metal-milestones",
  label: "Metal Milestones",
  category: "metals",
  iconUrl: widgetIcon("metal-milestones"),
  layout: { w: 3, h: 4, minW: 2, minH: 2 },
  description:
    "When the metal first crossed each round-number price — $100, $500, $1,000, $2,000 — and how long each leg took. A timeline only decades of fix history can tell, and the most human way to read gold's long climb.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal whose milestones to list. ${FIXED_METAL_NAMES}`),
    newestFirst: z
      .boolean()
      .default(true)
      .describe(
        "List the most recent milestone at the top. Turn off to read the climb chronologically from 1968.",
      ),
  }),
});

export const metalReturnDistributionMeta = defineFrameMeta({
  name: "metal-return-distribution",
  label: "Return Distribution",
  category: "metals",
  iconUrl: widgetIcon("metal-return-distribution"),
  layout: { w: 5, h: 4, minW: 3, minH: 3, maxH: 4 },
  description:
    "Histogram of the metal's periodic returns over decades, with the mean marked — how fat the tails really are, rather than the tidy bell curve risk models assume.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal to analyse. ${FIXED_METAL_NAMES}`),
    period: z
      .enum(["daily", "monthly"])
      .default("monthly")
      .describe(
        "Bucket returns by trading day or by calendar month. Monthly is smoother and easier to read; daily exposes the tails.",
      ),
    years: yearsField(30, "How many years of returns to bucket."),
  }),
});

export const metalsCorrelationMeta = defineFrameMeta({
  name: "metals-correlation",
  label: "Metals Correlation",
  category: "metals",
  iconUrl: widgetIcon("metals-correlation"),
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
  description:
    "Correlation matrix of daily returns across gold, silver, platinum and palladium over a chosen window — which metals actually move together, and which only look like they do.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    years: yearsField(
      3,
      "Window, in years, the correlations are measured over.",
    ),
  }),
});

export const metalRatioPercentileMeta = defineFrameMeta({
  name: "metal-ratio-percentile",
  label: "Metal Ratio Percentile",
  category: "metals",
  iconUrl: widgetIcon("metal-ratio-percentile"),
  layout: { w: 5, h: 5, minW: 3, minH: 3, maxH: 5 },
  description:
    "Where one metal's price against another sits in its OWN history: the live ratio as the headline, its percentile inside the chosen window, and a histogram of every daily fix in that window with today marked. The question a ratio line chart can't answer — an 84 gold/silver only means something next to the distribution it came from. Also reports the window's low, median and high.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    numerator: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(
        `Metal on top of the ratio — the leg that is expensive when the ratio is high. ${FIXED_METAL_NAMES}`,
      ),
    denominator: z
      .enum(FIXED_METALS)
      .default("XAG")
      .describe(
        "Metal on the bottom of the ratio, and the cheap leg when the ratio is high. Must differ from the numerator — a same-metal pair renders an instruction to change it rather than a flat 1.0.",
      ),
    years: yearsField(
      20,
      "Window the distribution is built from and the percentile is ranked inside. 5 asks 'extreme for this cycle', 58 asks 'extreme ever' — though 58 only exists for gold and silver, since the platinum and palladium fixes start in 1990 and a pair including one of them is capped by the overlap.",
    ),
  }),
});

export const metalRollingCorrelationMeta = defineFrameMeta({
  name: "metal-rolling-correlation",
  annotatable: true,
  label: "Metal Rolling Correlation",
  category: "metals",
  iconUrl: widgetIcon("metal-rolling-correlation"),
  layout: { w: 5, h: 4, minW: 3, minH: 4, maxH: 5 },
  description:
    "Rolling correlation of two metals' daily log returns, charted through time — whether silver is still tracking gold, or the relationship has broken. The regime view the static correlation matrix can't give, since that reports one number for one window. Switch the metric to beta to read how much the quote leg amplifies or damps the base's moves instead.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    base: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(
        `The reference leg. Correlation is symmetric so the order doesn't matter for it, but beta is measured TO this metal — a 1% move in it is the unit. ${FIXED_METAL_NAMES}`,
      ),
    quote: z
      .enum(FIXED_METALS)
      .default("XAG")
      .describe(
        "The metal measured against the base; under the beta metric it is the responding leg, so the reading is its sensitivity to a 1% base move. Must differ from the base — a metal against itself correlates 1.00 forever.",
      ),
    metric: z
      .enum(["correlation", "beta"])
      .default("correlation")
      .describe(
        "correlation = how tightly the two move together, -1 to +1, on a fixed axis so cards are comparable; beta = how FAR the quote moves per 1% of base move (1.00 is one-for-one, 1.40 means it amplifies by 40%). Correlation answers 'is the link intact', beta answers 'how much leverage does it give'.",
      ),
    window: z
      .number()
      .int()
      .min(20)
      .max(365)
      .default(90)
      .describe(
        "Rolling window in trading days. 30 is twitchy and catches a break early, 90 is the common standard, 252 is a year and only shows structural regime change.",
      ),
    years: yearsField(
      10,
      "How many years of the rolling series to chart. The window's warm-up is taken from history before this span, so the line starts filled rather than climbing out of nothing.",
    ),
  }),
});

export const btcInGoldMeta = defineFrameMeta({
  name: "btc-in-gold",
  annotatable: true,
  label: "BTC in Gold",
  category: "metals",
  iconUrl: widgetIcon("btc-in-gold"),
  layout: { w: 5, h: 4, minW: 3, minH: 4, maxH: 5 },
  description:
    "Bitcoin priced in ounces of gold instead of dollars — how many ounces one BTC buys, charted over time. The clean way to ask whether Bitcoin is beating the oldest hard asset or just the dollar.",
  capabilities: ["metal-history", "price-history-daily"],
  source: SOURCES.lbma,
  schema: z.object({
    years: yearsField(
      10,
      "How many years of the BTC-in-ounces ratio to chart.",
    ),
    logScale: z
      .boolean()
      .default(true)
      .describe(
        "Use a logarithmic axis — the ratio has spanned four orders of magnitude, so linear hides everything before the last cycle.",
      ),
  }),
});

export const metalCotNetMeta = defineFrameMeta({
  name: "metal-cot-net",
  annotatable: true,
  label: "COT Net Positioning",
  category: "metals",
  iconUrl: widgetIcon("metal-cot-net"),
  layout: { w: 5, h: 4, minW: 3, minH: 4, maxH: 6 },
  description:
    "Net speculative positioning from the CFTC's weekly Commitments of Traders — non-commercial longs minus shorts, against a zero line. Crowded longs have marked local tops in gold for decades.",
  capabilities: ["metal-positioning"],
  source: SOURCES.cftc,
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(`Metal futures market to read. ${METAL_NAMES}.`),
    years: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe("How many years of weekly reports to chart."),
    showOpenInterest: z
      .boolean()
      .default(false)
      .describe(
        "Overlay total open interest so a change in net positioning can be read against whether the whole market grew or shrank.",
      ),
  }),
});

export const metalCotBreakdownMeta = defineFrameMeta({
  name: "metal-cot-breakdown",
  label: "COT Trader Breakdown",
  category: "metals",
  iconUrl: widgetIcon("metal-cot-breakdown"),
  layout: { w: 4, h: 4, minW: 3, minH: 4 },
  description:
    "The latest COT week split by trader class — non-commercial speculators, commercial hedgers and small traders — as opposing long and short bars, plus each group's net and its week-over-week change.",
  capabilities: ["metal-positioning"],
  source: SOURCES.cftc,
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(`Metal futures market to read. ${METAL_NAMES}.`),
  }),
});

export const metalCotGaugeMeta = defineFrameMeta({
  name: "metal-cot-gauge",
  label: "COT Positioning Gauge",
  category: "metals",
  iconUrl: widgetIcon("metal-cot-gauge"),
  layout: { w: 3, h: 3, minW: 2, minH: 3, maxW: 5, maxH: 5 },
  description:
    "Where speculative net positioning sits inside its own historical range, as a dial from washed-out short to crowded long — a contrarian sentiment gauge built from the CFTC's own weekly numbers.",
  capabilities: ["metal-positioning"],
  source: SOURCES.cftc,
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(`Metal futures market to read. ${METAL_NAMES}.`),
    years: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe("Lookback the percentile is ranked against, in years."),
  }),
});

export const metalOpenInterestMeta = defineFrameMeta({
  name: "metal-open-interest",
  annotatable: true,
  label: "Futures Open Interest",
  category: "metals",
  iconUrl: widgetIcon("metal-open-interest"),
  layout: { w: 5, h: 4, minW: 3, minH: 4, maxH: 5 },
  description:
    "Total open interest in the metal's US futures contract, weekly from the CFTC — in contracts, in ounces, or in dollar notional at today's spot. How much paper claim sits on top of the physical market.",
  capabilities: ["metal-positioning", "metal-spot"],
  source: SOURCES.cftc,
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(`Metal futures market to read. ${METAL_NAMES}.`),
    years: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe("How many years of weekly open interest to chart."),
    unit: z
      .enum(["contracts", "ounces", "notional"])
      .default("contracts")
      .describe(
        "contracts = as CFTC reports it; ounces = contracts × contract size; notional = ounces × live spot (needs a spot quote).",
      ),
  }),
});

export const metalRealPriceMeta = defineFrameMeta({
  name: "metal-real-price",
  annotatable: true,
  label: "Real Price",
  category: "metals",
  iconUrl: widgetIcon("metal-real-price"),
  layout: { w: 6, h: 4, minW: 3, minH: 4, maxH: 6 },
  description:
    "The daily London fix deflated by US CPI into TODAY's dollars, drawn beside the price as published. A commodity has no earnings, so its inflation-adjusted price IS its valuation history — this is the card that answers whether a nominal record is a real record, and gold's January 1980 peak restated in today's money is the reference every all-time-high headline leaves out. The headline names the real record and how far below it the metal sits. Always reads the USD fix series (US CPI can only deflate dollars), and carries each monthly CPI print forward across its days rather than interpolating one.",
  capabilities: ["metal-history", "macro-reference-series"],
  source: [SOURCES.lbma, SOURCES.fred],
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal to deflate. ${FIXED_METAL_NAMES}`),
    years: yearsField(
      58,
      "How many years of the two lines to chart. The real all-time high in the headline is always measured over the FULL history whatever this says, so a short window still names the real record rather than the window's own high.",
    ),
    showNominal: z
      .boolean()
      .default(true)
      .describe(
        "Also draw the price exactly as published, unadjusted. The gap between the two lines IS the inflation, so turning this off leaves a real-terms line with nothing to read it against.",
      ),
  }),
});

export const metalVsMacroMeta = defineFrameMeta({
  name: "metal-vs-macro",
  annotatable: true,
  label: "Metal vs Macro",
  category: "metals",
  iconUrl: widgetIcon("metal-vs-macro"),
  layout: { w: 6, h: 4, minW: 3, minH: 4, maxH: 5 },
  description:
    "A metal against the macro variable it is supposed to answer to — the 10-year real yield, the broad dollar, or the inflation breakeven — plus the trailing correlation of their daily CHANGES, which is the number that says whether the textbook relationship still holds (levels would correlate near ±1 for any two trending series and say nothing). The chart layer has a single y-axis and the legs are in different units, so each is scaled to its own window range (0 = window low, 100 = window high) while the header keeps both legs' real values.",
  capabilities: ["metal-history", "macro-reference-series"],
  source: [SOURCES.lbma, SOURCES.fred],
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(
        `Metal to compare. ${FIXED_METAL_NAMES} (the price leg needs an LBMA fix, so copper isn't available here).`,
      ),
    series: z
      .enum(["DFII10", "REAINTRATREARAT10Y", "DTWEXBGS", "T10YIE"])
      .default("DFII10")
      .describe(
        "Macro series to plot against the metal. DFII10 = the 10-year TIPS real yield (daily, from 2003) — gold's classic inverse. REAINTRATREARAT10Y = the 10-year real interest rate (monthly, from 1982) — the same idea 21 years deeper, for windows TIPS cannot reach. DTWEXBGS = the Fed's broad trade-weighted dollar index (daily, from 2006). T10YIE = the 10-year inflation breakeven (daily, from 2003) — what the bond market prices for inflation, the thing bullion is bought as a hedge against.",
      ),
    years: yearsField(
      10,
      "How many years both legs cover. A window deeper than the chosen series reaches simply starts where the series does — DFII10, DTWEXBGS and T10YIE all begin in the 2000s, only REAINTRATREARAT10Y reaches the 1980s.",
    ),
  }),
});

export const commodityVolRegimeMeta = defineFrameMeta({
  name: "commodity-vol-regime",
  annotatable: true,
  label: "Commodity Vol Regime",
  category: "metals",
  iconUrl: widgetIcon("commodity-vol-regime"),
  // Two stacked plots (history 140px + distribution 92px) plus a header and a
  // caption, so the minimum is 5 rows, not the family's usual 3 — at 4 the
  // distribution strip is what clips.
  layout: { w: 5, h: 5, minW: 3, minH: 4, maxH: 6 },
  description:
    "Cboe's implied-volatility index for gold, silver, gold miners or crude — the level, where it ranks inside its own history, and the distribution it is ranked against. A volatility number alone answers nothing: 23% is cheap for miners and dear for gold, so the percentile is the reading, and the histogram shows what today's level is being compared with. The metals counterpart of a VIX card. These are volatility percentages, not money.",
  capabilities: ["commodity-vol-index"],
  source: SOURCES.cboe,
  schema: z.object({
    index: z
      .enum(["GVZ", "VXSLV", "VXGDX", "OVX"])
      .default("GVZ")
      .describe(
        "Which published index to read. GVZ = 30-day implied vol on SPDR Gold Shares (GLD) options, history from 2009. VXSLV = iShares Silver Trust (SLV), from 2011. VXGDX = VanEck Gold Miners (GDX), from 2011 — miner vol runs well above metal vol, and that gap is the leverage the equity carries. OVX = United States Oil Fund (USO), from 2009. Each measures options on the ETF named, not on the metal's own futures, because the ETF chain is where the liquid listed vol actually trades.",
      ),
    window: z
      .enum(["all", "10y", "5y", "1y"])
      .default("all")
      .describe(
        'History the percentile and the distribution are measured over. "all" uses the whole published file (2009 for GVZ/OVX, 2011 for VXSLV/VXGDX); the shorter windows ask whether today is expensive against the recent regime rather than against 2020.',
      ),
  }),
});

export const metalCotDisaggregatedMeta = defineFrameMeta({
  name: "metal-cot-disaggregated",
  annotatable: true,
  label: "COT Disaggregated",
  category: "metals",
  iconUrl: widgetIcon("metal-cot-disaggregated"),
  layout: { w: 5, h: 6, minW: 4, minH: 5 },
  description:
    "The CFTC's disaggregated Commitments of Traders — the five real trader classes (producers and merchants, swap dealers, managed money, other reportables, small traders) as opposing long and short bars, each with the agency's own week-over-week change and its share of open interest. Pick this over COT Trader Breakdown whenever the question is WHO holds the position: the legacy report's single \"commercial\" bucket adds miner hedging to swap-dealer bank shorts, which are opposite stories in metals, and conflating them is the most common misreading of gold positioning. A history view charts each class's net across the weekly reports instead.",
  capabilities: ["metal-positioning"],
  source: SOURCES.cftc,
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(`Metal futures market to read. ${METAL_NAMES}.`),
    view: z
      .enum(["latest", "history"])
      .default("latest")
      .describe(
        '"latest" shows the newest published week: the five classes as opposing long/short bars, then each class\'s contracts with the CFTC\'s own week-over-week change and its share of open interest. "history" charts every class\'s net (long − short) across the window instead, which is where a rotation from hedgers to funds becomes visible.',
      ),
    weeks: z
      .number()
      .int()
      .min(8)
      .max(520)
      .default(104)
      .describe(
        "How many weekly reports the history view charts (8–520; 52 ≈ one year, 520 is the provider's ceiling). Unused by the latest view. The disaggregated report only starts in June 2006, so a window reaching further back simply shows the weeks that exist.",
      ),
  }),
});

export const metalCotConcentrationMeta = defineFrameMeta({
  name: "metal-cot-concentration",
  annotatable: true,
  label: "COT Concentration",
  category: "metals",
  iconUrl: widgetIcon("metal-cot-concentration"),
  layout: { w: 5, h: 6, minW: 5, minH: 6 },
  description:
    "How few hands hold the market — the CFTC's concentration columns: the share of the market's longs and shorts sitting in the largest 4 and 8 traders, each drawn against the whole market, plus how many distinct traders hold each side of each class. Gold routinely runs above half of its gross shorts in four traders. The commodity analogue of equity ownership concentration, and only the disaggregated report (June 2006 onward) publishes it at all.",
  capabilities: ["metal-positioning"],
  source: SOURCES.cftc,
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(`Metal futures market to read. ${METAL_NAMES}.`),
    basis: z
      .enum(["gross", "net"])
      .default("gross")
      .describe(
        '"gross" counts each trader\'s long and short book separately — what "four traders hold 51% of the shorts" means in the wild, and the pair the CFTC always publishes. "net" nets each trader\'s books first, so it always reads lower and is not reported for every market; when it is missing the card says so and names the fix rather than drawing an empty chart.',
      ),
    weeks: z
      .number()
      .int()
      .min(8)
      .max(520)
      .default(104)
      .describe(
        "How many weekly reports the concentration history charts (8–520; 52 ≈ one year, 520 is the provider's ceiling). Only read when showHistory is on.",
      ),
    showHistory: z
      .boolean()
      .default(true)
      .describe(
        "Chart the concentration readings over the window underneath the latest week's shares. Turn it off on a short card, where the four shares plus the trader counts fit better on their own.",
      ),
  }),
});

export const metalCotPercentileMeta = defineFrameMeta({
  name: "metal-cot-percentile",
  label: "COT Percentile",
  category: "metals",
  iconUrl: widgetIcon("metal-cot-percentile"),
  layout: { w: 5, h: 4, minW: 4, minH: 3, maxH: 5 },
  description:
    "Scores this week's COT net position against its own history: the percentile and z-score of the chosen trader class's net, drawn over a histogram of every week in the window with today marked. Pick it when the question is whether a positioning level is crowded rather than what it is — 180k contracts net long is either ordinary or a record, and only the distribution says which.",
  capabilities: ["metal-positioning"],
  source: SOURCES.cftc,
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(`Metal futures market to read. ${METAL_NAMES}.`),
    traderClass: z
      .enum(["noncommercial", "commercial", "nonreportable"])
      .default("noncommercial")
      .describe(
        'Which trader class to score. "noncommercial" = large speculators, the crowd a "positioning extreme" normally refers to. "commercial" = hedgers (miners, refiners, fabricators), who are structurally net SHORT in metals, so for them the LOW end of the range is the crowded one, not the high end. "nonreportable" = small traders below the CFTC reporting threshold.',
      ),
    years: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe(
        "Window the percentile and z-score are measured over, in years. The CFTC feed carries about 10 years of weekly reports, so 10 is effectively the full history; a shorter window scores today against the current regime instead of a decade of them.",
      ),
  }),
});

export const metalSpecNotionalMeta = defineFrameMeta({
  name: "metal-spec-notional",
  annotatable: true,
  label: "Spec Net Notional",
  category: "metals",
  iconUrl: widgetIcon("metal-spec-notional"),
  layout: { w: 5, h: 4, minW: 3, minH: 4, maxH: 6 },
  description:
    "How much money the futures crowd actually has riding on the metal: net speculative contracts × contract size × live spot, as a dollar headline with its weekly history. Every week in the series is valued at TODAY's spot, so the line isolates the change in positioning — it is deliberately NOT a mark-to-market of what the position was worth at the time.",
  capabilities: ["metal-positioning", "metal-spot"],
  source: [SOURCES.cftc, SOURCES.goldApi],
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(
        `Metal futures market to read. ${METAL_NAMES}. Contract sizes are quoted in each metal's own unit (gold 100 oz, silver 5,000 oz, platinum 50 oz, palladium 100 oz, copper 25,000 lb) and spot is quoted in that same unit, so the dollar figure is sound for all five.`,
      ),
    years: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe(
        "How many years of weekly reports to chart. The CFTC feed carries about 10 years, so 10 is effectively the full history.",
      ),
  }),
});

export const metalPositioningVsPriceMeta = defineFrameMeta({
  name: "metal-positioning-vs-price",
  annotatable: true,
  label: "Positioning vs Price",
  category: "metals",
  iconUrl: widgetIcon("metal-positioning-vs-price"),
  layout: { w: 6, h: 4, minW: 4, minH: 4, maxH: 5 },
  description:
    "Net speculative positioning and the metal's price on one rebased chart, so you can see whether a rally is being led by the futures crowd or happening in spite of them — and where the two have diverged.",
  capabilities: ["metal-positioning", "metal-history"],
  source: SOURCES.cftc,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(
        `Metal to compare. ${FIXED_METAL_NAMES} (the price leg needs an LBMA fix, so copper isn't available here).`,
      ),
    years: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe("How many years both series cover."),
  }),
});

export const usGoldReserveMeta = defineFrameMeta({
  name: "us-gold-reserve",
  label: "US Gold Reserve",
  category: "metals",
  iconUrl: widgetIcon("us-gold-reserve"),
  layout: { w: 4, h: 4, minW: 3, minH: 3, maxH: 4 },
  description:
    "The U.S. Treasury's official gold holding from its own monthly status report: total fine ounces, the statutory book value that still carries it at $42.22/oz, and what the same metal is worth at today's spot. The gap between the two is the headline.",
  capabilities: ["gold-reserve", "metal-spot"],
  source: SOURCES.treasury,
  schema: z.object({
    showMarketValue: z
      .boolean()
      .default(true)
      .describe(
        "Value the reserve at live spot alongside the statutory book value, and show the difference.",
      ),
  }),
});

export const usGoldVaultsMeta = defineFrameMeta({
  name: "us-gold-vaults",
  label: "US Gold Vaults",
  category: "metals",
  iconUrl: widgetIcon("us-gold-vaults"),
  layout: { w: 4, h: 4, minW: 3, minH: 2, maxW: 11 },
  description:
    "Where the U.S. official gold physically sits — Fort Knox, West Point, Denver, the New York Fed vault and Mint working stock — sized by fine ounces, straight from the Treasury's monthly report.",
  capabilities: ["gold-reserve"],
  source: SOURCES.treasury,
  schema: z.object({
    mode: z
      .enum(["treemap", "bars"])
      .default("treemap")
      .describe(
        "treemap = area per vault, good for the size contrast; bars = ranked horizontal bars, easier to read exact ounces.",
      ),
  }),
});

export const tokenizedGoldMeta = defineFrameMeta({
  name: "tokenized-gold",
  label: "Tokenized Gold",
  category: "metals",
  iconUrl: widgetIcon("tokenized-gold"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Gold-backed tokens (PAXG, XAUT) with their premium or discount to physical spot, market cap and the ounces they claim to vault — the crypto wrapper on bullion, priced against the real thing.",
  capabilities: ["tokenized-gold"],
  source: SOURCES.coingecko,
  schema: z.object({
    showPremium: z
      .boolean()
      .default(true)
      .describe(
        "Show each token's premium (+) or discount (−) against live spot gold. A persistent premium is the market pricing convenience over custody.",
      ),
  }),
});

// ── FRED / Zillow / FHFA: index levels, credit spreads, house prices ────────

/**
 * The market indices FRED republishes as a keyless CSV. Kept here (not imported
 * from the provider) because `schemas.ts` must stay React- and provider-free —
 * the frame layer never sees a provider package. `tests/capability-coverage.test.ts`
 * is what keeps the two sides honest.
 */
const INDEX_SERIES = ["SP500", "VIXCLS", "NASDAQCOM"] as const;

/** How far back each index actually goes, for the schema's own description. */
const INDEX_SERIES_NOTE =
  "SP500 = S&P 500, VIXCLS = VIX (volatility), NASDAQCOM = Nasdaq Composite. Note FRED redistributes SP500 under licence with only a ~10-year rolling window, while NASDAQCOM runs back to 1971 — a longer `years` than the series carries simply shows everything there is.";

/** The 50 states plus DC, as FHFA keys its state-level HPI file. */
const US_STATES = [
  "AL",
  "AK",
  "AZ",
  "AR",
  "CA",
  "CO",
  "CT",
  "DE",
  "DC",
  "FL",
  "GA",
  "HI",
  "ID",
  "IL",
  "IN",
  "IA",
  "KS",
  "KY",
  "LA",
  "ME",
  "MD",
  "MA",
  "MI",
  "MN",
  "MS",
  "MO",
  "MT",
  "NE",
  "NV",
  "NH",
  "NJ",
  "NM",
  "NY",
  "NC",
  "ND",
  "OH",
  "OK",
  "OR",
  "PA",
  "RI",
  "SC",
  "SD",
  "TN",
  "TX",
  "UT",
  "VT",
  "VA",
  "WA",
  "WV",
  "WI",
  "WY",
] as const;

/** Zillow's own metro names — they must match its published `RegionName` exactly. */
const ZHVI_REGIONS = [
  "United States",
  "New York, NY",
  "Los Angeles, CA",
  "Chicago, IL",
  "Dallas, TX",
  "Houston, TX",
  "Washington, DC",
  "Philadelphia, PA",
  "Miami, FL",
  "Atlanta, GA",
  "Boston, MA",
  "Phoenix, AZ",
  "San Francisco, CA",
  "Riverside, CA",
  "Detroit, MI",
  "Seattle, WA",
  "Minneapolis, MN",
  "San Diego, CA",
  "Tampa, FL",
  "Denver, CO",
  "Austin, TX",
  "Nashville, TN",
  "Portland, OR",
  "Las Vegas, NV",
] as const;

export const indexLevelChartMeta = defineFrameMeta({
  name: "index-level-chart",
  annotatable: true,
  label: "Index Level Chart",
  category: "markets",
  iconUrl: widgetIcon("index-level-chart"),
  layout: { w: 6, h: 4, minW: 3, minH: 4, maxH: 5 },
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

export const creditSpreadChartMeta = defineFrameMeta({
  name: "credit-spread-chart",
  annotatable: true,
  label: "Credit Spread Chart",
  category: "macro",
  iconUrl: widgetIcon("credit-spread-chart"),
  layout: { w: 6, h: 4, minW: 3, minH: 4, maxH: 6 },
  description:
    "US corporate credit spreads — the ICE BofA high-yield and investment-grade option-adjusted spreads over Treasuries, charted together in percentage points. The market's own price of default risk and one of the cleanest risk-on/risk-off reads there is: spreads widen before equities notice. Keyless (FRED).",
  capabilities: ["credit-spread"],
  source: SOURCES.fred,
  schema: z.object({
    grades: z
      .array(z.enum(["high-yield", "investment-grade"]))
      .min(1)
      .max(2)
      .default(["high-yield", "investment-grade"])
      .describe(
        "Which grades to plot. Both together shows the quality gap; high-yield alone is the sharper stress signal.",
      ),
    years: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(3)
      .describe(
        "How many years of spread history to chart. FRED carries roughly the last three years of these licensed series.",
      ),
  }),
});

export const homePriceIndexMeta = defineFrameMeta({
  name: "home-price-index",
  annotatable: true,
  label: "Home Price Index",
  category: "macro",
  iconUrl: widgetIcon("home-price-index"),
  layout: { w: 6, h: 4, minW: 3, minH: 4, maxH: 6 },
  description:
    "The Case-Shiller US National Home Price Index — the benchmark measure of American house prices, monthly back to 1987, indexed to January 2000 = 100. Shows the latest print, the year-over-year change, and the full history including the 2006 peak and the 2012 trough. Keyless (FRED).",
  capabilities: ["housing-price"],
  source: SOURCES.fred,
  schema: z.object({
    years: z
      .number()
      .int()
      .min(1)
      .max(40)
      .default(25)
      .describe(
        "How many years of index history to chart. 25 covers both the housing bubble and its aftermath.",
      ),
    showYoY: z
      .boolean()
      .default(true)
      .describe(
        "Show the year-over-year percent change alongside the index level — the number that says whether prices are still rising.",
      ),
  }),
});

export const mortgageRateChartMeta = defineFrameMeta({
  name: "mortgage-rate-chart",
  annotatable: true,
  label: "Mortgage Rate Chart",
  category: "macro",
  iconUrl: widgetIcon("mortgage-rate-chart"),
  layout: { w: 6, h: 3, minW: 3, minH: 3, maxH: 5 },
  description:
    "The US 30-year fixed mortgage rate — the Freddie Mac weekly benchmark, back to 1971 — charted with its latest print and week-over-week move in basis points. The rate that actually sets housing affordability, and a cleaner read on long-end policy transmission than the 10-year yield. Keyless (FRED).",
  capabilities: ["mortgage-rate"],
  source: SOURCES.fred,
  schema: z.object({
    years: z
      .number()
      .int()
      .min(1)
      .max(55)
      .default(10)
      .describe(
        "How many years of weekly rates to chart. 55 reaches the 1981 peak above 18%.",
      ),
  }),
});

export const regionalHomePricesMeta = defineFrameMeta({
  name: "regional-home-prices",
  annotatable: true,
  label: "Regional Home Prices",
  category: "macro",
  iconUrl: widgetIcon("regional-home-prices"),
  layout: { w: 6, h: 4, minW: 3, minH: 4, maxH: 5 },
  description:
    "The FHFA House Price Index per state or metro, quarterly back to 1975 — several regions charted together so divergence is visible, which a single national index averages away. The regulator's own repeat-sales index; keyless (FHFA).",
  capabilities: ["regional-housing-price"],
  source: SOURCES.fhfa,
  schema: z.object({
    level: z
      .enum(["state", "metro"])
      .default("state")
      .describe(
        "Which published granularity to read. state = the 50 states + DC (a small, fast file); metro = ~410 metro areas (a much larger download, so prefer state unless a specific metro is the point).",
      ),
    regions: z
      .array(z.string().min(2))
      .min(1)
      .max(6)
      .default(["CA", "TX", "FL", "NY"])
      .describe(
        `Regions to chart, matched to the level. At state level use two-letter codes: ${US_STATES.join(
          ", ",
        )}. At metro level use FHFA's own metro name, which is a full CBSA title — a leading fragment is enough and is matched case-insensitively, so "Austin" resolves to "Austin-Round Rock-San Marcos, TX". A region that matches nothing is skipped rather than failing the card.`,
      ),
    years: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .describe("How many years of quarterly index history to chart."),
    rebase: z
      .boolean()
      .default(true)
      .describe(
        "Rebase every region to 0% at the start of the window so the lines are directly comparable as cumulative appreciation. Off plots the published index levels, which are NOT comparable across regions — FHFA rebases each series to 100 at its own start date.",
      ),
  }),
});

export const metroHomeValuesMeta = defineFrameMeta({
  name: "metro-home-values",
  label: "Metro Home Values",
  category: "macro",
  iconUrl: widgetIcon("metro-home-values"),
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
  description:
    "What a typical home actually costs, metro by metro — the Zillow Home Value Index in dollars (not index points), each row with its latest value and year-over-year change, ranked. The one house-price source on the board denominated in money, so it answers 'what would a house cost me there' rather than 'how much have prices risen'. Keyless (Zillow), monthly.",
  capabilities: ["home-value-index"],
  source: SOURCES.zillow,
  schema: z.object({
    regions: z
      .array(z.enum(ZHVI_REGIONS))
      .min(1)
      .max(24)
      .default([
        "United States",
        "New York, NY",
        "Los Angeles, CA",
        "San Francisco, CA",
        "Austin, TX",
        "Miami, FL",
        "Chicago, IL",
        "Phoenix, AZ",
      ])
      .describe(
        'Metros to list, using Zillow\'s own region names. "United States" is the national row.',
      ),
    sortBy: z
      .enum(["value", "change", "size"])
      .default("value")
      .describe(
        "value = most expensive first; change = fastest year-over-year appreciation first; size = Zillow's population size rank, which keeps the national row on top.",
      ),
  }),
});

export const homeValueChartMeta = defineFrameMeta({
  name: "home-value-chart",
  annotatable: true,
  label: "Home Value Chart",
  category: "macro",
  iconUrl: widgetIcon("home-value-chart"),
  layout: { w: 6, h: 4, minW: 4, minH: 3, maxH: 5 },
  description:
    "Typical home value over time for one or more metros — the Zillow Home Value Index charted in dollars, monthly back to 2000. The chart-first sibling of Metro Home Values: use it to see the 2006 peak, the 2012 bottom and the post-2020 run in actual money rather than index points. Keyless (Zillow).",
  capabilities: ["home-value-index"],
  source: SOURCES.zillow,
  schema: z.object({
    regions: z
      .array(z.enum(ZHVI_REGIONS))
      .min(1)
      .max(4)
      .default(["United States", "Austin, TX"])
      .describe(
        'Metros to chart, using Zillow\'s own region names. "United States" is the national row.',
      ),
    years: z
      .number()
      .int()
      .min(1)
      .max(26)
      .default(15)
      .describe(
        "How many years of monthly values to chart. The series starts in 2000, so 26 is everything.",
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
  layout: { w: 6, h: 4, minW: 3, minH: 3, maxH: 5 },
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
  layout: { w: 6, h: 4, minW: 3, minH: 3, maxH: 4 },
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
  layout: { w: 3, h: 4, minW: 2, minH: 3, maxW: 4, maxH: 4 },
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

export const creditQualityGapMeta = defineFrameMeta({
  name: "credit-quality-gap",
  annotatable: true,
  label: "Credit Quality Gap",
  category: "macro",
  iconUrl: widgetIcon("credit-quality-gap"),
  layout: { w: 6, h: 4, minW: 4, minH: 3, maxH: 5 },
  description:
    "The high-yield minus investment-grade spread — what the market charges for junk over quality, in percentage points. A single line that isolates credit RISK APPETITE from the level of rates: both spreads move together when Treasuries move, so the gap between them is the cleaner read, and it widens before equities notice. Shows where today sits in the charted window's range. Keyless (FRED).",
  capabilities: ["credit-spread"],
  source: SOURCES.fred,
  schema: z.object({
    years: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(3)
      .describe(
        "How many years of the gap to chart. FRED carries roughly the last three years of these licensed series.",
      ),
  }),
});

export const mortgagePaymentMeta = defineFrameMeta({
  name: "mortgage-payment",
  label: "Mortgage Payment",
  category: "macro",
  iconUrl: widgetIcon("mortgage-payment"),
  layout: { w: 4, h: 4, minW: 3, minH: 4, maxH: 5 },
  description:
    "What buying a typical home in one metro actually costs per month — the Zillow home value and the live 30-year fixed rate combined into a principal-and-interest payment, with the loan size and rate shown. This is the affordability question neither source answers alone: the index says prices rose, the rate says borrowing got dearer, and only the payment says whether a buyer can pay. Keyless (Zillow + FRED).",
  capabilities: ["home-value-index", "mortgage-rate"],
  source: SOURCES.zillow,
  schema: z.object({
    region: z
      .enum(ZHVI_REGIONS)
      .default("United States")
      .describe(
        "Which metro's typical home value to price, using Zillow's own region names. \"United States\" is the national row.",
      ),
    downPaymentPct: z
      .number()
      .min(0)
      .max(90)
      .default(20)
      .describe(
        "Down payment as a percent of the home value; the rest is financed. 20% is the conventional benchmark.",
      ),
    termYears: z
      .number()
      .int()
      .min(5)
      .max(40)
      .default(30)
      .describe(
        "Loan term in years. The rate charted is the 30-year benchmark, so a shorter term here prices that rate over a shorter schedule rather than switching to a 15-year quote.",
      ),
  }),
});

export const homeValueBarsMeta = defineFrameMeta({
  name: "home-value-bars",
  label: "Home Value Bars",
  category: "macro",
  iconUrl: widgetIcon("home-value-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 4, maxH: 5 },
  description:
    "Typical home value per metro as ranked horizontal bars — the price gap between coastal and inland America at a glance, in dollars rather than index points. The bar-chart sibling of Metro Home Values. Keyless (Zillow), monthly.",
  capabilities: ["home-value-index"],
  source: SOURCES.zillow,
  schema: z.object({
    regions: z
      .array(z.enum(ZHVI_REGIONS))
      .min(1)
      .max(24)
      .default([
        "San Francisco, CA",
        "Los Angeles, CA",
        "New York, NY",
        "Seattle, WA",
        "Boston, MA",
        "Denver, CO",
        "Austin, TX",
        "Miami, FL",
        "Phoenix, AZ",
        "Chicago, IL",
        "United States",
      ])
      .describe(
        'Metros to rank, using Zillow\'s own region names. "United States" is the national row and makes a useful baseline bar.',
      ),
  }),
});

export const homeValueMomentumMeta = defineFrameMeta({
  name: "home-value-momentum",
  label: "Home Value Momentum",
  category: "macro",
  iconUrl: widgetIcon("home-value-momentum"),
  layout: { w: 4, h: 4, minW: 3, minH: 4, maxH: 6 },
  description:
    "Year-over-year change in typical home value per metro as diverging bars — which housing markets are still appreciating and which have turned, ranked by move. The level tells you what a house costs; this tells you which direction the market is going. Keyless (Zillow), monthly.",
  capabilities: ["home-value-index"],
  source: SOURCES.zillow,
  schema: z.object({
    regions: z
      .array(z.enum(ZHVI_REGIONS))
      .min(2)
      .max(24)
      .default([
        "United States",
        "New York, NY",
        "Chicago, IL",
        "Boston, MA",
        "Miami, FL",
        "Austin, TX",
        "Phoenix, AZ",
        "San Francisco, CA",
        "Seattle, WA",
        "Denver, CO",
        "Tampa, FL",
        "Las Vegas, NV",
      ])
      .describe(
        "Metros to compare, using Zillow's own region names. A metro with under a year of published history is skipped, since it has no year-over-year change.",
      ),
  }),
});

export const homeValueScatterMeta = defineFrameMeta({
  name: "home-value-scatter",
  label: "Home Value Scatter",
  category: "macro",
  iconUrl: widgetIcon("home-value-scatter"),
  layout: { w: 6, h: 4, minW: 3, minH: 3, maxH: 4 },
  description:
    "Every metro plotted by what a home costs (y) against how fast that price is changing (x) — the four quadrants separate expensive-and-cooling from cheap-and-heating, which neither a ranked list nor a single chart shows. Keyless (Zillow), monthly.",
  capabilities: ["home-value-index"],
  source: SOURCES.zillow,
  schema: z.object({
    regions: z
      .array(z.enum(ZHVI_REGIONS))
      .min(3)
      .max(24)
      .default([
        "New York, NY",
        "Los Angeles, CA",
        "Chicago, IL",
        "Dallas, TX",
        "Houston, TX",
        "Washington, DC",
        "Philadelphia, PA",
        "Miami, FL",
        "Atlanta, GA",
        "Boston, MA",
        "Phoenix, AZ",
        "San Francisco, CA",
        "Detroit, MI",
        "Seattle, WA",
        "Denver, CO",
        "Austin, TX",
        "Tampa, FL",
        "Nashville, TN",
      ])
      .describe(
        "Metros to plot, using Zillow's own region names. More metros make the quadrant pattern clearer; only the largest bubbles are labelled.",
      ),
  }),
});

export const regionalHomePriceBarsMeta = defineFrameMeta({
  name: "regional-home-price-bars",
  label: "Regional Home Price Bars",
  category: "macro",
  iconUrl: widgetIcon("regional-home-price-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 4, maxH: 5 },
  description:
    "Year-over-year change in the FHFA House Price Index per state or metro, as diverging bars ranked by move — the regulator's repeat-sales index showing which regional housing markets are rising and which are falling. The bar-chart sibling of Regional Home Prices; quarterly, keyless (FHFA).",
  capabilities: ["regional-housing-price"],
  source: SOURCES.fhfa,
  schema: z.object({
    level: z
      .enum(["state", "metro"])
      .default("state")
      .describe(
        "Which published granularity to read. state = the 50 states + DC (a small, fast file); metro = ~410 metro areas (a much larger download).",
      ),
    regions: z
      .array(z.string().min(2))
      .min(2)
      .max(16)
      .default([
        "CA",
        "TX",
        "FL",
        "NY",
        "WA",
        "AZ",
        "CO",
        "IL",
        "MA",
        "GA",
        "NC",
        "OH",
      ])
      .describe(
        `Regions to compare, matched to the level. At state level use two-letter codes: ${US_STATES.join(
          ", ",
        )}. At metro level use a leading fragment of FHFA's CBSA title (case-insensitive), e.g. "Austin". A region that matches nothing is skipped rather than failing the card.`,
      ),
  }),
});

// ===== equity deep-dive =====
// The company-research half of a stocks-first board: what the business is
// worth, what it reported, what the street thinks, and what the options market
// is pricing. Everything here is keyless but proxy-bound, so these cards
// degrade to an empty state on a static host with no runtime — same as the
// SEC/Treasury families.

export const companyProfileMeta = defineFrameMeta({
  name: "company-profile",
  label: "Company Profile",
  category: "equities",
  iconUrl: widgetIcon("company-profile"),
  layout: { w: 4, h: 3, minW: 2, minH: 2 },
  description:
    "Identity card for one US-listed company — name, exchange, sector and industry, the last sale with its change, market capitalisation, the 52-week range with a marker showing where price sits inside it, average volume, and the dividend and yield when the company pays one. The header a company deep-dive board opens with. Keyless exchange data through the zframes runtime proxy; empty on a static host.",
  capabilities: ["equity-profile"],
  source: SOURCES.nasdaq,
  schema: z.object({
    symbol: companySymbolField(),
  }),
});

export const valuationMultiplesMeta = defineFrameMeta({
  name: "valuation-multiples",
  label: "Valuation Multiples",
  category: "equities",
  iconUrl: widgetIcon("valuation-multiples"),
  layout: { w: 4, h: 3, minW: 4, minH: 3 },
  description:
    "What the market is paying for one company's earnings, sales and book value — market cap, trailing P/E, P/S, P/B, and the dividend yield, each with the inputs it was computed from. IMPORTANT: no keyless source publishes these ratios, so they are DERIVED here — market cap and price from the exchange, earnings/sales/equity from the latest published annual statements — which means a ratio can lag a fresh quarter and is trailing, never forward. A multiple whose inputs are missing or non-positive is shown as unavailable rather than as a misleading number.",
  capabilities: ["equity-profile", "equity-financials"],
  source: SOURCES.nasdaq,
  schema: z.object({
    symbol: companySymbolField(),
  }),
});

export const financialsTrendMeta = defineFrameMeta({
  name: "financials-trend",
  // Stays in USD whatever the board asks for: figures as filed with the SEC.
  usdOnly: true,
  label: "Financials Trend",
  category: "equities",
  annotatable: true,
  iconUrl: widgetIcon("financials-trend"),
  layout: { w: 5, h: 4, minW: 3, minH: 4, maxH: 6 },
  description:
    "One company's reported financial history as a multi-year line — pick revenue, net income, total assets or shareholders' equity and see the whole series as filed, not just the latest print. Built from SEC EDGAR XBRL company facts, stitched across the XBRL tag changes issuers make mid-history (a single-tag series would simply stop the year the company re-tagged the line). Annual or quarterly cadence. Updates only on filings. Requires the zframes runtime proxy.",
  capabilities: ["fundamentals-history"],
  source: SOURCES.secEdgar,
  schema: z.object({
    symbol: companySymbolField(),
    metric: z
      .enum(["revenue", "netIncome", "assets", "equity", "eps"])
      .default("revenue")
      .describe(
        "Which reported line to chart: revenue, net income, total assets, shareholders' equity, or diluted EPS.",
      ),
    cadence: z
      .enum(["annual", "quarterly"])
      .default("annual")
      .describe(
        "Reporting cadence to chart. Annual is the readable long trend; quarterly shows seasonality but is noisier.",
      ),
  }),
});

export const marginTrendMeta = defineFrameMeta({
  name: "margin-trend",
  label: "Margin Trend",
  category: "equities",
  annotatable: true,
  iconUrl: widgetIcon("margin-trend"),
  layout: { w: 5, h: 4, minW: 3, minH: 4, maxH: 6 },
  description:
    "How profitable one company is per dollar of sales, across the last four reported fiscal years — gross, operating and net margin as published percentage lines, so margin expansion or compression reads at a glance. The single most telling chart on whether a growth story is also a business. Published exchange figures; updates only when the company reports.",
  capabilities: ["equity-financials"],
  source: SOURCES.nasdaq,
  schema: z.object({
    symbol: companySymbolField(),
    margins: z
      .array(z.enum(["gross", "operating", "preTax", "net"]))
      .min(1)
      .max(4)
      .default(["gross", "operating", "net"])
      .describe("Which margin lines to draw."),
  }),
});

export const cashflowTrendMeta = defineFrameMeta({
  name: "cashflow-trend",
  usdOnly: true,
  label: "Cash Flow Trend",
  category: "equities",
  // Deliberately NOT annotatable: this draws grouped bars, not a time axis, so
  // an event flag would have nowhere honest to land.
  iconUrl: widgetIcon("cashflow-trend"),
  layout: { w: 5, h: 4, minW: 3, minH: 2 },
  description:
    "Where one company's cash actually goes, by fiscal year — operating cash flow, capital expenditure, and free cash flow (operating minus capex) as grouped bars. Cash flow is the line hardest to dress up, so it is the honest counterweight to a rising reported profit. Published exchange figures, in absolute dollars; updates only when the company reports.",
  capabilities: ["equity-financials"],
  source: SOURCES.nasdaq,
  schema: z.object({
    symbol: companySymbolField(),
  }),
});

export const earningsSurpriseMeta = defineFrameMeta({
  name: "earnings-surprise",
  usdOnly: true,
  label: "Earnings Surprise",
  category: "equities",
  iconUrl: widgetIcon("earnings-surprise"),
  layout: { w: 5, h: 4, minW: 4, minH: 2 },
  description:
    "Whether one company beats its own guidance — reported EPS against the consensus estimate for each of the last several quarters, as paired bars with the surprise percentage, plus the average beat across the window. A consistent beat rate is a different signal from a single blowout quarter, and this shows which one you are looking at. Keyless exchange data; updates quarterly.",
  capabilities: ["earnings-history"],
  source: SOURCES.nasdaq,
  schema: z.object({
    symbol: companySymbolField(),
    count: z
      .number()
      .int()
      .min(2)
      .max(12)
      .default(6)
      .describe("How many past quarters to show (newest last)."),
  }),
});

export const earningsCountdownMeta = defineFrameMeta({
  name: "earnings-countdown",
  // Stays in USD: an EPS is a per-share figure as the company reported it, the
  // same class as the SEC filing frames — a baht-converted EPS is a number
  // nobody quotes.
  usdOnly: true,
  label: "Earnings Countdown",
  category: "equities",
  iconUrl: widgetIcon("earnings-countdown"),
  layout: { w: 3, h: 2, minW: 3, minH: 2, maxW: 4, maxH: 2 },
  description:
    "Days until one company's next scheduled earnings report, with the date, whether it lands before the open or after the close, and the last quarter's result for context. The date comes from the exchange's published calendar — when no date is confirmed yet the card says so rather than guessing one from the filing cadence.",
  capabilities: ["earnings-history"],
  source: SOURCES.nasdaq,
  schema: z.object({
    symbol: companySymbolField(),
  }),
});

export const earningsCalendarMeta = defineFrameMeta({
  name: "earnings-calendar",
  // Stays in USD: consensus EPS is quoted as published, and the market caps
  // here only rank the session's names rather than being spendable figures.
  usdOnly: true,
  label: "Earnings Calendar",
  category: "equities",
  iconUrl: widgetIcon("earnings-calendar"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Which companies report on a given session — ticker, name, before-open or after-close, the consensus EPS forecast and how many estimates back it, ranked by market cap so the session's heavyweights are on top. Market-wide, not tied to one company: the card that tells you whether tomorrow is a quiet day or a minefield. Keyless exchange calendar.",
  capabilities: ["earnings-calendar"],
  source: SOURCES.nasdaq,
  schema: z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Session to list, ISO "YYYY-MM-DD". Omit for the next trading session. A date with no scheduled reports shows an empty state, not an error.',
      ),
    count: z
      .number()
      .int()
      .min(3)
      .max(25)
      .default(10)
      .describe("How many companies to list (largest market cap first)."),
  }),
});

export const analystRatingsMeta = defineFrameMeta({
  name: "analyst-ratings",
  label: "Analyst Ratings",
  category: "equities",
  iconUrl: widgetIcon("analyst-ratings"),
  layout: { w: 4, h: 3, minW: 3, minH: 3 },
  description:
    "What sell-side coverage says about one company — the headline consensus (Buy / Hold / Sell), how many analysts contribute to it, the consensus one-year price target against the live price with the implied upside or downside, and the covering brokers. Sentiment, not fact: a consensus target is an average of opinions and is routinely wrong. Keyless exchange data.",
  capabilities: ["analyst-ratings"],
  source: SOURCES.nasdaq,
  schema: z.object({
    symbol: companySymbolField(),
    showBrokers: z
      .boolean()
      .default(true)
      .describe("List the covering broker names under the consensus."),
  }),
});

export const institutionalOwnershipMeta = defineFrameMeta({
  name: "institutional-ownership",
  usdOnly: true,
  label: "Institutional Ownership",
  category: "equities",
  iconUrl: widgetIcon("institutional-ownership"),
  layout: { w: 4, h: 3, minW: 3, minH: 2, maxH: 4 },
  description:
    "How much of one company the institutions hold, and which way they moved last quarter — percent of shares outstanding in institutional hands, the total value of those holdings, and the split between holders that increased versus decreased their position, with the share counts behind each. Aggregated 13F data, so it is a quarter behind by construction. Keyless exchange data.",
  capabilities: ["institutional-ownership"],
  source: SOURCES.nasdaq,
  schema: z.object({
    symbol: companySymbolField(),
  }),
});

export const equityOptionsOiMeta = defineFrameMeta({
  name: "equity-options-oi",
  label: "Equity Options OI",
  category: "derivatives",
  iconUrl: widgetIcon("equity-options-oi"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Where the open interest sits on one listed stock's option chain — calls and puts stacked by strike for a chosen expiry, with the spot price marked, so the strikes the market has actually positioned around are visible. Also shows the chain's put/call open-interest ratio. Keyless Cboe data, delayed ~15 minutes (the card says so); requires the zframes runtime proxy.",
  capabilities: ["options-chain"],
  source: SOURCES.cboe,
  schema: z.object({
    symbol: companySymbolField(),
    expiry: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Which expiry to chart, ISO "YYYY-MM-DD". Omit for the nearest expiry with meaningful open interest.',
      ),
    strikes: z
      .number()
      .int()
      .min(6)
      .max(40)
      .default(16)
      .describe("How many strikes to show, centred on spot."),
  }),
});

export const equityOptionsSmileMeta = defineFrameMeta({
  name: "equity-options-smile",
  label: "Equity Vol Smile",
  category: "derivatives",
  iconUrl: widgetIcon("equity-options-smile"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Implied volatility across strikes for one listed stock at a single expiry — the smile (or smirk), plotted separately for calls and puts against strike, with spot marked. A steep downside skew means the market is paying up for crash protection. Contracts quoting no implied volatility are dropped rather than plotted at zero. Keyless Cboe data, delayed ~15 minutes.",
  capabilities: ["options-chain"],
  source: SOURCES.cboe,
  schema: z.object({
    symbol: companySymbolField(),
    expiry: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Which expiry to chart, ISO "YYYY-MM-DD". Omit for the nearest liquid expiry.',
      ),
    moneyness: z
      .number()
      .min(0.1)
      .max(1)
      .default(0.3)
      .describe(
        "How far from spot to plot, as a fraction of spot (0.3 = strikes within ±30%). Wide chains have far-out strikes whose quotes are noise.",
      ),
  }),
});

export const equityOptionsMaxPainMeta = defineFrameMeta({
  name: "equity-options-max-pain",
  label: "Equity Max Pain",
  category: "derivatives",
  iconUrl: widgetIcon("equity-options-max-pain"),
  layout: { w: 4, h: 3, minW: 3, minH: 3, maxH: 4 },
  description:
    "The strike at which the most option value expires worthless for holders on one listed stock — total in-the-money payout across the chain plotted per strike, with the minimum (max pain) and the spot price marked, plus the gap between them. A widely-watched folk indicator, not a prediction: it assumes open interest is static and ignores hedging. Keyless Cboe data, delayed ~15 minutes.",
  capabilities: ["options-chain"],
  source: SOURCES.cboe,
  schema: z.object({
    symbol: companySymbolField(),
    expiry: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Which expiry to evaluate, ISO "YYYY-MM-DD". Omit for the nearest expiry with meaningful open interest.',
      ),
  }),
});

export const equityOptionsGreeksMeta = defineFrameMeta({
  name: "equity-options-greeks",
  label: "Equity Options Greeks",
  category: "derivatives",
  iconUrl: widgetIcon("equity-options-greeks"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "A chosen greek across the strike ladder for one listed stock at a single expiry — delta, gamma, vega or theta for calls and puts, with spot marked. Gamma in particular shows where dealer hedging concentrates, which is where price tends to get pinned or accelerate. Keyless Cboe data including published greeks, delayed ~15 minutes.",
  capabilities: ["options-chain"],
  source: SOURCES.cboe,
  schema: z.object({
    symbol: companySymbolField(),
    greek: z
      .enum(["delta", "gamma", "vega", "theta"])
      .default("gamma")
      .describe("Which greek to plot across the strike ladder."),
    expiry: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Which expiry to chart, ISO "YYYY-MM-DD". Omit for the nearest liquid expiry.',
      ),
    strikes: z
      .number()
      .int()
      .min(6)
      .max(40)
      .default(20)
      .describe("How many strikes to show, centred on spot."),
  }),
});

/** Every built-in frame's metadata — what the CLI and skill read. */
export const frameMetas: FrameMeta[] = [
  companyProfileMeta,
  valuationMultiplesMeta,
  financialsTrendMeta,
  marginTrendMeta,
  cashflowTrendMeta,
  earningsSurpriseMeta,
  earningsCountdownMeta,
  earningsCalendarMeta,
  analystRatingsMeta,
  institutionalOwnershipMeta,
  equityOptionsOiMeta,
  equityOptionsSmileMeta,
  equityOptionsMaxPainMeta,
  equityOptionsGreeksMeta,
  metalsBoardMeta,
  metalPriceMeta,
  metalValueMeta,
  metalPriceChartMeta,
  metalDrawdownMeta,
  metalAnnualReturnsMeta,
  metalSeasonalityMeta,
  metalVolatilityMeta,
  goldSilverRatioMeta,
  metalRatioChartMeta,
  metalCompareChartMeta,
  metalPerformanceMeta,
  metalAthMeta,
  metalFixTableMeta,
  metalMilestonesMeta,
  metalReturnDistributionMeta,
  metalsCorrelationMeta,
  metalRatioPercentileMeta,
  metalRollingCorrelationMeta,
  btcInGoldMeta,
  metalCotNetMeta,
  metalCotBreakdownMeta,
  metalCotGaugeMeta,
  metalCotDisaggregatedMeta,
  metalCotConcentrationMeta,
  metalOpenInterestMeta,
  metalCotPercentileMeta,
  metalSpecNotionalMeta,
  metalPositioningVsPriceMeta,
  metalRealPriceMeta,
  metalVsMacroMeta,
  commodityVolRegimeMeta,
  usGoldReserveMeta,
  usGoldVaultsMeta,
  tokenizedGoldMeta,
  indexLevelChartMeta,
  creditSpreadChartMeta,
  homePriceIndexMeta,
  mortgageRateChartMeta,
  regionalHomePricesMeta,
  metroHomeValuesMeta,
  homeValueChartMeta,
  indexLevelMeta,
  indexDrawdownMeta,
  indexAnnualReturnsMeta,
  vixGaugeMeta,
  creditQualityGapMeta,
  mortgagePaymentMeta,
  homeValueBarsMeta,
  homeValueMomentumMeta,
  homeValueScatterMeta,
  regionalHomePriceBarsMeta,
  customDataMeta,
  newsFeedMeta,
  portfolioValueMeta,
  portfolioAllocationMeta,
  portfolioHoldingsMeta,
  bitcoinDominanceMeta,
  clockMeta,
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
  groupMeta,
  headingMeta,
  heroNumberMeta,
  imageMeta,
  imageGalleryMeta,
  inflationPulseMeta,
  marketHoursMeta,
  noteMeta,
  priceChartMeta,
  priceCompareMeta,
  priceEventsMeta,
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
  returnCalendarMeta,
  returnDistributionMeta,
  breadthHistogramMeta,
  fundingCalendarMeta,
  fundingDistributionMeta,
  sentimentCalendarMeta,
  yieldDistributionMeta,
  dxyMeta,
  cycleSignalsMeta,
  stablecoinSupplyMeta,
  yieldScannerMeta,
  defiRevenueMeta,
  optionsChainTableMeta,
  tokenUnlockScheduleMeta,
  cryptoProfileMeta,
  cryptoDilutionMeta,
  protocolRevenueMeta,
  protocolMultiplesMeta,
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
  orderBookDepthMeta,
  nftTreemapMeta,
  dexPoolTreemapMeta,
  sectorBarsMeta,
  fundingBarsMeta,
  etfFlowBarsMeta,
  chainActivityBarsMeta,
  marketScatterMeta,
  marketBubblesMeta,
  tvlBubblesMeta,
  protocolTvlBubblesMeta,
  dexVolumeBubblesMeta,
  protocolFeesBubblesMeta,
  sectorBubblesMeta,
  nftBubblesMeta,
  dexPoolBubblesMeta,
  moversBubblesMeta,
  sentimentGaugeMeta,
  moversBarsMeta,
  tvlBarsMeta,
  yieldScatterMeta,
  nftScatterMeta,
  dominanceGaugeMeta,
  putCallGaugeMeta,
  oiTreemapMeta,
  ohlcvVolumeBarsMeta,
  fundingSpreadBarsMeta,
  fundingVenueHeatmapMeta,
  fundingCarryAreaMeta,
  volumeShareDonutMeta,
  volumeMoversScatterMeta,
  fundingLeaderboardBarsMeta,
  fundingCrowdingScatterMeta,
  liquidityBasisBarsMeta,
  coinMomentumHeatmapMeta,
  coinMomentumScatterMeta,
  trendingBarsMeta,
  nftActivityBarsMeta,
  dominanceBarsMeta,
  trendingBubblesMeta,
  yieldRiskPieMeta,
  dexPoolLiquidityScatterMeta,
  protocolFeesVsTvlScatterMeta,
  yieldCompositionScatterMeta,
  protocolTvlByCategoryMeta,
  protocolTvlShareAreaMeta,
  dexVolumeShareAreaMeta,
  yieldMomentumBarsMeta,
  btcDifficultyChartMeta,
  btcBlockSizeBarsMeta,
  chainPriceMoversMeta,
  chainActivityScatterMeta,
  mempoolFeeCurveMeta,
  miningPoolsShareMeta,
  optionsMaxPainMeta,
  optionsOiSkewMeta,
  optionsVolSpreadMeta,
  optionsFlowSkewMeta,
  optionsVolSmileMeta,
  optionsOiLadderHeatmapMeta,
  optionsMaxPainMultiMeta,
  mvrvZscoreChartMeta,
  nuplCycleChartMeta,
  cycleValuationCompositeMeta,
  onchainOscillatorOverlayMeta,
  ethIssuanceImpactMeta,
  treasuryAvgRateBarsMeta,
  treasuryAuctionDemandScatterMeta,
  treasuryAuctionSizeBarsMeta,
  nyfedReferenceRateBarsMeta,
  nyfedSofrTermAveragesBarsMeta,
  nyfedFedFundsBandGaugeMeta,
  treasuryDebtCompositionAreaMeta,
  ofrStressCategoryAreaMeta,
  miseryIndexMeta,
  realWagesMeta,
  laborForceFlowMeta,
  payrollsBarsMeta,
  shortVolumeBarsMeta,
  capitalStructureBarsMeta,
  filingsMixMeta,
  fxCrossHeatmapMeta,
  etfIssuerTreemapMeta,
  fxTrendChartMeta,
  fearGreedChartMeta,
  predictionMarketBarsMeta,
  dxyChartMeta,
  fxMoversBarsMeta,
  predictionMarketScatterMeta,
  etfIssuerBarsMeta,
  portfolioMoversMeta,
  portfolioValueBarsMeta,
  etfFlowCalendarMeta,
  predictionMarketsBubbleMeta,
];

/**
 * Every renderable frame's metadata — the full set the runtime registers (the
 * React-free twin of `allFrames`), in contrast to `frameMetas` above, which is
 * the *curated* subset the AI catalogue + CLI/skill expose so the generating
 * agent only picks data/market frames. The runtime must render all 82 (a human
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
