import { defineFrameMeta } from "@zframes/spec/frame";
import { z } from "zod";
import { widgetIcon, SOURCES } from "./shared";

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

export const fearGreedChartMeta = defineFrameMeta({
  name: "fear-greed-chart",
  annotatable: true,
  label: "Fear & Greed Chart",
  category: "sentiment",
  iconUrl: widgetIcon("fear-greed-chart"),
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
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
  layout: { w: 5, h: 5, minW: 2, minH: 2 },
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

export const predictionMarketScatterMeta = defineFrameMeta({
  name: "prediction-market-scatter",
  label: "Prediction Market Scatter",
  category: "sentiment",
  iconUrl: widgetIcon("prediction-market-scatter"),
  layout: { w: 6, h: 4, minW: 4, minH: 2 },
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
