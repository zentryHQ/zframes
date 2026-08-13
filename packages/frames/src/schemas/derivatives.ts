import { defineFrameMeta } from "@zframes/spec/frame";
import { z } from "zod";
import { widgetIcon, SOURCES, companySymbolField } from "./shared";

export const fundingRateChartMeta = defineFrameMeta({
  name: "funding-rate-chart",
  annotatable: true,
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
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
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

export const putCallGaugeMeta = defineFrameMeta({
  name: "put-call-gauge",
  label: "Put/Call Gauge",
  category: "derivatives",
  iconUrl: widgetIcon("put-call-gauge"),
  layout: { w: 3, h: 3, minW: 2, minH: 2, maxW: 4 },
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
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
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
  layout: { w: 4, h: 4, minW: 2, minH: 2 },
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
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
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

export const optionsMaxPainMeta = defineFrameMeta({
  name: "options-max-pain",
  label: "Max Pain by Strike",
  category: "derivatives",
  iconUrl: widgetIcon("options-max-pain"),
  layout: { w: 6, h: 4, minW: 5, minH: 2 },
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
  layout: { w: 6, h: 4, minW: 5, minH: 2 },
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
  layout: { w: 6, h: 3, minW: 4, minH: 2 },
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
  layout: { w: 4, h: 3, minW: 3, minH: 3 },
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
