import { defineFrameMeta } from "@zframes/spec/frame";
import { z } from "zod";
import { widgetIcon, SOURCES, bubbleTopN } from "./shared";

export const tvlTreemapMeta = defineFrameMeta({
  name: "tvl-treemap",
  label: "TVL Treemap",
  category: "crypto",
  iconUrl: widgetIcon("tvl-treemap"),
  layout: { w: 6, h: 4, minW: 2, minH: 2 },
  description:
    "Treemap of total value locked (TVL) across the largest blockchain ecosystems, sized by TVL. Data from DeFiLlama. Good single-glance answer to 'where does on-chain capital live right now'.",
  interpretation: `Total value locked (TVL) is the dollar value of all assets deposited into a blockchain's DeFi applications — lending pools, exchanges, staking contracts. It is the closest thing to a measure of how much capital actually lives on each chain.

Each rectangle is one blockchain, and its area is proportional to that chain's TVL: the bigger the tile, the more capital the chain holds. The layout re-ranks as values change, so the largest chains always sit most prominently.

A chain growing its tile over time is attracting deposits, new applications, or both; a shrinking tile means capital is leaving or asset prices there are falling. One caution: TVL is priced in dollars, so a rally in the deposited tokens inflates TVL without a single new deposit — a rising tile is not automatically new money arriving.`,
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
  interpretation: `Dominance is an asset's share of the entire crypto market's value: Bitcoin's market cap divided by the market cap of everything combined. The bar splits that whole into three segments — Bitcoin, Ethereum, and everything else — so the three widths always sum to 100%.

A wider Bitcoin segment means capital is concentrated in the market's largest, most conservative asset; a shrinking one means smaller coins are growing faster, which historically accompanies risk-seeking phases. The optional total-market-cap figure below the bar shows whether the whole pie is growing or shrinking while the shares shift.

The common misreading: dominance is a share, not a price. Bitcoin dominance can rise while Bitcoin's price falls — it only requires everything else to fall harder. A dominance move says how Bitcoin did relative to the rest, never how it did in absolute terms.`,
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

export const dexVolumeTreemapMeta = defineFrameMeta({
  name: "dex-volume-treemap",
  label: "DEX Volume Treemap",
  category: "crypto",
  iconUrl: widgetIcon("dex-volume-treemap"),
  layout: { w: 6, h: 4, minW: 4, minH: 2 },
  description:
    "Treemap of decentralized-exchange (DEX) protocols sized by trailing-24h trading volume, tiles colored green/red by 1-day change. Data from DeFiLlama. One-glance read on where on-chain trading flow is concentrated right now.",
  interpretation: `Decentralized exchanges (DEXes) are trading venues that run as on-chain programs rather than companies. This card measures how much trading each one processed in the last 24 hours, in dollars.

Each tile is one exchange; its area is proportional to that 24-hour volume, and its color shows the one-day change — green means volume grew versus the prior day, red means it shrank. Big tiles are where trading actually happens; tiny tiles are niche venues.

Rising volume across the board usually accompanies volatile markets — trading activity spikes when prices move sharply in either direction, so a wall of green here signals action, not optimism. A single exchange's tile growing while others shrink suggests flow is migrating, often chasing a newly incentivized pool or a hot token that only trades there.`,
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
  interpretation: `Each line tracks one decentralized exchange's daily trading volume — the dollar value of all swaps it processed that day — over the chosen lookback window. Time runs left to right; dollars run up the y-axis.

Reading it is mostly about comparing the lines: which venue handles the most flow, and whether the gap between them is widening or closing. A line pulling away from the pack means that exchange is winning traders; converging lines mean the market share race is tightening.

Daily volume is naturally spiky — weekends dip, volatile days spike everywhere at once. A one-day spike shared by every line reflects a market-wide event, not any one exchange's success; only a divergence between the lines says something about the venues themselves.`,
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
  interpretation: `Total value locked (TVL) is the dollar value of assets users have deposited into a DeFi protocol — collateral in a lender, liquidity in an exchange, stake in a staking service. This card ranks individual applications rather than whole blockchains.

Each tile is one protocol; area is proportional to its TVL, and color shows the one-day change — green for growing, red for shrinking. The biggest tiles are where DeFi's capital is actually parked.

Growing TVL generally signals user trust and adoption; a sudden shrink can mean withdrawals, an exploit, or simply falling prices of the deposited assets. That last point is the standard trap: TVL is denominated in dollars, so a market-wide selloff turns every tile red without anyone withdrawing a cent.`,
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
  interpretation: `Each line tracks one DeFi protocol's total value locked (TVL) — the dollar value of assets users have deposited into it — day by day over the chosen window. Time runs left to right, dollars up the y-axis.

A rising line means the protocol is accumulating deposits or the assets in it are appreciating; a falling one means withdrawals or falling prices. Comparing lines shows which protocols are gaining or losing ground against each other.

Because TVL is priced in dollars, all lines tend to move together with the broad market — a synchronized dip usually reflects prices, not an exodus. The informative moments are divergences: one line climbing while its peers are flat suggests genuine inflows.`,
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
  interpretation: `Fees are what users actually paid a protocol in the last 24 hours — trading fees on an exchange, interest on a lender, gas on a blockchain. Unlike deposits or market cap, fees are money changing hands, so this is the closest thing to a revenue-activity map of crypto.

Each tile is one protocol; area is proportional to its 24-hour fees, and the tint shows the one-day change — green if fees grew versus yesterday, red if they shrank. Large tiles are where real paid usage concentrates.

High fees signal genuine demand for a protocol's service, but note the distinction the sizing hides: fees are what users paid, not what the protocol kept — many protocols pass most fees through to liquidity providers or stakers. A large tile means heavy use, not necessarily a profitable protocol.`,
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
  interpretation: `Market capitalisation is a coin's price multiplied by its circulating supply — a rough measure of the total value the market assigns to it. This card lays the largest coins out as a mosaic weighted by that value.

Each tile is one coin; area is proportional to market cap, and color shows the 24-hour price change — green up, red down, with stronger moves tinted more intensely. Because area encodes size, a sea of small red tiles matters far less than one large red tile.

A mostly-green board reads as a broad rally; green large caps with red small tiles suggests capital hiding in the majors. One caution: market cap depends on circulating supply, which for newer tokens can be a small fraction of the eventual total — two equally-sized tiles can carry very different amounts of future dilution.`,
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

export const stablecoinSupplyMeta = defineFrameMeta({
  name: "stablecoin-supply",
  label: "Stablecoin Supply",
  category: "crypto",
  iconUrl: widgetIcon("stablecoin-supply"),
  layout: { w: 3, h: 3, minW: 3, minH: 2, maxH: 3 },
  description:
    "Total USD-stablecoin circulating supply — a market-wide liquidity gauge. Rising supply = fresh capital entering crypto (risk-on dry powder); contraction = risk-off. Shows the total, 1d/7d/30d change, and the largest chains. Keyless (DeFiLlama).",
  interpretation: `Stablecoins are tokens pegged to the US dollar (USDT, USDC, and peers). Their combined circulating supply is a gauge of how many dollars are sitting inside crypto, ready to be deployed — often called dry powder.

The card shows the headline total, its change over one, seven and thirty days, and which blockchains hold the most of it. Green change figures mean the supply grew over that window; red means it contracted.

Sustained growth typically means fresh capital is entering the ecosystem — investors mint stablecoins before buying anything else — and is read as a bullish liquidity backdrop. Sustained contraction means dollars are being redeemed and leaving. Note that supply measures capacity, not action: a large stablecoin float can sit idle for months, so growth signals potential demand rather than buying already underway.`,
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
  interpretation: `DeFi pools pay depositors a yield — quoted here as APY, the annualized percentage return — for supplying assets to lenders, exchanges, and staking services. This list ranks the highest-paying pools that clear the configured liquidity floor.

Each row shows the pool, its APY (split into base yield earned from real activity and reward yield paid in incentive tokens), the pool's size (TVL), its chain, and whether it carries impermanent-loss (IL) risk — the loss a two-asset pool suffers when its assets' prices diverge.

By construction this is the extreme right tail of thousands of pools, so the quoted rates are outliers, not the norm. Higher APY almost always prices in more risk: incentive tokens that may collapse in value, thin pools, or IL exposure. A large base APY on a deep pool is a stronger signal of durable yield than a huge reward APY on a small one.`,
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
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Histogram of APY across every DeFi pool that clears the TVL floor — what yield is actually on offer, rather than the ten headline pools. The yield scanner's top-8 list is by construction the extreme right tail; this shows the distribution it was drawn from, so a '40% APY' can be read as remarkable or ordinary. Marks the median, and the far tail is folded into the end bar so a handful of 5000% incentive pools can't flatten the rest. Keyless (DeFiLlama yields).",
  interpretation: `A histogram of the yields (APY, annualized percentage return) on offer across every DeFi pool clearing the liquidity floor. Instead of listing the top payers, it shows the whole distribution they were drawn from.

APY runs along the x-axis in buckets; each bar's height is how many pools fall in that bucket. The marked median is the yield a typical pool actually pays, and the rightmost bar folds in the extreme tail so a few outlandish incentive quotes cannot flatten the rest of the picture.

The point of the card is calibration: a quoted 40% APY is remarkable if the median sits at 3%, and ordinary if the whole distribution has shifted right. A distribution bunched near zero signals a low-yield regime; a long fat right tail signals aggressive incentive programs running somewhere. Headline yields from any top-10 list are, by construction, the extreme edge of this chart — never the typical experience.`,
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

export const tokenUnlockScheduleMeta = defineFrameMeta({
  name: "token-unlock-schedule",
  annotatable: true,
  label: "Unlock Schedule",
  category: "crypto",
  iconUrl: widgetIcon("token-unlock-schedule"),
  layout: { w: 6, h: 4, minW: 3, minH: 4 },
  description:
    "How much supply is about to hit the market, and who gets it — the crypto equivalent of a share-lockup expiry, and the only forward-looking supply data available keylessly. Charts cumulative unlocked supply with the observed history and the SCHEDULED future drawn as separate lines, so a projection can never be misread as history, and lists the next unlock events with their dates, categories and token amounts. Also states the insider share now against its fully-vested end state, and how far through the documented schedule the token is. A fully-vested token legitimately has no upcoming events, which the card says rather than rendering empty. Keyless (DeFiLlama's published emissions dataset). Keyed by protocol SLUG, and only around 366 protocols publish a schedule at all.",
  interpretation: `Most tokens launch with a large share of supply locked up for the team, investors, and treasury, released on a published schedule. An unlock puts new tokens into hands that may sell — the crypto analogue of a share-lockup expiry — so the schedule is forward-looking supply pressure a price chart cannot show.

The chart plots cumulative unlocked supply over time: the solid history is what has already vested, and the separately-drawn future line is the SCHEDULE — a projection, not a fact. Below it, the next unlock events list their dates, recipient categories (team, investors, ecosystem), and token amounts, alongside the insider share now versus fully vested.

Large near-term unlocks, especially to investors or team, are potential sell pressure; a token deep into its schedule has little dilution left ahead. A steep future line relative to circulating supply is the number to notice — a headline unlock is only meaningful relative to how much already trades.`,
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
  interpretation: `A single token's research card — the crypto counterpart of a company profile, since a token files no reports. It gathers identity, price and returns, valuation, supply, all-time extremes, category tags, links, and a public-repository activity readout in one place.

The key block is the supply triple: circulating (tokens trading now), total (tokens minted), and max (the hard cap, if any). The gap between market cap (price times circulating) and fully diluted valuation (price times max) is the dilution still ahead. An absent max supply means the token is uncapped — more can always be minted — and is never the same as a cap of zero.

The all-time-high distance says how far price sits from its best; deep drawdowns are normal in crypto and not by themselves a signal. The repository readout measures one public repo only, so a monorepo or rename distorts it, and thin coverage below the majors is expected — an empty field usually means unpublished, not zero.`,
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
  interpretation: `This card answers the question a price chart cannot: how much of a token's supply is not on the market yet. Market cap values only the circulating tokens; fully diluted valuation (FDV) values the whole eventual supply at today's price. The gap between them is future dilution.

The horizontal bar splits the supply into circulating tokens, tokens minted but locked (team, investors, vesting, treasury), and any unminted headroom under a hard cap. The figures above state the circulating share and the FDV/market-cap multiple — a multiple near 1 means almost everything already trades; a large multiple means most of the supply is still to come.

The classic misreading is treating market cap as the price of the whole project: a small-cap token with a 10x FDV multiple is valued far higher than its market cap suggests. Note also that FDV means different things by regime — for a capped asset it is a real ceiling, while for an uncapped one it is only a floor, since more can always be minted; the card's wording follows the regime.`,
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
  interpretation: `A protocol's income statement in two daily lines: fees, the total users paid to use it, and revenue, the slice the protocol itself kept after passing the rest through to liquidity providers, suppliers, or stakers. Trailing 30-day and 365-day totals and the implied take rate sit alongside the chart.

Time runs left to right; both series are daily dollar figures on the y-axis. The vertical gap between the two lines IS the take rate — lines close together mean the protocol keeps most of what users pay; a wide gap means it is largely a pass-through.

Rising fees signal growing usage; rising revenue signals the protocol converting that usage into income for itself. The misreading this card exists to prevent: valuing a protocol on its fees. Uniswap's roughly 845M of trailing fees became about 30M of kept revenue — a fee-based multiple flatters a pass-through protocol by an order of magnitude.`,
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
  interpretation: `Valuation multiples for a token, in the spirit of a stock's P/E: the token's value divided by what its protocol earns over a trailing year. Lower means cheaper relative to earnings; higher means the market is paying more per dollar earned.

Four figures are shown. Price-to-sales divides market cap by kept revenue; price-to-fees divides by gross fees users paid. Each is then repeated against fully diluted valuation (FDV) — price times the eventual full supply — which is the honest numerator for a token with a large locked supply still to unlock.

Two readings to avoid. First, a fees-based multiple flatters a pass-through protocol: fees are what users paid, revenue is what the protocol kept, and the two can differ enormously — price-to-sales is the comparable figure. Second, the market-cap multiple understates a token whose supply is mostly locked; when the FDV multiple is several times the market-cap one, dilution is doing the work. Crypto multiples also run far higher than equity ones, so compare tokens against tokens.`,
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
  interpretation: `The sum of fees paid by users across every tracked crypto protocol in the last 24 hours, with a short daily trend. Fees are money actually spent to use blockchains and their applications, so this total is a gauge of real economic activity rather than speculation about it.

The headline figure is the trailing-24h total in dollars; the trend line shows how that daily total has moved recently.

Rising aggregate fees mean people are transacting, trading, and borrowing more — activity usually correlated with volatile or busy markets. Falling fees mean quiet chains. Because fee spend spikes when prices move sharply in either direction, a jump here signals activity, not necessarily optimism — crash days are often record fee days.`,
  capabilities: ["fees-overview"],
  source: SOURCES.defillama,
  schema: z.object({}),
});

export const ethSupplyMeta = defineFrameMeta({
  name: "eth-supply",
  label: "ETH Ultrasound",
  category: "crypto",
  iconUrl: widgetIcon("eth-supply"),
  layout: { w: 4, h: 3, minW: 3, minH: 2, maxH: 3 },
  description:
    "Ethereum supply economics — EIP-1559 burn vs PoS issuance and the resulting net annual supply growth. Negative growth = deflationary ('ultrasound money'). Shows the net rate, burn/issuance, and vs the counterfactual PoW issuance. Keyless (ultrasound.money).",
  interpretation: `Ethereum's money supply moves in two directions at once: new ETH is issued to reward validators who secure the network, while a slice of every transaction fee is permanently destroyed (burned). This card nets the two into an annual supply growth rate.

The headline is that net rate: a negative number means more ETH is being burned than issued and the total supply is shrinking — the deflationary state nicknamed ultrasound money. The burn and issuance components are shown separately, plus a comparison against what the old proof-of-work system would have issued.

The burn scales with network usage, so deflation is really an activity gauge: busy chain, big burn, shrinking supply; quiet chain, small burn, mild inflation. Ethereum flips between the two with usage — a deflationary reading is a snapshot of current demand for blockspace, not a permanent property of the asset.`,
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
  interpretation: `The annual return an Ethereum validator earns for staking ETH to secure the network — the closest thing the ecosystem has to a benchmark interest rate, often called the risk-free ETH rate (risk-free relative to other crypto yields, not in the treasury-bill sense).

The total APR splits into three sources: consensus issuance (new ETH the protocol pays validators), MEV (extra income from ordering transactions in blocks), and priority tips (fees users pay to jump the queue). Issuance is steady; the other two rise and fall with how busy and volatile the chain is.

A rising rate usually reflects hectic on-chain activity fattening tips and MEV; issuance yield mechanically falls as more ETH is staked, since the same rewards spread across more validators. This rate is also the yardstick DeFi yields are judged against — an ETH yield below it raises the question of why the extra risk is being taken.`,
  capabilities: ["eth-supply"],
  source: SOURCES.ultrasound,
  schema: z.object({}),
});

export const etfFlowsMeta = defineFrameMeta({
  name: "etf-flows",
  label: "Spot ETF Flows",
  category: "crypto",
  iconUrl: widgetIcon("etf-flows"),
  layout: { w: 4, h: 4, minW: 3, minH: 3, maxH: 5 },
  description:
    "Spot Bitcoin or Ethereum ETF daily net flows — per-issuer (IBIT, FBTC, GBTC, …) plus the total, with a recent trend. The biggest institutional-demand signal. Keyless (SoSoValue); best-effort, may show empty if the source is unavailable.",
  interpretation: `Spot ETFs hold actual Bitcoin or Ethereum and trade on stock exchanges — the regulated wrapper through which traditional investors buy crypto. Net flow is the day's creations minus redemptions: money moving into or out of the funds.

The card lists each issuer's daily net flow (IBIT is BlackRock's, FBTC Fidelity's, GBTC the converted Grayscale trust) plus the total, with a recent trend. Green positive figures are inflows; red negative ones are outflows.

Sustained inflows are the clearest available signal of institutional demand — every inflow dollar forces the fund to buy the underlying asset. Persistent outflows signal that demand reversing. One caution: flows are demand through this one channel, not the whole market, and a single issuer's outflow (historically GBTC, whose higher fees drove rotation) can reflect switching between funds rather than selling crypto exposure.`,
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
  interpretation: `The coins people are searching for most right now on CoinGecko — a gauge of retail attention, not of price or size. Each row shows the coin's trending rank, current price, and 24h change, colored green for up and red for down.

Attention concentrates around whatever is moving hardest: fresh listings, meme coins mid-pump, and assets in the news. A major like Bitcoin appearing here means the whole market has eyes on it; an obscure micro-cap at rank one usually means a speculative frenzy is underway somewhere small.

The misreading to avoid is treating trending as endorsement or momentum. Search interest spikes on crashes as readily as rallies, and by the time a coin tops this list, much of the attention-driven move has often already happened.`,
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
  interpretation: `Crypto coins cluster into thematic sectors — layer-1 blockchains, DeFi, AI tokens, meme coins, real-world assets, and more. This list ranks those sectors by how much their combined market value changed in the last 24 hours.

Green percentages mean the sector's total market cap grew; red means it shrank. The ordering is the point: the sectors at the top are where capital flowed today, the ones at the bottom are where it left.

A single sector outperforming a flat market suggests a genuine rotation or a sector-specific catalyst; everything green together is just a market-wide rally wearing sector labels. Note that many sectors are dominated by one or two large coins, so a sector's move often restates one coin's day rather than a broad theme.`,
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

export const stablecoinChainsMeta = defineFrameMeta({
  name: "stablecoin-chains",
  label: "Stablecoin Chains",
  category: "crypto",
  iconUrl: widgetIcon("stablecoin-chains"),
  layout: { w: 5, h: 4, minW: 1, minH: 1, maxH: 4 },
  description:
    "Where stablecoin liquidity sits — a treemap of the largest chains by stablecoin circulating supply. Complements the Stablecoin Supply total with the cross-chain distribution. Keyless (DeFiLlama).",
  interpretation: `Stablecoins — dollar-pegged tokens like USDT and USDC — are the cash of crypto, and this card shows which blockchains that cash sits on. Each tile is one chain, its area proportional to the dollar value of stablecoins circulating there.

The biggest tiles are where crypto's spendable liquidity lives, which is a strong predictor of where trading and DeFi activity can happen: capital transacts where it is already parked.

A chain's tile growing over time means stablecoins are bridging in — often an early sign of an ecosystem attracting users, since liquidity tends to arrive before activity. Note that a large stablecoin base measures capacity, not motion: some chains hold big idle treasuries, so size here means potential, not necessarily bustle.`,
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
  interpretation: `Crypto's thematic sectors — layer-1 blockchains, DeFi, AI tokens, memes, real-world assets — laid out as a mosaic. Each tile is one sector; its area is proportional to the sector's combined market value, and its color shows the 24-hour change: green up, red down, deeper tints for bigger moves.

Because size and change are encoded together, the board answers two questions at once: which themes are big, and which are moving today. A bright green small tile is a hot niche; a red giant drags the whole market with it.

Uniform color across the board is just the market's day restated by theme — the informative pattern is contrast, one sector glowing against a neutral field. And since many sectors are dominated by a single large coin, a tile's move often reflects that one coin rather than a broad thematic shift.`,
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
  interpretation: `Spot Bitcoin and Ethereum ETFs hold the actual asset and trade on stock exchanges; their daily net flow is the money entering (creations) minus the money leaving (redemptions). This chart draws that daily figure as a line over time.

Time runs left to right; the y-axis is dollars per day, with the zero line the boundary between inflow and outflow. Points above zero are days institutions and their clients added exposure; points below are days they withdrew.

Long stretches above zero are the strongest available read on sustained institutional demand — each inflow dollar obliges the fund to buy the underlying. The line is naturally jagged day to day, so the multi-week drift matters more than any single print; markets are also closed weekends and holidays, so gaps are absence of trading, not zero demand.`,
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

export const nftCollectionsMeta = defineFrameMeta({
  name: "nft-collections",
  label: "NFT Collections",
  category: "crypto",
  iconUrl: widgetIcon("nft-collections"),
  layout: { w: 3, h: 4, minW: 3, minH: 2, maxH: 7 },
  description:
    "Blue-chip NFT collections ranked by 24h trading volume — floor price (USD), 24h floor change, and volume, for a hand-picked set of majors (Bored Ape, Pudgy Penguins, CryptoPunks, Azuki, …). Keyless (CoinGecko free tier). A quick read on where the top NFT market is trading.",
  interpretation: `NFT collections are sets of unique tokens (profile pictures, art series) traded piece by piece. The floor price is the cheapest listed item in a collection — the market's minimum price of entry, and the standard health gauge since averages are skewed by rare pieces.

Each row is one blue-chip collection, ranked by 24-hour trading volume, showing the floor in USD, the 24h floor change (green up, red down), and the volume traded.

Rising floors on real volume signal genuine demand; a rising floor on near-zero volume can be a single relisting rather than a market. Volume is the honesty check throughout — NFT markets are thin, so floor moves without trades behind them are quotes, not prices. Note the floors here are converted to dollars, so an ETH-priced collection's floor can drift in USD terms purely on ETH's own move.`,
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

export const nftTreemapMeta = defineFrameMeta({
  name: "nft-treemap",
  label: "NFT Treemap",
  category: "crypto",
  iconUrl: widgetIcon("nft-treemap"),
  layout: { w: 4, h: 4, minW: 4, minH: 3 },
  description:
    "Treemap of blue-chip NFT collections sized by market capitalisation, tiles colored green/red by 24h floor-price change. A heat-map of the top NFT market at a glance. Keyless (CoinGecko free tier).",
  interpretation: `The top NFT collections as a mosaic. Each tile is one collection; its area is proportional to the collection's market capitalisation — roughly the floor price times the number of items — and its color shows the 24-hour floor-price change: green up, red down.

Big tiles are where the most value sits; the coloring shows which of those floors moved today. A large tile turning deep red is the top of the NFT market repricing; small tiles flickering matters far less in dollar terms.

Treat NFT market cap gently: it assumes every item in a collection could sell at the floor, which a thin market never supports — it is a comparative weight for sizing tiles, not realizable value. Floor moves without trading volume behind them (which this view does not show) are quotes rather than prices.`,
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

export const sectorBarsMeta = defineFrameMeta({
  name: "sector-bars",
  label: "Sector Bars",
  category: "crypto",
  iconUrl: widgetIcon("sector-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
  description:
    "Crypto sector rotation as a diverging bar chart — market categories (L1s, DeFi, AI, memes, RWA, …) ranked by 24h market-cap change, gains right in green, losses left in red. The chart-first sibling of the Sector Performance list. Keyless (CoinGecko categories).",
  interpretation: `Crypto's thematic sectors — layer-1s, DeFi, AI tokens, memes, real-world assets — ranked by how much their combined market value changed in 24 hours, drawn as bars diverging from a center zero line.

Bars extending right in green are sectors that gained; bars extending left in red are sectors that lost. Bar length is the size of the move in percent, so the shape of the chart is the day's story: all bars one way is a market-wide move, a lone long bar against the grain is a genuine rotation or a sector-specific catalyst.

A sector's move is its coins' market-cap change weighted by size, and many sectors are dominated by one or two large coins — so a dramatic bar often restates a single coin's day rather than a broad theme catching fire.`,
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

export const etfFlowBarsMeta = defineFrameMeta({
  name: "etf-flow-bars",
  label: "ETF Flow Bars",
  category: "crypto",
  iconUrl: widgetIcon("etf-flow-bars"),
  layout: { w: 6, h: 3, minW: 4, minH: 2 },
  description:
    "Spot BTC or ETH ETF daily net flows as diverging bars — one bar per day, inflows up in green, outflows down in red. The classic ETF-flow chart; complements the cumulative line and per-issuer snapshot. Keyless (SoSoValue); best-effort, may be empty if the source is unavailable.",
  interpretation: `Daily money movement into and out of the spot Bitcoin or Ethereum ETFs, one bar per trading day. Net flow is creations minus redemptions: what investors added to the funds minus what they pulled out.

Green bars rise above the zero line on inflow days; red bars drop below it on outflow days. Bar height is the day's net dollars, so a glance shows both the direction and the size of institutional appetite through this channel.

Runs of green bars mark sustained accumulation — each inflow dollar forces the funds to buy the underlying asset — while runs of red mark distribution. Individual days are noisy and one record bar can follow an options expiry or a single allocator's rebalance; the pattern across weeks is the signal. Gaps are market holidays, not zero-flow days.`,
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

export const marketScatterMeta = defineFrameMeta({
  name: "market-scatter",
  label: "Market Scatter",
  category: "crypto",
  iconUrl: widgetIcon("market-scatter"),
  layout: { w: 6, h: 4, minW: 3, minH: 2 },
  description:
    "Top coins as a bubble scatter — 24h price change on the x-axis, market cap on a log y-axis, bubble size by market cap. Shows in one view whether large caps or small caps are moving, and who's the outlier. Keyless (CoinGecko top-50 by market cap).",
  interpretation: `The top coins plotted as bubbles on two axes: the day's price change runs left to right (losses left of zero, gains right), and market capitalisation runs up a logarithmic y-axis, with bubble size repeating market cap for emphasis.

The vertical position separates giants from mid-caps; the horizontal position separates today's winners from losers. The picture to read is the cloud's shape: bubbles drifting right together is a broad rally, big bubbles near zero while small ones scatter wide means the majors are calm and the action is speculative.

The y-axis is logarithmic — each gridline step is a multiple, not an increment — so visually small vertical gaps between high bubbles hide enormous dollar differences. An outlier bubble far right or far left is the day's story; whether it matters depends on how high it sits.`,
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
  interpretation: `The largest cryptocurrencies as a floating cloud of logo bubbles. Each bubble's area is proportional to the coin's market capitalisation — price times circulating supply — and the ring around it is tinted green or red by the coin's 24-hour price change.

Bubble size answers "how big", ring color answers "how was today". The market's weight is wildly top-heavy, so expect one or two dominant bubbles and a swarm of small ones — that skew IS the structure of the crypto market.

A cloud ringed mostly green is a broad up-day; green rings only on the small bubbles suggests speculative appetite while the majors rest. Size here is standing, not momentum: yesterday's biggest bubble is still the biggest after a bad day. When sized by change instead (a config option), the biggest bubbles become today's movers regardless of their rank.`,
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

export const tvlBubblesMeta = defineFrameMeta({
  name: "tvl-bubbles",
  label: "TVL Bubbles",
  category: "crypto",
  iconUrl: widgetIcon("tvl-bubbles"),
  layout: { w: 6, h: 4, minW: 3, minH: 2 },
  description:
    "Blockchain ecosystems as a floating bubble cloud, area by total value locked (TVL) — the bubble-chart sibling of the TVL treemap. Data from DeFiLlama. Draggable, playful answer to 'where does on-chain capital live'.",
  interpretation: `Each bubble is one blockchain, and its area is proportional to that chain's total value locked (TVL) — the dollar value of assets deposited into the chain's DeFi applications. The cloud is a weight map of where on-chain capital actually lives.

Expect one or two dominant bubbles and a long tail of small ones: DeFi capital is heavily concentrated, and that concentration is itself the main fact the card shows.

A bubble growing across days means the chain is attracting deposits or its assets are appreciating; a shrinking one means capital leaving or prices falling. The usual TVL caution applies — it is a dollar figure, so market-wide price moves swell or shrink every bubble at once without any deposits changing hands.`,
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
  interpretation: `Each bubble is one DeFi protocol — a lending market, staking service, or exchange — with area proportional to its total value locked (TVL), the dollar value of assets users have deposited into it. The ring is tinted green or red by the one-day change.

Bubble size shows where DeFi's capital is concentrated; the ring shows which of those pools of capital grew or shrank today. The biggest bubbles tend to be staking and lending giants, since those hold deposits by nature.

A green ring on a big bubble is meaningful inflow (or price appreciation of what is deposited); a red ring can be withdrawals, an incident, or simply a down market repricing the deposits. TVL is a dollar figure, so a market-wide selloff rings every bubble red at once without anyone withdrawing.`,
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
  interpretation: `Each bubble is one decentralized exchange (DEX) — an on-chain trading venue — with area proportional to the dollar volume it traded in the last 24 hours. The ring is tinted green if that volume grew versus the prior day, red if it shrank.

Bubble size maps where on-chain trading flow concentrates; ring color shows whose flow is rising or fading today. A handful of large venues typically dominate, with a tail of niche and chain-specific exchanges.

Volume rising everywhere at once usually means a volatile market — trading spikes on sharp moves in either direction, so green rings across the cloud signal action rather than optimism. One bubble growing against a quiet field suggests flow migrating to that venue, often chasing an incentive program or a token that only trades there.`,
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
  interpretation: `Each bubble is one protocol, with area proportional to the fees users paid it in the last 24 hours — real money spent on trading, borrowing, and blockspace, not deposits or valuations. The ring is tinted green if fees grew versus the prior day, red if they shrank.

Bubble size is the closest thing to a paid-usage map of crypto: the big bubbles are where people are actually spending. Ring color shows whose business picked up or slowed today.

High fees signal genuine demand for a service, but the sizing hides one distinction: fees are what users paid, not what the protocol kept — many venues pass most fees through to liquidity providers or stakers. A large bubble means heavy use, not necessarily a lucrative protocol. Fee spend also spikes on volatile days regardless of direction.`,
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
  interpretation: `Crypto's thematic sectors — layer-1 blockchains, DeFi, AI tokens, memes, real-world assets — as a cloud of bubbles. Each bubble's area is proportional to the sector's combined market value; the ring is tinted green or red by the sector's 24-hour change.

Size answers which themes hold the most capital; ring color answers which themes moved today. A small bubble ringed bright green is a hot niche; a red ring on a giant is the market's core repricing.

All rings one color is just the market's day restated by theme — the informative pattern is one sector diverging from a neutral field, which suggests rotation or a sector-specific catalyst. Many sectors are dominated by one or two large coins, so a sector's ring often reflects a single coin's move rather than a broad theme.`,
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
  interpretation: `The top NFT collections as a cloud of bubbles. Each bubble's area is proportional to the collection's market capitalisation — roughly its floor price (the cheapest listed item) times the number of items — and the ring is tinted green or red by the 24-hour floor-price change.

Bubble size shows where NFT value concentrates among the blue chips; ring color shows whose floor moved today. A red ring on the biggest bubble is the top of the NFT market repricing.

NFT market cap deserves skepticism: it assumes every item could sell at the floor, which thin NFT markets never support — treat it as a comparative weight, not realizable value. Floor moves can also happen on a single relisting with no actual sales behind them, so a colored ring is a quote until volume confirms it.`,
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

export const moversBubblesMeta = defineFrameMeta({
  name: "movers-bubbles",
  label: "Movers Bubbles",
  category: "crypto",
  iconUrl: widgetIcon("movers-bubbles"),
  layout: { w: 6, h: 5, minW: 4, minH: 2 },
  description:
    "The broad market's biggest movers as a bubble cloud — logo bubbles sized by the magnitude of the move over a chosen window, green for gainers, red for losers. Today's action at a glance, regardless of coin size. Keyless (CoinPaprika, ~2000 coins).",
  interpretation: `The biggest price movers across roughly two thousand coins, drawn as logo bubbles. Unlike a market-cap view, bubble area here is the SIZE OF THE MOVE over the chosen window — a tiny coin that doubled gets a huge bubble — and color is direction: green gainers, red losers.

The cloud is deliberately size-blind: it answers where the action is, not where the value is. A balanced field of green and red is a normal churning market; a wall of one color is a broad directional day.

The bubbles are drawn from the market's extreme tail, so the moves shown are outliers by construction — mostly thin, small coins where a modest amount of money produces a spectacular percentage. A major appearing among them is the rarer, more meaningful sight: large caps need real flow to move that much.`,
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
  layout: { w: 3, h: 3, minW: 2, minH: 2, maxW: 4 },
  description:
    "Crypto fear & greed index as a radial gauge — the arc fills from extreme fear (0) to extreme greed (100) in the mood color, with the reading and classification in the center. A dial-style alternative to the Fear & Greed sparkline card. Keyless (alternative.me).",
  interpretation: `The crypto fear & greed index compresses market mood into a single 0-100 number, built from volatility, momentum, volume, social activity, and Bitcoin dominance. Zero is extreme fear; one hundred is extreme greed.

The arc fills clockwise as the reading rises, colored by mood — cold at the fearful end, warm at the greedy end — with the number and its classification (Extreme Fear, Fear, Neutral, Greed, Extreme Greed) in the center.

The index describes how the crowd feels, not where price goes next. Its traditional use is contrarian: extreme greed marks crowded optimism that has historically preceded pullbacks, and extreme fear marks capitulation that has preceded recoveries. The misreading is following it literally — treating a high reading as a buy signal is joining the crowd at its most euphoric. Extremes can also persist for weeks.`,
  capabilities: ["sentiment"],
  source: SOURCES.alternativeMe,
  schema: z.object({}),
});

export const moversBarsMeta = defineFrameMeta({
  name: "movers-bars",
  label: "Movers Bars",
  category: "crypto",
  iconUrl: widgetIcon("movers-bars"),
  layout: { w: 4, h: 5, minW: 3, minH: 2 },
  description:
    "Top gainers and losers across the broad crypto market as a diverging bar chart — the biggest movers over a chosen window, gains right in green, losses left in red, ranked by size. The chart-first sibling of the Coin Movers list. Keyless (CoinPaprika, ~2000 coins).",
  interpretation: `The biggest percentage movers across roughly two thousand coins over the chosen window, split evenly into top gainers and top losers and drawn as bars diverging from a center zero line.

Green bars extend right for the largest gains, red bars extend left for the largest losses; bar length is the size of the move in percent. The chart's symmetry is informative — long bars on both sides is a churning market, one side dominating is a broad directional day.

These are the extreme tail of a large universe, so extraordinary percentages are the norm here, and they mostly belong to small, thinly-traded coins where little money moves price a lot. The magnitude of a bar says how far the price went, not how much capital moved — a household name on this chart is a bigger event than a stranger.`,
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
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
  description:
    "Total value locked (TVL) per blockchain as a horizontal bar chart, ranked largest-first — DeFi capital compared across chains at a glance. The chart-first sibling of the TVL treemap. Keyless (DeFiLlama).",
  interpretation: `Total value locked (TVL) — the dollar value of assets deposited into a blockchain's DeFi applications — compared across chains as horizontal bars, ranked largest first.

Each bar is one chain; its length is that chain's TVL in dollars. The ranked layout makes the comparison exact where a treemap makes it impressionistic: how many times larger the leader is, and how steeply the tail falls away.

A steep drop after the first bar or two is the normal state — DeFi capital is heavily concentrated. A chain climbing the ranking over time is attracting deposits or new applications. As always with TVL, the figure is denominated in dollars, so a rally in the deposited tokens lengthens a bar without any new money arriving.`,
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
  layout: { w: 6, h: 4, minW: 3, minH: 2 },
  description:
    "DeFi yield pools as a risk/reward bubble scatter — total APY on the x-axis, pool TVL on a log y-axis, bubble size by TVL. Surfaces the deep, high-yield pools (top-right) versus thin outliers in one view. The chart-first sibling of the Yield Scanner list. Keyless (DeFiLlama).",
  interpretation: `DeFi yield pools plotted on two axes: the yield they pay (APY, annualized percent) runs left to right, and the pool's size (TVL, the dollars deposited in it) runs up a logarithmic y-axis, with bubble area repeating size.

The quadrants tell the story. Top-left is the bulk of the market: deep pools paying modest yield. Top-right is the rare prize — a large pool paying a high rate. Bottom-right, high yield on a tiny pool, is where the spectacular numbers live and where they mean least: thin pools quote extreme APYs precisely because so little capital has taken the offer.

Position on the x-axis is the advertised rate, not a durable one — high quoted yields are usually incentive-driven and decay as capital arrives. The y-axis being logarithmic, each step up is a multiple of size, so visually adjacent bubbles can differ tenfold in depth.`,
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
  layout: { w: 6, h: 4, minW: 3, minH: 2 },
  description:
    "Blue-chip NFT collections as a bubble scatter — 24h floor change on the x-axis, 24h trading volume on a log y-axis, bubble size by market cap. Shows which collections are moving on real volume versus thin floors. The chart-first sibling of the NFT Collections list. Keyless (CoinGecko, curated slugs).",
  interpretation: `Top NFT collections plotted by how their floor price moved against how much they actually traded. The 24-hour floor change runs left to right (drops left of zero, gains right); 24-hour trading volume runs up a logarithmic y-axis; bubble area is the collection's market cap.

Height is the honesty axis. A collection high on the chart moved on real trading; one near the bottom barely traded, so its floor move — however dramatic — may be a single relisting rather than a market.

The pattern to look for is right-and-high: floors rising on genuine volume, the strongest demand signal NFTs offer. Right-but-low is a quote, not a price. The y-axis being logarithmic, bubbles near the bottom trade orders of magnitude less than those at the top, even when the visual gap looks modest.`,
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
  layout: { w: 3, h: 3, minW: 2, minH: 2, maxW: 4 },
  description:
    "One asset's share of total crypto market cap as a radial gauge — the arc fills from 0% to 100% dominance with the reading in the center. A dial-style alternative to the segmented Bitcoin Dominance bar. Keyless (CoinGecko global).",
  interpretation: `Dominance is one asset's share of the entire crypto market's value — its market cap divided by the market cap of everything combined. The arc fills from 0% to 100% with the current reading in the center.

For Bitcoin, a fuller arc means capital is concentrated in the market's largest and most conservative asset; a receding arc means smaller coins are growing faster, which historically accompanies risk-seeking phases. Ethereum's dominance reads the same way one rung down the risk ladder.

The essential caution: dominance is a ratio, not a price. The arc can fill while the asset's price is falling — it only requires everything else to fall harder — so a rising gauge says how the asset did relative to the rest of crypto, never how it did in absolute terms.`,
  capabilities: ["global-market"],
  source: SOURCES.coingecko,
  schema: z.object({
    coin: z
      .enum(["btc", "eth"])
      .default("btc")
      .describe("Which asset's market-cap dominance to gauge."),
  }),
});

export const coinMomentumHeatmapMeta = defineFrameMeta({
  name: "coin-momentum-heatmap",
  label: "Coin Momentum Heatmap",
  category: "crypto",
  iconUrl: widgetIcon("coin-momentum-heatmap"),
  layout: { w: 5, h: 5, minW: 3, minH: 2 },
  description:
    "Top coins by market-cap rank as a momentum heatmap — rows are coins, columns are 1h/24h/7d/30d change windows, colored diverging green/red by magnitude. Spot which coins are heating up (or cooling off) across every timeframe at a glance. Keyless (CoinPaprika, ~2000 coins).",
  interpretation: `A grid of price momentum: each row is one of the top coins by market-cap rank, each column a change window (one hour, one day, one week, one month), and each cell is colored by the price change over that window — green for gains, red for losses, deeper tints for bigger moves.

Reading rows left to right shows a coin's momentum across timeframes. A row shading from red on the long windows to green on the short ones is a coin turning up; the reverse is momentum fading. A uniformly green or red row is a sustained trend.

Reading columns down shows the market's character per timeframe — a green 30d column over a red 24h column is a pullback inside an uptrend. The percentages are not comparable across columns: a 3% hour is a violent move, a 3% month is noise, so compare color within a column, not across the grid.`,
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
  layout: { w: 6, h: 4, minW: 3, minH: 2 },
  description:
    "Broad-market coins as a momentum scatter — 24h change on the x-axis, 7d change on the y-axis, bubble size by market cap, colored by 24h direction. Reveals whether today's move is a continuation or a reversal of the week's trend. Keyless (CoinPaprika, ~2000 coins).",
  interpretation: `Each bubble is one coin, placed by two momentum readings at once: the 24-hour price change runs left to right, the 7-day change runs bottom to top. Bubble area is market cap, and color follows the day's direction — green right of zero, red left of it.

The quadrants are the point. Top-right coins are up today AND up on the week — continuation. Bottom-left is sustained decline. The off-diagonal quadrants are where trends change: top-left (down today, up on the week) is a pullback or a top; bottom-right (up today, down on the week) is a bounce or a bottom.

A cloud stretched along the diagonal means today simply extends the week; a cloud rotated off it means the market is turning. Small bubbles reach the extreme corners far more easily than large ones — a giant drifting into a corner is the rarer, more meaningful sight.`,
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
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
  description:
    "The coins with the most search interest right now on CoinGecko as a diverging bar chart — 24h change per trending coin, gains right in green, losses left in red. The chart-first sibling of the Trending Coins list. Keyless (CoinGecko).",
  interpretation: `The coins currently drawing the most search interest on CoinGecko, with each one's 24-hour price change drawn as a bar diverging from a center zero line — green bars extend right for gains, red bars left for losses.

Membership in the chart is decided by attention, not by the size of the move: a coin appears because people are looking it up, and the bar then shows what its price did. That pairing is the read — bars mostly green means attention is chasing winners; mostly red means people are searching what is crashing.

Attention is not endorsement: search interest spikes on collapses as readily as rallies. And since a coin usually trends after its move made news, much of the action shown here has already happened by the time it charts.`,
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
  layout: { w: 4, h: 4, minW: 2, minH: 2 },
  description:
    "Blue-chip NFT collections ranked by 24h sales count as a horizontal bar chart — which collections are actually trading, not just holding a floor price. The chart-first sibling of the NFT Collections list. Keyless (CoinGecko, curated slugs).",
  interpretation: `Top NFT collections ranked by how many individual sales they recorded in the last 24 hours. Each horizontal bar is one collection; its length is the count of items that actually changed hands, largest at the top.

Sales count is the liveliness measure the more famous numbers miss: a collection can hold a proud floor price with essentially no trading behind it. Long bars mark collections with real, active markets; short bars mark ones where the quoted floor rests on very few transactions.

A collection whose sales spike while its floor holds or rises is seeing genuine demand; a spike alongside a falling floor is holders rushing for the exit. Counts, not dollars — many cheap sales can outrank one expensive one, so a long bar means busy, not necessarily valuable.`,
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

export const trendingBubblesMeta = defineFrameMeta({
  name: "trending-bubbles",
  label: "Trending Bubbles",
  category: "crypto",
  iconUrl: widgetIcon("trending-bubbles"),
  layout: { w: 6, h: 5, minW: 3, minH: 2 },
  description:
    "The coins with the most search interest right now on CoinGecko as a floating bubble cloud — bubble area by |24h change|, ring tinted green/red by direction. A movement-first alternative to the Trending Coins list. Keyless (CoinGecko).",
  interpretation: `The coins drawing the most search interest on CoinGecko right now, floated as logo bubbles. Bubble area is the SIZE of the coin's 24-hour move regardless of direction — a coin down 30% floats as large as one up 30% — and the ring supplies the direction: green up, red down.

Membership is decided by attention, sizing by movement, so the cloud shows what the crowd is watching and how violently it is moving. Big green-ringed bubbles are the pumps being chased; big red-ringed ones are the crashes being rubbernecked.

Neither attention nor movement implies quality — trending coins are often tiny, thin markets where modest money makes spectacular percentages, and search interest peaks after the move made news. A near-still bubble (small, whatever its ring) trending anyway usually means anticipation of something rather than reaction to it.`,
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

export const yieldRiskPieMeta = defineFrameMeta({
  name: "yield-risk-pie",
  label: "Yield Risk Pie",
  category: "crypto",
  iconUrl: widgetIcon("yield-risk-pie"),
  layout: { w: 4, h: 4, minW: 2, minH: 2, maxW: 6 },
  description:
    "DeFi yield pools grouped by impermanent-loss risk as a donut, sliced by total value locked (TVL) — no-IL-risk, IL-risk, and unknown, summed across every pool. A quick read on how much yield-seeking capital carries IL exposure. Keyless (DeFiLlama).",
  interpretation: `Impermanent loss (IL) is the loss a depositor in a two-asset pool suffers when the two assets' prices diverge — the pool automatically sells the winner for the loser, so the deposit ends up worth less than simply holding. Single-asset pools (lending, staking) do not carry it.

The donut slices all DeFi yield capital by that exposure: deposits in pools with no IL risk, deposits in pools that carry it, and pools where the flag is unknown. Slice size is total value locked in dollars, so the chart weighs capital, not pool counts.

A market tilted toward the no-IL slice is earning conservatively; the IL slice growing means capital is reaching for the higher advertised yields of two-asset pools. The catch built into that trade: IL-bearing pools quote higher APYs precisely as compensation, so the headline yield overstates what divergent markets let depositors keep.`,
  capabilities: ["yields"],
  source: SOURCES.defillama,
  schema: z.object({}),
});

export const protocolFeesVsTvlScatterMeta = defineFrameMeta({
  name: "protocol-fees-vs-tvl-scatter",
  label: "Protocol Fees vs TVL Scatter",
  category: "crypto",
  iconUrl: widgetIcon("protocol-fees-vs-tvl-scatter"),
  layout: { w: 6, h: 4, minW: 3, minH: 2 },
  description:
    "DeFi protocols as a fees-vs-TVL bubble scatter — total value locked on a log x-axis, trailing-24h fees on a log y-axis, bubble size by fees. Surfaces capital-efficient protocols earning outsized fees on their TVL versus large-but-quiet ones. Only protocols DeFiLlama reports both a TVL and a fees figure for are plotted. Keyless (DeFiLlama).",
  interpretation: `Each bubble is one DeFi protocol placed by two measures: the capital deposited in it (TVL) runs left to right, and the fees users paid it in the last 24 hours run bottom to top. Both axes are logarithmic, and bubble area repeats the fees.

The diagonal is the read. A protocol above the cloud's trend earns outsized fees on its capital — high capital efficiency, typical of busy exchanges that need little standing liquidity. One below the trend holds a lot of capital that generates little — typical of staking and lending, where deposits sit rather than churn.

Off-diagonal positions are as much business model as quality: a lender is not failing for earning less per dollar than a DEX. And fees are what users paid, not what the protocol kept — a high-flying bubble may pass nearly all of it through to liquidity providers. Log axes mean each gridline is a multiple, so modest visual gaps are large real ones.`,
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
  layout: { w: 6, h: 4, minW: 4, minH: 2 },
  description:
    "DeFi yield pools as a base-vs-reward APY scatter — organic (base) APY on the x-axis, incentive (reward) APY on the y-axis, bubble size by TVL. Separates pools earning real organic yield from ones propped up by token incentives. Keyless (DeFiLlama).",
  interpretation: `A DeFi pool's advertised yield has two ingredients: base APY, earned from real activity (trading fees, loan interest), and reward APY, paid in a protocol's own incentive tokens to attract deposits. This chart plots the two against each other — base runs left to right, reward bottom to top — with bubble area showing pool size (TVL).

Position is the pool's character. Far right and low: yield earned organically, the durable kind. High and far left: yield that exists only as long as the token subsidy does — and its dollar value falls with the token's price. The diagonal mixes the two.

A large bubble sitting high on the reward axis is a protocol paying heavily to rent liquidity; when the incentives end, both the yield and the deposits tend to leave. The same headline APY means very different things at the two ends of this chart, which is exactly the distinction the headline number hides.`,
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
  layout: { w: 4, h: 4, minW: 2, minH: 2 },
  description:
    "Total value locked (TVL) summed by DeFiLlama category — Dexes, Lending, Liquid Staking, and more — as a horizontal bar chart ranked largest-first. Shows which slice of DeFi actually holds the capital. Keyless (DeFiLlama).",
  interpretation: `DeFi's capital summed by what it is doing rather than where it sits: total value locked (TVL) grouped into functional categories — exchanges, lending markets, liquid staking, bridges, and more — drawn as horizontal bars ranked largest first.

Each bar's length is the dollars deposited across every protocol in that category. The ranking answers a structural question: is DeFi mostly a place where capital is staked, lent, or traded right now?

Categories shifting rank over months track the ecosystem's shape — liquid staking's rise, for instance, rebuilt this chart's top end. Two cautions: TVL is a dollar figure, so price moves swell all bars without new deposits; and TVL measures parked capital, not activity — exchanges can dominate actual usage while holding a modest bar here, because trading needs less standing capital than lending or staking.`,
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
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Stacked area chart of total value locked (TVL) for several DeFi protocols over a lookback window, each protocol's slice stacked to show the combined total and how the mix shifts over time. The composition-focused sibling of the Protocol TVL Chart's overlaid lines. Data from DeFiLlama (daily granularity).",
  interpretation: `Total value locked (TVL) — the dollars deposited into each protocol — for a handful of DeFi protocols, stacked on top of one another over time. Time runs left to right; the top edge of the stack is the group's combined TVL, and each colored band's thickness is one protocol's share of it.

Two readings coexist. The stack's overall height rising or falling is the group gaining or losing capital together. A single band thickening while the total holds steady is a share shift — capital rotating between the chosen protocols.

The stacking has a reading cost: only the bottom band sits on a flat baseline, so a middle band's wiggles partly inherit the movement of everything beneath it — judge a band by its thickness, not the altitude of its edges. And since TVL is a dollar figure, market-wide price moves breathe the whole stack in and out without any deposits changing hands.`,
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
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Stacked area chart of daily DEX trading volume for several protocols over a lookback window, stacked to show combined volume and how each DEX's share shifts over time. The composition-focused sibling of the DEX Volume Chart's overlaid lines. Data from DeFiLlama (daily granularity).",
  interpretation: `Daily trading volume for several decentralized exchanges, stacked into one chart. Time runs left to right; the top edge of the stack is the group's combined daily volume in dollars, and each colored band's thickness is one exchange's slice of that day's trading.

The stack separates two different stories: the total's rise and fall is market-wide activity (which spikes on volatile days in either direction), while one band thickening at another's expense is market share moving between venues — the competitive story the combined total hides.

Only the bottom band rests on a flat baseline; every band above it inherits the wiggles of those beneath, so read a band by its thickness rather than the altitude of its edges. Daily volume is naturally spiky — a shared one-day bulge across all bands is a market event, not any single exchange's win.`,
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
  layout: { w: 4, h: 5, minW: 3, minH: 2 },
  description:
    "DeFi yield pools ranked by 7-day APY change as a diverging bar chart — the biggest APY gains and drops over the past week, filtered above a TVL floor to skip dust pools. Surfaces where yields are heating up or cooling off. Keyless (DeFiLlama).",
  interpretation: `Not the highest yields, but the fastest-changing ones: DeFi pools ranked by how much their APY moved over the past week, drawn as bars diverging from a center zero line. Green bars extend right for the biggest APY gains, red bars left for the biggest drops, with tiny pools filtered out by a liquidity floor.

A pool's yield rises when demand for its service outruns its deposits — borrowing demand spiking on a lender, a new incentive program starting — and falls as capital piles in or incentives end.

Long green bars mark where yield is appearing (and where capital will soon chase it, compressing the rate); long red bars mark yields normalizing after a rush, or subsidies switching off. These are the extremes of the week by construction, and a violent APY jump is as often an incentive-program artifact as a durable change in what the pool earns.`,
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

export const etfIssuerTreemapMeta = defineFrameMeta({
  name: "etf-issuer-treemap",
  label: "ETF Issuer Treemap",
  category: "crypto",
  iconUrl: widgetIcon("etf-issuer-treemap"),
  layout: { w: 5, h: 4, minW: 2, minH: 3 },
  description:
    "Spot BTC or ETH ETF issuers as a treemap — tile size by assets under management, tint green/red by that issuer's net flow today. Shows who holds the most AND who's gathering or losing assets right now, in one view. Best-effort; may be empty if the source is unavailable. Keyless (SoSoValue).",
  interpretation: `The companies running spot Bitcoin or Ethereum ETFs, laid out as a mosaic. Each tile is one issuer's fund; its area is proportional to assets under management — the total value of crypto the fund holds — and its tint shows today's net flow: green where money came in, red where it left.

Size is the standings (who custodies the most), color is today's motion (who is gathering or bleeding assets). A large tile tinted green is the market leader still growing; a small tile glowing green is a challenger taking share.

Note the two encodings move on different scales: AUM rises and falls with the crypto price itself, while flow measures only investor deposits and withdrawals. A red-tinted tile can still have grown in dollar terms on an up day — the tint reports flows, never the price move.`,
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

export const etfIssuerBarsMeta = defineFrameMeta({
  name: "etf-issuer-bars",
  label: "ETF Issuer Bars",
  category: "crypto",
  iconUrl: widgetIcon("etf-issuer-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
  description:
    "Spot BTC or ETH ETF issuers' daily net flow as a diverging bar chart — inflows right in green, outflows left in red, ranked by size. The chart-first sibling of the Spot ETF Flows list. Best-effort; may be empty if the source is unavailable. Keyless (SoSoValue).",
  interpretation: `Today's money movement per spot-ETF issuer: each bar is one fund's daily net flow — investor money in minus money out — diverging from a center zero line. Green bars extend right for net inflows, red bars left for net outflows, ranked by size.

The shape reads at a glance. All bars green is broad institutional accumulation; all red is broad withdrawal. A split chart — some funds gathering while others bleed — often means investors are switching issuers (historically out of higher-fee funds into cheaper ones) rather than changing their crypto exposure at all.

That is the key caution: one issuer's outflow is not the market selling. Sum the bars mentally — the aggregate, not any single bar, is the demand signal, since every net inflow dollar forces a fund to buy the underlying asset and every net outflow dollar forces a sale.`,
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

export const etfFlowCalendarMeta = defineFrameMeta({
  name: "etf-flow-calendar",
  label: "ETF Flow Calendar",
  category: "crypto",
  iconUrl: widgetIcon("etf-flow-calendar"),
  layout: { w: 6, h: 5, minW: 3, minH: 3 },
  description:
    "Spot BTC or ETH ETF daily net flows as a GitHub-style calendar heatmap — one square per day, weeks running left to right, green for inflow days and red for outflow days (intensity ranked within the window, so one record day can't wash out the rest). Surfaces the weekly inflow/outflow rhythm the daily bar chart doesn't show at a glance, and the market holidays where there is simply no print. Keyless (SoSoValue); best-effort, may be empty if the source is unavailable.",
  interpretation: `Spot Bitcoin or Ethereum ETF net flows as a calendar: one square per trading day, weeks running left to right like a contribution graph. Green squares are days money flowed into the funds, red squares days it flowed out, with deeper shades for larger flows.

The calendar layout surfaces rhythm rather than magnitude — unbroken green streaks of sustained accumulation, red clusters of withdrawal, and the alternating checkerboard of an undecided market. Blank squares are weekends and market holidays: no trading, so no print, not a zero.

Color intensity is ranked within the visible window rather than scaled to dollars, so one record day cannot wash every other square pale — but it also means a deep green here and a deep green in another period may be very different dollar amounts. The pattern across weeks is the signal; single squares are noise.`,
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
