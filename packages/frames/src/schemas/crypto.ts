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
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
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

export const tokenUnlockScheduleMeta = defineFrameMeta({
  name: "token-unlock-schedule",
  annotatable: true,
  label: "Unlock Schedule",
  category: "crypto",
  iconUrl: widgetIcon("token-unlock-schedule"),
  layout: { w: 6, h: 4, minW: 3, minH: 4 },
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

export const sectorBarsMeta = defineFrameMeta({
  name: "sector-bars",
  label: "Sector Bars",
  category: "crypto",
  iconUrl: widgetIcon("sector-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
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

export const etfFlowBarsMeta = defineFrameMeta({
  name: "etf-flow-bars",
  label: "ETF Flow Bars",
  category: "crypto",
  iconUrl: widgetIcon("etf-flow-bars"),
  layout: { w: 6, h: 3, minW: 4, minH: 2 },
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

export const marketScatterMeta = defineFrameMeta({
  name: "market-scatter",
  label: "Market Scatter",
  category: "crypto",
  iconUrl: widgetIcon("market-scatter"),
  layout: { w: 6, h: 4, minW: 3, minH: 2 },
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
  layout: { w: 3, h: 3, minW: 2, minH: 2, maxW: 4 },
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
  layout: { w: 4, h: 5, minW: 3, minH: 2 },
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
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
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
  layout: { w: 6, h: 4, minW: 3, minH: 2 },
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
  layout: { w: 6, h: 4, minW: 3, minH: 2 },
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
  layout: { w: 3, h: 3, minW: 2, minH: 2, maxW: 4 },
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
  layout: { w: 6, h: 4, minW: 3, minH: 2 },
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
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
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
  layout: { w: 4, h: 4, minW: 2, minH: 2 },
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

export const yieldRiskPieMeta = defineFrameMeta({
  name: "yield-risk-pie",
  label: "Yield Risk Pie",
  category: "crypto",
  iconUrl: widgetIcon("yield-risk-pie"),
  layout: { w: 4, h: 4, minW: 2, minH: 2, maxW: 6 },
  description:
    "DeFi yield pools grouped by impermanent-loss risk as a donut, sliced by total value locked (TVL) — no-IL-risk, IL-risk, and unknown, summed across every pool. A quick read on how much yield-seeking capital carries IL exposure. Keyless (DeFiLlama).",
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
