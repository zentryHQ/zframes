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

export const chainActivityBarsMeta = defineFrameMeta({
  name: "chain-activity-bars",
  label: "Chain Activity Bars",
  category: "onchain",
  iconUrl: widgetIcon("chain-activity-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
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

export const dexPoolLiquidityScatterMeta = defineFrameMeta({
  name: "dex-pool-liquidity-scatter",
  label: "DEX Pool Liquidity Scatter",
  category: "onchain",
  iconUrl: widgetIcon("dex-pool-liquidity-scatter"),
  layout: { w: 6, h: 4, minW: 4, minH: 2 },
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

export const chainPriceMoversMeta = defineFrameMeta({
  name: "chain-price-movers",
  label: "Chain Price Movers",
  category: "onchain",
  iconUrl: widgetIcon("chain-price-movers"),
  layout: { w: 4, h: 4, minW: 2, minH: 1, maxH: 4 },
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
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "Major L1s as a bubble scatter — 24h native-asset price change on the x-axis, 24h confirmed transactions on a log y-axis, bubble size by current mempool backlog. Shows which chains are both moving in price and busy on-chain. Keyless (Blockchair).",
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
