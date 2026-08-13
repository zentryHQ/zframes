import { defineFrameMeta } from "@zframes/spec/frame";
import { z } from "zod";
import { widgetIcon, SOURCES, US_STATES, ZHVI_REGIONS } from "./shared";

export const ratesBoardMeta = defineFrameMeta({
  name: "rates-board",
  // Stays in USD whatever the board asks for: US-macro: an official U.S. rate board.
  usdOnly: true,
  label: "Rates Board",
  category: "macro",
  iconUrl: widgetIcon("rates-board"),
  layout: { w: 4, h: 4, minW: 3, minH: 4 },
  description:
    "Official US rates board from free public APIs: New York Fed reference rates (SOFR, effective fed funds, repo rates) plus Treasury average interest rates by security class. Daily/reference data, not a real-time stock quote feed.",
  capabilities: ["reference-rates", "treasury-rates"],
  source: [SOURCES.nyFed, SOURCES.treasury],
  schema: z.object({
    maxReferenceRates: z
      .number()
      .int()
      .min(2)
      .max(8)
      .default(5)
      .describe("How many New York Fed reference rates to show."),
    showTreasuryAverageRates: z
      .boolean()
      .default(true)
      .describe(
        "Also show Treasury average interest rates by security class from Fiscal Data.",
      ),
    maxTreasuryRates: z
      .number()
      .int()
      .min(1)
      .max(8)
      .default(4)
      .describe("How many Treasury average-rate rows to show."),
  }),
});

export const fxBoardMeta = defineFrameMeta({
  name: "fx-board",
  label: "FX Board",
  category: "macro",
  iconUrl: widgetIcon("fx-board"),
  layout: { w: 4, h: 4, minW: 3, minH: 2, maxH: 5 },
  description:
    "Foreign-exchange board from the ECB's free daily reference rates (via Frankfurter, no key): each currency's latest rate vs a base, its day-over-day change, and a short trend sparkline. Daily reference data with broader currency coverage than the handful of FX perps — not a live intraday quote feed.",
  capabilities: ["fx-rates"],
  source: SOURCES.frankfurter,
  schema: z.object({
    base: z
      .string()
      .length(3)
      .default("USD")
      .describe(
        'Base currency (ISO 4217 code) each rate is quoted against, e.g. "USD". One unit of the base buys the shown amount of each listed currency.',
      ),
    symbols: z
      .array(z.string().length(3))
      .min(1)
      .max(12)
      .default(["EUR", "GBP", "JPY", "CHF", "CAD", "AUD"])
      .describe(
        'Currencies to show (ISO 4217 codes), e.g. ["EUR","GBP","JPY"]. The ECB publishes ~30; a code equal to the base is skipped.',
      ),
    showSparkline: z
      .boolean()
      .default(true)
      .describe("Show a small ~30-day trend sparkline next to each rate."),
  }),
});

export const inflationPulseMeta = defineFrameMeta({
  name: "inflation-pulse",
  label: "Inflation Pulse",
  category: "macro",
  iconUrl: widgetIcon("inflation-pulse"),
  layout: { w: 4, h: 3, minW: 3, minH: 3, maxH: 4 },
  description:
    "BLS CPI pulse from the public no-key API: latest CPI-U all-items index with month-over-month and year-over-year changes plus a small trend sparkline. Monthly macro context for stock dashboards; not a live price feed.",
  capabilities: ["macro-series"],
  source: SOURCES.bls,
  schema: z.object({
    months: z
      .number()
      .int()
      .min(13)
      .max(36)
      .default(18)
      .describe("How many monthly CPI observations to show in the trend."),
  }),
});

export const financialStressMeta = defineFrameMeta({
  name: "financial-stress",
  label: "Financial Stress",
  category: "macro",
  iconUrl: widgetIcon("financial-stress"),
  layout: { w: 4, h: 3, minW: 3, minH: 3, maxH: 5 },
  description:
    "The OFR Financial Stress Index — a daily, market-based gauge of systemic financial stress from the U.S. Office of Financial Research. One headline value where 0 is the long-run average (positive = elevated stress, negative = calmer than normal), an optional breakdown of the five contributing categories (credit, equity valuation, safe assets, funding, volatility), and a trend line. Keyless official data, updated each business day; needs the zframes runtime's data proxy (ships with `zframes serve` / `vite dev`). Not a price feed.",
  capabilities: ["financial-stress"],
  source: SOURCES.ofr,
  schema: z.object({
    trendDays: z
      .number()
      .int()
      .min(20)
      .max(90)
      .default(60)
      .describe("How many recent daily readings to plot in the trend line."),
    showCategories: z
      .boolean()
      .default(true)
      .describe(
        "Show the five category contributions (credit, equity valuation, safe assets, funding, volatility) under the headline.",
      ),
  }),
});

export const nationalDebtMeta = defineFrameMeta({
  name: "national-debt",
  // Stays in USD whatever the board asks for: US-macro: nobody quotes the U.S. national debt in another currency.
  usdOnly: true,
  label: "National Debt",
  category: "macro",
  iconUrl: widgetIcon("national-debt"),
  layout: { w: 4, h: 3, minW: 3, minH: 3, maxH: 4 },
  description:
    "U.S. total public debt outstanding from the Treasury's keyless 'Debt to the Penny' dataset — the headline total in trillions, the change over the chosen window, an optional split into debt held by the public vs intragovernmental holdings, and a trend line. Official data updated each business day; CORS-safe (no proxy needed). Macro context, not a live price feed.",
  capabilities: ["national-debt"],
  source: SOURCES.treasury,
  schema: z.object({
    trendDays: z
      .number()
      .int()
      .min(30)
      .max(365)
      .default(180)
      .describe(
        "How many business days of history to load for the trend and the change figure.",
      ),
    showSplit: z
      .boolean()
      .default(true)
      .describe(
        "Show the debt-held-by-the-public vs intragovernmental-holdings split.",
      ),
  }),
});

export const laborMarketMeta = defineFrameMeta({
  name: "labor-market",
  label: "Labor Market",
  category: "macro",
  iconUrl: widgetIcon("labor-market"),
  layout: { w: 4, h: 3, minW: 3, minH: 3, maxH: 4 },
  description:
    "U.S. labor-market snapshot from the BLS keyless public API: the headline unemployment rate, the latest monthly change in nonfarm payrolls (jobs added or lost), the total payroll level, and an unemployment-rate trend line. Monthly macro context for stock dashboards; updates on the BLS jobs-report schedule, not a live feed.",
  capabilities: ["macro-series"],
  source: SOURCES.bls,
  schema: z.object({
    months: z
      .number()
      .int()
      .min(13)
      .max(36)
      .default(18)
      .describe("How many monthly observations to show in the trend."),
  }),
});

export const treasuryAuctionsMeta = defineFrameMeta({
  name: "treasury-auctions",
  label: "Treasury Auctions",
  category: "macro",
  iconUrl: widgetIcon("treasury-auctions"),
  layout: { w: 5, h: 4, minW: 3, minH: 2 },
  description:
    "Recent completed U.S. Treasury auctions from the keyless Fiscal Data API — each row shows the security (bill/note/bond + term), the high awarded yield, and the bid-to-cover ratio (demand: total bids ÷ amount accepted; higher = stronger). Newest first. Official market-plumbing data, CORS-safe; updates as auctions settle, not a live price feed.",
  capabilities: ["treasury-auctions"],
  source: SOURCES.treasury,
  schema: z.object({
    count: z
      .number()
      .int()
      .min(3)
      .max(20)
      .default(8)
      .describe("How many recent auctions to list (newest first)."),
  }),
});

export const yieldCurveMeta = defineFrameMeta({
  name: "yield-curve",
  label: "Yield Curve",
  category: "macro",
  iconUrl: widgetIcon("yield-curve"),
  layout: { w: 4, h: 3, minW: 3, minH: 2, maxH: 4 },
  description:
    "The U.S. Treasury daily par yield curve — a line from 1-month to 30-year yields, the headline 2s10s spread (10Y minus 2Y; negative = inverted, the classic recession signal), and a configurable row of key maturities. Keyless official data from the U.S. Treasury, updated each business day; not a live intraday feed.",
  capabilities: ["yield-curve"],
  source: SOURCES.treasury,
  schema: z.object({
    maturities: z
      .array(
        z.enum([
          "1M",
          "2M",
          "3M",
          "4M",
          "6M",
          "1Y",
          "2Y",
          "3Y",
          "5Y",
          "7Y",
          "10Y",
          "20Y",
          "30Y",
        ]),
      )
      .min(2)
      .max(8)
      .default(["3M", "2Y", "5Y", "10Y", "30Y"])
      .describe(
        "Maturities to show as labelled cells under the curve (the full curve line always shows every maturity).",
      ),
  }),
});

export const dxyMeta = defineFrameMeta({
  name: "dxy",
  label: "Dollar Index (DXY)",
  category: "macro",
  iconUrl: widgetIcon("dxy"),
  layout: { w: 3, h: 3, minW: 3, minH: 2, maxH: 3 },
  description:
    "US Dollar Index (DXY) — the dollar's strength vs a basket of six major currencies. A rising DXY is a macro headwind for risk assets (incl. BTC); a falling DXY a tailwind. Computed as the ICE-weighted geometric mean of keyless ECB reference rates (daily granularity).",
  capabilities: ["dollar-index"],
  source: SOURCES.frankfurter,
  schema: z.object({}),
});

export const macroCalendarMeta = defineFrameMeta({
  name: "macro-calendar",
  label: "Macro Calendar",
  category: "macro",
  iconUrl: widgetIcon("macro-calendar"),
  layout: { w: 4, h: 4, minW: 2, minH: 2, maxH: 4 },
  description:
    "Countdown to upcoming scheduled macro events — defaults to the 2026 FOMC rate decisions, fully editable. No data feed; the dates are known in advance.",
  capabilities: [],
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(12)
      .default(5)
      .describe("How many upcoming events to show."),
    events: z
      .array(
        z.object({
          date: z.string().describe("Event date, ISO YYYY-MM-DD."),
          label: z.string().describe("Event name, e.g. 'FOMC decision'."),
        }),
      )
      .default([
        { date: "2026-07-29", label: "FOMC decision" },
        { date: "2026-09-16", label: "FOMC decision" },
        { date: "2026-10-28", label: "FOMC decision" },
        { date: "2026-12-09", label: "FOMC decision" },
        { date: "2027-01-27", label: "FOMC decision" },
      ])
      .describe(
        "Scheduled events (date + label). Defaults to the 2026 FOMC meetings; edit to add CPI/NFP/earnings dates.",
      ),
  }),
});

export const treasuryAvgRateBarsMeta = defineFrameMeta({
  name: "treasury-avg-rate-bars",
  label: "Treasury Avg Rate Bars",
  category: "macro",
  iconUrl: widgetIcon("treasury-avg-rate-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 1, maxH: 4 },
  description:
    "U.S. Treasury average interest rates across the full set of security classes as a horizontal bar chart, ranked highest-first. The chart-first sibling of the Rates Board's Treasury-rates section. Keyless (U.S. Treasury).",
  capabilities: ["treasury-rates"],
  source: SOURCES.treasury,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(5)
      .max(25)
      .default(20)
      .describe(
        "How many security classes (by average rate, highest first) to chart.",
      ),
  }),
});

export const treasuryAuctionDemandScatterMeta = defineFrameMeta({
  name: "treasury-auction-demand-scatter",
  label: "Treasury Auction Demand",
  category: "macro",
  iconUrl: widgetIcon("treasury-auction-demand-scatter"),
  layout: { w: 6, h: 4, minW: 4, minH: 2 },
  description:
    "Recent completed U.S. Treasury auctions as a bubble scatter — awarded rate on the x-axis, bid-to-cover ratio (demand) on the y-axis, one dot per auction labelled by term. Reveals whether richer (lower-yield) auctions also draw stronger demand. Keyless (U.S. Treasury).",
  capabilities: ["treasury-auctions"],
  source: SOURCES.treasury,
  schema: z.object({
    count: z
      .number()
      .int()
      .min(5)
      .max(30)
      .default(20)
      .describe(
        "How many recent completed auctions (with a reported rate and bid-to-cover) to plot.",
      ),
  }),
});

export const treasuryAuctionSizeBarsMeta = defineFrameMeta({
  name: "treasury-auction-size-bars",
  // Stays in USD whatever the board asks for: US-macro: Treasury auction sizes as offered.
  usdOnly: true,
  label: "Treasury Auction Size",
  category: "macro",
  iconUrl: widgetIcon("treasury-auction-size-bars"),
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Recent completed U.S. Treasury auctions as paired bars — the offering amount beside the amount actually accepted, per auction, oldest to newest. Shows at a glance how close each auction came to being fully subscribed. Keyless (U.S. Treasury).",
  capabilities: ["treasury-auctions"],
  source: SOURCES.treasury,
  schema: z.object({
    count: z
      .number()
      .int()
      .min(3)
      .max(20)
      .default(8)
      .describe(
        "How many recent completed auctions to chart (oldest to newest).",
      ),
  }),
});

export const nyfedReferenceRateBarsMeta = defineFrameMeta({
  name: "nyfed-reference-rate-bars",
  // Stays in USD whatever the board asks for: US-macro: official NY Fed rates, published in USD.
  usdOnly: true,
  label: "NY Fed Rate Bars",
  category: "macro",
  iconUrl: widgetIcon("nyfed-reference-rate-bars"),
  layout: { w: 4, h: 3, minW: 3, minH: 2 },
  description:
    "The six official New York Fed reference rates (effective fed funds, SOFR, tri-party and broad general collateral repo, overnight bank funding, and SOFR averages) as a horizontal bar chart — level or reported volume. The chart-first sibling of the Rates Board's NY Fed section. Keyless (NY Fed).",
  capabilities: ["reference-rates"],
  source: SOURCES.nyFed,
  schema: z.object({
    metric: z
      .enum(["rate", "volume"])
      .default("rate")
      .describe(
        '"rate" charts each reference rate\'s level (%); "volume" charts its reported trading volume in USD (SOFR averages report no volume and are skipped in this mode).',
      ),
    limit: z
      .number()
      .int()
      .min(2)
      .max(6)
      .default(6)
      .describe("How many of the six official reference rates to chart."),
  }),
});

export const nyfedSofrTermAveragesBarsMeta = defineFrameMeta({
  name: "nyfed-sofr-term-averages-bars",
  label: "SOFR Term Averages",
  category: "macro",
  iconUrl: widgetIcon("nyfed-sofr-term-averages-bars"),
  layout: { w: 3, h: 3, minW: 2, minH: 1 },
  description:
    "SOFR compounded average rates over the trailing 30, 90, and 180 days as a simple bar comparison — a quick read on where short-term secured funding costs have been trending. Keyless (NY Fed).",
  capabilities: ["reference-rates"],
  source: SOURCES.nyFed,
  schema: z.object({}),
});

export const nyfedFedFundsBandGaugeMeta = defineFrameMeta({
  name: "nyfed-fed-funds-band-gauge",
  label: "Fed Funds Band Gauge",
  category: "macro",
  iconUrl: widgetIcon("nyfed-fed-funds-band-gauge"),
  layout: { w: 3, h: 3, minW: 2, minH: 2, maxW: 4 },
  description:
    "The effective fed funds rate as a radial gauge inside the FOMC's current target band — the arc fills from the band's lower bound to its upper bound, with the live EFFR reading in the center. Makes it visible at a glance whether the effective rate is trading near the top, bottom, or middle of the target range. Keyless (NY Fed).",
  capabilities: ["reference-rates"],
  source: SOURCES.nyFed,
  schema: z.object({}),
});

export const treasuryDebtCompositionAreaMeta = defineFrameMeta({
  name: "treasury-debt-composition-area",
  // Stays in USD whatever the board asks for: US-macro: the Treasury debt split as published.
  usdOnly: true,
  label: "Debt Composition",
  category: "macro",
  iconUrl: widgetIcon("treasury-debt-composition-area"),
  layout: { w: 6, h: 4, minW: 2, minH: 1 },
  description:
    "U.S. total public debt outstanding split into debt held by the public vs. intragovernmental holdings, as a stacked area chart over time — the two components that sum to the National Debt card's headline total. Keyless (U.S. Treasury).",
  capabilities: ["national-debt"],
  source: SOURCES.treasury,
  schema: z.object({
    trendDays: z
      .number()
      .int()
      .min(30)
      .max(365)
      .default(180)
      .describe(
        "How many business days of history to load for the stacked area.",
      ),
  }),
});

export const ofrStressCategoryAreaMeta = defineFrameMeta({
  name: "ofr-stress-category-area",
  label: "FSI by Category",
  category: "macro",
  iconUrl: widgetIcon("ofr-stress-category-area"),
  layout: { w: 6, h: 5, minW: 2, minH: 1 },
  description:
    "The OFR Financial Stress Index decomposed into its five contributing categories (credit, equity valuation, safe assets, funding, volatility) as a stacked area chart over time — each category can be positive or negative and they sum to the overall index shown on the Financial Stress card. Keyless (OFR).",
  capabilities: ["financial-stress"],
  source: SOURCES.ofr,
  schema: z.object({
    trendDays: z
      .number()
      .int()
      .min(20)
      .max(90)
      .default(60)
      .describe("How many recent daily readings to plot in the stacked area."),
  }),
});

export const miseryIndexMeta = defineFrameMeta({
  name: "misery-index",
  label: "Misery Index",
  category: "macro",
  iconUrl: widgetIcon("misery-index"),
  layout: { w: 6, h: 4, minW: 2, minH: 1 },
  description:
    "The classic 'Misery Index' — CPI year-over-year inflation stacked with the unemployment rate — as a two-series stacked area chart, month-aligned, plus the combined headline score. Monthly macro context for stock dashboards, not a live feed. Keyless (BLS).",
  capabilities: ["macro-series"],
  source: SOURCES.bls,
  schema: z.object({
    months: z
      .number()
      .int()
      .min(13)
      .max(36)
      .default(18)
      .describe("How many recent monthly observations to chart."),
  }),
});

export const realWagesMeta = defineFrameMeta({
  name: "real-wages",
  annotatable: true,
  label: "Real Wages",
  category: "macro",
  iconUrl: widgetIcon("real-wages"),
  layout: { w: 6, h: 3, minW: 1, minH: 1 },
  description:
    "Are paychecks outrunning inflation? A two-line chart comparing year-over-year average hourly earnings growth against year-over-year CPI inflation — when earnings run above CPI, real (inflation-adjusted) pay is rising. Monthly macro context, not a live feed. Keyless (BLS).",
  capabilities: ["macro-series"],
  source: SOURCES.bls,
  schema: z.object({
    months: z
      .number()
      .int()
      .min(13)
      .max(36)
      .default(18)
      .describe(
        "How many recent monthly year-over-year observations to chart.",
      ),
  }),
});

export const laborForceFlowMeta = defineFrameMeta({
  name: "labor-force-flow",
  annotatable: true,
  label: "Labor Force Flow",
  category: "macro",
  iconUrl: widgetIcon("labor-force-flow"),
  layout: { w: 6, h: 3, minW: 3, minH: 3 },
  description:
    "The unemployment rate and the labor-force participation rate plotted together over time — a rising unemployment rate alongside a falling participation rate points to people leaving the workforce rather than finding jobs. Monthly macro context, not a live feed. Keyless (BLS).",
  capabilities: ["macro-series"],
  source: SOURCES.bls,
  schema: z.object({
    months: z
      .number()
      .int()
      .min(13)
      .max(36)
      .default(18)
      .describe("How many recent monthly observations to chart."),
  }),
});

export const payrollsBarsMeta = defineFrameMeta({
  name: "payrolls-bars",
  label: "Payrolls Bars",
  category: "macro",
  iconUrl: widgetIcon("payrolls-bars"),
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Monthly nonfarm payrolls net change as a diverging bar chart — jobs added up in green, jobs cut down in red. The chart-first sibling of the Labor Market frame's headline figure. Monthly macro data, not a live feed. Keyless (BLS).",
  capabilities: ["macro-series"],
  source: SOURCES.bls,
  schema: z.object({
    months: z
      .number()
      .int()
      .min(6)
      .max(36)
      .default(18)
      .describe("How many recent months of net payroll change to chart."),
  }),
});

export const fxCrossHeatmapMeta = defineFrameMeta({
  name: "fx-cross-heatmap",
  label: "FX Cross Heatmap",
  category: "macro",
  iconUrl: widgetIcon("fx-cross-heatmap"),
  layout: { w: 6, h: 4, minW: 4, minH: 2 },
  description:
    "A full currency × currency cross-rate matrix as a heatmap — each cell is the day-over-day % change of that specific cross, derived from every listed currency's rate vs a common pivot, green up / red down. Spots which cross is moving hardest across an entire currency set, not just one pair at a time. Keyless (Frankfurter/ECB).",
  capabilities: ["fx-rates"],
  source: SOURCES.frankfurter,
  schema: z.object({
    symbols: z
      .array(z.string().length(3))
      .min(3)
      .max(8)
      .default(["USD", "EUR", "GBP", "JPY", "CHF", "CAD"])
      .describe(
        'Currencies (ISO 4217 codes) forming both axes of the matrix, e.g. ["USD","EUR","GBP","JPY"]. At least 3, so the grid shows more than one cross.',
      ),
  }),
});

export const fxTrendChartMeta = defineFrameMeta({
  name: "fx-trend-chart",
  annotatable: true,
  label: "FX Trend Chart",
  category: "macro",
  iconUrl: widgetIcon("fx-trend-chart"),
  layout: { w: 6, h: 3, minW: 5, minH: 2 },
  description:
    "Several currencies' recent trend vs a base, each indexed to 0% at the start of the window so wildly different-magnitude pairs (JPY vs CHF) compare cleanly on one chart. The multi-line sibling of the FX Board. Keyless (Frankfurter/ECB).",
  capabilities: ["fx-rates"],
  source: SOURCES.frankfurter,
  schema: z.object({
    base: z
      .string()
      .length(3)
      .default("USD")
      .describe(
        'Base currency (ISO 4217 code) each line is quoted against, e.g. "USD".',
      ),
    symbols: z
      .array(z.string().length(3))
      .min(1)
      .max(8)
      .default(["EUR", "GBP", "JPY", "CHF"])
      .describe(
        'Currencies to chart (ISO 4217 codes), e.g. ["EUR","GBP","JPY"]. A code equal to the base is skipped.',
      ),
  }),
});

export const dxyChartMeta = defineFrameMeta({
  name: "dxy-chart",
  annotatable: true,
  label: "Dollar Index Chart",
  category: "macro",
  iconUrl: widgetIcon("dxy-chart"),
  layout: { w: 6, h: 3, minW: 4, minH: 2 },
  description:
    "US Dollar Index (DXY) as a line chart over time — the dollar's trend vs a basket of six major currencies, tinted green/red by its own direction. The chart-first sibling of the Dollar Index card. Keyless (Frankfurter/ECB).",
  capabilities: ["dollar-index"],
  source: SOURCES.frankfurter,
  schema: z.object({}),
});

export const fxMoversBarsMeta = defineFrameMeta({
  name: "fx-movers-bars",
  label: "FX Movers Bars",
  category: "macro",
  iconUrl: widgetIcon("fx-movers-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
  description:
    "A currency set's day-over-day % change vs a base as a diverging bar chart — strengthening currencies right in green, weakening left in red, ranked by move. The chart-first sibling of the FX Board. Keyless (Frankfurter/ECB).",
  capabilities: ["fx-rates"],
  source: SOURCES.frankfurter,
  schema: z.object({
    base: z
      .string()
      .length(3)
      .default("USD")
      .describe(
        'Base currency (ISO 4217 code) each bar is quoted against, e.g. "USD".',
      ),
    symbols: z
      .array(z.string().length(3))
      .min(1)
      .max(12)
      .default(["EUR", "GBP", "JPY", "CHF", "CAD", "AUD"])
      .describe(
        'Currencies to chart (ISO 4217 codes), e.g. ["EUR","GBP","JPY"]. A code equal to the base is skipped.',
      ),
  }),
});

export const creditSpreadChartMeta = defineFrameMeta({
  name: "credit-spread-chart",
  annotatable: true,
  label: "Credit Spread Chart",
  category: "macro",
  iconUrl: widgetIcon("credit-spread-chart"),
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "US corporate credit spreads — the ICE BofA high-yield and investment-grade option-adjusted spreads over Treasuries, charted together in percentage points. The market's own price of default risk and one of the cleanest risk-on/risk-off reads there is: spreads widen before equities notice. Keyless (FRED).",
  capabilities: ["credit-spread"],
  source: SOURCES.fred,
  schema: z.object({
    grades: z
      .array(z.enum(["high-yield", "investment-grade"]))
      .min(1)
      .max(2)
      .default(["high-yield", "investment-grade"])
      .describe(
        "Which grades to plot. Both together shows the quality gap; high-yield alone is the sharper stress signal.",
      ),
    years: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(3)
      .describe(
        "How many years of spread history to chart. FRED carries roughly the last three years of these licensed series.",
      ),
  }),
});

export const homePriceIndexMeta = defineFrameMeta({
  name: "home-price-index",
  annotatable: true,
  label: "Home Price Index",
  category: "macro",
  iconUrl: widgetIcon("home-price-index"),
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "The Case-Shiller US National Home Price Index — the benchmark measure of American house prices, monthly back to 1987, indexed to January 2000 = 100. Shows the latest print, the year-over-year change, and the full history including the 2006 peak and the 2012 trough. Keyless (FRED).",
  capabilities: ["housing-price"],
  source: SOURCES.fred,
  schema: z.object({
    years: z
      .number()
      .int()
      .min(1)
      .max(40)
      .default(25)
      .describe(
        "How many years of index history to chart. 25 covers both the housing bubble and its aftermath.",
      ),
    showYoY: z
      .boolean()
      .default(true)
      .describe(
        "Show the year-over-year percent change alongside the index level — the number that says whether prices are still rising.",
      ),
  }),
});

export const mortgageRateChartMeta = defineFrameMeta({
  name: "mortgage-rate-chart",
  annotatable: true,
  label: "Mortgage Rate Chart",
  category: "macro",
  iconUrl: widgetIcon("mortgage-rate-chart"),
  layout: { w: 6, h: 3, minW: 3, minH: 3 },
  description:
    "The US 30-year fixed mortgage rate — the Freddie Mac weekly benchmark, back to 1971 — charted with its latest print and week-over-week move in basis points. The rate that actually sets housing affordability, and a cleaner read on long-end policy transmission than the 10-year yield. Keyless (FRED).",
  capabilities: ["mortgage-rate"],
  source: SOURCES.fred,
  schema: z.object({
    years: z
      .number()
      .int()
      .min(1)
      .max(55)
      .default(10)
      .describe(
        "How many years of weekly rates to chart. 55 reaches the 1981 peak above 18%.",
      ),
  }),
});

export const regionalHomePricesMeta = defineFrameMeta({
  name: "regional-home-prices",
  annotatable: true,
  label: "Regional Home Prices",
  category: "macro",
  iconUrl: widgetIcon("regional-home-prices"),
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "The FHFA House Price Index per state or metro, quarterly back to 1975 — several regions charted together so divergence is visible, which a single national index averages away. The regulator's own repeat-sales index; keyless (FHFA).",
  capabilities: ["regional-housing-price"],
  source: SOURCES.fhfa,
  schema: z.object({
    level: z
      .enum(["state", "metro"])
      .default("state")
      .describe(
        "Which published granularity to read. state = the 50 states + DC (a small, fast file); metro = ~410 metro areas (a much larger download, so prefer state unless a specific metro is the point).",
      ),
    regions: z
      .array(z.string().min(2))
      .min(1)
      .max(6)
      .default(["CA", "TX", "FL", "NY"])
      .describe(
        `Regions to chart, matched to the level. At state level use two-letter codes: ${US_STATES.join(
          ", ",
        )}. At metro level use FHFA's own metro name, which is a full CBSA title — a leading fragment is enough and is matched case-insensitively, so "Austin" resolves to "Austin-Round Rock-San Marcos, TX". A region that matches nothing is skipped rather than failing the card.`,
      ),
    years: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(20)
      .describe("How many years of quarterly index history to chart."),
    rebase: z
      .boolean()
      .default(true)
      .describe(
        "Rebase every region to 0% at the start of the window so the lines are directly comparable as cumulative appreciation. Off plots the published index levels, which are NOT comparable across regions — FHFA rebases each series to 100 at its own start date.",
      ),
  }),
});

export const metroHomeValuesMeta = defineFrameMeta({
  name: "metro-home-values",
  label: "Metro Home Values",
  category: "macro",
  iconUrl: widgetIcon("metro-home-values"),
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
  description:
    "What a typical home actually costs, metro by metro — the Zillow Home Value Index in dollars (not index points), each row with its latest value and year-over-year change, ranked. The one house-price source on the board denominated in money, so it answers 'what would a house cost me there' rather than 'how much have prices risen'. Keyless (Zillow), monthly.",
  capabilities: ["home-value-index"],
  source: SOURCES.zillow,
  schema: z.object({
    regions: z
      .array(z.enum(ZHVI_REGIONS))
      .min(1)
      .max(24)
      .default([
        "United States",
        "New York, NY",
        "Los Angeles, CA",
        "San Francisco, CA",
        "Austin, TX",
        "Miami, FL",
        "Chicago, IL",
        "Phoenix, AZ",
      ])
      .describe(
        'Metros to list, using Zillow\'s own region names. "United States" is the national row.',
      ),
    sortBy: z
      .enum(["value", "change", "size"])
      .default("value")
      .describe(
        "value = most expensive first; change = fastest year-over-year appreciation first; size = Zillow's population size rank, which keeps the national row on top.",
      ),
  }),
});

export const homeValueChartMeta = defineFrameMeta({
  name: "home-value-chart",
  annotatable: true,
  label: "Home Value Chart",
  category: "macro",
  iconUrl: widgetIcon("home-value-chart"),
  layout: { w: 6, h: 4, minW: 4, minH: 3 },
  description:
    "Typical home value over time for one or more metros — the Zillow Home Value Index charted in dollars, monthly back to 2000. The chart-first sibling of Metro Home Values: use it to see the 2006 peak, the 2012 bottom and the post-2020 run in actual money rather than index points. Keyless (Zillow).",
  capabilities: ["home-value-index"],
  source: SOURCES.zillow,
  schema: z.object({
    regions: z
      .array(z.enum(ZHVI_REGIONS))
      .min(1)
      .max(4)
      .default(["United States", "Austin, TX"])
      .describe(
        'Metros to chart, using Zillow\'s own region names. "United States" is the national row.',
      ),
    years: z
      .number()
      .int()
      .min(1)
      .max(26)
      .default(15)
      .describe(
        "How many years of monthly values to chart. The series starts in 2000, so 26 is everything.",
      ),
  }),
});

export const creditQualityGapMeta = defineFrameMeta({
  name: "credit-quality-gap",
  annotatable: true,
  label: "Credit Quality Gap",
  category: "macro",
  iconUrl: widgetIcon("credit-quality-gap"),
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "The high-yield minus investment-grade spread — what the market charges for junk over quality, in percentage points. A single line that isolates credit RISK APPETITE from the level of rates: both spreads move together when Treasuries move, so the gap between them is the cleaner read, and it widens before equities notice. Shows where today sits in the charted window's range. Keyless (FRED).",
  capabilities: ["credit-spread"],
  source: SOURCES.fred,
  schema: z.object({
    years: z
      .number()
      .int()
      .min(1)
      .max(30)
      .default(3)
      .describe(
        "How many years of the gap to chart. FRED carries roughly the last three years of these licensed series.",
      ),
  }),
});

export const mortgagePaymentMeta = defineFrameMeta({
  name: "mortgage-payment",
  label: "Mortgage Payment",
  category: "macro",
  iconUrl: widgetIcon("mortgage-payment"),
  layout: { w: 4, h: 4, minW: 3, minH: 3 },
  description:
    "What buying a typical home in one metro actually costs per month — the Zillow home value and the live 30-year fixed rate combined into a principal-and-interest payment, with the loan size and rate shown. This is the affordability question neither source answers alone: the index says prices rose, the rate says borrowing got dearer, and only the payment says whether a buyer can pay. Keyless (Zillow + FRED).",
  capabilities: ["home-value-index", "mortgage-rate"],
  source: SOURCES.zillow,
  schema: z.object({
    region: z
      .enum(ZHVI_REGIONS)
      .default("United States")
      .describe(
        "Which metro's typical home value to price, using Zillow's own region names. \"United States\" is the national row.",
      ),
    downPaymentPct: z
      .number()
      .min(0)
      .max(90)
      .default(20)
      .describe(
        "Down payment as a percent of the home value; the rest is financed. 20% is the conventional benchmark.",
      ),
    termYears: z
      .number()
      .int()
      .min(5)
      .max(40)
      .default(30)
      .describe(
        "Loan term in years. The rate charted is the 30-year benchmark, so a shorter term here prices that rate over a shorter schedule rather than switching to a 15-year quote.",
      ),
  }),
});

export const homeValueBarsMeta = defineFrameMeta({
  name: "home-value-bars",
  label: "Home Value Bars",
  category: "macro",
  iconUrl: widgetIcon("home-value-bars"),
  layout: { w: 4, h: 4, minW: 4, minH: 2 },
  description:
    "Typical home value per metro as ranked horizontal bars — the price gap between coastal and inland America at a glance, in dollars rather than index points. The bar-chart sibling of Metro Home Values. Keyless (Zillow), monthly.",
  capabilities: ["home-value-index"],
  source: SOURCES.zillow,
  schema: z.object({
    regions: z
      .array(z.enum(ZHVI_REGIONS))
      .min(1)
      .max(24)
      .default([
        "San Francisco, CA",
        "Los Angeles, CA",
        "New York, NY",
        "Seattle, WA",
        "Boston, MA",
        "Denver, CO",
        "Austin, TX",
        "Miami, FL",
        "Phoenix, AZ",
        "Chicago, IL",
        "United States",
      ])
      .describe(
        'Metros to rank, using Zillow\'s own region names. "United States" is the national row and makes a useful baseline bar.',
      ),
  }),
});

export const homeValueMomentumMeta = defineFrameMeta({
  name: "home-value-momentum",
  label: "Home Value Momentum",
  category: "macro",
  iconUrl: widgetIcon("home-value-momentum"),
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
  description:
    "Year-over-year change in typical home value per metro as diverging bars — which housing markets are still appreciating and which have turned, ranked by move. The level tells you what a house costs; this tells you which direction the market is going. Keyless (Zillow), monthly.",
  capabilities: ["home-value-index"],
  source: SOURCES.zillow,
  schema: z.object({
    regions: z
      .array(z.enum(ZHVI_REGIONS))
      .min(2)
      .max(24)
      .default([
        "United States",
        "New York, NY",
        "Chicago, IL",
        "Boston, MA",
        "Miami, FL",
        "Austin, TX",
        "Phoenix, AZ",
        "San Francisco, CA",
        "Seattle, WA",
        "Denver, CO",
        "Tampa, FL",
        "Las Vegas, NV",
      ])
      .describe(
        "Metros to compare, using Zillow's own region names. A metro with under a year of published history is skipped, since it has no year-over-year change.",
      ),
  }),
});

export const homeValueScatterMeta = defineFrameMeta({
  name: "home-value-scatter",
  label: "Home Value Scatter",
  category: "macro",
  iconUrl: widgetIcon("home-value-scatter"),
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "Every metro plotted by what a home costs (y) against how fast that price is changing (x) — the four quadrants separate expensive-and-cooling from cheap-and-heating, which neither a ranked list nor a single chart shows. Keyless (Zillow), monthly.",
  capabilities: ["home-value-index"],
  source: SOURCES.zillow,
  schema: z.object({
    regions: z
      .array(z.enum(ZHVI_REGIONS))
      .min(3)
      .max(24)
      .default([
        "New York, NY",
        "Los Angeles, CA",
        "Chicago, IL",
        "Dallas, TX",
        "Houston, TX",
        "Washington, DC",
        "Philadelphia, PA",
        "Miami, FL",
        "Atlanta, GA",
        "Boston, MA",
        "Phoenix, AZ",
        "San Francisco, CA",
        "Detroit, MI",
        "Seattle, WA",
        "Denver, CO",
        "Austin, TX",
        "Tampa, FL",
        "Nashville, TN",
      ])
      .describe(
        "Metros to plot, using Zillow's own region names. More metros make the quadrant pattern clearer; only the largest bubbles are labelled.",
      ),
  }),
});

export const regionalHomePriceBarsMeta = defineFrameMeta({
  name: "regional-home-price-bars",
  label: "Regional Home Price Bars",
  category: "macro",
  iconUrl: widgetIcon("regional-home-price-bars"),
  layout: { w: 4, h: 4, minW: 3, minH: 2 },
  description:
    "Year-over-year change in the FHFA House Price Index per state or metro, as diverging bars ranked by move — the regulator's repeat-sales index showing which regional housing markets are rising and which are falling. The bar-chart sibling of Regional Home Prices; quarterly, keyless (FHFA).",
  capabilities: ["regional-housing-price"],
  source: SOURCES.fhfa,
  schema: z.object({
    level: z
      .enum(["state", "metro"])
      .default("state")
      .describe(
        "Which published granularity to read. state = the 50 states + DC (a small, fast file); metro = ~410 metro areas (a much larger download).",
      ),
    regions: z
      .array(z.string().min(2))
      .min(2)
      .max(16)
      .default([
        "CA",
        "TX",
        "FL",
        "NY",
        "WA",
        "AZ",
        "CO",
        "IL",
        "MA",
        "GA",
        "NC",
        "OH",
      ])
      .describe(
        `Regions to compare, matched to the level. At state level use two-letter codes: ${US_STATES.join(
          ", ",
        )}. At metro level use a leading fragment of FHFA's CBSA title (case-insensitive), e.g. "Austin". A region that matches nothing is skipped rather than failing the card.`,
      ),
  }),
});
