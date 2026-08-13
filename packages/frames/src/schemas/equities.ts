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
  interpretation: `US public companies must report to the SEC on standard forms, and this card lists one company's most recent submissions exactly as filed. It is a paper trail, not a price feed — nothing here says whether the stock went up.

Each row is one filing: the form code, a plain-English label, and the date, newest at the top. The codes carry the meaning — a 10-K is the annual report, a 10-Q a quarterly one, an 8-K discloses a material event between reports, and Forms 3/4/5 record insiders buying or selling their own stock.

A quiet feed of routine 10-Qs and proxies is normal. A cluster of 8-Ks can mean real news (a deal, an executive change, a restatement), and a burst of Form 4s shows insiders trading — though many insider sales are pre-scheduled and signal little on their own.`,
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
  interpretation: `The headline numbers a company reported in its own SEC filings — revenue (total sales), net income (profit after everything), total assets, shareholders' equity (assets minus liabilities), diluted EPS (profit per share), and shares outstanding. These are the figures as filed, in US dollars, not estimates.

Each value is labelled with its fiscal period. Income figures cover the latest full fiscal year; balance-sheet figures are a snapshot at the latest quarter — so the two groups describe different dates on purpose.

Rising revenue with rising net income is a growing, profitable business; revenue up while income falls means costs are growing faster than sales. A common misreading: fiscal years are not calendar years — many companies end their year in June or January, so "FY2025" may mostly describe 2024.`,
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
  interpretation: `For each stock in the list, the share of one day's reported trading volume that was sold short — sales of borrowed shares. FINRA publishes the file the next business day, so the card describes yesterday, not right now.

Each row shows the short percentage with a proportional bar, plus the raw short and total share counts behind it. Longer bar = a larger fraction of that day's selling was short sales.

Readings of 40–60% are ordinary for US stocks, largely because market makers hedge by shorting; a value far above a stock's own usual range is more informative than the level itself. The classic misreading: short volume is one day's flow, not short interest — it does not tell you how large the outstanding short position is, and a high number alone is not a bearish (or squeeze) signal.`,
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
  interpretation: `The same FINRA data as the Short Volume list, drawn as a ranking: for each stock, the share of one day's reported trading volume that was short sales (sales of borrowed shares), published the next business day.

Horizontal bars run highest-first, so the stock where short selling made up the biggest slice of the day's volume sits on top. Bar length encodes the percentage of volume, not the number of shares — a small stock can out-rank a giant.

Values of 40–60% are routine, inflated by market makers hedging with short sales; what matters is a name sitting far above its own norm. The common misreading: this is one day's short-sale flow, not short interest — it says nothing about how many shorts are still open, and rank alone is not a bearish signal.`,
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
  interpretation: `A picture of how one company is financed, from its own SEC filings: total assets (everything it owns), shareholders' equity (the part owners would keep after debts), and liabilities, computed here as assets minus equity. Figures are as reported, in US dollars, at the latest filing date.

Three horizontal bars share one scale, so their relative lengths are the whole story: assets is always the longest, and the equity and liabilities bars show how that total splits between owners and creditors.

Equity near the size of assets means a lightly leveraged company; liabilities dwarfing equity means most of the balance sheet is borrowed or owed — normal for banks, more notable elsewhere. Note the liabilities bar is derived, not a filed line item, and the data only moves when the company files a new report.`,
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
  interpretation: `One company's recent SEC filings sorted into three buckets and drawn as a donut: periodic and material reports (annual/quarterly reports, 8-K event disclosures, registrations, proxies), insider ownership forms (insiders reporting their own trades), and everything else.

Each donut slice is a share of the recent filing count — bigger slice means more of that kind of paperwork, not more important paperwork. The mix describes behaviour, not performance.

A mix dominated by periodic reports is a company on routine cadence. A large insider-forms slice means executives and directors have been trading their own stock — worth a look at the Filings Feed for direction, since the donut counts forms without saying whether they were buys or sells. Filing volume is also not news volume: one 10-K can matter more than a dozen routine forms.`,
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
  interpretation: `A one-glance identity card: who the company is (name, exchange, sector, industry), what the stock last traded at with its daily change, and how big it is (market capitalisation — share price times shares outstanding).

The 52-week range bar shows the past year's low and high with a marker where today's price sits between them: near the right edge means trading close to its yearly high, near the left edge close to its low. Average volume gives a sense of how actively the stock trades, and the dividend line appears only when the company pays one.

Position in the 52-week range is context, not a verdict — near the high can mean momentum or an expensive entry, near the low can mean a bargain or a business in decline. Market cap, not share price, is the measure of size: a $900 stock can belong to a smaller company than a $40 one.`,
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
  interpretation: `Valuation multiples answer "what am I paying per dollar of the business" — P/E divides the company's market value by its annual earnings, P/S by its sales, P/B by its book value (net assets). Each ratio on the card shows the inputs it was computed from, so nothing is a black box.

Higher multiples mean the market pays more per dollar of earnings or sales — usually because it expects growth; lower multiples read as cheap, or as low expectations. What counts as high is relative to the industry: software habitually trades at multiples that would be alarming for a bank.

Two cautions built into this card. The ratios are derived here from the latest annual statements, so they are trailing and can lag a fresh quarter — never forward-looking. And a missing multiple usually means negative earnings or book value, where the ratio would be meaningless, not that data failed to load.`,
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
  interpretation: `One reported line from a company's SEC filings — revenue, net income, total assets, shareholders' equity, or diluted EPS — traced across every year (or quarter) the company has filed, exactly as reported, in US dollars.

Time runs left to right; the line's height is the reported figure for each period. The shape is the point: steady climb, plateau, or the dip-and-recover of a bad stretch reads instantly in a way a single latest number cannot.

A rising revenue line with a flat net-income line means growth without profit leverage; a falling assets line can be deliberate slimming rather than distress. Two cautions: quarterly series carry seasonality (retailers spike every fourth quarter — compare a quarter to the same quarter last year, not the one before), and fiscal years need not match calendar years, so points may sit months from where intuition puts them.`,
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
  interpretation: `A margin is profit per dollar of sales, as a percentage. Gross margin is what's left after the direct cost of the product; operating margin also subtracts running the business (salaries, R&D, marketing); net margin is what survives everything, including tax and interest.

Each margin is a line across the last four reported fiscal years, so the slope is the message: rising lines mean each dollar of sales is becoming more profitable (expansion), falling lines mean compression. The gap between gross and operating shows how heavy the company's overhead is.

Typical levels differ wildly by industry — grocers live on low-single-digit net margins while software can clear 30% — so compare a company to its own history and its peers, not to an absolute bar. A revenue line can grow while margins shrink; this chart exists to catch exactly that.`,
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
  interpretation: `Three cash figures per fiscal year, in absolute dollars: operating cash flow (cash the business actually generated), capital expenditure (cash spent on equipment, buildings, infrastructure), and free cash flow — operating minus capex, the cash genuinely left over.

Each year is a group of bars, so two comparisons read at once: across years (is cash generation growing?) and within a year (how much of the operating cash does capex consume?). A bar below zero means cash flowed out.

Reported profit involves accounting judgment; cash largely does not — which is why a company can post rising net income while free cash flow stagnates, and that divergence is worth noticing. The reverse misreading matters too: heavy capex that crushes free cash flow can be aggressive investment in growth rather than weakness — the chart shows the split, not the verdict.`,
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
  interpretation: `Before each quarter, analysts publish a consensus estimate of the company's earnings per share; this card compares what was actually reported against that estimate, quarter by quarter. Reported above consensus is a beat, below is a miss.

Each quarter shows the estimate and the actual as paired bars with the surprise percentage — how far above or below the consensus the report landed — and the average beat across the window sums up the pattern. Newest quarter is on the right.

A steady string of small beats and one giant blowout are different animals: the first suggests conservative guidance and reliable execution, the second a one-off. The common misreading is treating a beat as bullish by itself — the stock often falls on a beat if expectations ran even higher, and estimates themselves drift toward the company's own guidance.`,
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
  interpretation: `A countdown to one company's next scheduled earnings report — the day, quarterly, when it publishes results and the market reprices the stock, often sharply. The big number is days remaining; below it, the confirmed date and whether the report lands before the market opens or after it closes.

Last quarter's result is shown for context: what the company reported against what analysts expected, a rough gauge of how these events have gone lately.

A near-zero countdown flags event risk — options get pricier and moves get larger around report dates. Two cautions: "before open" and "after close" matter (an after-close report moves the next morning's open, not today's session), and a date read from the exchange calendar can still shift — an unconfirmed date is shown as unknown rather than guessed.`,
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
  interpretation: `Every company scheduled to report earnings on one trading session, ranked by market capitalisation so the names big enough to move the whole market sit on top. Each row shows the ticker and company, whether the report lands before the open or after the close, and the consensus EPS forecast with how many analyst estimates stand behind it.

Timing is the practical detail: a before-open report moves that day's session, an after-close report moves the next morning's. A forecast backed by twenty estimates is a firmer consensus than one backed by two.

A session crowded with heavyweights is a volatility day for indexes, not just the reporting names. The forecast column is expectations, not results — the market's reaction depends on the gap between the two, so a listed EPS number says nothing about which way the stock will move.`,
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
  interpretation: `What professional stock analysts collectively think of one company: the headline consensus rating (Buy / Hold / Sell), the number of analysts behind it, and their average one-year price target set against the live price — with the implied upside or downside that gap represents.

A target above the current price reads as expected upside, below as expected downside; the analyst count is a quality signal, since a consensus of three opinions is far flimsier than one of thirty.

This card is sentiment, not fact. Consensus targets are averages of forecasts and are routinely wrong; ratings also skew optimistic — "Sell" is rare on Wall Street, so "Hold" often functions as the polite bearish call. A big implied upside can equally mean analysts are behind: after a sharp fall, targets lag until they are revised down.`,
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
  interpretation: `How much of one company is owned by institutions — funds, pensions, asset managers — from their quarterly 13F disclosures to the SEC. The headline is the percent of shares outstanding in institutional hands and the dollar value of those holdings.

The increased-versus-decreased split shows which way the professionals leaned last quarter: how many filers grew their position against how many trimmed, with the share counts behind each side. More increasers than decreasers reads as accumulation; the reverse as distribution.

High institutional ownership (large caps often sit above 70%) signals professional conviction but also crowding — when many funds exit at once, the move is violent. The built-in caution: 13Fs are filed up to 45 days after each quarter ends, so this picture is always at least a quarter old and may not reflect what institutions hold today.`,
  capabilities: ["institutional-ownership"],
  source: SOURCES.nasdaq,
  schema: z.object({
    symbol: companySymbolField(),
  }),
});
