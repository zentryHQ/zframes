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
  interpretation: `The Fear & Greed index compresses several signals — price momentum, volatility, trading volume, social-media chatter, and Bitcoin dominance — into a single 0-to-100 score of crowd mood in the crypto market. It is a measure of how people feel, not of where prices are headed.

The big number is the latest reading, colored along a mood ramp: red tones near 0 mean widespread fear, green tones near 100 mean widespread greed, with neutral around 50. The small sparkline underneath traces the last few weeks, so a spike or slide in mood is visible at a glance.

A low reading says investors are anxious and selling pressure has dominated; a high reading says optimism and buying appetite are running hot. One common misreading: taking the score literally. Many traders read extremes as contrarian signals — extreme fear has often coincided with market bottoms and extreme greed with tops — so a very low number is not automatically a reason for pessimism, nor a high one for confidence.`,
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
  interpretation: `Prediction markets let people bet real money on the outcome of future events — elections, rate decisions, crypto milestones. The price of a "yes" share doubles as a probability: a share trading at 70 cents means the market collectively assigns roughly a 70% chance to that outcome.

Each row shows one open market with its leading outcome and that outcome's implied probability. Markets are ranked by trading volume, so the questions at the top are the ones attracting the most real-money attention right now.

A rising probability means new money is betting the outcome has become more likely; a falling one means conviction is draining away. Because participants stake actual funds, these odds tend to update faster than polls or pundit forecasts. One common misreading: a probability is a live market price, not a verdict — a market at 80% still expects to be wrong one time in five, and thin markets can swing on a handful of trades.`,
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
  interpretation: `The Fear & Greed index blends price momentum, volatility, volume, social-media activity, and Bitcoin dominance into one daily 0-to-100 score of crypto market mood. This chart plots that score over months, so what the single-number card shows as a snapshot becomes a history of how sentiment has swung.

The line runs between 0 (extreme fear) and 100 (extreme greed), with 50 as the neutral midpoint; its tint follows the latest reading, red for fearful and green for greedy. Long stretches near either extreme mark sentiment regimes; sharp vertical moves mark days when the mood flipped quickly.

Rising values mean optimism is building, falling values mean anxiety is spreading. One common misreading: treating the level as a price forecast. The index measures crowd feeling, and many read its extremes as contrarian signals — prolonged extreme fear has often preceded recoveries, and prolonged greed has often preceded pullbacks — so the chart is most useful for spotting when mood has reached an edge, not for confirming it.`,
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
  interpretation: `Each square is one day's Fear & Greed reading — the 0-to-100 crypto sentiment score that blends momentum, volatility, volume, social chatter, and Bitcoin dominance. Laid out as a calendar, months of market mood read as colored blocks rather than a wandering line.

Red squares are days below the neutral 50 (fear), green squares are days above it (greed), and deeper color means a more extreme reading. What the layout makes visible is duration: a long unbroken band of red shows how many weeks fear actually persisted, and an abrupt color flip shows a mood change that happened overnight rather than gradually.

One common misreading: comparing color depth across different boards or windows. Intensity is ranked within the visible window — the deepest red shown is the most fearful day in view, not necessarily an all-time extreme — so the grid is best read for patterns and streaks, with exact levels left to the number or line-chart siblings.`,
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
  interpretation: `Prediction markets let people bet real money on future events, and the price of a "yes" share works as a probability: 70 cents means the crowd assigns roughly a 70% chance. This chart shows the busiest open markets on Polymarket as horizontal bars.

Each bar's length is the implied probability of that market's leading outcome — a bar reaching most of the way across means the market considers the outcome close to settled, a short bar means it is still a long shot. Markets are ordered by trailing-24-hour trading volume, so the questions drawing the most money sit at the top.

A lengthening bar means fresh money is betting the outcome has become more likely. One common misreading: a probability is a market price, not a verdict — an 80% market still expects to lose one time in five, and odds in thinner markets can move on just a few trades.`,
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
  interpretation: `Each bubble is one open prediction market on Polymarket, where real-money bets set the odds and a share price doubles as a probability. The scatter separates conviction from attention: how likely the crowd thinks the leading outcome is, and how much money is actually trading on the question.

Position reads on two axes — left-to-right is the leading outcome's implied probability (near 50% is a toss-up, near 100% is close to settled), and bottom-to-top is trailing-24-hour trading volume on a log scale, with bubble size repeating the volume cue. So a large bubble in the upper right is a heavily traded market with a confident consensus, while small bubbles near the bottom are thin long shots.

One common misreading: trusting every bubble's odds equally. Low-volume markets sit low on the chart precisely because little money backs their price — their probabilities can swing on a handful of trades, so the higher a bubble sits, the more weight its odds deserve.`,
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
  interpretation: `Each bubble is one open prediction market on Polymarket, where people stake real money on future events and the resulting share price doubles as a probability — 70 cents on a "yes" share means a roughly 70% implied chance.

Two visual cues carry the information. Size shows trailing-24-hour trading volume: the biggest bubbles are the questions attracting the most money right now. Tint shows how decided the leading outcome is: a muted bubble is near a 50/50 toss-up, while a vivid green one is a market the crowd considers close to settled.

A bubble growing means attention is flooding in; its color deepening means consensus is hardening. One common misreading: taking a confident tint as certainty. These are live market prices, not verdicts — a market at 80% still expects to be wrong one time in five, and small, thinly traded bubbles can flip their odds on just a few trades.`,
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
