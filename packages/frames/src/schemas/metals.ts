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
  interpretation: `Spot is the price for immediate delivery of the metal, quoted continuously while markets trade. The London fix is a benchmark price set by a daily auction in London — it is what the physical trade settles contracts against.

Each row shows one metal with its live spot price and, when enabled, its percent move since the most recent fix — green when spot sits above the fix, red when below.

A rising board across all five metals usually reflects a weaker dollar or broad demand for hard assets; gold moving alone is more often a safe-haven or interest-rate story. Note the change is measured against the last daily fix, not yesterday's close, so it can differ from the daily change quoted elsewhere.`,
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
  interpretation: `Spot is the price to buy or sell the metal for immediate delivery, quoted continuously while markets trade. The headline is that live price expressed in the chosen weight unit — the troy ounce (about 31.1 g) is the market convention, and copper quotes per pound instead.

Below the headline, when enabled, sits the latest London fix — the daily benchmark auction price the physical trade settles against — and the percent change is measured from that fix, not from yesterday's close.

A price alone signals little; the change against the fix says whether the metal has moved since the last daily benchmark. The fix history loads a few seconds after the price, so a freshly opened card may briefly show no change.`,
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
  interpretation: `The card multiplies a fixed weight of metal by the live spot price — the price for immediate delivery — so the number is what that holding is worth at this moment.

The value moves one-for-one with the metal: a 2% rise in spot is a 2% rise in the card. Nothing else changes it, since the weight is fixed.

A real sale of physical bullion usually happens slightly below spot (the dealer's spread), and coins or small bars carry premiums on the way in, so the figure reads best as a mark-to-market reference rather than a guaranteed sale price.`,
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
  interpretation: `Each line is the daily London fix — the benchmark price set by a daily auction in London, which the physical metal trade settles against — not a live spot feed. Gold and silver fixes run back to 1968; platinum and palladium start in 1990.

Time runs left to right; the vertical axis is price in the chosen fix currency. With the log axis on, equal vertical steps mean equal percentage moves, which is the honest way to read decades of history — a linear axis makes early decades look flat.

A rising line over long spans reflects both real demand and the slow erosion of the currency it is priced in. One trap: the USD, GBP and EUR fixes are separate published prints, not conversions of one another — a GBP or EUR series is shown as published and does not follow the board's display currency.`,
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
  interpretation: `Drawdown is the distance below the highest price reached up to each date. The line sits at 0% whenever the metal is making new highs, and falls to show how far under the running record it trades.

The axis is negative percent, so deeper is worse: a dip to -20% means the metal was worth a fifth less than at its prior peak. Gold spent most of 1980-2005 more than 40% underwater.

Long stretches at 0% mark bull runs; long deep troughs show how many years a buyer at the top waited to break even. A common misreading is taking a shallow current drawdown as safety — it only says the price is near its record, not that it will stay there.`,
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
  interpretation: `Each bar is one calendar year's percent return, computed from the LBMA's daily London fix — the benchmark price the physical market settles against. Years run left to right, most recent last.

Green bars are up years and extend above the zero line; red bars are down years and hang below it. Bar length is the size of the move.

A run of green marks a bull market, but the more useful reading is the mix: how often down years appear and how large they run compared with the up years. Calendar years are arbitrary slices — a metal can fall 30% peak-to-trough inside a year that still closes green.`,
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
  interpretation: `Each cell is one month's percent return in one year, computed from the London fix history. Rows are years, columns are months, and each column's long-run average sits underneath.

Green cells are positive months, red negative, with stronger color for bigger moves. The average row at the bottom is where a seasonal pattern would show — a column consistently green (or red) across many years.

Seasonal effects in metals are weak and unstable: a column average driven by one or two outlier years is noise, not a pattern. The grid is more honest than a smoothed seasonal line precisely because every individual year stays visible behind the average.`,
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
  interpretation: `Realised volatility measures how violently the price has actually moved: it is computed from daily London-fix returns over a rolling window and annualised. It describes the past, unlike implied volatility, which is what option prices expect for the future.

The line rises when daily swings get larger and falls when trading goes quiet. Around 10% is calm for gold; readings past 30% mark crisis conditions.

Volatility is direction-blind — a sharp rally raises it as much as a crash does, so a high reading means turbulence, not necessarily falling prices. Shorter windows react faster but flicker; the 90-day default is the common standard.`,
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
  interpretation: `The ratio is gold's daily London fix divided by silver's — how many ounces of silver one ounce of gold buys. It has ranged roughly from the teens to over 120 across the last century.

The card shows the live ratio, its recent trend, and optionally where today ranks inside the charted window — a percentile of 100% means silver has never been cheaper against gold over that span.

A high ratio means silver is cheap relative to gold, not that either metal is cheap outright: both can fall together while the ratio rises. The ratio also has no level it must return to — the pre-1900 value near 15 reflected fixed coinage ratios, not a natural anchor.`,
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
  interpretation: `The line is one metal's daily London fix divided by another's — how many units of the bottom metal one unit of the top metal buys. Both legs are priced in the same currency, so the currency cancels: this is relative value between the two metals, free of the dollar's own trend.

A rising line means the numerator metal is outperforming the denominator; a falling line means the opposite. The level itself matters less than where it sits against its own history.

Ratios can trend for decades — gold/platinum flipped from below 1 to well above it after 2015 — so a stretched reading is a statement about relative regimes, not an automatic bet on reversion.`,
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
  interpretation: `Every metal is rebased to 0% at the start of the window, so each line reads as cumulative percent return since that date rather than a price. That is what lets a $4,000 gold and a $58 silver share one axis.

The line highest on the chart has gained the most over the window; a line below zero has lost money over it. Gaps between lines are relative performance, and crossings mark leadership changing hands.

The picture depends entirely on the start date — shifting the window a year can reorder the race — so it shows relative behaviour over this particular span, not a permanent ranking of the metals.`,
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
  interpretation: `Each bar is the metal's return over one standard horizon — one month out to twenty years — computed from the London fix history. Green bars extend up for gains, red hang down for losses.

In cumulative mode each bar is the total change over its horizon, so long bars naturally dwarf short ones. Annualised mode restates each as a compound yearly rate, the only fair way to compare a 3-month move with a 20-year one.

A common misreading is taking a big 20-year cumulative number as strength: 300% over 20 years is only about 7% a year. Mixed signs across horizons — long-term green, short-term red — describe a pullback inside a longer uptrend, or the reverse.`,
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
  interpretation: `The card reads the full London fix history and reports the highest price ever recorded, the date it printed, how far below that record the metal trades now, and how long since the last new high.

Distance below the record is a drawdown: 0% means the metal is at, or making, all-time highs; -30% means it is worth almost a third less than at its peak.

Long droughts between records are normal in metals — gold went 28 years (1980-2008) without one. The record here is nominal: adjusted for inflation, a price can print a nominal all-time high while remaining far below the real 1980 peak.`,
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
  interpretation: `Each row is one day's London fix — the benchmark price set by the LBMA's daily auction, which physical contracts, miner sales and ETF valuations settle against. It is a once-a-day print, distinct from the continuous spot quote.

Columns show the date, the fix price in the chosen published series, and the change from the previous fix — green for up, red for down.

The USD, GBP and EUR fixes are separate auction prints, not currency conversions of one another: a GBP or EUR series is shown exactly as published and does not follow the board's display currency. Day-over-day fix changes can also differ slightly from spot-market daily changes, since the fix samples one moment of the day.`,
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
  interpretation: `Each row marks the first day the metal's London fix closed above a round-number price — $100, $500, $1,000, $2,000 — with the date and how long the climb from the previous milestone took.

Short gaps between milestones mark explosive phases; multi-decade gaps mark the long stagnations in between. Gold took over 27 years to go from $500 to $1,000, then under four from $1,000 to $2,000.

Milestones compress as prices rise — $1,000 to $2,000 is a 100% move while $2,000 to $3,000 is only 50% — so quickening milestones partly reflect arithmetic, not just acceleration. The prices are nominal, unadjusted for inflation.`,
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
  interpretation: `The histogram buckets decades of the metal's periodic returns — daily or monthly — by size. Bar height is how often returns of that size occurred, and the marked line is the long-run mean.

Most bars cluster near zero; the information is in the tails, the rare very large up and down moves at the edges. Metals' tails are fatter than a normal bell curve, meaning extreme moves happen far more often than standard risk models assume.

A mean only slightly right of zero is what a long-run uptrend looks like at this scale — nearly invisible period to period. Daily bucketing exposes the tails; monthly smooths them into a friendlier but less honest shape.`,
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
  interpretation: `Each cell is the correlation of two metals' daily returns over the chosen window, from -1 to +1: +1 means they move in lockstep, 0 means no relationship, negative means they tend to move opposite.

Stronger color marks a tighter relationship. Gold and silver typically correlate highly; copper, an industrial metal, often sits apart from the precious complex.

Correlation measures day-to-day co-movement, not shared trend: two metals can correlate highly while one grinds up and the other down over the window. Each number is also one average over the whole window — the rolling-correlation card shows when it changed.`,
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
  interpretation: `The headline is one metal's London fix divided by another's; the percentile says where that ratio sits inside its own history over the chosen window. A percentile of 90% means the ratio has been lower than today on nine days out of ten in the window.

The histogram underneath shows every daily ratio in the window with today marked, so a stretched reading can be judged against the actual distribution it came from — alongside the window's low, median and high.

A high percentile means the numerator metal is historically expensive against the denominator, not that either is expensive outright. The reading also depends on the window: extreme against five years can be ordinary against fifty.`,
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
  interpretation: `The line is the correlation (or beta) of two metals' daily returns, recomputed over a rolling window and charted through time — the regime view a single correlation number cannot give.

Correlation runs -1 to +1 on a fixed axis: high and steady means the link is intact, a falling line means the metals are decoupling. Beta reads differently — it is how far the quote metal moves per 1% move in the base, so 1.4 means it amplifies the base's moves by 40%.

Correlation answers whether the relationship holds; beta answers how much leverage it carries — silver can stay highly correlated to gold while its beta swings widely. Short windows catch a break early but flicker; a 252-day window shows only structural change.`,
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
  interpretation: `The line is Bitcoin's price divided by gold's London fix — how many ounces of gold one bitcoin buys. Pricing one hard asset in the other removes the dollar from the picture: a rising line means Bitcoin is outperforming gold itself, not merely the currency both are quoted in.

The axis defaults to logarithmic because the ratio has spanned four orders of magnitude; on a log axis equal vertical steps are equal percentage moves, so the early history stays readable.

A flat line during a Bitcoin rally means gold rose just as fast — both were likely riding the same dollar or liquidity move. The ratio inherits Bitcoin's volatility almost entirely, since gold moves far less day to day.`,
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
  interpretation: `Every week the CFTC publishes the Commitments of Traders report, classifying US futures positions by trader type. This line is non-commercial (speculator) longs minus shorts — the net bet hedge funds and other large speculators hold in the metal's futures.

The line is drawn against a zero line: above zero the speculative crowd is net long, below it net short. The optional open-interest overlay shows whether a positioning change came from new money entering or old positions closing.

Extremes read contrarian: heavily crowded longs have marked local tops in gold for decades, because the buying that drove the move is already done. The report also lags — it is published Friday for the prior Tuesday.`,
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
  interpretation: `The CFTC's weekly Commitments of Traders report classifies every large futures position by who holds it. This card shows the latest week split three ways: non-commercial speculators, commercial hedgers, and small traders below the reporting threshold.

Each class gets opposing bars — longs one way, shorts the other — plus its net position and the change from the prior week. Commercials (miners, refiners, fabricators) are structurally net short in metals, because selling futures is how producers hedge future output.

Reading the commercial short as a bearish bank bet is the classic misreading: much of it is routine hedging, and this legacy report's single commercial bucket also mixes producer hedging with swap-dealer positions — the disaggregated card separates them.`,
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
  interpretation: `The dial places this week's net speculative futures position — from the CFTC's weekly Commitments of Traders report — inside its own range over the lookback window.

A needle at the top of the range means speculators are as net long as they have been over the window (a crowded long); the bottom means positioning is washed out toward net short.

It reads as a contrarian sentiment gauge: crowded longs leave few buyers left to push the price higher, and washed-out positioning marks capitulation. The gauge says nothing about direction on its own — extremes can persist for months — and the reading depends on the window it is ranked against.`,
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
  interpretation: `Open interest is the number of futures contracts currently open in the metal's US futures market — every contract has both a long and a short, so it counts live paper claims, not trading volume. The weekly series comes from the CFTC.

Rising open interest means new positions are being created; falling means positions are closing. Switching the unit to ounces or dollar notional shows how much metal, or money, the paper market represents next to the physical one.

Open interest is direction-neutral: it grows whether the new positions are bullish or bearish. Rising prices on rising open interest suggest new money driving a trend; rising prices on falling open interest suggest shorts covering.`,
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
  interpretation: `One line is the London fix as published; the other is the same series deflated by US consumer-price inflation into today's dollars — what each historical price would be in current money. A commodity has no earnings, so this real price is the closest thing it has to a valuation history.

The vertical gap between the two lines is cumulative inflation. The headline names the real all-time high and how far below it the metal trades now.

The classic reading: gold's January 1980 peak, restated in today's dollars, sat far above later nominal records for decades — so a nominal all-time high is not automatically a real one. The card always deflates the USD fix series, since US CPI can only meaningfully deflate dollars.`,
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
  interpretation: `The chart draws the metal's fix against one macro series — the 10-year real yield, the broad dollar index, or the inflation breakeven — the variables gold is textbook-supposed to answer to: real yields and the dollar inversely, inflation expectations positively.

The two legs are in different units, so each line is scaled to its own window range (0 = window low, 100 = window high); the header keeps the real values. The correlation readout uses daily CHANGES, because the levels of any two trending series correlate near plus or minus one and say nothing.

A strongly negative change-correlation with real yields is gold's classic regime; the interesting moments are when it fades — the relationship breaking is itself the signal. The scaled lines compare shape, not magnitude: identical-looking swings can differ hugely in size.`,
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
  interpretation: `The index is Cboe's implied volatility for the chosen ETF's options — the market's price for expected movement over the next 30 days, built the same way as the VIX. It measures options on the ETF (GLD, SLV, GDX, USO), not the metal's own futures, and the values are volatility percentages, not money.

The upper plot is the index's history; the strip below is the distribution of every reading in the window, with today marked and ranked as a percentile.

The percentile is the reading, not the level: 23% is cheap for gold miners and expensive for gold itself, since miner volatility structurally runs higher. A high reading means options are pricing turbulence — often after a shock has already landed — while a very low percentile means insurance on the metal is historically cheap.`,
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
  interpretation: `The CFTC's disaggregated Commitments of Traders splits the metal's futures market into its five real trader classes: producers and merchants hedging physical metal, swap dealers (largely banks), managed money (funds), other reportables, and small traders.

In the latest view each class shows opposing long and short bars with the week's change and its share of open interest; the history view charts each class's net through time, where a rotation from hedgers to funds becomes visible.

The reason this card exists: the legacy report's single commercial bucket adds miner hedging to swap-dealer bank shorts — opposite stories in metals — and conflating them is the most common misreading of gold positioning. Managed money is the class that behaves like the speculative crowd sentiment reads refer to.`,
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
  interpretation: `The CFTC publishes how much of a futures market sits with its largest traders. The bars show the share of all longs and all shorts held by the biggest 4 and biggest 8 traders, alongside how many distinct traders hold each side.

Longer bars mean fewer hands control the market — gold routinely runs above half of its gross shorts in just four traders. The optional history charts how that concentration has shifted week by week.

Gross concentration counts each trader's long and short books separately, which is what the widely quoted figures mean; the net basis nets each trader's books first and always reads lower. High concentration flags who could move the market, not that anyone will — much of a large short is dealer hedging rather than a directional bet.`,
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
  interpretation: `The card scores this week's net futures position for one trader class — from the CFTC's weekly Commitments of Traders report — against its own history: a percentile and a z-score, drawn over a histogram of every week in the window with today marked.

A high percentile means positioning sits near the crowded end of its range; the distribution behind it shows whether today is a mild outlier or a record. A raw figure like 180k contracts net long means nothing without it.

Direction depends on the class: speculators (non-commercial) are crowded at the HIGH end, but commercial hedgers are structurally net short in metals, so for them the LOW end of the range is the crowded one. Extremes are contrarian context that can persist for months, not timing triggers.`,
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
  interpretation: `The headline converts the futures crowd's net speculative position into money: net contracts from the CFTC's weekly report, times the contract's size in metal, times today's spot price. It is how many dollars of exposure large speculators hold, with the weekly history charted below.

Above zero the crowd is net long in dollar terms; the line's swings show that exposure building or unwinding.

One deliberate quirk: every week in the history is valued at TODAY's spot, so the line isolates changes in positioning — it is not what the position was worth at the time. A rising spot price therefore lifts the whole history uniformly without meaning speculators ever bought more.`,
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
  interpretation: `Two lines rebased onto one chart: the metal's price (from the daily London fix) and net speculative futures positioning (from the CFTC's weekly report). Rebasing starts both at the same point so their shapes compare directly.

Moving together is the normal state — speculators chase trends. The information is in divergence: a rally the positioning line does not follow is happening in spite of the futures crowd (often physical or central-bank demand), while positioning racing ahead of price marks a crowded trade.

Rebased lines compare shape, not size — the gap between them is not measured in any unit. Positioning is also weekly and published with a lag, so it always looks slightly stale next to the daily price.`,
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
  interpretation: `The numbers come from the U.S. Treasury's own monthly status report of its gold holdings: total fine troy ounces, the statutory book value — which still carries every ounce at the $42.22 fixed by law in 1973 — and what the same metal is worth at today's spot price.

The gap between book value and market value is the headline: roughly $11 billion on the books against several hundred billion at market. The ounces barely change month to month; the market value moves with the gold price.

The book value is an accounting artifact, not an opinion about gold's worth. The figures are the Treasury's official record of its own holdings, not an independent audit.`,
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
  interpretation: `The card breaks the U.S. official gold holding down by where it physically sits — Fort Knox, West Point, Denver, the New York Fed vault and Mint working stock — from the Treasury's own monthly report, sized in fine troy ounces.

In treemap mode each vault is a rectangle whose area is its share of the total, which makes the size contrast readable at a glance; bar mode ranks the vaults for exact figures.

The distribution is remarkably static — these ounces almost never move month to month, so the card is a map, not a monitor. The figures are the Treasury's official record of its own holdings rather than an independent audit.`,
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
  interpretation: `Each row is a gold-backed token — a crypto asset (PAXG, XAUT) whose issuer claims vaulted gold behind each token — with its traded price, market cap, the ounces it claims, and its premium or discount to physical spot gold.

The premium column is the key reading: the gap between the token's traded price and the live spot price of the gold backing it, positive when the token trades rich, negative when it trades cheap.

A small persistent premium is the market pricing convenience over custody; a widening one can signal crypto-side demand or redemption friction. The premium measures the token against spot — it says nothing about whether gold itself is cheap or dear, and the backing is the issuer's audited claim, not something the chart verifies.`,
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
