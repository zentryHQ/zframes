import { defineFrameMeta } from "@zframes/spec/frame";
import { z } from "zod";
import { widgetIcon, SOURCES } from "./shared";

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
  layout: { w: 5, h: 4, minW: 3, minH: 2 },
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

export const mempoolFeeCurveMeta = defineFrameMeta({
  name: "mempool-fee-curve",
  label: "Mempool Fee Curve",
  category: "bitcoin",
  iconUrl: widgetIcon("mempool-fee-curve"),
  layout: { w: 5, h: 3, minW: 3, minH: 2 },
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
  layout: { w: 4, h: 4, minW: 2, minH: 3 },
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
