import { defineFrameMeta } from "@zframes/spec/frame";
import { z } from "zod";
import { widgetIcon, SOURCES, companySymbolField } from "./shared";

export const filingsFeedMeta = defineFrameMeta({
  name: "filings-feed",
  label: "Filings Feed",
  category: "equities",
  iconUrl: widgetIcon("filings-feed"),
  layout: { w: 5, h: 4, minW: 3, minH: 3, maxH: 7 },
  description:
    "Recent SEC EDGAR filings for one US-listed company — each row shows the form type (10-K, 10-Q, 8-K, Form 4…), a plain-English label, the filing date, and a click-through to the document on sec.gov, under a header with the company name, exchange, and filer category. Official data from SEC's free, CORS-safe submissions endpoint; event-driven (updates when the company files), not a price feed. Resolve by ticker (a bundled snapshot of the ~500 largest US issuers) or by raw SEC CIK for anything else.",
  capabilities: ["filings"],
  source: SOURCES.secEdgar,
  schema: z.object({
    symbol: z
      .string()
      .min(1)
      .describe(
        'Company to show filings for — a ticker ("AAPL", "NVDA"), a HIP-3 symbol ("xyz:TSLA"), or a raw SEC CIK ("320193"). Tickers outside the bundled top-500 map need a CIK.',
      ),
    forms: z
      .enum(["important", "all", "insider"])
      .default("important")
      .describe(
        'Which filings to surface: "important" = periodic & material reports (10-K, 10-Q, 8-K, S-1, proxies, 13D/G…); "insider" = ownership forms (3/4/5/144); "all" = unfiltered. Always newest first.',
      ),
    count: z
      .number()
      .int()
      .min(3)
      .max(25)
      .default(8)
      .describe("How many filings to list (newest first)."),
  }),
});

export const fundamentalsMeta = defineFrameMeta({
  name: "fundamentals",
  // Stays in USD whatever the board asks for: SEC filing figures, shown as reported.
  usdOnly: true,
  label: "Fundamentals",
  category: "equities",
  iconUrl: widgetIcon("fundamentals"),
  layout: { w: 4, h: 4, minW: 3, minH: 3, maxH: 5 },
  description:
    "Headline financials for one US-listed company from SEC EDGAR XBRL company facts — revenue, net income, total assets, shareholders' equity, diluted EPS, and shares outstanding, each labelled with its fiscal period. Income-statement figures are the latest full fiscal year; balance-sheet figures are the latest reported quarter. Keyless official data that updates only when the company files (annual/quarterly), not a live feed. Requires the zframes runtime's data proxy (it ships with `zframes serve` / `vite dev`); resolve by ticker (bundled top-500 map) or raw SEC CIK.",
  capabilities: ["fundamentals"],
  source: SOURCES.secEdgar,
  schema: z.object({
    symbol: z
      .string()
      .min(1)
      .describe(
        'Company to show financials for — a ticker ("AAPL", "NVDA"), a HIP-3 symbol ("xyz:NVDA"), or a raw SEC CIK ("320193"). Tickers outside the bundled top-500 map need a CIK.',
      ),
  }),
});

export const shortVolumeMeta = defineFrameMeta({
  name: "short-volume",
  label: "Short Volume",
  category: "equities",
  iconUrl: widgetIcon("short-volume"),
  layout: { w: 5, h: 4, minW: 2, minH: 2, maxH: 4 },
  description:
    "Daily reported short-sale volume for a watchlist of US-listed stocks, from FINRA's free consolidated file — each row shows the % of the day's reported volume that was sold short, with a bar and the raw short/total share counts. IMPORTANT: this is reported short volume (sell-side short flow, which includes market-maker hedging), NOT short interest (outstanding short positions), and is not a directional signal on its own. Daily data published the next business day; not a live feed. US equities only.",
  capabilities: ["short-volume"],
  source: SOURCES.finra,
  schema: z.object({
    symbols: z
      .array(z.string())
      .min(1)
      .max(12)
      .describe(
        'US-listed stock tickers to show, e.g. ["TSLA","NVDA","AAPL"]. HIP-3 symbols ("xyz:TSLA") work too — the dex prefix is stripped. Crypto has no SEC/FINRA short-volume and is ignored.',
      ),
    sort: z
      .enum(["shortPct", "volume", "symbol"])
      .default("shortPct")
      .describe(
        "Order rows by short % of volume (highest first), by total volume (highest first), or alphabetically by symbol.",
      ),
  }),
});

export const shortVolumeBarsMeta = defineFrameMeta({
  name: "short-volume-bars",
  label: "Short Volume Bars",
  category: "equities",
  iconUrl: widgetIcon("short-volume-bars"),
  layout: { w: 4, h: 4, minW: 4, minH: 2 },
  description:
    "Daily reported short-sale volume for a watchlist of US-listed stocks, ranked highest-first as a horizontal bar chart — the chart-first sibling of the Short Volume list. IMPORTANT: this is reported short volume (sell-side short flow, including market-maker hedging), NOT short interest, and is not a directional signal on its own. Daily data published the next business day; not a live feed. US equities only. (FINRA).",
  capabilities: ["short-volume"],
  source: SOURCES.finra,
  schema: z.object({
    symbols: z
      .array(z.string())
      .min(1)
      .max(12)
      .describe(
        'US-listed stock tickers to rank, e.g. ["TSLA","NVDA","AAPL"]. HIP-3 symbols ("xyz:TSLA") work too — the dex prefix is stripped. Crypto has no SEC/FINRA short-volume and is ignored.',
      ),
  }),
});

export const capitalStructureBarsMeta = defineFrameMeta({
  name: "capital-structure-bars",
  // Stays in USD whatever the board asks for: SEC filing figures, shown as reported.
  usdOnly: true,
  label: "Capital Structure Bars",
  category: "equities",
  iconUrl: widgetIcon("capital-structure-bars"),
  layout: { w: 4, h: 3, minW: 2, minH: 1 },
  description:
    "One company's balance-sheet shape as a horizontal bar chart — total assets, shareholders' equity, and liabilities (derived as assets minus equity) — from SEC EDGAR XBRL company facts. Updates only when the company files (annual/quarterly), not a live feed. Requires the zframes runtime's data proxy (ships with `zframes serve` / `vite dev`); resolve by ticker (bundled top-500 map) or raw SEC CIK. (SEC EDGAR).",
  capabilities: ["fundamentals"],
  source: SOURCES.secEdgar,
  schema: z.object({
    symbol: z
      .string()
      .min(1)
      .describe(
        'Company to chart — a ticker ("AAPL", "NVDA"), a HIP-3 symbol ("xyz:NVDA"), or a raw SEC CIK ("320193"). Tickers outside the bundled top-500 map need a CIK.',
      ),
  }),
});

export const filingsMixMeta = defineFrameMeta({
  name: "filings-mix",
  label: "Filings Mix",
  category: "equities",
  iconUrl: widgetIcon("filings-mix"),
  layout: { w: 4, h: 4, minW: 2, minH: 2, maxW: 6 },
  description:
    "What kind of paper is one company actually filing? A donut of recent SEC EDGAR filings bucketed into periodic & material reports (10-K, 10-Q, 8-K, registrations, proxies, activist stakes…), insider ownership forms (3/4/5/144), and everything else — the chart-first sibling of the Filings Feed. Official data from SEC's free, CORS-safe submissions endpoint; event-driven, not a price feed. Resolve by ticker (bundled top-500 map) or raw SEC CIK. (SEC EDGAR).",
  capabilities: ["filings"],
  source: SOURCES.secEdgar,
  schema: z.object({
    symbol: z
      .string()
      .min(1)
      .describe(
        'Company to show filing mix for — a ticker ("AAPL", "NVDA"), a HIP-3 symbol ("xyz:TSLA"), or a raw SEC CIK ("320193"). Tickers outside the bundled top-500 map need a CIK.',
      ),
  }),
});

// The company-research half of a stocks-first board: what the business is
// worth, what it reported, what the street thinks, and what the options market
// is pricing. Everything here is keyless but proxy-bound, so these cards
// degrade to an empty state on a static host with no runtime — same as the
// SEC/Treasury families.
export const companyProfileMeta = defineFrameMeta({
  name: "company-profile",
  label: "Company Profile",
  category: "equities",
  iconUrl: widgetIcon("company-profile"),
  layout: { w: 4, h: 3, minW: 2, minH: 2 },
  description:
    "Identity card for one US-listed company — name, exchange, sector and industry, the last sale with its change, market capitalisation, the 52-week range with a marker showing where price sits inside it, average volume, and the dividend and yield when the company pays one. The header a company deep-dive board opens with. Keyless exchange data through the zframes runtime proxy; empty on a static host.",
  capabilities: ["equity-profile"],
  source: SOURCES.nasdaq,
  schema: z.object({
    symbol: companySymbolField(),
  }),
});

export const valuationMultiplesMeta = defineFrameMeta({
  name: "valuation-multiples",
  label: "Valuation Multiples",
  category: "equities",
  iconUrl: widgetIcon("valuation-multiples"),
  layout: { w: 4, h: 3, minW: 4, minH: 3 },
  description:
    "What the market is paying for one company's earnings, sales and book value — market cap, trailing P/E, P/S, P/B, and the dividend yield, each with the inputs it was computed from. IMPORTANT: no keyless source publishes these ratios, so they are DERIVED here — market cap and price from the exchange, earnings/sales/equity from the latest published annual statements — which means a ratio can lag a fresh quarter and is trailing, never forward. A multiple whose inputs are missing or non-positive is shown as unavailable rather than as a misleading number.",
  capabilities: ["equity-profile", "equity-financials"],
  source: SOURCES.nasdaq,
  schema: z.object({
    symbol: companySymbolField(),
  }),
});

export const financialsTrendMeta = defineFrameMeta({
  name: "financials-trend",
  // Stays in USD whatever the board asks for: figures as filed with the SEC.
  usdOnly: true,
  label: "Financials Trend",
  category: "equities",
  annotatable: true,
  iconUrl: widgetIcon("financials-trend"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "One company's reported financial history as a multi-year line — pick revenue, net income, total assets or shareholders' equity and see the whole series as filed, not just the latest print. Built from SEC EDGAR XBRL company facts, stitched across the XBRL tag changes issuers make mid-history (a single-tag series would simply stop the year the company re-tagged the line). Annual or quarterly cadence. Updates only on filings. Requires the zframes runtime proxy.",
  capabilities: ["fundamentals-history"],
  source: SOURCES.secEdgar,
  schema: z.object({
    symbol: companySymbolField(),
    metric: z
      .enum(["revenue", "netIncome", "assets", "equity", "eps"])
      .default("revenue")
      .describe(
        "Which reported line to chart: revenue, net income, total assets, shareholders' equity, or diluted EPS.",
      ),
    cadence: z
      .enum(["annual", "quarterly"])
      .default("annual")
      .describe(
        "Reporting cadence to chart. Annual is the readable long trend; quarterly shows seasonality but is noisier.",
      ),
  }),
});

export const marginTrendMeta = defineFrameMeta({
  name: "margin-trend",
  label: "Margin Trend",
  category: "equities",
  annotatable: true,
  iconUrl: widgetIcon("margin-trend"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "How profitable one company is per dollar of sales, across the last four reported fiscal years — gross, operating and net margin as published percentage lines, so margin expansion or compression reads at a glance. The single most telling chart on whether a growth story is also a business. Published exchange figures; updates only when the company reports.",
  capabilities: ["equity-financials"],
  source: SOURCES.nasdaq,
  schema: z.object({
    symbol: companySymbolField(),
    margins: z
      .array(z.enum(["gross", "operating", "preTax", "net"]))
      .min(1)
      .max(4)
      .default(["gross", "operating", "net"])
      .describe("Which margin lines to draw."),
  }),
});

export const cashflowTrendMeta = defineFrameMeta({
  name: "cashflow-trend",
  usdOnly: true,
  label: "Cash Flow Trend",
  category: "equities",
  // Deliberately NOT annotatable: this draws grouped bars, not a time axis, so
  // an event flag would have nowhere honest to land.
  iconUrl: widgetIcon("cashflow-trend"),
  layout: { w: 5, h: 4, minW: 3, minH: 2 },
  description:
    "Where one company's cash actually goes, by fiscal year — operating cash flow, capital expenditure, and free cash flow (operating minus capex) as grouped bars. Cash flow is the line hardest to dress up, so it is the honest counterweight to a rising reported profit. Published exchange figures, in absolute dollars; updates only when the company reports.",
  capabilities: ["equity-financials"],
  source: SOURCES.nasdaq,
  schema: z.object({
    symbol: companySymbolField(),
  }),
});

export const earningsSurpriseMeta = defineFrameMeta({
  name: "earnings-surprise",
  usdOnly: true,
  label: "Earnings Surprise",
  category: "equities",
  iconUrl: widgetIcon("earnings-surprise"),
  layout: { w: 5, h: 4, minW: 4, minH: 2 },
  description:
    "Whether one company beats its own guidance — reported EPS against the consensus estimate for each of the last several quarters, as paired bars with the surprise percentage, plus the average beat across the window. A consistent beat rate is a different signal from a single blowout quarter, and this shows which one you are looking at. Keyless exchange data; updates quarterly.",
  capabilities: ["earnings-history"],
  source: SOURCES.nasdaq,
  schema: z.object({
    symbol: companySymbolField(),
    count: z
      .number()
      .int()
      .min(2)
      .max(12)
      .default(6)
      .describe("How many past quarters to show (newest last)."),
  }),
});

export const earningsCountdownMeta = defineFrameMeta({
  name: "earnings-countdown",
  // Stays in USD: an EPS is a per-share figure as the company reported it, the
  // same class as the SEC filing frames — a baht-converted EPS is a number
  // nobody quotes.
  usdOnly: true,
  label: "Earnings Countdown",
  category: "equities",
  iconUrl: widgetIcon("earnings-countdown"),
  layout: { w: 3, h: 2, minW: 3, minH: 2, maxW: 4, maxH: 2 },
  description:
    "Days until one company's next scheduled earnings report, with the date, whether it lands before the open or after the close, and the last quarter's result for context. The date comes from the exchange's published calendar — when no date is confirmed yet the card says so rather than guessing one from the filing cadence.",
  capabilities: ["earnings-history"],
  source: SOURCES.nasdaq,
  schema: z.object({
    symbol: companySymbolField(),
  }),
});

export const earningsCalendarMeta = defineFrameMeta({
  name: "earnings-calendar",
  // Stays in USD: consensus EPS is quoted as published, and the market caps
  // here only rank the session's names rather than being spendable figures.
  usdOnly: true,
  label: "Earnings Calendar",
  category: "equities",
  iconUrl: widgetIcon("earnings-calendar"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Which companies report on a given session — ticker, name, before-open or after-close, the consensus EPS forecast and how many estimates back it, ranked by market cap so the session's heavyweights are on top. Market-wide, not tied to one company: the card that tells you whether tomorrow is a quiet day or a minefield. Keyless exchange calendar.",
  capabilities: ["earnings-calendar"],
  source: SOURCES.nasdaq,
  schema: z.object({
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Session to list, ISO "YYYY-MM-DD". Omit for the next trading session. A date with no scheduled reports shows an empty state, not an error.',
      ),
    count: z
      .number()
      .int()
      .min(3)
      .max(25)
      .default(10)
      .describe("How many companies to list (largest market cap first)."),
  }),
});

export const analystRatingsMeta = defineFrameMeta({
  name: "analyst-ratings",
  label: "Analyst Ratings",
  category: "equities",
  iconUrl: widgetIcon("analyst-ratings"),
  layout: { w: 4, h: 3, minW: 3, minH: 3 },
  description:
    "What sell-side coverage says about one company — the headline consensus (Buy / Hold / Sell), how many analysts contribute to it, the consensus one-year price target against the live price with the implied upside or downside, and the covering brokers. Sentiment, not fact: a consensus target is an average of opinions and is routinely wrong. Keyless exchange data.",
  capabilities: ["analyst-ratings"],
  source: SOURCES.nasdaq,
  schema: z.object({
    symbol: companySymbolField(),
    showBrokers: z
      .boolean()
      .default(true)
      .describe("List the covering broker names under the consensus."),
  }),
});

export const institutionalOwnershipMeta = defineFrameMeta({
  name: "institutional-ownership",
  usdOnly: true,
  label: "Institutional Ownership",
  category: "equities",
  iconUrl: widgetIcon("institutional-ownership"),
  layout: { w: 4, h: 3, minW: 3, minH: 2, maxH: 4 },
  description:
    "How much of one company the institutions hold, and which way they moved last quarter — percent of shares outstanding in institutional hands, the total value of those holdings, and the split between holders that increased versus decreased their position, with the share counts behind each. Aggregated 13F data, so it is a quarter behind by construction. Keyless exchange data.",
  capabilities: ["institutional-ownership"],
  source: SOURCES.nasdaq,
  schema: z.object({
    symbol: companySymbolField(),
  }),
});
