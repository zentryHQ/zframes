import { defineFrameMeta } from "@zframes/spec/frame";
import { z } from "zod";
import { widgetIcon, SOURCES } from "./shared";

export const mvrvMeta = defineFrameMeta({
  name: "mvrv",
  label: "MVRV Ratio",
  category: "onchain",
  iconUrl: widgetIcon("mvrv"),
  layout: { w: 3, h: 3, minW: 3, minH: 2, maxH: 3 },
  description:
    "Bitcoin MVRV ratio — market cap ÷ realized cap. Above ~3 historically marks cycle tops (overvalued); below ~1 marks deep value near bottoms. Shows the current ratio, its valuation zone, the MVRV Z-score, and a history sparkline. Keyless on-chain data from Coin Metrics.",
  interpretation: `MVRV compares what all bitcoin is worth now (market cap) with what holders in aggregate paid for it (realized cap — each coin valued at the price it last moved on-chain). A ratio of 2 means the average coin sits on a 2x paper gain.

The card shows the current ratio, a valuation-zone label, the MVRV Z-score (how many standard deviations the gap is from typical), and a sparkline of the ratio's history.

High readings (historically above ~3) mean holders carry large unrealized gains, which has often preceded cycle tops; readings below ~1 mean the market trades under its aggregate cost basis, historically near bottoms. The thresholds are historical tendencies, not triggers — each cycle's extremes have differed.`,
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
  interpretation: `NUPL measures how much of Bitcoin's market value is unrealized (paper) profit: the gap between market cap and realized cap, expressed as a share of market cap.

The value maps onto named sentiment bands — below 0 is Capitulation (the average holder is underwater), 0–25% Hope/Fear, 25–50% Optimism, 50–75% Belief, above 75% Euphoria/Greed. The card shows the current reading, its band, and a history sparkline.

Rising NUPL means holders accumulate paper profit as price climbs; extreme highs have coincided with cycle tops and negative readings with bottoms. It describes crowd positioning, not timing — the market can sit in one band for months.`,
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
  interpretation: `SOPR looks at the coins that actually moved on-chain each day and asks whether they were, on average, sold above or below the price at which they last moved. A value over 1 means the average moved coin realized a profit; under 1, a loss.

The card shows the latest reading and a sparkline of its recent path around the 1.0 line.

Sustained readings below 1 mean holders are selling at a loss — classic capitulation. In uptrends, brief dips that reset to ~1 are typically read as healthy profit-taking finding buyers. Because it counts only coins that moved, quiet days with little on-chain volume make the series noisier.`,
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
  interpretation: `The Puell Multiple compares what miners earn today (the day's newly issued bitcoin, valued in dollars) with their average daily earnings over the past year. It gauges whether miner revenue is unusually rich or unusually thin.

The card shows the current multiple and a sparkline of its history.

High values (historically above ~4) mean miner income is stretched far above its yearly norm, which has coincided with cycle tops. Low values (around 0.5 or below) mark miner capitulation — income compresses and weaker miners switch off — historically near bottoms. It reflects the value of issuance, not price directly, so halvings shift its baseline.`,
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
  interpretation: `The Mayer Multiple is Bitcoin's price divided by its own 200-day moving average — a simple gauge of how stretched price is relative to its long trend. A value of 1 means price sits exactly on the average.

The card shows the current multiple and a sparkline of its history.

Historically, readings above ~2.4 marked overheated rallies and readings below ~0.8 marked value zones. It measures distance from trend, not the network's underlying value, and the thresholds come from past cycles — extended bull markets can hold elevated multiples for long stretches.`,
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
  interpretation: `Pi Cycle Top watches two moving averages of Bitcoin's price: the 111-day MA and twice the 350-day MA. The card tracks their ratio — when the fast average overtakes the doubled slow one (the ratio crossing 1), the indicator fires.

The readout shows how close the ratio is to 1, with a sparkline of its recent path; a rising line means the fast average is gaining on the trigger level.

Past crosses have landed within days of major cycle tops, which is the indicator's whole claim. It says nothing about bottoms, gives no sense of how far away a cross is in time, and a pattern fitted to a handful of past cycles can stop working — the ratio approaching 1 without crossing is common late in rallies.`,
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
  interpretation: `This card divides Bitcoin's price by a very long moving average — two years or four years, chosen in the config — to show how far above or below its multi-year trend price sits.

The card shows the current multiple and a sparkline of its history; 1 means price is exactly on the long average.

On the 2-year version, trading below about 1.5x the average has historically been an accumulation zone, while multiples of 2x to 5x marked escalating late-cycle tiers; the 4-year multiple above ~3.5x has marked tops. These are slow, cycle-scale gauges — they move over months, and their bands are drawn from a small number of past cycles.`,
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

export const cycleSignalsMeta = defineFrameMeta({
  name: "cycle-signals",
  label: "Cycle Signals",
  category: "onchain",
  iconUrl: widgetIcon("cycle-signals"),
  layout: { w: 4, h: 5, minW: 2, minH: 2, maxH: 7 },
  description:
    "A cycle top- or bottom-signal checklist — MVRV, MVRV Z-score, NUPL, Mayer Multiple, Puell, RSI, and Pi Cycle each checked against its historical extreme, with a live 'X of N firing' tally. A capstone that aggregates the on-chain and cycle metrics into one 'how late in the cycle are we' read. Keyless (Coin Metrics + bitcoin-data.com).",
  interpretation: `A checklist that runs several well-known Bitcoin cycle indicators — MVRV, MVRV Z-score, NUPL, Mayer Multiple, Puell Multiple, RSI, and Pi Cycle — and checks each against the extreme level it reached at past cycle tops (or bottoms, depending on the configured mode).

Each row shows the indicator's current value and whether it is past its historical trigger; the header tallies how many of the set are firing at once.

Few or none firing reads as mid-cycle; most firing together has historically meant the market is near an extreme. The tally is a confluence read, not a countdown — these indicators are calibrated on the same past cycles and tend to fire together, so seven checks are not seven independent confirmations.`,
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

export const realizedPriceMeta = defineFrameMeta({
  name: "realized-price",
  annotatable: true,
  label: "Realized Price",
  category: "onchain",
  iconUrl: widgetIcon("realized-price"),
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Bitcoin market price vs realized price — the on-chain cost basis of all coins. Market above realized = aggregate profit; crossing below realized has marked cycle bottoms. Keyless (Coin Metrics).",
  interpretation: `Two lines: Bitcoin's market price and its realized price — the average on-chain cost basis of all coins, computed by valuing each coin at the price when it last moved.

When the market line sits above the realized line, the average holder is in profit; the gap between the two is the market's aggregate paper gain.

Price crossing below realized price means the average holder is underwater — historically rare, and associated with capitulation and cycle bottoms. A wide gap above signals a profit-heavy market where selling pressure can build. Realized price moves slowly, so most of the visible action is in the market line.`,
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
  interpretation: `Reserve Risk relates Bitcoin's price to the conviction of long-term holders — roughly, how much accumulated holding (measured through coin-days not spent) stands behind the current price. It asks whether strong hands are holding cheaply or spending into strength.

The card shows the current value and a sparkline of its recent history.

Low readings mean high conviction at a low price — historically attractive risk/reward, cycle-bottom territory. High readings mean that conviction has been spent into an elevated price, typical of late cycles. The raw number is tiny and only meaningful relative to its own history, which is what the sparkline is for.`,
  capabilities: ["onchain-cycle-extras"],
  source: SOURCES.bitcoinData,
  schema: z.object({
    window: z
      .enum(["90D", "180D", "1Y"])
      .default("1Y")
      .describe("How much history the sparkline shows."),
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
  interpretation: `A list of the liquidity pools drawing the most trading on one chain's decentralized exchanges over the last 24 hours. Each row is a trading pair with the base token's current price, its 24h price change, and the pool's 24h volume.

Rows rank busiest-first, so the top of the list is where on-chain trading attention is concentrated right now — new listings, momentum tokens, pairs reacting to news.

High volume with a big positive change reads as heavy buying; high volume with a deep negative change is heavy selling. A caution: trending pools are often brand-new and thinly traded, so a triple-digit price change on a small pool says more about low liquidity than about genuine adoption.`,
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
  interpretation: `A side-by-side table of major layer-1 blockchains, ranked by how many transactions each confirmed in the last 24 hours, with blocks mined and the current mempool backlog (transactions waiting to be included in a block).

More transactions means more network usage; a swelling mempool means demand for block space currently exceeds supply, which usually pushes fees up on that chain.

Raw transaction counts are not directly comparable across chains — block times, fee models, and what counts as one transaction all differ — so read each chain against its own norm, and treat the ranking as a rough pulse of where activity concentrates rather than a quality score.`,
  capabilities: ["chain-activity"],
  source: SOURCES.blockchair,
  schema: z.object({}),
});

export const dexPoolTreemapMeta = defineFrameMeta({
  name: "dex-pool-treemap",
  label: "DEX Pool Treemap",
  category: "onchain",
  iconUrl: widgetIcon("dex-pool-treemap"),
  layout: { w: 5, h: 4, minW: 5, minH: 2 },
  description:
    "Treemap of trending DEX pools on a chain sized by 24h trading volume, tiles colored green/red by 24h price change. Shows at a glance which pairs are pulling the most on-chain volume. Keyless (GeckoTerminal free tier).",
  interpretation: `Trending DEX pools on one chain drawn as a treemap: each tile is a liquidity pool, its area proportional to 24h trading volume, its color green where the base token is up over 24 hours and red where it is down.

Big tiles are where on-chain trading is concentrated; small tiles are minor pools that still made the trending list. A mostly-green board reads as broad risk-on trading, mostly-red as broad selling.

Area encodes volume, not value or size of the project — a small new token can own the biggest tile for a day. Trending pools also skew toward the newest, thinnest markets, so violent color on a small tile usually reflects low liquidity more than conviction.`,
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

export const chainActivityBarsMeta = defineFrameMeta({
  name: "chain-activity-bars",
  label: "Chain Activity Bars",
  category: "onchain",
  iconUrl: widgetIcon("chain-activity-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
  description:
    "24h confirmed transactions per major L1 (Bitcoin, Ethereum, Litecoin, Dogecoin, …) as a horizontal bar chart, ranked busiest-first — cross-chain usage compared at a glance. The chart-first sibling of the Chain Activity table. Keyless (Blockchair).",
  interpretation: `Confirmed transactions over the past 24 hours per major layer-1 blockchain, drawn as horizontal bars ranked busiest-first. A longer bar means more transactions confirmed on that chain.

The chart answers one question at a glance: where on-chain usage is concentrated right now, and how lopsided the gap is between the leaders and the rest.

Transaction counts are an activity proxy, not a value one — chains differ in block times and in how much work a single transaction does, so a chain with cheap, fast blocks naturally posts bigger counts. Compare a chain's bar with its own usual length rather than reading the ranking as a quality score.`,
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

export const dexPoolBubblesMeta = defineFrameMeta({
  name: "dex-pool-bubbles",
  label: "DEX Pool Bubbles",
  category: "onchain",
  iconUrl: widgetIcon("dex-pool-bubbles"),
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
  description:
    "Trending DEX pools on a chain as a bubble cloud — area by 24h trading volume, ring tinted green/red by 24h price change. Which pairs are pulling the most on-chain volume. Keyless (GeckoTerminal free tier).",
  interpretation: `Trending DEX pools on one chain as a bubble cloud: each bubble is a liquidity pool, its area scaled to 24h trading volume, its ring tinted green where the base token is up over 24 hours and red where it is down.

Large bubbles are the pairs pulling the most on-chain volume; the color mix shows whether the hot end of the market is being bought or sold.

Bubble size compares volume within this trending set only, not against the whole market. Trending pools skew new and thin, so a large, deeply red or green bubble often marks a low-liquidity token making an outsized move rather than a major market event.`,
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

export const dexPoolLiquidityScatterMeta = defineFrameMeta({
  name: "dex-pool-liquidity-scatter",
  label: "DEX Pool Liquidity Scatter",
  category: "onchain",
  iconUrl: widgetIcon("dex-pool-liquidity-scatter"),
  layout: { w: 6, h: 4, minW: 4, minH: 2 },
  description:
    "Trending DEX pools on a chain as a liquidity-vs-volume bubble scatter — pool reserves on a log x-axis, 24h trading volume on a log y-axis, bubble size by 24h trade count, tinted green/red by 24h price change. Surfaces deep, active pools versus thin or quiet ones. Keyless (GeckoTerminal free tier).",
  interpretation: `Each bubble is a trending DEX pool, placed by its reserves (liquidity) on the horizontal axis and its 24h trading volume on the vertical — both log scales, so each gridline step means roughly 10x. Bubble size shows the 24h trade count, and the tint is green or red by 24h price change.

Position is the read: upper-right pools are deep and busy (established markets), lower-right are deep but quiet, and the upper-left corner — heavy volume on thin reserves — is where prices move violently and slippage is worst.

Volume far above liquidity is the classic hot-new-token signature. It can be genuine discovery or churn, but either way the thin pool means the printed price change cost relatively little money to produce.`,
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

export const chainPriceMoversMeta = defineFrameMeta({
  name: "chain-price-movers",
  label: "Chain Price Movers",
  category: "onchain",
  iconUrl: widgetIcon("chain-price-movers"),
  layout: { w: 4, h: 4, minW: 2, minH: 1, maxH: 4 },
  description:
    "24h native-asset price change per major L1 (Bitcoin, Ethereum, Litecoin, Dogecoin, …) as a diverging bar chart, gains right in green, losses left in red. The price-led sibling of the Chain Activity Bars transaction chart. Keyless (Blockchair).",
  interpretation: `The 24h price change of each major layer-1's native asset (BTC for Bitcoin, ETH for Ethereum, and so on) drawn as a diverging bar chart: gains extend right in green, losses extend left in red, and the bar's length is the size of the move.

A glance shows whether the major chains are moving together — mostly green or mostly red reads as market-wide sentiment — or whether one chain is diverging from the pack.

This chart is about the coins' prices, not the networks' usage; a chain's asset can rally with no change in activity and vice versa. Its sibling, Chain Activity Bars, shows the transaction side of the same set.`,
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
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "Major L1s as a bubble scatter — 24h native-asset price change on the x-axis, 24h confirmed transactions on a log y-axis, bubble size by current mempool backlog. Shows which chains are both moving in price and busy on-chain. Keyless (Blockchair).",
  interpretation: `Major layer-1 chains as bubbles: the 24h price change of each chain's native asset on the horizontal axis, its 24h confirmed transactions on a log vertical axis, and bubble size by the chain's current mempool backlog (transactions waiting for a block).

Upper-right bubbles are chains that are both rallying and busy; lower-left are falling and quiet. A big bubble means congestion — demand for block space is outrunning supply, which usually means rising fees on that chain.

Price and activity are related but not locked together: a chain can be very busy while its coin falls, since heavy selling is still activity. And the log y-axis compresses huge gaps — chains one gridline apart differ by roughly 10x in transactions.`,
  capabilities: ["chain-activity"],
  source: SOURCES.blockchair,
  schema: z.object({}),
});

export const mvrvZscoreChartMeta = defineFrameMeta({
  name: "mvrv-zscore-chart",
  annotatable: true,
  label: "MVRV Z-Score Chart",
  category: "onchain",
  iconUrl: widgetIcon("mvrv-zscore-chart"),
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Bitcoin MVRV Z-Score plotted as a full daily time-series line, not just a sparkline — how many standard deviations market cap sits above realized cap across the whole available history. Historically, spikes above ~7 have marked cycle tops and dips below 0 mark deep-value bottoms. The chart-first sibling of the MVRV gauge. Keyless (Coin Metrics).",
  interpretation: `The MVRV Z-score measures how far Bitcoin's market cap sits above or below its realized cap (the aggregate on-chain cost basis of all coins), in standard deviations — normalizing the market's paper gain against its own historical volatility.

The card draws the full daily series as a line, so the shape of past cycles is visible: sharp spikes at tops, long troughs at bottoms, and where today's reading sits against both.

Historically, spikes above roughly 7 have marked cycle tops, and dips below 0 (market cap under realized cap) have marked deep-value bottoms. The extremes have trended lower across cycles as the market has grown, so past thresholds are landmarks rather than fixed triggers.`,
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
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Net Unrealized Profit/Loss plotted as a full daily time-series line across Bitcoin's cycle sentiment bands — Capitulation, Hope/Fear, Optimism, Belief, Euphoria/Greed. The chart-first sibling of the NUPL gauge. Keyless (Coin Metrics).",
  interpretation: `Net Unrealized Profit/Loss as a full daily line: the share of Bitcoin's market cap that is unrealized (paper) profit, drawn across colored sentiment bands from Capitulation (below 0) through Hope/Fear, Optimism, and Belief up to Euphoria/Greed (above 75%).

The line's position within the bands is the read — which mood regime the market is in, and how it has traveled through past cycles' full arcs from despair to euphoria and back.

Time spent in the upper bands has historically clustered around cycle tops, and dips below zero around bottoms. Band crossings are slow, regime-scale events rather than trade signals; the market can hold one band for many months.`,
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
  layout: { w: 6, h: 4, minW: 4, minH: 2 },
  description:
    "Three cycle-valuation signals — MVRV Z-Score, NUPL, and BTC's 14-day RSI — overlaid on one chart, each independently min-max normalized to 0–100% over the selected window so their unrelated native scales become directly comparable. All three near the top together reads late-cycle euphoria; all three near the bottom reads capitulation. Keyless (Coin Metrics).",
  interpretation: `Three cycle gauges on one chart — MVRV Z-score, NUPL, and Bitcoin's 14-day RSI. Their native scales are unrelated, so each line is independently rescaled to 0–100% of its own range over the selected window, making the shapes directly comparable.

When all three lines crowd the top together, valuation, holder profit, and price momentum are simultaneously stretched — the classic late-cycle euphoria picture. All three at the bottom together reads as capitulation.

The rescaling is the thing to remember: 100% means the highest that signal has been within the chosen window, not an all-time extreme. A short window makes ordinary wiggles fill the whole scale, so the overlay is about agreement between the lines, not their absolute level.`,
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
  layout: { w: 6, h: 4, minW: 4, minH: 2 },
  description:
    "SOPR, Puell Multiple, and Reserve Risk overlaid on one chart, each independently min-max normalized to 0–100% over the selected window — three on-chain cycle oscillators with unrelated native scales made directly comparable. Keyless (bitcoin-data.com; polled once daily, best-effort per metric).",
  interpretation: `Three on-chain cycle oscillators on one chart — SOPR (whether coins moving on-chain are selling at a profit or a loss), the Puell Multiple (miner revenue against its yearly norm), and Reserve Risk (long-term-holder conviction relative to price). Their native scales are unrelated, so each line is independently rescaled to 0–100% of its own range over the selected window.

The overlay reads by agreement: all three pressed high together suggests a stretched, late-cycle market; all three depressed suggests capitulation showing up across sellers, miners, and holders at once.

As with any normalized overlay, 100% means that signal's high within the chosen window, not an all-time extreme — a calm window makes small moves fill the whole scale.`,
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
  interpretation: `Ethereum's net annual supply growth under proof-of-stake — new ETH issued to validators minus ETH destroyed by the EIP-1559 fee burn — compared against the counterfactual: what issuance would look like if Ethereum still ran proof-of-work.

The bars diverge from zero: a green bar below zero means supply is actually shrinking (the burn outpaces issuance — deflation), a red bar above zero means net inflation. The PoW bar shows how much heavier issuance used to be before the Merge.

The burn scales with network usage, so ETH flips between mildly inflationary and deflationary depending on how busy the chain is — the deflationary state is activity-dependent, not guaranteed.`,
  capabilities: ["eth-supply"],
  source: SOURCES.ultrasound,
  schema: z.object({}),
});
