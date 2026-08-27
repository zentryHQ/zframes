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
  interpretation: `Interest rates are the price of borrowing money. This board lists the short-term rates the U.S. financial system actually runs on: SOFR and the effective fed funds rate are what banks pay to borrow overnight, and the Treasury rows show the average rate the U.S. government pays on its own debt, by type of security.

Each row is a name and a percentage. The New York Fed rates hug the Federal Reserve's policy target, so they mostly move only when the Fed moves; the Treasury averages drift more slowly as old debt is refinanced.

Rising rates mean money is getting more expensive — a headwind for stocks, housing and crypto; falling rates mean easier borrowing. These are official prints updated once per business day, not a live feed.`,
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
  interpretation: `An exchange rate says how much of another currency one unit of the base buys — at 0.92, one dollar buys 0.92 euros. Each row here is one currency against the base, with its latest daily reference rate, its day-over-day change, and a small trend sparkline.

A rising number means the base currency is strengthening against that currency (one unit buys more of it); a falling number means it is weakening. This can feel backwards at first: on a USD-based board, the EUR row rising means a stronger dollar, not a stronger euro.

These are the ECB's once-a-day reference rates — good for direction and comparison, not the to-the-second price a currency trader would use.`,
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
  interpretation: `CPI, the Consumer Price Index, tracks what a fixed basket of everyday goods and services costs. It is the standard measure of U.S. inflation: when CPI rises, the same money buys less.

The card shows the latest index level with two changes — month-over-month (the recent pace) and year-over-year (the headline inflation rate people quote) — plus a sparkline of the index trend.

A year-over-year reading near 2% is what the Federal Reserve targets; well above it pressures the Fed to keep rates high. One common misreading: a falling inflation rate still means prices are rising, just more slowly — only a negative reading means prices actually fell. Data updates once a month.`,
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
  interpretation: `The OFR Financial Stress Index condenses many market signals — credit conditions, equity valuations, demand for safe assets, funding markets and volatility — into one daily number measuring how strained the financial system is.

Zero is the long-run average. A positive reading means stress is elevated versus history; negative means calmer than normal. The trend line shows the recent path, and the optional breakdown shows which of the five categories is contributing most.

Big spikes coincide with crises (2008, March 2020), while long negative stretches mark easy, complacent conditions. The absolute level matters less than direction: a fast rise from any starting point is the warning sign.`,
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
  interpretation: `This is the total amount the U.S. federal government owes — every outstanding Treasury bill, note and bond added up, in dollars (measured in trillions), from the Treasury's own daily ledger.

The card shows the headline total, how much it changed over the chosen window, and a trend line. The optional split separates debt held by the public (investors, funds, foreign governments) from intragovernmental holdings (money one part of the government owes another, like the Social Security trust fund).

The total almost always rises; what varies is the pace. Faster growth means heavier borrowing, which feeds Treasury auction sizes and, eventually, interest costs. The figure stays in U.S. dollars regardless of the board's display currency — nobody quotes this number any other way.`,
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
  interpretation: `Two headline gauges of U.S. jobs: the unemployment rate (the share of people looking for work who have not found it) and nonfarm payrolls (the net number of jobs the economy added or lost last month).

The card shows the latest unemployment rate, the monthly payrolls change, the total payroll level, and a trend line of the unemployment rate.

Low unemployment with steady job gains signals a healthy economy, and a rising unemployment rate is one of the most reliable recession markers. Counterintuitively, markets sometimes fall on strong jobs data — a hot labor market can keep the Federal Reserve holding rates high. Updates once a month on the jobs-report schedule.`,
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
  interpretation: `The U.S. government borrows by auctioning Treasury securities — short-term bills, medium notes, long bonds. Each row here is one completed auction: what was sold, the high yield awarded (the interest rate buyers demanded), and the bid-to-cover ratio.

Bid-to-cover is total bids divided by the amount actually sold — a gauge of demand. Around 2.5 is routine; well above 3 means strong appetite; near or below 2 marks a weak auction.

Rising awarded yields paired with falling bid-to-cover suggest investors want more compensation to fund the government — a sign the market is struggling to digest supply. Rows are newest first and update as auctions settle.`,
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
  interpretation: `The yield curve plots the interest rate the U.S. government pays to borrow at each maturity, from 1 month out to 30 years — one line, short maturities on the left, long on the right.

Normally the line slopes upward: lenders demand more to lock their money up longer. The headline 2s10s spread is the 10-year yield minus the 2-year; when it is negative the curve is inverted, meaning short-term rates sit above long-term ones.

An inversion is the classic recession warning, but the common misreading is timing: recessions have historically followed inversions by a year or more, and often begin as the curve steepens back to normal — the inversion itself is not the crash moment. Updates each business day.`,
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
  interpretation: `The Dollar Index (DXY) compresses the dollar's value against six major currencies — euro, yen, pound, Canadian dollar, Swedish krona and Swiss franc — into one number. Levels near 100 are the historical middle ground, but the direction matters more than the level.

A rising reading means the dollar is strengthening against the basket; a falling one means it is weakening.

A strengthening dollar tightens global financial conditions and acts as a headwind for risk assets — commodities, emerging markets and crypto tend to struggle — while a weakening dollar acts as a tailwind. This version is computed from daily ECB reference rates, so it moves once per business day, not tick by tick.`,
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
  interpretation: `The U.S. Treasury pays different average interest rates on different kinds of debt — short bills, longer notes and bonds, savings bonds, non-marketable securities. Each bar is one security class's current average rate: longer bar, higher rate, ranked highest-first.

Because these are averages over ALL debt outstanding in a class — old cheap debt mixed with newly issued expensive debt — they lag current market yields. When market rates rise, the averages climb only gradually as maturing debt is refinanced at today's levels.

A steady upward drift across the bars means the government's overall interest bill is growing, and it keeps growing for years even after policy rates stop moving.`,
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
  // Stays in USD whatever the board asks for: US-macro: Treasury auction sizes
  // as offered (the bubble weight, named in the hover tooltip) — the same
  // figure, and the same reason, as treasury-auction-size-bars.
  usdOnly: true,
  label: "Treasury Auction Demand",
  category: "macro",
  iconUrl: widgetIcon("treasury-auction-demand-scatter"),
  layout: { w: 6, h: 4, minW: 4, minH: 2 },
  description:
    "Recent completed U.S. Treasury auctions as a bubble scatter — awarded rate on the x-axis, bid-to-cover ratio (demand) on the y-axis, one dot per auction labelled by term. Reveals whether richer (lower-yield) auctions also draw stronger demand. Keyless (U.S. Treasury).",
  interpretation: `Each dot is one completed U.S. Treasury auction, placed by the interest rate it awarded (horizontal — further right means buyers demanded a higher yield) against its bid-to-cover ratio (vertical — total bids divided by amount sold, so higher means stronger demand). Dots are labelled by the security's term.

The pattern is the point: dots trending toward the lower right — higher yields paired with weaker demand — suggest investors want more compensation to fund the government. Dots sitting high regardless of yield mean appetite is comfortable.

One reading trap: bills, notes and bonds naturally cluster at different bid-to-cover levels (short bills usually run higher), so compare dots of the same term against each other rather than across the whole cloud.`,
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
  interpretation: `Each completed Treasury auction shows two bars side by side: how much debt the government offered for sale, and how much it actually accepted, in dollars, oldest to newest.

When the pair is nearly equal, the auction was fully subscribed — buyers took everything offered. A visible gap between the bars means demand fell short of the offering.

Growing bar heights over time show the government's borrowing needs rising — the flow that adds to the national debt total. Amounts are shown in U.S. dollars as offered, and the chart updates as auctions settle rather than in real time.`,
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
  interpretation: `These are the official overnight interest rates the U.S. money market runs on, published daily by the New York Fed: the effective fed funds rate (bank-to-bank lending), SOFR (lending secured by Treasuries), repo rates, and SOFR averages. Each bar is one rate's level in percent — or, in volume mode, how many dollars of trading stood behind it.

The bars normally sit tightly bunched inside the Federal Reserve's target range; that closeness is monetary policy actually reaching the market.

A rate drifting away from its siblings — especially a repo or SOFR bar spiking above the pack — signals funding stress: someone is paying up for overnight cash. That is rare, and it is exactly what this chart exists to make visible.`,
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
  interpretation: `SOFR is the overnight interest rate on lending secured by U.S. Treasuries — the benchmark that replaced LIBOR for pricing loans and derivatives. These three bars are its compounded averages over the trailing 30, 90 and 180 days.

Because each bar looks further back in time, comparing them reveals direction: when the 30-day bar sits above the 180-day, short-term funding costs have been rising recently; when it sits below, they have been falling.

The averages are backward-looking by construction, so they respond to a Fed policy change only gradually — the 30-day bar moves first, the 180-day last. Three nearly equal bars mean rates have been stable for months.`,
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
  interpretation: `The Federal Reserve sets a target range for the fed funds rate — say 4.25% to 4.50% — rather than a single number. The effective fed funds rate (EFFR) is where banks actually lend to each other overnight, and this gauge shows where that market rate sits inside the target band.

The arc spans the band from its lower bound to its upper bound; the filled portion and the center figure are the latest EFFR reading.

Normally the rate sits placidly inside the band — that is monetary policy working as designed. A reading pressing against the top of the band hints at funding pressure, and one drifting past either edge would mean the Fed's control tools need adjusting — rare, and notable when it happens. Daily official data.`,
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
  interpretation: `The U.S. national debt has two parts, stacked here as colored bands over time: debt held by the public (Treasuries owned by investors, funds and foreign governments) and intragovernmental holdings (money one arm of the government owes another, such as the Social Security trust fund).

The two bands sum to the total debt — the full height of the stack — so the chart shows both the overall trajectory and which component is doing the growing.

Debt held by the public is the economically meaningful part: it competes for investors' money and influences market interest rates, while the intragovernmental slice is internal bookkeeping. Amounts are in U.S. dollars, published each business day.`,
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
  interpretation: `The OFR Financial Stress Index is one daily number summarizing strain in the financial system; this chart splits it into its five ingredients — credit, equity valuation, safe assets, funding, and volatility — stacked over time.

Each colored band is one category's contribution. Unusually for a stacked chart, a band can sit below the zero line, meaning that category is calmer than its long-run average; the bands sum to the overall index, where zero marks average conditions.

The breakdown shows where stress comes from, not just how much there is: a rise driven by the funding and credit bands is more systemic — closer to the financial plumbing — than one driven by equity volatility alone.`,
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
  interpretation: `The Misery Index is a deliberately blunt gauge from the 1970s: the inflation rate plus the unemployment rate — the two things that most directly make households worse off, simply added together.

The chart stacks CPI year-over-year inflation and the unemployment rate as two colored bands; the top of the stack is the combined score, shown as the headline number.

Historically, readings under about 7 mark comfortable times, while high-inflation or deep-recession periods push above 15. The stack also reveals the flavor of the misery: the late-1970s peaks were inflation-driven, 2009's was unemployment-driven. Monthly data on the BLS release schedule.`,
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
  interpretation: `This chart asks one question: are paychecks growing faster than prices? It plots two lines — year-over-year growth in average hourly earnings, and year-over-year CPI inflation — on the same percentage axis.

When the earnings line runs above the CPI line, real (inflation-adjusted) pay is rising: workers are gaining purchasing power. When CPI sits on top, wages are rising in name but buying less — as happened through much of 2021-22.

The gap between the lines matters more than either level, and a small persistent gap compounds into a large change in living standards over a few years. The wage figure is an economy-wide average, which can hide very different experiences across industries. Monthly data.`,
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
  interpretation: `Two lines about who is working: the unemployment rate (the share of active job-seekers who have not found work) and the labor-force participation rate (the share of the adult population either working or looking for work).

The pairing catches what the unemployment rate alone hides: people who stop looking for work drop out of the unemployed count entirely, which can make the headline rate look better while the job market worsens.

- Unemployment falling with participation steady or rising: genuine labor-market strength.
- Unemployment rising while participation falls: people leaving the workforce — the weakest combination.

The two rates live at different levels, so read each line's direction rather than comparing their heights. Monthly data.`,
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
  interpretation: `Nonfarm payrolls is the monthly count of net jobs the U.S. economy added or lost — one of the most watched economic releases. Each bar is one month: green bars extend upward for jobs added, red bars extend downward for jobs cut.

Bar height is the size of the swing. A run of solid green bars around 150-250 thousand marks a healthy expansion; shrinking green bars show cooling; red bars are contraction territory.

Two cautions built into the data: single months are noisy and often revised heavily after first release, so the trend across several bars is more trustworthy than any one of them — and a weak print can still lift markets if it eases pressure on the Federal Reserve to keep rates high.`,
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
  interpretation: `A grid of every pairing within a currency set: the cell at row A, column B shows the day-over-day percent change of that specific cross-rate — how much currency A moved against currency B since the previous day.

Green cells mean the row currency strengthened against the column currency; red means it weakened; deeper color marks a bigger move. Every cell has a mirror twin across the diagonal with the opposite sign.

Reading along a mostly-green row shows a currency strengthening against everything at once — genuine strength, not just a weak counterpart. That distinction is the point of a matrix: a single pair rising cannot tell you which side actually moved. Daily reference rates, not intraday.`,
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
  interpretation: `Several currencies charted against one base over the recent window — but instead of raw exchange rates (where yen trades near 150 and pounds near 0.8, impossible to share one axis), every line starts at 0% and shows cumulative change since the window began.

A line above zero means that currency has strengthened against the base since the start of the window; below zero means it has weakened. Steeper is faster.

When the lines move together, the base currency itself is usually doing the moving — every cross falls when the dollar rallies. Lines diverging isolate genuinely currency-specific news. The starting point is arbitrary, so the picture is relative change, not absolute levels. Daily ECB reference data.`,
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
  interpretation: `The Dollar Index (DXY) tracks the dollar against a basket of six major currencies — one line for the dollar overall rather than one pair at a time. This chart shows its recent path, tinted green when the index is up over the window and red when down.

Rising means the dollar is strengthening against the basket; falling means weakening. The basket is euro-heavy (roughly 58%), so DXY largely mirrors the euro inverted — worth remembering when reading dollar-strength headlines.

A sustained climb tightens global financial conditions and weighs on commodities, emerging markets and crypto; a sustained decline eases them. Computed from daily reference rates, so the line gains one point per business day.`,
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
  interpretation: `Each bar is one currency's day-over-day percent change against the base, ranked by size of move: currencies that strengthened extend right in green, ones that weakened extend left in red.

Bar length is the size of the move. Major currencies typically shift a fraction of a percent per day, so a bar past 1% marks a genuinely large move worth investigating.

If almost every bar points the same way, the story is usually the base itself — all green against the dollar typically means the dollar weakened, not that every other currency had good news at once. Daily reference rates, so the picture refreshes once per business day.`,
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
  interpretation: `A credit spread is the extra yield investors demand for lending to companies instead of the U.S. government — compensation for default risk, measured in percentage points over Treasuries. The chart plots two lines: high-yield (riskier, junk-rated) bonds and investment-grade (safer) bonds.

Higher lines mean lenders are more worried about being repaid. High-yield always sits above investment-grade; the meaningful movement is widening (rising — fear building) versus tightening (falling — confidence returning).

Spreads are among the earliest risk signals in markets — they often start widening before stock indexes react. High-yield near 3 points is complacent territory; past 5 is strain; 2008 touched 20. The axis is percentage points of extra yield, not a price.`,
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
  interpretation: `The Case-Shiller index is the benchmark measure of U.S. house prices, built from repeat sales of the same homes. It is an index, not a price: January 2000 is set to 100, so a reading of 320 means prices are 3.2 times their 2000 level. The number is not dollars — only its changes are meaningful, which is the misreading to avoid.

The card shows the latest print, the year-over-year change, and the long history — including the mid-2000s bubble peak and the 2012 trough.

The year-over-year figure is the practical headline: positive means prices are still climbing; negative means an actual national decline, historically rare outside the 2007-2011 bust. The index lags reality by about two months and smooths over three, so turning points show up late.`,
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
  interpretation: `The 30-year fixed mortgage rate is the interest rate on the standard U.S. home loan — the Freddie Mac weekly survey benchmark, going back to 1971. The chart shows the rate over time, with the latest print and the week's move in basis points (one basis point = 0.01%).

This single line effectively sets housing affordability: at the same house price, a move from 3% to 7% roughly doubles the monthly interest cost of a new loan.

It tracks the 10-year Treasury yield plus a spread, so it reflects long-term rate expectations rather than the Fed's overnight rate directly — mortgage rates can fall while the Fed holds steady, and vice versa. The 1981 peak above 18% marks one historical extreme; the sub-3% prints of 2020-21 the other.`,
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
  interpretation: `House prices do not move as one national market — this chart plots the FHFA House Price Index for several states or metros together, quarterly back to 1975, so regional divergence shows up instead of being averaged away.

By default every line is rebased to 0% at the start of the window, so each line reads as cumulative appreciation since then and the lines are directly comparable — the steepest line is the fastest-appreciating market.

The misreading to avoid: with rebasing off, the chart plots FHFA's raw index levels, and those are NOT comparable across regions — each region's series is set to 100 at its own start date, so a higher line does not mean more expensive housing. The index tracks price change, never dollar prices.`,
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
  interpretation: `Each row is a metro area with the Zillow Home Value Index — the value of a typical home there, in actual dollars — plus its year-over-year change, ranked by the chosen sort.

Unlike house-price indexes (which track change relative to a base year in unit-less points), this is denominated in money, so rows are directly comparable: the card answers "what would a home cost there", not "how much have prices risen".

"Typical" means the middle band of the market — roughly the 35th to 65th percentile of homes — so luxury and distressed segments can behave differently. A positive change means the metro is still appreciating; a negative one means values fell over the past year. Monthly data.`,
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
  interpretation: `The value of a typical home over time, in dollars, for one or more metros — the Zillow Home Value Index charted monthly back to 2000.

Because the vertical axis is money rather than index points, the lines carry more than direction: the gap between two metros is an actual price difference, and a line's level is a real answer to "what does a home cost there".

The full window shows the shape of two decades of American housing — the mid-2000s bubble, the 2012 bottom, and the steep post-2020 run. "Typical" means the middle band of each market (roughly the 35th to 65th percentile), smoothed, so the line understates how jumpy individual sales are. Monthly updates.`,
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
  interpretation: `One line: the high-yield credit spread minus the investment-grade credit spread — the extra yield the market charges its riskiest corporate borrowers over its safest, in percentage points.

Subtracting the two isolates pure risk appetite. Both spreads rise and fall together when Treasury yields move, so the gap between them changes only when investors change how much they care about credit quality.

A widening gap means fear — money demanding much more compensation to hold the riskiest credit — and it tends to move before stock indexes react. A narrow, grinding gap marks complacency and easy credit conditions. The card also marks where today's reading sits within the charted window's range.`,
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
  interpretation: `This card turns two data feeds into one practical number: the monthly principal-and-interest payment on a typical home in the chosen metro, combining Zillow's home value (in dollars) with the live 30-year fixed mortgage rate, under the configured down payment and loan term.

The loan size and the rate used are shown alongside the headline payment, so the ingredients are visible.

Neither ingredient alone answers affordability — prices can fall while payments rise if rates climb faster, which is exactly what happened in 2022-23. Two caveats: the figure excludes property tax, insurance and fees, so the real monthly cost is higher; and the rate is the national 30-year benchmark, not a personalized quote.`,
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
  interpretation: `Each horizontal bar is a metro's typical home value in dollars — longer bar, more expensive market — ranked most expensive first. The Zillow index is denominated in money, so bar lengths are actual price differences, not index points.

The spread is the point of the chart: coastal metros can run three to four times the price of inland ones, a gap a single national average completely hides. Including the United States row gives a baseline bar to measure each metro against.

"Typical" means the middle band of each market — roughly the 35th to 65th percentile of homes. Values update monthly.`,
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
  interpretation: `Each bar is a metro's year-over-year change in typical home value: appreciating markets extend one way in green, declining ones the other way in red, ranked by the size of the move.

This is the direction chart, deliberately separated from the price level: an expensive market can be cooling while a cheap one heats up, and this view shows only which way each market is moving and how fast.

Housing momentum moves slowly — a metro flipping from green to red is a meaningful regime change, not day-to-day noise. Nationwide declines are rare outside genuine busts; scattered red bars usually mark local corrections after fast run-ups. Monthly Zillow data.`,
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
  interpretation: `Every metro is one bubble, placed by what a typical home costs there (vertical, in dollars) against how fast that value is changing year-over-year (horizontal, in percent).

The four quadrants are the point: top-right is expensive and still rising, top-left expensive but cooling, bottom-right affordable and heating up, bottom-left cheap and falling. A ranked list or a single time chart cannot show this combination.

Watch for migration across the plot over time: expensive metros drifting left (losing momentum) have historically led national turns, while a crowded bottom-right marks money rotating into affordable markets. Only the largest bubbles are labelled to keep the plot readable. Monthly Zillow data.`,
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
  interpretation: `Each bar is a state's or metro's year-over-year change in the FHFA House Price Index — rising regional markets extend one way in green, falling ones the other way in red, ranked by the size of the move.

FHFA is the U.S. housing regulator's own repeat-sales index, built from mortgages it oversees. It measures price CHANGE, not price level — a long bar means fast movement, not an expensive market, which is the misreading to avoid.

The spread across the bars is the story: housing rarely moves as one country, and a mix of green and red marks a rotating market where some regions correct while others still climb. Quarterly data, so it updates slowly and turns appear with a lag.`,
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
