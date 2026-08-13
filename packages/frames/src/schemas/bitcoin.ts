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
  interpretation: `Sending a Bitcoin transaction means paying a fee, and this card shows the going rate. Fees are quoted in satoshis per virtual byte (sat/vB) — a price per unit of transaction size, not per amount sent — so moving $10 costs the same as moving $10 million.

Each tile is a speed tier: the number is what a transaction should pay to confirm within that window. "Fastest" targets the very next block (~10 minutes), the middle tiers accept a ~30 or ~60 minute wait, and economy/minimum are the cheapest rates the network will still relay.

- Tiers close together (e.g. all near 1–5 sat/vB): the network is quiet and even cheap transactions confirm quickly.
- A wide spread with a high "fastest": the mempool is congested and urgency is expensive.

Rising fees signal demand for block space — often bursts of activity or hype — not anything about Bitcoin's price direction. These are on-chain fees only; exchange trades don't touch them.`,
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
  interpretation: `The mempool is Bitcoin's waiting room: every transaction that has been broadcast but not yet mined into a block sits there. This card shows how crowded that room is — the count of unconfirmed transactions and their total pending size (vsize, a measure of the block space they'd consume).

The row of blocks is a projection, not history: mempool.space simulates which transactions miners would most profitably pack into the next few blocks. Each projected block is labelled with its median fee rate (sat/vB) and transaction count, next-to-mine first.

A small mempool means transactions clear almost immediately and cheap fees work fine. A swelling backlog means congestion — new transactions must outbid the queue to confirm soon. The projected blocks are estimates and reshuffle constantly as new transactions arrive; a spot in "the next block" is never guaranteed.`,
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
  interpretation: `Bitcoin's ledger grows one block at a time, roughly every ten minutes. This feed lists the most recent ones, newest at the top — each row is one block that has been permanently added to the chain.

The height is the block's position in the chain (a running count since 2009). Alongside it: how long ago the block was found, how many transactions it packed in, which mining pool found it, the total fees those transactions paid (in BTC), and the block's data size.

Gaps between blocks are naturally lumpy — a block two minutes after the last, then a forty-minute wait, is normal luck, not a network problem; only the long-run average is ten minutes. High fee totals mean users were competing hard for space in that block. Seeing the same pool name repeatedly is common — a handful of large pools find most blocks.`,
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
  interpretation: `Hashrate is the total computing power all Bitcoin miners are pointing at the network, measured in exahashes per second (EH/s) — quintillions of guesses per second at the puzzle that seals each block. It is the best single gauge of how much real-world hardware and electricity is securing the chain.

The line charts that power over the chosen window (time on the horizontal axis, EH/s on the vertical); the headline figures show today's hashrate and the current difficulty, which the network retunes so blocks keep arriving every ~10 minutes however much power joins.

A rising line means miners are investing in more machines — a costly, long-horizon bet on the network. A sustained fall usually reflects miner economics (energy prices, halved rewards) or events like regional shutdowns. Hashrate is not the price and doesn't lead it: day-to-day wiggles are largely luck-driven estimates, so read the multi-month slope, not the jitter.`,
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
  interpretation: `Bitcoin aims for one block every ten minutes. Every 2016 blocks (about two weeks) the network checks how fast blocks actually arrived and retunes the mining puzzle's difficulty to pull the pace back to target. This card counts down to that next retarget.

The progress bar tracks how far through the current 2016-block epoch the network is; alongside it sit the blocks remaining, the estimated retarget date, and the projected change. A positive percentage means mining gets harder; negative means easier. The previous adjustment is shown for context.

An upward estimate means blocks have been arriving faster than every ten minutes — more mining power joined — while a downward one means power left the network. The estimate drifts until the epoch actually ends, since it extrapolates from blocks mined so far; early in an epoch it is especially rough. Difficulty says nothing direct about price — it tracks miner activity, not market demand.`,
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
  interpretation: `Most Bitcoin miners don't mine alone — they join pools that combine their machines and split the rewards. This treemap shows which pools found the network's blocks over the chosen window: each tile is one pool, and its area is proportional to the share of blocks it mined.

A few large tiles dominating the square means hashpower is concentrated in a handful of coordinators; many similar-sized tiles means it is spread out. The smallest pools fold into a single "Other" tile.

Concentration matters because a pool controlling a very large share could, in theory, censor or reorder transactions — so a more even map is generally read as healthier. Two caveats: a pool is a coordinator of many independent miners who can switch pools at will, not a single owner of that hardware; and over short windows (24h) the shares are noisy, since finding blocks is a lottery — the weekly or monthly view is the fairer read.`,
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
  interpretation: `The Lightning Network is a payments layer built on top of Bitcoin: participants lock BTC into channels between each other and route many fast, cheap payments through them, settling back to the main chain only when a channel closes. This card is a size snapshot of that network.

Nodes are the participants, channels are the payment links between them, and capacity is the total BTC locked into public channels — the network's routing liquidity. The small delta shows the day-over-day change, and the split shows how many nodes run over Tor (privacy-routed) versus the open internet.

Growing capacity and channel counts signal adoption of Bitcoin as a payment rail rather than just a held asset; shrinkage suggests liquidity being withdrawn. The figures only cover publicly announced channels — private channels are invisible to these crawlers — so the real network is somewhat larger than shown.`,
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
  interpretation: `Difficulty is the network's self-tuning knob: how hard the mining puzzle is set so that, at the current amount of mining power, blocks keep arriving roughly every ten minutes. Every 2016 blocks (about two weeks) it re-adjusts to whatever power is actually online.

The line charts that setting over the chosen window — time on the horizontal axis, the difficulty value on the vertical. Because it only changes at each two-week retarget, the line moves in steps rather than a smooth curve. Current difficulty and hashrate sit above it as headline figures.

A climbing staircase means mining power keeps joining — each step confirms more hardware and energy is competing for blocks, and mining any one block costs more work. Downward steps are rarer and mark miners switching off, historically around price crashes, halvings squeezing margins, or events like regional mining bans. Difficulty follows hashrate with up to a two-week lag; it is a trailing record of miner commitment, not a live gauge and not a price signal.`,
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
  interpretation: `Each Bitcoin block can hold only a limited amount of transaction data. This chart shows how much of that space recent blocks actually used: one bar per block, oldest on the left, newest on the right, with bar height being the block's data size.

Blocks top out around the network's ~4MB weight limit, so a row of tall, even bars means blocks are running full — there is a standing queue of transactions and fees have a floor under them. Short or uneven bars mean spare capacity: the network mined whatever was waiting and had room left over.

A run of full blocks usually accompanies rising fees and a growing mempool; sustained slack usually means fees are cheap. One caveat: a small block is not a network hiccup — if two blocks are found minutes apart, the second simply has fewer waiting transactions to include, so occasional short bars are normal even in busy periods.`,
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
  interpretation: `This chart answers one question: how much does patience save on Bitcoin fees right now? Each bar is a projected future block — the leftmost is the next to be mined, each further bar one block (~10 minutes) later — and its height is the median fee rate (sat/vB) of the transactions expected to fill it.

The tint tracks urgency: hotter bars are the expensive, next-in-line blocks; cooler bars are the cheaper ones further out. The shape of the decay is the story — a steep drop from the first bar means a short burst of urgent demand that waiting one block largely avoids, while a flat, uniformly tall profile means deep congestion where waiting buys little.

These are projections from the current mempool, not commitments: new transactions can outbid the queue and reshuffle every bar within seconds. And the rates are per virtual byte of transaction size, not per amount sent — a large-value payment isn't inherently more expensive.`,
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
  interpretation: `Bitcoin miners mostly work through pools — coordinators that combine many miners' machines and share the rewards. This donut shows how the network's recent blocks were divided among them: each slice is one pool, sized by the fraction of blocks it mined over the window, with the smallest pools grouped into "Other".

The number in the center is the combined share of the three largest pools — a one-glance concentration gauge. The higher it is, the more of the network's block production runs through just three coordinators.

A top-3 share creeping toward or past half the network is the concentration worry: a majority of hashpower could in principle censor transactions. Balanced slices read as healthier. Two cautions apply: pools coordinate independent miners who can leave at any time, so a big slice is not one entity's hardware; and over a 24-hour window shares swing on pure block-finding luck — judge concentration on the weekly or monthly view.`,
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
