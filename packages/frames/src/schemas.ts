import { defineFrameMeta, type FrameMeta } from "@zframes/core/frame";
import { z } from "zod";

/**
 * Frame metadata, separated from components so React-free tooling (the
 * zframes CLI, catalogue export, the /zframes skill) can import this module
 * without charts, liveline, or CSS. Each frame's .tsx imports its meta from
 * here — this file is the single source of truth for the AI catalogue.
 */

export const fearGreedMeta = defineFrameMeta({
  name: "fear-greed",
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "Crypto Fear & Greed index (0 = extreme fear, 100 = extreme greed) with a recent-history sparkline. A one-number market mood gauge from alternative.me.",
  capabilities: ["sentiment"],
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
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Multi-series line chart comparing hourly perp funding rates across symbols over a configurable lookback window. Positive funding = longs pay shorts. Useful for spotting crowded trades.",
  capabilities: ["funding-history"],
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
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Live animated price chart (candlestick or line) for one symbol — canvas-rendered at 60fps via liveline, streaming live off the Hyperliquid WebSocket. Works for HIP-3 stock perps (xyz:TSLA) and crypto (BTC). The centerpiece frame.",
  capabilities: ["ohlcv", "quote-stream"],
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

export const priceTickerMeta = defineFrameMeta({
  name: "price-ticker",
  layout: { w: 3, h: 3, minW: 2, minH: 2 },
  description:
    "Live watchlist streaming mid prices over the Hyperliquid WebSocket with 24h change per symbol. The bread-and-butter frame for any dashboard.",
  capabilities: ["quote-stream", "day-stats"],
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
  layout: { w: 5, h: 3, minW: 3, minH: 3 },
  description:
    "Today's biggest gainers and losers across the whole Hyperliquid perp universe, side by side with 24h change.",
  capabilities: ["day-stats"],
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
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "Treemap of total value locked (TVL) across the largest blockchain ecosystems, sized by TVL. Data from DeFiLlama. Good single-glance answer to 'where does on-chain capital live right now'.",
  capabilities: ["tvl"],
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
  layout: { w: 4, h: 2, minW: 3, minH: 2 },
  description:
    "BTC / ETH / Others market-cap dominance as a segmented bar, with optional total marketcap line. Shifts in BTC dominance hint at where the market rotates next.",
  capabilities: ["global-market"],
  schema: z.object({
    showTotalMarketCap: z
      .boolean()
      .default(true)
      .describe(
        "Show total crypto marketcap and its 24h change below the bar.",
      ),
  }),
});

export const fundingHeatmapMeta = defineFrameMeta({
  name: "funding-heatmap",
  layout: { w: 6, h: 3, minW: 4, minH: 3 },
  description:
    "Heatmap of perp funding rates — symbols as rows, 4h time buckets over the last 3 days as columns, green positive / red negative. Spots persistent funding regimes at a glance.",
  capabilities: ["funding-history"],
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
  layout: { w: 4, h: 3, minW: 3, minH: 3 },
  description:
    "Chrome-dino style runner game on canvas — jump cacti with SPACE or tap. High score persists locally. For when the market is boring. Needs no data provider.",
  capabilities: [],
  schema: z.object({}),
});

export const imageMeta = defineFrameMeta({
  name: "image",
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
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Multi-series line chart overlaying the price history of several symbols over a lookback window — see how TSLA, NVDA and BTC moved against each other. Normalized by default to % change from the window start so symbols at very different price levels (BTC vs a $20 stock) stay comparable on one axis. Candles from Hyperliquid.",
  capabilities: ["ohlcv"],
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
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Donut of a portfolio's live allocation — list holdings (symbol + amount) and each slice is sized by current USD value off the Hyperliquid mid stream, with total portfolio value in the center. A live 'where is my money right now' view.",
  capabilities: ["quote-stream"],
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
  dailyAnalysisMeta,
  dinoGameMeta,
  fearGreedMeta,
  fundingHeatmapMeta,
  fundingRateChartMeta,
  headingMeta,
  imageMeta,
  noteMeta,
  priceChartMeta,
  priceCompareMeta,
  priceTickerMeta,
  topMoversMeta,
  tvlTreemapMeta,
];
