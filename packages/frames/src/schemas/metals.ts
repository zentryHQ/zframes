import { defineFrameMeta } from "@zframes/spec/frame";
import { z } from "zod";
import {
  widgetIcon,
  SOURCES,
  METAL_SYMBOLS,
  FIXED_METALS,
  METAL_NAMES,
  FIXED_METAL_NAMES,
  yearsField,
} from "./shared";

export const metalsBoardMeta = defineFrameMeta({
  name: "metals-board",
  label: "Metals Board",
  category: "metals",
  iconUrl: widgetIcon("metals-board"),
  layout: { w: 3, h: 4, minW: 2, minH: 2 },
  description:
    "Live spot board for the metals complex — gold, silver, platinum, palladium and copper — each with its current price and its move against the most recent London fix. Keyless spot quotes; the metals equivalent of a crypto ticker list.",
  capabilities: ["metal-spot"],
  source: SOURCES.goldApi,
  schema: z.object({
    symbols: z
      .array(z.enum(METAL_SYMBOLS))
      .min(1)
      .max(5)
      .default([...METAL_SYMBOLS])
      .describe(`Metals to list, in display order. ${METAL_NAMES}.`),
    showChange: z
      .boolean()
      .default(true)
      .describe(
        "Show each metal's percent move against the latest London fix. The change appears once the fix history has loaded (a few seconds after first paint).",
      ),
  }),
});

export const metalPriceMeta = defineFrameMeta({
  name: "metal-price",
  label: "Metal Price",
  category: "metals",
  iconUrl: widgetIcon("metal-price"),
  layout: { w: 3, h: 2, minW: 2, minH: 2, maxW: 3, maxH: 2 },
  description:
    "One metal's live spot price as a headline number, in the weight unit you pick (troy ounce, gram, kilogram or tola). The single-asset hero card for a gold or silver dashboard.",
  capabilities: ["metal-spot"],
  source: SOURCES.goldApi,
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(`Metal to price. ${METAL_NAMES}.`),
    unit: z
      .enum(["ounce", "gram", "kilogram", "tola"])
      .default("ounce")
      .describe(
        "Weight unit the headline price is quoted in. Troy ounce is the market convention; gram and kilogram suit retail bullion, tola is the South Asian bar unit (11.6638 g). Ignored for copper, which quotes per pound.",
      ),
    showFix: z
      .boolean()
      .default(true)
      .describe(
        "Show the latest London fix underneath as the reference the change is measured from.",
      ),
  }),
});

export const metalValueMeta = defineFrameMeta({
  name: "metal-value",
  label: "Metal Holding Value",
  category: "metals",
  iconUrl: widgetIcon("metal-value"),
  layout: { w: 3, h: 2, minW: 2, minH: 2, maxW: 3, maxH: 2 },
  description:
    "What a physical holding is worth right now: a weight you own, multiplied by live spot. Set the weight and unit once and the card revalues itself as the metal moves.",
  capabilities: ["metal-spot"],
  source: SOURCES.goldApi,
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(`Metal held. ${METAL_NAMES}.`),
    weight: z
      .number()
      .positive()
      .default(1)
      .describe("How much of the metal is held, in `unit`."),
    unit: z
      .enum(["ounce", "gram", "kilogram", "tola"])
      .default("ounce")
      .describe(
        "Unit the weight is expressed in — troy ounce, gram, kilogram, or tola (11.6638 g).",
      ),
  }),
});

export const metalPriceChartMeta = defineFrameMeta({
  name: "metal-price-chart",
  annotatable: true,
  label: "Metal Price Chart",
  category: "metals",
  iconUrl: widgetIcon("metal-price-chart"),
  layout: { w: 6, h: 4, minW: 4, minH: 2 },
  description:
    "Daily London fix history for one or more metals — the benchmark price the physical market settles against, published by the LBMA and running back to 1968 for gold and silver. Set the window in years and switch to a log axis for multi-decade views.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbols: z
      .array(z.enum(FIXED_METALS))
      .min(1)
      .max(4)
      .default(["XAU"])
      .describe(`Metals to chart. ${FIXED_METAL_NAMES}`),
    currency: z
      .enum(["USD", "GBP", "EUR"])
      .default("USD")
      .describe(
        "Which published fix SERIES to read — the LBMA fixes each metal in all three, and they are separate prints, not conversions of one another (EUR only exists from 1999). This is a data choice, not a display one: to change what the card renders money in, set the frame instance's own `currency` (sibling of `config`) or the dashboard's. A USD fix follows that display currency; a GBP/EUR fix is shown as published.",
      ),
    years: yearsField(5, "How many years of daily fixes to chart."),
    logScale: z
      .boolean()
      .default(false)
      .describe(
        "Use a logarithmic price axis — the honest way to read a multi-decade series, where a move from $35 to $350 is the same tenfold step as $350 to $3,500.",
      ),
  }),
});

export const metalDrawdownMeta = defineFrameMeta({
  name: "metal-drawdown",
  annotatable: true,
  label: "Metal Drawdown",
  category: "metals",
  iconUrl: widgetIcon("metal-drawdown"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "How far a metal sits below its running all-time high, charted through history. Gold's decades-long post-1980 underwater stretch is the clearest picture of what a real bear market in bullion looks like.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal to chart. ${FIXED_METAL_NAMES}`),
    years: yearsField(20, "How many years of drawdown history to chart."),
  }),
});

export const metalAnnualReturnsMeta = defineFrameMeta({
  name: "metal-annual-returns",
  label: "Metal Annual Returns",
  category: "metals",
  iconUrl: widgetIcon("metal-annual-returns"),
  layout: { w: 6, h: 4, minW: 6, minH: 2 },
  description:
    "Calendar-year percent return per year as diverging bars — green up years, red down years — from the LBMA fix history. The at-a-glance record of how often, and how hard, a metal actually delivers.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal to chart. ${FIXED_METAL_NAMES}`),
    years: z
      .number()
      .int()
      .min(3)
      .max(58)
      .default(15)
      .describe(
        "How many calendar years of returns to show, most recent last.",
      ),
  }),
});

export const metalSeasonalityMeta = defineFrameMeta({
  name: "metal-seasonality",
  label: "Metal Seasonality",
  category: "metals",
  iconUrl: widgetIcon("metal-seasonality"),
  layout: { w: 6, h: 4, minW: 6, minH: 3 },
  description:
    "Month-by-year heatmap of monthly percent returns, with each month's long-run average underneath — the standard way to look for seasonal patterns in gold and silver without eyeballing a price chart.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal to analyse. ${FIXED_METAL_NAMES}`),
    years: z
      .number()
      .int()
      .min(5)
      .max(58)
      .default(20)
      .describe("How many years of monthly returns to include in the grid."),
  }),
});

export const metalVolatilityMeta = defineFrameMeta({
  name: "metal-volatility",
  annotatable: true,
  label: "Metal Volatility",
  category: "metals",
  iconUrl: widgetIcon("metal-volatility"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Rolling annualised realised volatility from daily fixes — how violent the metal has actually been, not what options imply. Quiet gold sits near 10%; a crisis takes it past 30%.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal to analyse. ${FIXED_METAL_NAMES}`),
    window: z
      .number()
      .int()
      .min(20)
      .max(365)
      .default(90)
      .describe(
        "Rolling window in trading days. 30 is twitchy, 90 is the common standard, 252 is a year.",
      ),
    years: yearsField(10, "How many years of the volatility series to chart."),
  }),
});

export const goldSilverRatioMeta = defineFrameMeta({
  name: "gold-silver-ratio",
  label: "Gold/Silver Ratio",
  category: "metals",
  iconUrl: widgetIcon("gold-silver-ratio"),
  layout: { w: 4, h: 3, minW: 3, minH: 3, maxH: 4 },
  description:
    "How many ounces of silver one ounce of gold buys — the oldest relative-value gauge in metals. Shows the live ratio, where it sits in its own historical range, and the trend.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    years: yearsField(
      20,
      "How many years of ratio history to chart and rank against.",
    ),
    showPercentile: z
      .boolean()
      .default(true)
      .describe(
        "Show where today's ratio ranks within the charted window — 100% means silver has never been cheaper against gold over that span.",
      ),
  }),
});

export const metalRatioChartMeta = defineFrameMeta({
  name: "metal-ratio-chart",
  annotatable: true,
  label: "Metal Ratio Chart",
  category: "metals",
  iconUrl: widgetIcon("metal-ratio-chart"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "The price of any metal divided by any other, charted over time — gold/silver, gold/platinum, platinum/palladium. Relative value between two metals, free of the dollar's own trend.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    numerator: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal on top of the ratio. ${FIXED_METAL_NAMES}`),
    denominator: z
      .enum(FIXED_METALS)
      .default("XAG")
      .describe(
        "Metal on the bottom of the ratio. Must differ from the numerator.",
      ),
    years: yearsField(20, "How many years of ratio history to chart."),
  }),
});

export const metalCompareChartMeta = defineFrameMeta({
  name: "metal-compare-chart",
  annotatable: true,
  label: "Metal Compare",
  category: "metals",
  iconUrl: widgetIcon("metal-compare-chart"),
  layout: { w: 6, h: 4, minW: 5, minH: 3 },
  description:
    "Several metals rebased to 0% at the start of the window so a $4,000 gold and a $58 silver compare on one axis. The relative-performance race across the complex.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbols: z
      .array(z.enum(FIXED_METALS))
      .min(2)
      .max(4)
      .default([...FIXED_METALS])
      .describe(`Metals to race against each other. ${FIXED_METAL_NAMES}`),
    years: yearsField(10, "How many years the race runs over."),
  }),
});

export const metalPerformanceMeta = defineFrameMeta({
  name: "metal-performance",
  label: "Metal Performance",
  category: "metals",
  iconUrl: widgetIcon("metal-performance"),
  layout: { w: 4, h: 4, minW: 2, minH: 2 },
  description:
    "One metal's return across standard horizons — 1M, 3M, 6M, YTD, 1Y, 5Y, 10Y, 20Y — as diverging bars. Switch to annualised to compare long horizons honestly instead of letting a 20-year number dwarf everything.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal to measure. ${FIXED_METAL_NAMES}`),
    mode: z
      .enum(["cumulative", "annualized"])
      .default("cumulative")
      .describe(
        "cumulative = total return over each horizon; annualized = the compound annual rate, which makes long and short horizons comparable.",
      ),
  }),
});

export const metalAthMeta = defineFrameMeta({
  name: "metal-ath",
  label: "Metal ATH Watch",
  category: "metals",
  iconUrl: widgetIcon("metal-ath"),
  layout: { w: 3, h: 3, minW: 2, minH: 3, maxH: 4 },
  description:
    "All-time-high watch from the full fix history: the record price and when it was set, how far below it the metal trades now, and how long it has been since the last record.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal to watch. ${FIXED_METAL_NAMES}`),
  }),
});

export const metalFixTableMeta = defineFrameMeta({
  name: "metal-fix-table",
  label: "London Fix Table",
  category: "metals",
  iconUrl: widgetIcon("metal-fix-table"),
  layout: { w: 3, h: 4, minW: 3, minH: 2, maxH: 7 },
  description:
    "The most recent daily London fixes as a table — date, fix price and the day-over-day change. The settlement prints themselves, for anyone who prices contracts off the fix rather than off spot.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal whose fixes to list. ${FIXED_METAL_NAMES}`),
    currency: z
      .enum(["USD", "GBP", "EUR"])
      .default("USD")
      .describe(
        "Which published fix SERIES to list — the LBMA publishes all three as separate prints, not conversions of one another. This is a data choice, not a display one: to change what the card renders money in, set the frame instance's own `currency` (sibling of `config`) or the dashboard's. A USD fix follows that display currency; a GBP/EUR fix is shown as published.",
      ),
    rows: z
      .number()
      .int()
      .min(5)
      .max(40)
      .default(12)
      .describe("How many recent fixes to list, newest first."),
  }),
});

export const metalMilestonesMeta = defineFrameMeta({
  name: "metal-milestones",
  label: "Metal Milestones",
  category: "metals",
  iconUrl: widgetIcon("metal-milestones"),
  layout: { w: 3, h: 4, minW: 2, minH: 2 },
  description:
    "When the metal first crossed each round-number price — $100, $500, $1,000, $2,000 — and how long each leg took. A timeline only decades of fix history can tell, and the most human way to read gold's long climb.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal whose milestones to list. ${FIXED_METAL_NAMES}`),
    newestFirst: z
      .boolean()
      .default(true)
      .describe(
        "List the most recent milestone at the top. Turn off to read the climb chronologically from 1968.",
      ),
  }),
});

export const metalReturnDistributionMeta = defineFrameMeta({
  name: "metal-return-distribution",
  label: "Return Distribution",
  category: "metals",
  iconUrl: widgetIcon("metal-return-distribution"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Histogram of the metal's periodic returns over decades, with the mean marked — how fat the tails really are, rather than the tidy bell curve risk models assume.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal to analyse. ${FIXED_METAL_NAMES}`),
    period: z
      .enum(["daily", "monthly"])
      .default("monthly")
      .describe(
        "Bucket returns by trading day or by calendar month. Monthly is smoother and easier to read; daily exposes the tails.",
      ),
    years: yearsField(30, "How many years of returns to bucket."),
  }),
});

export const metalsCorrelationMeta = defineFrameMeta({
  name: "metals-correlation",
  label: "Metals Correlation",
  category: "metals",
  iconUrl: widgetIcon("metals-correlation"),
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
  description:
    "Correlation matrix of daily returns across gold, silver, platinum and palladium over a chosen window — which metals actually move together, and which only look like they do.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    years: yearsField(
      3,
      "Window, in years, the correlations are measured over.",
    ),
  }),
});

export const metalRatioPercentileMeta = defineFrameMeta({
  name: "metal-ratio-percentile",
  label: "Metal Ratio Percentile",
  category: "metals",
  iconUrl: widgetIcon("metal-ratio-percentile"),
  layout: { w: 5, h: 5, minW: 3, minH: 3 },
  description:
    "Where one metal's price against another sits in its OWN history: the live ratio as the headline, its percentile inside the chosen window, and a histogram of every daily fix in that window with today marked. The question a ratio line chart can't answer — an 84 gold/silver only means something next to the distribution it came from. Also reports the window's low, median and high.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    numerator: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(
        `Metal on top of the ratio — the leg that is expensive when the ratio is high. ${FIXED_METAL_NAMES}`,
      ),
    denominator: z
      .enum(FIXED_METALS)
      .default("XAG")
      .describe(
        "Metal on the bottom of the ratio, and the cheap leg when the ratio is high. Must differ from the numerator — a same-metal pair renders an instruction to change it rather than a flat 1.0.",
      ),
    years: yearsField(
      20,
      "Window the distribution is built from and the percentile is ranked inside. 5 asks 'extreme for this cycle', 58 asks 'extreme ever' — though 58 only exists for gold and silver, since the platinum and palladium fixes start in 1990 and a pair including one of them is capped by the overlap.",
    ),
  }),
});

export const metalRollingCorrelationMeta = defineFrameMeta({
  name: "metal-rolling-correlation",
  annotatable: true,
  label: "Metal Rolling Correlation",
  category: "metals",
  iconUrl: widgetIcon("metal-rolling-correlation"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Rolling correlation of two metals' daily log returns, charted through time — whether silver is still tracking gold, or the relationship has broken. The regime view the static correlation matrix can't give, since that reports one number for one window. Switch the metric to beta to read how much the quote leg amplifies or damps the base's moves instead.",
  capabilities: ["metal-history"],
  source: SOURCES.lbma,
  schema: z.object({
    base: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(
        `The reference leg. Correlation is symmetric so the order doesn't matter for it, but beta is measured TO this metal — a 1% move in it is the unit. ${FIXED_METAL_NAMES}`,
      ),
    quote: z
      .enum(FIXED_METALS)
      .default("XAG")
      .describe(
        "The metal measured against the base; under the beta metric it is the responding leg, so the reading is its sensitivity to a 1% base move. Must differ from the base — a metal against itself correlates 1.00 forever.",
      ),
    metric: z
      .enum(["correlation", "beta"])
      .default("correlation")
      .describe(
        "correlation = how tightly the two move together, -1 to +1, on a fixed axis so cards are comparable; beta = how FAR the quote moves per 1% of base move (1.00 is one-for-one, 1.40 means it amplifies by 40%). Correlation answers 'is the link intact', beta answers 'how much leverage does it give'.",
      ),
    window: z
      .number()
      .int()
      .min(20)
      .max(365)
      .default(90)
      .describe(
        "Rolling window in trading days. 30 is twitchy and catches a break early, 90 is the common standard, 252 is a year and only shows structural regime change.",
      ),
    years: yearsField(
      10,
      "How many years of the rolling series to chart. The window's warm-up is taken from history before this span, so the line starts filled rather than climbing out of nothing.",
    ),
  }),
});

export const btcInGoldMeta = defineFrameMeta({
  name: "btc-in-gold",
  annotatable: true,
  label: "BTC in Gold",
  category: "metals",
  iconUrl: widgetIcon("btc-in-gold"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Bitcoin priced in ounces of gold instead of dollars — how many ounces one BTC buys, charted over time. The clean way to ask whether Bitcoin is beating the oldest hard asset or just the dollar.",
  capabilities: ["metal-history", "price-history-daily"],
  source: SOURCES.lbma,
  schema: z.object({
    years: yearsField(
      10,
      "How many years of the BTC-in-ounces ratio to chart.",
    ),
    logScale: z
      .boolean()
      .default(true)
      .describe(
        "Use a logarithmic axis — the ratio has spanned four orders of magnitude, so linear hides everything before the last cycle.",
      ),
  }),
});

export const metalCotNetMeta = defineFrameMeta({
  name: "metal-cot-net",
  annotatable: true,
  label: "COT Net Positioning",
  category: "metals",
  iconUrl: widgetIcon("metal-cot-net"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Net speculative positioning from the CFTC's weekly Commitments of Traders — non-commercial longs minus shorts, against a zero line. Crowded longs have marked local tops in gold for decades.",
  capabilities: ["metal-positioning"],
  source: SOURCES.cftc,
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(`Metal futures market to read. ${METAL_NAMES}.`),
    years: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe("How many years of weekly reports to chart."),
    showOpenInterest: z
      .boolean()
      .default(false)
      .describe(
        "Overlay total open interest so a change in net positioning can be read against whether the whole market grew or shrank.",
      ),
  }),
});

export const metalCotBreakdownMeta = defineFrameMeta({
  name: "metal-cot-breakdown",
  label: "COT Trader Breakdown",
  category: "metals",
  iconUrl: widgetIcon("metal-cot-breakdown"),
  layout: { w: 4, h: 4, minW: 3, minH: 4 },
  description:
    "The latest COT week split by trader class — non-commercial speculators, commercial hedgers and small traders — as opposing long and short bars, plus each group's net and its week-over-week change.",
  capabilities: ["metal-positioning"],
  source: SOURCES.cftc,
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(`Metal futures market to read. ${METAL_NAMES}.`),
  }),
});

export const metalCotGaugeMeta = defineFrameMeta({
  name: "metal-cot-gauge",
  label: "COT Positioning Gauge",
  category: "metals",
  iconUrl: widgetIcon("metal-cot-gauge"),
  layout: { w: 3, h: 3, minW: 2, minH: 3, maxW: 5 },
  description:
    "Where speculative net positioning sits inside its own historical range, as a dial from washed-out short to crowded long — a contrarian sentiment gauge built from the CFTC's own weekly numbers.",
  capabilities: ["metal-positioning"],
  source: SOURCES.cftc,
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(`Metal futures market to read. ${METAL_NAMES}.`),
    years: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe("Lookback the percentile is ranked against, in years."),
  }),
});

export const metalOpenInterestMeta = defineFrameMeta({
  name: "metal-open-interest",
  annotatable: true,
  label: "Futures Open Interest",
  category: "metals",
  iconUrl: widgetIcon("metal-open-interest"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Total open interest in the metal's US futures contract, weekly from the CFTC — in contracts, in ounces, or in dollar notional at today's spot. How much paper claim sits on top of the physical market.",
  capabilities: ["metal-positioning", "metal-spot"],
  source: SOURCES.cftc,
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(`Metal futures market to read. ${METAL_NAMES}.`),
    years: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe("How many years of weekly open interest to chart."),
    unit: z
      .enum(["contracts", "ounces", "notional"])
      .default("contracts")
      .describe(
        "contracts = as CFTC reports it; ounces = contracts × contract size; notional = ounces × live spot (needs a spot quote).",
      ),
  }),
});

export const metalRealPriceMeta = defineFrameMeta({
  name: "metal-real-price",
  annotatable: true,
  label: "Real Price",
  category: "metals",
  iconUrl: widgetIcon("metal-real-price"),
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "The daily London fix deflated by US CPI into TODAY's dollars, drawn beside the price as published. A commodity has no earnings, so its inflation-adjusted price IS its valuation history — this is the card that answers whether a nominal record is a real record, and gold's January 1980 peak restated in today's money is the reference every all-time-high headline leaves out. The headline names the real record and how far below it the metal sits. Always reads the USD fix series (US CPI can only deflate dollars), and carries each monthly CPI print forward across its days rather than interpolating one.",
  capabilities: ["metal-history", "macro-reference-series"],
  source: [SOURCES.lbma, SOURCES.fred],
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(`Metal to deflate. ${FIXED_METAL_NAMES}`),
    years: yearsField(
      58,
      "How many years of the two lines to chart. The real all-time high in the headline is always measured over the FULL history whatever this says, so a short window still names the real record rather than the window's own high.",
    ),
    showNominal: z
      .boolean()
      .default(true)
      .describe(
        "Also draw the price exactly as published, unadjusted. The gap between the two lines IS the inflation, so turning this off leaves a real-terms line with nothing to read it against.",
      ),
  }),
});

export const metalVsMacroMeta = defineFrameMeta({
  name: "metal-vs-macro",
  annotatable: true,
  label: "Metal vs Macro",
  category: "metals",
  iconUrl: widgetIcon("metal-vs-macro"),
  layout: { w: 6, h: 4, minW: 4, minH: 3 },
  description:
    "A metal against the macro variable it is supposed to answer to — the 10-year real yield, the broad dollar, or the inflation breakeven — plus the trailing correlation of their daily CHANGES, which is the number that says whether the textbook relationship still holds (levels would correlate near ±1 for any two trending series and say nothing). The chart layer has a single y-axis and the legs are in different units, so each is scaled to its own window range (0 = window low, 100 = window high) while the header keeps both legs' real values.",
  capabilities: ["metal-history", "macro-reference-series"],
  source: [SOURCES.lbma, SOURCES.fred],
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(
        `Metal to compare. ${FIXED_METAL_NAMES} (the price leg needs an LBMA fix, so copper isn't available here).`,
      ),
    series: z
      .enum(["DFII10", "REAINTRATREARAT10Y", "DTWEXBGS", "T10YIE"])
      .default("DFII10")
      .describe(
        "Macro series to plot against the metal. DFII10 = the 10-year TIPS real yield (daily, from 2003) — gold's classic inverse. REAINTRATREARAT10Y = the 10-year real interest rate (monthly, from 1982) — the same idea 21 years deeper, for windows TIPS cannot reach. DTWEXBGS = the Fed's broad trade-weighted dollar index (daily, from 2006). T10YIE = the 10-year inflation breakeven (daily, from 2003) — what the bond market prices for inflation, the thing bullion is bought as a hedge against.",
      ),
    years: yearsField(
      10,
      "How many years both legs cover. A window deeper than the chosen series reaches simply starts where the series does — DFII10, DTWEXBGS and T10YIE all begin in the 2000s, only REAINTRATREARAT10Y reaches the 1980s.",
    ),
  }),
});

export const commodityVolRegimeMeta = defineFrameMeta({
  name: "commodity-vol-regime",
  annotatable: true,
  label: "Commodity Vol Regime",
  category: "metals",
  iconUrl: widgetIcon("commodity-vol-regime"),
  // Two stacked plots (history 140px + distribution 92px) plus a header and a
  // caption, so the minimum is 5 rows, not the family's usual 3 — at 4 the
  // distribution strip is what clips.
  layout: { w: 5, h: 5, minW: 3, minH: 4 },
  description:
    "Cboe's implied-volatility index for gold, silver, gold miners or crude — the level, where it ranks inside its own history, and the distribution it is ranked against. A volatility number alone answers nothing: 23% is cheap for miners and dear for gold, so the percentile is the reading, and the histogram shows what today's level is being compared with. The metals counterpart of a VIX card. These are volatility percentages, not money.",
  capabilities: ["commodity-vol-index"],
  source: SOURCES.cboe,
  schema: z.object({
    index: z
      .enum(["GVZ", "VXSLV", "VXGDX", "OVX"])
      .default("GVZ")
      .describe(
        "Which published index to read. GVZ = 30-day implied vol on SPDR Gold Shares (GLD) options, history from 2009. VXSLV = iShares Silver Trust (SLV), from 2011. VXGDX = VanEck Gold Miners (GDX), from 2011 — miner vol runs well above metal vol, and that gap is the leverage the equity carries. OVX = United States Oil Fund (USO), from 2009. Each measures options on the ETF named, not on the metal's own futures, because the ETF chain is where the liquid listed vol actually trades.",
      ),
    window: z
      .enum(["all", "10y", "5y", "1y"])
      .default("all")
      .describe(
        'History the percentile and the distribution are measured over. "all" uses the whole published file (2009 for GVZ/OVX, 2011 for VXSLV/VXGDX); the shorter windows ask whether today is expensive against the recent regime rather than against 2020.',
      ),
  }),
});

export const metalCotDisaggregatedMeta = defineFrameMeta({
  name: "metal-cot-disaggregated",
  annotatable: true,
  label: "COT Disaggregated",
  category: "metals",
  iconUrl: widgetIcon("metal-cot-disaggregated"),
  layout: { w: 5, h: 6, minW: 4, minH: 5 },
  description:
    "The CFTC's disaggregated Commitments of Traders — the five real trader classes (producers and merchants, swap dealers, managed money, other reportables, small traders) as opposing long and short bars, each with the agency's own week-over-week change and its share of open interest. Pick this over COT Trader Breakdown whenever the question is WHO holds the position: the legacy report's single \"commercial\" bucket adds miner hedging to swap-dealer bank shorts, which are opposite stories in metals, and conflating them is the most common misreading of gold positioning. A history view charts each class's net across the weekly reports instead.",
  capabilities: ["metal-positioning"],
  source: SOURCES.cftc,
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(`Metal futures market to read. ${METAL_NAMES}.`),
    view: z
      .enum(["latest", "history"])
      .default("latest")
      .describe(
        '"latest" shows the newest published week: the five classes as opposing long/short bars, then each class\'s contracts with the CFTC\'s own week-over-week change and its share of open interest. "history" charts every class\'s net (long − short) across the window instead, which is where a rotation from hedgers to funds becomes visible.',
      ),
    weeks: z
      .number()
      .int()
      .min(8)
      .max(520)
      .default(104)
      .describe(
        "How many weekly reports the history view charts (8–520; 52 ≈ one year, 520 is the provider's ceiling). Unused by the latest view. The disaggregated report only starts in June 2006, so a window reaching further back simply shows the weeks that exist.",
      ),
  }),
});

export const metalCotConcentrationMeta = defineFrameMeta({
  name: "metal-cot-concentration",
  annotatable: true,
  label: "COT Concentration",
  category: "metals",
  iconUrl: widgetIcon("metal-cot-concentration"),
  layout: { w: 5, h: 6, minW: 5, minH: 6 },
  description:
    "How few hands hold the market — the CFTC's concentration columns: the share of the market's longs and shorts sitting in the largest 4 and 8 traders, each drawn against the whole market, plus how many distinct traders hold each side of each class. Gold routinely runs above half of its gross shorts in four traders. The commodity analogue of equity ownership concentration, and only the disaggregated report (June 2006 onward) publishes it at all.",
  capabilities: ["metal-positioning"],
  source: SOURCES.cftc,
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(`Metal futures market to read. ${METAL_NAMES}.`),
    basis: z
      .enum(["gross", "net"])
      .default("gross")
      .describe(
        '"gross" counts each trader\'s long and short book separately — what "four traders hold 51% of the shorts" means in the wild, and the pair the CFTC always publishes. "net" nets each trader\'s books first, so it always reads lower and is not reported for every market; when it is missing the card says so and names the fix rather than drawing an empty chart.',
      ),
    weeks: z
      .number()
      .int()
      .min(8)
      .max(520)
      .default(104)
      .describe(
        "How many weekly reports the concentration history charts (8–520; 52 ≈ one year, 520 is the provider's ceiling). Only read when showHistory is on.",
      ),
    showHistory: z
      .boolean()
      .default(true)
      .describe(
        "Chart the concentration readings over the window underneath the latest week's shares. Turn it off on a short card, where the four shares plus the trader counts fit better on their own.",
      ),
  }),
});

export const metalCotPercentileMeta = defineFrameMeta({
  name: "metal-cot-percentile",
  label: "COT Percentile",
  category: "metals",
  iconUrl: widgetIcon("metal-cot-percentile"),
  layout: { w: 5, h: 4, minW: 4, minH: 3 },
  description:
    "Scores this week's COT net position against its own history: the percentile and z-score of the chosen trader class's net, drawn over a histogram of every week in the window with today marked. Pick it when the question is whether a positioning level is crowded rather than what it is — 180k contracts net long is either ordinary or a record, and only the distribution says which.",
  capabilities: ["metal-positioning"],
  source: SOURCES.cftc,
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(`Metal futures market to read. ${METAL_NAMES}.`),
    traderClass: z
      .enum(["noncommercial", "commercial", "nonreportable"])
      .default("noncommercial")
      .describe(
        'Which trader class to score. "noncommercial" = large speculators, the crowd a "positioning extreme" normally refers to. "commercial" = hedgers (miners, refiners, fabricators), who are structurally net SHORT in metals, so for them the LOW end of the range is the crowded one, not the high end. "nonreportable" = small traders below the CFTC reporting threshold.',
      ),
    years: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe(
        "Window the percentile and z-score are measured over, in years. The CFTC feed carries about 10 years of weekly reports, so 10 is effectively the full history; a shorter window scores today against the current regime instead of a decade of them.",
      ),
  }),
});

export const metalSpecNotionalMeta = defineFrameMeta({
  name: "metal-spec-notional",
  annotatable: true,
  label: "Spec Net Notional",
  category: "metals",
  iconUrl: widgetIcon("metal-spec-notional"),
  layout: { w: 5, h: 4, minW: 3, minH: 4 },
  description:
    "How much money the futures crowd actually has riding on the metal: net speculative contracts × contract size × live spot, as a dollar headline with its weekly history. Every week in the series is valued at TODAY's spot, so the line isolates the change in positioning — it is deliberately NOT a mark-to-market of what the position was worth at the time.",
  capabilities: ["metal-positioning", "metal-spot"],
  source: [SOURCES.cftc, SOURCES.goldApi],
  schema: z.object({
    symbol: z
      .enum(METAL_SYMBOLS)
      .default("XAU")
      .describe(
        `Metal futures market to read. ${METAL_NAMES}. Contract sizes are quoted in each metal's own unit (gold 100 oz, silver 5,000 oz, platinum 50 oz, palladium 100 oz, copper 25,000 lb) and spot is quoted in that same unit, so the dollar figure is sound for all five.`,
      ),
    years: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe(
        "How many years of weekly reports to chart. The CFTC feed carries about 10 years, so 10 is effectively the full history.",
      ),
  }),
});

export const metalPositioningVsPriceMeta = defineFrameMeta({
  name: "metal-positioning-vs-price",
  annotatable: true,
  label: "Positioning vs Price",
  category: "metals",
  iconUrl: widgetIcon("metal-positioning-vs-price"),
  layout: { w: 6, h: 4, minW: 4, minH: 3 },
  description:
    "Net speculative positioning and the metal's price on one rebased chart, so you can see whether a rally is being led by the futures crowd or happening in spite of them — and where the two have diverged.",
  capabilities: ["metal-positioning", "metal-history"],
  source: SOURCES.cftc,
  schema: z.object({
    symbol: z
      .enum(FIXED_METALS)
      .default("XAU")
      .describe(
        `Metal to compare. ${FIXED_METAL_NAMES} (the price leg needs an LBMA fix, so copper isn't available here).`,
      ),
    years: z
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5)
      .describe("How many years both series cover."),
  }),
});

export const usGoldReserveMeta = defineFrameMeta({
  name: "us-gold-reserve",
  label: "US Gold Reserve",
  category: "metals",
  iconUrl: widgetIcon("us-gold-reserve"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "The U.S. Treasury's official gold holding from its own monthly status report: total fine ounces, the statutory book value that still carries it at $42.22/oz, and what the same metal is worth at today's spot. The gap between the two is the headline.",
  capabilities: ["gold-reserve", "metal-spot"],
  source: SOURCES.treasury,
  schema: z.object({
    showMarketValue: z
      .boolean()
      .default(true)
      .describe(
        "Value the reserve at live spot alongside the statutory book value, and show the difference.",
      ),
  }),
});

export const usGoldVaultsMeta = defineFrameMeta({
  name: "us-gold-vaults",
  label: "US Gold Vaults",
  category: "metals",
  iconUrl: widgetIcon("us-gold-vaults"),
  layout: { w: 4, h: 4, minW: 3, minH: 2, maxW: 11 },
  description:
    "Where the U.S. official gold physically sits — Fort Knox, West Point, Denver, the New York Fed vault and Mint working stock — sized by fine ounces, straight from the Treasury's monthly report.",
  capabilities: ["gold-reserve"],
  source: SOURCES.treasury,
  schema: z.object({
    mode: z
      .enum(["treemap", "bars"])
      .default("treemap")
      .describe(
        "treemap = area per vault, good for the size contrast; bars = ranked horizontal bars, easier to read exact ounces.",
      ),
  }),
});

export const tokenizedGoldMeta = defineFrameMeta({
  name: "tokenized-gold",
  label: "Tokenized Gold",
  category: "metals",
  iconUrl: widgetIcon("tokenized-gold"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "Gold-backed tokens (PAXG, XAUT) with their premium or discount to physical spot, market cap and the ounces they claim to vault — the crypto wrapper on bullion, priced against the real thing.",
  capabilities: ["tokenized-gold"],
  source: SOURCES.coingecko,
  schema: z.object({
    showPremium: z
      .boolean()
      .default(true)
      .describe(
        "Show each token's premium (+) or discount (−) against live spot gold. A persistent premium is the market pricing convenience over custody.",
      ),
  }),
});
