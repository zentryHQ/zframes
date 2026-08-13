import { defineFrameMeta } from "@zframes/spec/frame";
import { z } from "zod";
import { widgetIcon, SOURCES, companySymbolField } from "./shared";

export const fundingRateChartMeta = defineFrameMeta({
  name: "funding-rate-chart",
  annotatable: true,
  label: "Funding Rate Chart",
  category: "derivatives",
  iconUrl: widgetIcon("funding-rate-chart"),
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Multi-series line chart comparing hourly perp funding rates across symbols over a configurable lookback window. Positive funding = longs pay shorts. Useful for spotting crowded trades.",
  interpretation: `Perpetual futures never expire, so exchanges keep their price glued to the real market with funding: a small payment that flows between traders every hour. When funding is positive, people betting on the price rising (longs) pay the people betting on it falling (shorts); negative flips it.

Each line is one symbol's hourly funding rate over the chosen window. A line above zero means longs are paying to hold; below zero, shorts pay. The higher the line, the more expensive that side of the trade is to keep open.

Persistently high positive funding usually signals a crowded bullish trade — lots of leveraged longs willing to pay to stay in — which can unwind sharply. Funding near zero means positioning is balanced. The rates are hourly and look tiny (hundredths of a percent), but they compound: a steady 0.01% per hour is roughly 90% a year.`,
  capabilities: ["funding-history"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbols: z
      .array(z.string())
      .min(1)
      .max(6)
      .describe(
        'Hyperliquid symbols to compare funding for, e.g. ["xyz:TSLA", "xyz:NVDA"]. Up to 6.',
      ),
    lookback: z
      .enum(["24h", "7D", "1M"])
      .default("7D")
      .describe("History window for the funding chart."),
  }),
});

export const fundingCalendarMeta = defineFrameMeta({
  name: "funding-calendar",
  label: "Funding Calendar",
  category: "derivatives",
  iconUrl: widgetIcon("funding-calendar"),
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "Each day's total perp funding as a calendar heatmap — one square per day, green where longs paid shorts and red where shorts paid longs, so a carry position's income reads as a pattern instead of a squiggle. Surfaces what the funding line chart hides: whether the carry is a steady drip or a few violent days, and how long the flips last. Intensity is ranked within the window, so one funding spike can't wash out every ordinary day. Keyless (Hyperliquid), summed from the hourly prints.",
  interpretation: `Funding is the periodic payment perpetual-futures traders exchange to keep the perp's price near the real market: positive funding means longs (bets on up) pay shorts (bets on down). This card sums each day's hourly funding prints into one square per calendar day.

Green squares are days longs paid shorts; red squares are days shorts paid longs. Deeper shading means a larger daily total — but intensity is ranked within the window, so one extreme day doesn't wash every ordinary day to pale.

A mostly-green grid means holding a long has been a steady cost (and a short a steady income); scattered red patches show funding flips. The pattern is the point: a smooth drip of pale squares is very different carry from a few violent dark days, even when the totals match.`,
  capabilities: ["funding-history"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbol: z
      .string()
      .default("BTC")
      .describe(
        "Symbol to chart funding for, e.g. 'BTC', 'ETH', or a HIP-3 equity 'xyz:TSLA'.",
      ),
    lookback: z
      .enum(["1M", "3M", "6M"])
      .default("3M")
      .describe("How much history the grid covers."),
    weekStart: z
      .enum(["sunday", "monday"])
      .default("monday")
      .describe("Which weekday is the top row."),
  }),
});

export const fundingDistributionMeta = defineFrameMeta({
  name: "funding-distribution",
  label: "Funding Histogram",
  category: "derivatives",
  iconUrl: widgetIcon("funding-distribution"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Histogram of every hourly funding print over the window — how often longs pay versus get paid, and how extreme it gets. The question a funding line chart can't answer: a carry trade is priced off the whole distribution, not the current rate. Reports the share of hours funding was positive and the annualised carry implied by the mean, plus markers at the mean and the latest print. Keyless (Hyperliquid).",
  interpretation: `Funding is the hourly payment between perpetual-futures traders that keeps the perp priced near the real market — positive prints mean longs (up bets) paid shorts. This histogram buckets every hourly print over the window, showing the whole range of what funding has done, not just the latest number.

Taller bars mean funding spent more hours at that rate. Markers flag the mean and the latest print, and the card reports the share of hours funding was positive plus the annualised carry the mean implies.

A distribution sitting mostly right of zero means longs have persistently paid to hold. A wide, fat-tailed distribution means funding is volatile and the current rate says little. The common misreading is pricing a carry trade off the latest print alone — the whole distribution is what a position actually pays over time.`,
  capabilities: ["funding-history"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbol: z
      .string()
      .default("BTC")
      .describe(
        "Symbol to analyse funding for, e.g. 'BTC', 'ETH', or a HIP-3 equity 'xyz:TSLA'.",
      ),
    lookback: z
      .enum(["7D", "1M", "3M"])
      .default("1M")
      .describe(
        "How much funding history to bucket. Hourly prints, so even '7D' is ~168 observations.",
      ),
  }),
});

export const fundingHeatmapMeta = defineFrameMeta({
  name: "funding-heatmap",
  label: "Funding Heatmap",
  category: "derivatives",
  iconUrl: widgetIcon("funding-heatmap"),
  layout: { w: 6, h: 3, minW: 5, minH: 2 },
  description:
    "Heatmap of perp funding rates — symbols as rows, daily average over the last 7 days as columns, green positive / red negative. Spots persistent funding regimes at a glance.",
  interpretation: `Funding is the periodic payment between perpetual-futures traders that ties the perp's price to the real market: positive funding means longs (bets on up) pay shorts. This grid shows each symbol's daily average funding over the last week.

Symbols run down as rows and days across as columns. Green cells are days longs paid shorts, red cells the reverse, with deeper color meaning a larger rate.

A row that stays green all week is a persistently crowded long — traders keep paying to hold that side. Rows flipping color show unstable positioning. Comparing rows tells which symbols carry the most expensive positioning right now, which a single-symbol chart can't.`,
  capabilities: ["funding-history"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbols: z
      .array(z.string())
      .min(2)
      .max(8)
      .describe(
        'Hyperliquid symbols as heatmap rows — at least 2, since the heatmap compares funding across symbols, e.g. ["xyz:TSLA", "xyz:NVDA", "xyz:AAPL"].',
      ),
  }),
});

export const openInterestMeta = defineFrameMeta({
  name: "open-interest",
  label: "Open Interest",
  category: "derivatives",
  iconUrl: widgetIcon("open-interest"),
  layout: { w: 4, h: 3, minW: 2, minH: 1, maxH: 4 },
  description:
    'Live open interest across a watchlist of Hyperliquid perps — each symbol is a horizontal bar sized by USD notional, largest first, refreshed on a ~30s poll. Single-venue (Hyperliquid only), so read it as a relative gauge across your symbols, not a market-wide total. Stocks (HIP-3, e.g. "xyz:TSLA") and crypto both work.',
  interpretation: `Open interest is the total value of perpetual-futures positions currently open in a market — every long is matched by a short, and this counts the money committed to those bets, in US dollars. It is not trading volume: volume measures turnover, open interest measures standing exposure.

Each symbol is a horizontal bar sized by its open interest, largest at the top, refreshed about every 30 seconds.

Rising open interest means new money entering positions; falling means positions closing. Heavy open interest on a stretched price often precedes sharp moves, since many leveraged positions can be forced out at once. One caveat: this is a single venue's book, so the bars are relative sizes across the watchlist, not a market-wide total.`,
  capabilities: ["open-interest"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbols: z
      .array(z.string())
      .min(1)
      .max(20)
      .describe(
        'Hyperliquid symbols to compare open interest for, e.g. ["BTC", "ETH", "xyz:TSLA"]. A "<dex>:*" wildcard (e.g. "xyz:*") pulls that dex\'s entire universe.',
      ),
  }),
});

export const optionsPutCallMeta = defineFrameMeta({
  name: "options-put-call",
  label: "Put / Call Ratio",
  category: "derivatives",
  iconUrl: widgetIcon("options-put-call"),
  layout: { w: 4, h: 3, minW: 2, minH: 2, maxH: 3 },
  description:
    "Deribit options put/call ratio for BTC or ETH — the headline ratio (by open interest or 24h volume), a call-vs-put open-interest split bar, and the open-interest-weighted average implied volatility. A ratio above 1 means puts outweigh calls (defensive positioning). Keyless Deribit market data.",
  interpretation: `An option is a contract to buy (a call) or sell (a put) at a set price later. Calls are typically bought for or as exposure to rises, puts as bets on or insurance against falls — so comparing how many of each are outstanding hints at the market's lean.

The headline number is the put/call ratio: puts divided by calls, either by open interest (positions standing) or by 24h volume (what traded today). The split bar shows the call-vs-put share directly, and the card adds the open-interest-weighted average implied volatility.

A ratio above 1 means puts outweigh calls — defensive or bearish positioning; well below 1 reads bullish or complacent. One nuance: heavy put buying is often insurance on positions people intend to keep, so a high ratio can mean hedged rather than panicking.`,
  capabilities: ["options-summary"],
  source: SOURCES.deribit,
  schema: z.object({
    currency: z
      .enum(["BTC", "ETH"])
      .default("BTC")
      .describe(
        "Which Deribit options book to summarise — BTC or ETH (the only deeply liquid books).",
      ),
    basis: z
      .enum(["oi", "volume"])
      .default("oi")
      .describe(
        'Headline put/call ratio basis: "oi" = by open interest (positioning), "volume" = by 24h traded volume (flow). The other is shown smaller.',
      ),
  }),
});

export const optionsIvMeta = defineFrameMeta({
  name: "options-iv",
  label: "Implied Volatility",
  category: "derivatives",
  iconUrl: widgetIcon("options-iv"),
  layout: { w: 6, h: 3, minW: 3, minH: 2, maxH: 3 },
  description:
    "Deribit DVOL implied-volatility index for BTC or ETH over time — the crypto equivalent of the VIX, as a line chart with the current reading and its change over the window. Rising DVOL = the market is pricing bigger expected swings. Keyless Deribit market data.",
  interpretation: `Implied volatility is the size of price swings the options market is currently pricing in — derived from what traders pay for options, which are essentially insurance against moves. DVOL condenses a whole options book into one such number for BTC or ETH, the crypto counterpart of the stock market's VIX.

The line tracks the index over the chosen window, quoted in annualised percent (a DVOL of 60 roughly means options are priced for swings consistent with ±60% over a year). The card shows the current reading and its change.

Rising DVOL means the market expects bigger moves ahead — in either direction; it is not a price forecast. Falling or low DVOL signals calm, and options are relatively cheap. Spikes usually accompany sell-offs, but price can also grind higher while volatility falls.`,
  capabilities: ["volatility-index"],
  source: SOURCES.deribit,
  schema: z.object({
    currency: z
      .enum(["BTC", "ETH"])
      .default("BTC")
      .describe("Which DVOL volatility index to plot — BTC or ETH."),
    lookback: z
      .enum(["7D", "1M", "3M"])
      .default("1M")
      .describe("History window for the volatility-index line."),
  }),
});

export const optionsOiStrikeMeta = defineFrameMeta({
  name: "options-oi-strike",
  label: "OI by Strike",
  category: "derivatives",
  iconUrl: widgetIcon("options-oi-strike"),
  layout: { w: 6, h: 4, minW: 3, minH: 3 },
  description:
    "Open interest by strike for the nearest Deribit options expiry (BTC or ETH) — a grouped histogram of call vs put open interest across strikes, with the current spot marked. Surfaces the strike 'walls' where positioning is concentrated. Keyless Deribit market data.",
  interpretation: `Options are contracts to buy (calls) or sell (puts) at a fixed price — the strike. Open interest counts how many contracts are outstanding at each strike, so this chart maps where option traders have actually placed their positions for the nearest expiry.

Strikes run along the axis with paired bars at each: one for call open interest, one for puts, and a marker at the current spot price. Taller bars mean more contracts standing at that strike.

Tall clusters — the walls — often act like magnets or barriers into expiry, because dealers hedging those positions trade around them. Put walls tend to sit below spot (protection), call walls above (upside bets). A wall is positioning, not a prediction: it shows where exposure concentrates, not where the price must go.`,
  capabilities: ["options-summary"],
  source: SOURCES.deribit,
  schema: z.object({
    currency: z
      .enum(["BTC", "ETH"])
      .default("BTC")
      .describe("Which Deribit options book — BTC or ETH."),
    strikes: z
      .number()
      .int()
      .min(6)
      .max(30)
      .default(14)
      .describe(
        "How many strikes nearest the current spot to show (centered on the underlying price).",
      ),
  }),
});

export const optionsChainTableMeta = defineFrameMeta({
  name: "options-chain-table",
  label: "Options Chain",
  category: "derivatives",
  iconUrl: widgetIcon("options-chain-table"),
  layout: { w: 8, h: 5, minW: 2, minH: 3 },
  description:
    "The full option chain for one underlying as the conventional strike ladder — calls and puts side by side for a chosen expiry, with implied volatility, open interest, volume, bid/ask and optional greeks. Deliberately asset-class-agnostic: the same card reads a crypto venue's book, a listed equity and a metal ETF, so it is the one options surface that works whatever the board is about. Greeks depend on the feed — a delayed exchange chain publishes them, a crypto book-summary call does not, and the greek columns hide themselves when the chain carries none. The header states the quote delay, because reading a 15-minute-old chain as live is the real hazard here. Absent quotes render as a dash, never as zero: a zero bid is a different and real statement.",
  interpretation: `An options chain is the full menu of contracts on one asset: for each strike price, a call (the right to buy) and a put (the right to sell), for a chosen expiry date. This table lays them out the conventional way — calls on one side, puts on the other, strikes down the middle, centred near the current price.

Each row shows the market for that contract: bid/ask (what buyers offer and sellers ask), implied volatility (how big a move that option's price implies), open interest (contracts outstanding), volume (traded today), and optionally greeks (sensitivities such as delta).

Rich implied volatility and heavy open interest around a strike show where the market expects — or fears — the price to go. Two reading hazards: the header states the quote delay, and reading a delayed chain as live is the real trap; and a dash means no quote at all, which is different from a zero bid — a real, if bleak, offer.`,
  capabilities: ["options-chain"],
  source: SOURCES.deribit,
  schema: z.object({
    symbol: z
      .string()
      .min(1)
      .default("BTC")
      .describe(
        "Underlying to read the chain for. Source-native: the crypto venue lists only 'BTC' and 'ETH' (every other currency returns an empty book, which renders as 'no listed options' rather than an error), while an exchange feed takes an equity or ETF ticker like 'NVDA' or 'GLD'.",
      ),
    expiry: z
      .string()
      .default("")
      .describe(
        "Which expiry to ladder, as an ISO date ('2026-08-28'). Leave empty for the nearest expiry, which is what a chain is normally read at. An expiry the feed does not list falls back to the nearest rather than emptying the card.",
      ),
    strikes: z
      .number()
      .int()
      .min(4)
      .max(40)
      .default(12)
      .describe(
        "How many strikes to show around the money, split either side of the underlying. A real chain runs to thousands of contracts (7,600 on a liquid ETF), so this is a window, not a filter — raise it to see the wings, lower it for a compact card.",
      ),
    greeks: z
      .array(z.enum(["delta", "gamma", "vega", "theta", "rho"]))
      .max(3)
      .default(["delta", "gamma"])
      .describe(
        "Which greek columns to show, at most three so the ladder stays readable. Ignored entirely when the feed publishes no greeks — the crypto book-summary endpoint does not, and fetching them per contract would cost one request per strike.",
      ),
    source: z
      .enum(["deribit", "cboe"])
      .default("deribit")
      .describe(
        "Which feed to read the chain from — 'deribit' for the crypto book (BTC and ETH only, live, no greeks), 'cboe' for a listed equity or ETF chain (delayed ~15 minutes, full greeks). Capability routing is first-match and the equity feed registers first, so this is what actually decides the venue, not the symbol: an equity or ETF ticker needs 'cboe' pinned here or the chain comes back empty. Defaults to the crypto book to match the default symbol.",
      ),
  }),
});

export const fundingComparisonMeta = defineFrameMeta({
  name: "funding-comparison",
  label: "Cross-Venue Funding",
  category: "derivatives",
  iconUrl: widgetIcon("funding-comparison"),
  layout: { w: 5, h: 4, minW: 4, minH: 2, maxH: 5 },
  description:
    "Predicted perpetual funding rates compared across venues (Hyperliquid vs Binance vs Bybit), annualized, per coin — ranked by the cross-venue spread. A large spread flags a funding-arbitrage or crowded-positioning signal. Keyless (Hyperliquid predicted fundings).",
  interpretation: `Perpetual futures charge funding — a periodic payment between longs and shorts that keeps each venue's perp price near the real market. Because every exchange sets its own rate, the same coin can cost very different amounts to hold on different venues.

Each row is one coin with its predicted funding rate on Hyperliquid, Binance and Bybit, annualised so the numbers read like interest rates. Rows are ranked by the spread between the venues' rates, widest first.

A wide spread means the venues disagree about positioning — the raw material of a funding-arbitrage trade (collecting funding on one venue while paying less on another) and often a sign one venue's crowd is leaning hard. The rates are predictions for the next interval, not locked-in yields; they reset continuously.`,
  capabilities: ["funding-comparison"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(20)
      .default(8)
      .describe("How many coins (by funding spread) to show."),
  }),
});

export const fundingBarsMeta = defineFrameMeta({
  name: "funding-bars",
  label: "Funding by Venue",
  category: "derivatives",
  iconUrl: widgetIcon("funding-bars"),
  layout: { w: 4, h: 3, minW: 3, minH: 2, maxH: 3 },
  description:
    "One coin's predicted perpetual funding rate compared across venues (Hyperliquid vs Binance vs Bybit) as a diverging bar chart of annualized rates — positive funding (longs pay) in green, negative in red. Makes a funding-arb spread visible at a glance. Keyless (Hyperliquid predicted fundings).",
  interpretation: `Funding is the periodic payment perpetual-futures traders exchange so the perp's price tracks the real market: positive funding means longs (up bets) pay shorts. Each venue sets its own rate, so one coin can be cheap to hold on one exchange and expensive on another.

Each bar is one venue's predicted funding rate for the chosen coin, annualised. Bars extend one way in green when funding is positive — longs paying — and the other way in red when negative.

Bars all on the same side show a consistent market lean; bars split across zero mean the venues' crowds disagree, which is the setup for funding arbitrage (collecting on one venue while paying less on the other). Annualising makes small hourly rates readable, but the rate resets constantly — the annual figure is a run-rate, not a promise.`,
  capabilities: ["funding-comparison"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    coin: z
      .string()
      .min(1)
      .default("BTC")
      .describe('Coin to compare across venues, e.g. "BTC", "ETH", "SOL".'),
  }),
});

export const putCallGaugeMeta = defineFrameMeta({
  name: "put-call-gauge",
  label: "Put/Call Gauge",
  category: "derivatives",
  iconUrl: widgetIcon("put-call-gauge"),
  layout: { w: 3, h: 3, minW: 2, minH: 2, maxW: 4 },
  description:
    "Options put/call ratio as a radial gauge — the arc reads from 0 (all calls, bullish) through 1 (balanced) toward 2 (put-heavy, defensive), colored green below 1 and red above. A dial-style alternative to the Put/Call Ratio card. Keyless (Deribit).",
  interpretation: `Options come in two kinds: calls (bets on or exposure to rises) and puts (bets on falls, or insurance). The put/call ratio divides puts by calls, condensing an options market's lean into one number.

The dial sweeps from 0 (all calls) through 1 (balanced) toward 2 (put-heavy). The needle sits in green territory below 1 and red above. The basis setting picks what gets counted: open interest measures standing positions, volume measures today's flow.

Readings well below 1 signal bullish or complacent positioning; above 1, defensive. Extremes are often read contrarily — heavy put buying is common near market bottoms. And a high ratio can mean hedged rather than bearish: puts frequently serve as insurance on positions their owners intend to keep.`,
  capabilities: ["options-summary"],
  source: SOURCES.deribit,
  schema: z.object({
    currency: z
      .enum(["BTC", "ETH"])
      .default("BTC")
      .describe("Options underlying to read the ratio for."),
    basis: z
      .enum(["oi", "volume"])
      .default("oi")
      .describe("Ratio basis — open interest or 24h contract volume."),
  }),
});

export const oiTreemapMeta = defineFrameMeta({
  name: "oi-treemap",
  label: "OI Treemap",
  category: "derivatives",
  iconUrl: widgetIcon("oi-treemap"),
  layout: { w: 6, h: 4, minW: 1, minH: 1, maxH: 4 },
  description:
    "Treemap of live Hyperliquid open interest, sized by USD notional — largest markets first, the long tail rolled into a single 'Other' tile. A single-glance map of where perp capital concentrates right now. Keyless (Hyperliquid).",
  interpretation: `Open interest is the money currently committed to open perpetual-futures positions — standing exposure, distinct from trading volume, which measures turnover. This treemap sizes each market's tile by its open interest in US dollars, so the whole card is a map of where leveraged capital sits right now.

Bigger tiles mean more open positions; the largest markets get their own tile and the long tail rolls into one Other tile.

Concentration is the main read: when a handful of tiles dominate, most leveraged risk sits in few markets, and a tile growing over time is a market attracting new positions. This is one venue's book, so tiles compare markets within it rather than measuring the whole market's exposure.`,
  capabilities: ["open-interest"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(30)
      .default(12)
      .describe(
        "How many of the largest open-interest markets to show as individual tiles before rolling the rest into a single 'Other' tile.",
      ),
  }),
});

export const ohlcvVolumeBarsMeta = defineFrameMeta({
  name: "ohlcv-volume-bars",
  label: "OHLCV Volume Bars",
  category: "derivatives",
  iconUrl: widgetIcon("ohlcv-volume-bars"),
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Per-candle trading volume for one Hyperliquid symbol as vertical bars over time, each bar tinted green when that candle closed up and red when it closed down. Works for any HIP-3 perp (stocks, indices, commodities) and crypto. Keyless (Hyperliquid).",
  interpretation: `Trading volume is how much of an asset changed hands in each slice of time — activity, as opposed to price. Each vertical bar is one candle interval's traded volume for the chosen symbol.

Bars are tinted by what price did in that same interval: green when the candle closed higher than it opened, red when lower. Taller bars mean more trading.

Heavy volume behind a move suggests conviction — many participants trading at those prices — while a large price move on thin volume is easier to reverse. Volume spikes often mark turning points or news. The tint reads direction only: a tall green bar means an up-candle was busy, not that buyers outnumbered sellers — every trade has both.`,
  capabilities: ["ohlcv"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbol: z
      .string()
      .min(1)
      .describe(
        'Hyperliquid symbol to chart volume for. HIP-3 cross-asset: stocks "xyz:TSLA"/"xyz:NVDA", indices "xyz:SP500", commodities "xyz:GOLD". Crypto: "BTC", "ETH".',
      ),
    interval: z
      .enum(["1m", "5m", "15m", "1h", "4h", "1d"])
      .default("1h")
      .describe("Candle interval each volume bar represents."),
  }),
});

export const fundingSpreadBarsMeta = defineFrameMeta({
  name: "funding-spread-bars",
  label: "Funding Spread Bars",
  category: "derivatives",
  iconUrl: widgetIcon("funding-spread-bars"),
  layout: { w: 4, h: 4, minW: 2, minH: 2 },
  description:
    "Cross-venue predicted funding-rate spread per coin (max − min annualized rate across Hyperliquid/Binance/Bybit) as a ranked horizontal bar chart — the widest spreads are the clearest funding-arbitrage or crowded-positioning candidates. The bars-first sibling of Cross-Venue Funding. Keyless (Hyperliquid predicted fundings).",
  interpretation: `Perpetual futures charge funding — a rolling payment between longs and shorts that keeps each venue's price near the real market — and every exchange sets its own rate. The spread here is the gap between the highest and lowest annualised predicted rate across Hyperliquid, Binance and Bybit for each coin.

Each horizontal bar is one coin's spread, ranked widest first.

A wide bar means the venues price holding that coin very differently — the classic setup for funding arbitrage (earning funding on one venue while paying less on the other) and often a flag that one venue's positioning is unusually crowded. The spread hides direction: it says the venues disagree, not which side pays — the heatmap and per-coin siblings show that.`,
  capabilities: ["funding-comparison"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(20)
      .default(10)
      .describe("How many coins (by cross-venue funding spread) to chart."),
  }),
});

export const fundingVenueHeatmapMeta = defineFrameMeta({
  name: "funding-venue-heatmap",
  label: "Funding Venue Heatmap",
  category: "derivatives",
  iconUrl: widgetIcon("funding-venue-heatmap"),
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Heatmap of predicted annualized funding rates — coins as rows, venues (Hyperliquid/Binance/Bybit) as columns, green positive / red negative. Spots which venue is paying up (or charging) for a given coin at a glance. Keyless (Hyperliquid predicted fundings).",
  interpretation: `Funding is the recurring payment between perpetual-futures longs and shorts that ties each venue's perp price to the real market: positive rates mean longs (up bets) pay. Each exchange sets its own rate, so the same coin can pay on one venue and charge on another.

Coins run down as rows and venues (Hyperliquid, Binance, Bybit) across as columns. Green cells are positive annualised rates — longs paying — red negative, with deeper color meaning a larger rate.

A row of uniform color is a market-wide lean; a row mixing green and red is venue disagreement — the funding-arbitrage setup. A column consistently hotter than its neighbours suggests that venue's crowd leans harder overall. Rates are annualised predictions and reset continuously.`,
  capabilities: ["funding-comparison"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(15)
      .default(8)
      .describe(
        "How many coins (by cross-venue funding spread) to include as heatmap rows.",
      ),
  }),
});

export const fundingCarryAreaMeta = defineFrameMeta({
  name: "funding-carry-area",
  label: "Funding Carry",
  category: "derivatives",
  iconUrl: widgetIcon("funding-carry-area"),
  layout: { w: 6, h: 3, minW: 3, minH: 2 },
  description:
    "Stacked area of each symbol's running cumulative funding cost or benefit over a configurable lookback — the running total a position would have paid or earned in funding, symbol by symbol. Shows whether carry has been a persistent drag or tailwind. Keyless (Hyperliquid).",
  interpretation: `Funding is the periodic payment between perpetual-futures longs and shorts that keeps the perp priced near the real market. This chart runs the total: for each symbol, the cumulative funding a long position would have paid or earned since the start of the window — the carry cost of simply holding.

Each colored band is one symbol; the bands stack, so the overall envelope is the combined running total and each band's thickness is that symbol's share. A band climbing means holding a long has been costing money (longs paying shorts); a falling band means it has been earning.

A steady climb is a persistent drag on longs — small hourly rates compounding into real cost — and the interesting moments are inflections, where the carry regime flips. Cumulative totals hide texture: a smooth slope and a few violent days can sum to the same endpoint (the funding calendar shows which it was).`,
  capabilities: ["funding-history"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    symbols: z
      .array(z.string())
      .min(1)
      .max(6)
      .describe(
        'Hyperliquid symbols to compare cumulative funding carry for, e.g. ["BTC", "ETH"]. Up to 6.',
      ),
    lookback: z
      .enum(["24h", "7D", "1M"])
      .default("7D")
      .describe("History window for the cumulative funding-carry chart."),
  }),
});

export const volumeShareDonutMeta = defineFrameMeta({
  name: "volume-share-donut",
  label: "Volume Share Donut",
  category: "derivatives",
  iconUrl: widgetIcon("volume-share-donut"),
  layout: { w: 4, h: 4, minW: 2, minH: 1 },
  description:
    "Donut of 24h Hyperliquid trading volume share across the busiest symbols, top symbols as slices with the long tail rolled into 'Other'. Shows where perp trading activity concentrates right now. Keyless (Hyperliquid).",
  interpretation: `Trading volume measures turnover — how much money changed hands in the last 24 hours. This donut splits that turnover by symbol, so each slice is one market's share of the venue's activity.

The busiest symbols get their own slices; everything else rolls into Other. Bigger slice, bigger share of the day's trading.

A donut dominated by one or two slices means activity is concentrated — usually where news, volatility or a squeeze is happening; a large Other slice means trading is spread thin across the tail. Volume share is attention, not direction: a huge slice says a market is busy, not whether it is rising or falling.`,
  capabilities: ["day-stats"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(15)
      .default(7)
      .describe(
        "How many top symbols (by 24h notional volume) to show as individual slices before rolling the rest into a single 'Other' slice.",
      ),
  }),
});

export const volumeMoversScatterMeta = defineFrameMeta({
  name: "volume-movers-scatter",
  label: "Volume Movers Scatter",
  category: "derivatives",
  iconUrl: widgetIcon("volume-movers-scatter"),
  layout: { w: 6, h: 4, minW: 2, minH: 1 },
  description:
    "Hyperliquid perps as a bubble scatter — 24h price change on the x-axis, 24h notional volume on a log y-axis, bubble size by volume. Shows whether the busiest markets are also the biggest movers, or diverging. Keyless (Hyperliquid).",
  interpretation: `Each bubble is one perpetual-futures market, placed by two measures of its day: how far its price moved (horizontal — left is down, right is up) and how much money traded in it (vertical, with bubble size repeating it).

The corners are the interesting reads. Big bubbles far right or left are conviction moves — heavy trading behind a big change. Small bubbles at the extremes moved a lot on thin volume, which reverses more easily. Big bubbles near the middle are busy but going nowhere — often a tug of war.

The volume axis is logarithmic, and that is the common misreading: visually small vertical gaps are large multiples, so two bubbles that look close can differ by ten times in turnover.`,
  capabilities: ["day-stats"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(10)
      .max(60)
      .default(40)
      .describe(
        "How many of the busiest symbols (by 24h notional volume) to plot.",
      ),
  }),
});

export const fundingLeaderboardBarsMeta = defineFrameMeta({
  name: "funding-leaderboard-bars",
  label: "Funding Leaderboard",
  category: "derivatives",
  iconUrl: widgetIcon("funding-leaderboard-bars"),
  layout: { w: 4, h: 4, minW: 2, minH: 1 },
  description:
    "Predicted hourly funding rate ranked across the whole Hyperliquid universe — crypto and HIP-3 equities together — as a diverging bar chart, largest absolute rates first. Surfaces the most expensive (or most rewarded) side to hold right now. Keyless (Hyperliquid).",
  interpretation: `Funding is the recurring payment between perpetual-futures longs and shorts that keeps a perp priced near the real market: positive rates mean longs (up bets) pay shorts to hold. This board ranks the whole universe — crypto and stock perps alike — by the size of that rate right now.

Each bar is one symbol's predicted hourly funding, largest absolute rates first. Green bars extend one way for positive funding (longs paying), red the other for negative (shorts paying).

The top of the board is where holding a position costs — or pays — the most: extreme positive funding marks a crowded long, extreme negative a crowded short, and both are squeeze-prone. The rates look tiny because they are hourly; a steady 0.01% per hour compounds to roughly 90% a year.`,
  capabilities: ["day-stats"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(3)
      .max(20)
      .default(10)
      .describe("How many symbols (by absolute funding rate) to chart."),
  }),
});

export const fundingCrowdingScatterMeta = defineFrameMeta({
  name: "funding-crowding-scatter",
  label: "Funding Crowding Scatter",
  category: "derivatives",
  iconUrl: widgetIcon("funding-crowding-scatter"),
  layout: { w: 6, h: 4, minW: 2, minH: 1 },
  description:
    "24h price change (x) vs predicted funding rate (y) across Hyperliquid perps, bubble size by open interest — the combination of a stretched funding rate and heavy open interest flags a crowded, squeeze-prone position. Keyless (Hyperliquid).",
  interpretation: `A crowded trade is one where many leveraged traders lean the same way, and two numbers reveal it: funding (the rolling fee longs pay shorts when positioning leans long, negative when it leans short) and open interest (the money committed to open positions).

Each bubble is one market: 24h price change runs horizontally, predicted funding rate vertically, and bubble size shows open interest.

The dangerous corners are big bubbles far from the middle: stretched funding plus heavy open interest on a moving price means a large, expensive, one-sided position that can unwind violently — a squeeze. Small bubbles at the same extremes matter less, since little money is at stake. Funding shows how costly the lean is, not when it resolves — crowded trades can stay crowded a long time.`,
  capabilities: ["day-stats", "open-interest"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    limit: z
      .number()
      .int()
      .min(10)
      .max(60)
      .default(40)
      .describe("How many symbols (by open interest) to plot."),
  }),
});

export const liquidityBasisBarsMeta = defineFrameMeta({
  name: "liquidity-basis-bars",
  label: "Liquidity & Basis Bars",
  category: "derivatives",
  iconUrl: widgetIcon("liquidity-basis-bars"),
  layout: { w: 4, h: 4, minW: 2, minH: 1 },
  description:
    "Ranked horizontal bars of a chosen liquidity/pricing metric across Hyperliquid perps — either the bid/ask impact-price spread (% of mark price) or the mark-vs-oracle basis (bps). Surfaces the least liquid or most stretched markets at a glance. Keyless (Hyperliquid).",
  interpretation: `Two health checks on a perpetual-futures market: the spread (the gap between the best buy and sell prices, as a share of the market price — roughly what an immediate round trip costs) and the basis (how far the perp's own price has drifted from its oracle reference, in basis points — hundredths of a percent).

Each horizontal bar is one market, ranked by the chosen metric's size, so the widest spreads or the most stretched prices sit at the top.

A wide spread marks a thin market: trading it costs more and its price gaps more easily. A large basis means the perp trades rich (positive) or cheap (negative) versus its reference — pressure that funding payments exist to correct. Both are per-venue readings: the same market can be thin here and deep on a larger exchange.`,
  capabilities: ["day-stats"],
  source: SOURCES.hyperliquid,
  schema: z.object({
    metric: z
      .enum(["spread", "basis"])
      .default("spread")
      .describe(
        'Which liquidity metric to rank by: "spread" (bid/ask impact-price spread as a % of mark price) or "basis" (mark-vs-oracle premium in basis points).',
      ),
    limit: z
      .number()
      .int()
      .min(3)
      .max(20)
      .default(10)
      .describe(
        "How many symbols (by the chosen metric's magnitude) to chart.",
      ),
  }),
});

export const optionsMaxPainMeta = defineFrameMeta({
  name: "options-max-pain",
  label: "Max Pain by Strike",
  category: "derivatives",
  iconUrl: widgetIcon("options-max-pain"),
  layout: { w: 6, h: 4, minW: 5, minH: 2 },
  description:
    "Max pain for the nearest Deribit options expiry (BTC or ETH) — the aggregate payout option writers would owe at each candidate settlement strike, as a bar chart, with the strike that minimizes it (where the most contracts expire worthless) highlighted against the current spot. Keyless (Deribit).",
  interpretation: `Options expire, and at expiry each contract is either worth something or nothing depending on where the price settles. Max pain asks: at which settlement price would option holders collectively be paid the least — equivalently, where do the most contracts expire worthless?

Each bar is a candidate settlement strike, sized by the total payout option writers would owe if the price expired there. The lowest bar — the max-pain strike — is highlighted, with the current spot price marked for comparison.

Spot sitting far from max pain is what watchers flag: the folk theory says price tends to drift toward the pain point into expiry as dealers hedge. It is a widely watched curiosity, not a forecast — the calculation assumes positioning stays frozen, and it often doesn't.`,
  capabilities: ["options-summary"],
  source: SOURCES.deribit,
  schema: z.object({
    currency: z
      .enum(["BTC", "ETH"])
      .default("BTC")
      .describe("Which Deribit options book — BTC or ETH."),
  }),
});

export const optionsOiSkewMeta = defineFrameMeta({
  name: "options-oi-skew",
  label: "OI Skew by Strike",
  category: "derivatives",
  iconUrl: widgetIcon("options-oi-skew"),
  layout: { w: 6, h: 4, minW: 5, minH: 2 },
  description:
    "Net call-minus-put open interest by strike for the nearest Deribit options expiry (BTC or ETH) — a single diverging bar per strike showing where positioning skews call-heavy (green, above zero) versus put-heavy (red, below zero) near spot. The netted sibling of OI by Strike. Keyless (Deribit).",
  interpretation: `Options split into calls (upside bets or exposure) and puts (downside bets or insurance), each standing at a strike price. This chart nets the two: at every strike near the current price, call open interest minus put open interest, for the nearest expiry.

One bar per strike: green above zero where calls outnumber puts, red below where puts dominate, with longer bars meaning a bigger imbalance.

Green clusters above spot mark where upside bets concentrate; red clusters below spot mark protection levels. The netting is the caveat: a strike with huge but equal call and put interest nets to nothing and vanishes here, so the gross OI-by-strike view is worth checking before concluding a strike is quiet.`,
  capabilities: ["options-summary"],
  source: SOURCES.deribit,
  schema: z.object({
    currency: z
      .enum(["BTC", "ETH"])
      .default("BTC")
      .describe("Which Deribit options book — BTC or ETH."),
    strikes: z
      .number()
      .int()
      .min(6)
      .max(30)
      .default(14)
      .describe(
        "How many strikes nearest the current spot to show (centered on the underlying price).",
      ),
  }),
});

export const optionsVolSpreadMeta = defineFrameMeta({
  name: "options-vol-spread",
  annotatable: true,
  label: "BTC/ETH Vol Spread",
  category: "derivatives",
  iconUrl: widgetIcon("options-vol-spread"),
  layout: { w: 6, h: 3, minW: 4, minH: 2 },
  description:
    "BTC DVOL and ETH DVOL implied-volatility indices plotted together over time — the spread between crypto's two most liquid vol benchmarks, and which one is pricing bigger expected swings. Keyless (Deribit).",
  interpretation: `Implied volatility is the size of future price swings the options market is pricing in, distilled into an index per asset (DVOL — crypto's counterpart of the stock market's VIX). This chart plots BTC's and ETH's indices together, so the read is the gap between them.

Two lines over time, one per asset, in annualised percent. Whichever line sits higher is the asset whose options market expects bigger swings.

ETH typically carries higher implied volatility than BTC; the spread narrowing or inverting is the notable event — the market has repriced which asset is riskier, often around ETH-specific catalysts. Both lines rising together is a market-wide risk signal rather than a relative one. Volatility indices measure expected swing size, not direction.`,
  capabilities: ["volatility-index"],
  source: SOURCES.deribit,
  schema: z.object({
    lookback: z
      .enum(["7D", "1M", "3M"])
      .default("1M")
      .describe("History window for both volatility-index lines."),
  }),
});

export const optionsFlowSkewMeta = defineFrameMeta({
  name: "options-flow-skew",
  label: "Positioning vs Flow Skew",
  category: "derivatives",
  iconUrl: widgetIcon("options-flow-skew"),
  layout: { w: 4, h: 3, minW: 3, minH: 2, maxH: 4 },
  description:
    "Call/put skew for BTC or ETH options across two bases at once — open interest (standing positioning) and 24h volume (today's flow) — as two diverging bars. Green = call-heavy, red = put-heavy; the two diverging signals fresh flow fighting stale positioning. Keyless (Deribit).",
  interpretation: `Options positioning can be read two ways: what stands (open interest — all contracts currently open) and what is flowing (volume — contracts traded in the last 24 hours). This card shows the call-versus-put skew on both bases at once.

Two diverging bars, one per basis. A bar extends green when calls outweigh puts (a bullish lean) and red when puts dominate (a defensive lean); the longer the bar, the stronger the tilt.

The interesting state is disagreement: the open-interest bar leaning one way while the volume bar leans the other means today's flow is fighting the standing position — early evidence positioning is turning. When both agree, the lean is entrenched. Puts also serve as insurance, so a put-heavy reading can mean hedged rather than bearish.`,
  capabilities: ["options-summary"],
  source: SOURCES.deribit,
  schema: z.object({
    currency: z
      .enum(["BTC", "ETH"])
      .default("BTC")
      .describe("Which Deribit options book — BTC or ETH."),
  }),
});

export const optionsVolSmileMeta = defineFrameMeta({
  name: "options-vol-smile",
  label: "Vol Smile",
  category: "derivatives",
  iconUrl: widgetIcon("options-vol-smile"),
  layout: { w: 6, h: 4, minW: 2, minH: 1 },
  description:
    "Implied volatility by strike for the nearest Deribit options expiry (BTC or ETH) — a call-IV line and a put-IV line across the strike range, the classic 'vol smile' shape that shows where the market prices tail risk richest. Keyless (Deribit).",
  interpretation: `Every option carries an implied volatility — the size of move its market price implies traders expect. In theory it would be the same at every strike; in practice, plotting IV against strike bends into the famous smile: the market charges more for options far from the current price.

Two lines run across the strike range for the nearest expiry — one from call quotes, one from puts — with the current spot price in the middle.

Where the smile sits highest is where the market pays up for protection or lottery tickets. A smile steeper on the low-strike side (a smirk) means downside crashes are priced as the bigger risk — the usual shape in equities, less reliably so in crypto, where the upside wing can be rich too. The curve's overall level matters separately: a high, flat smile is broad fear; a low one with a steep wing is calm with one specific tail worry.`,
  capabilities: ["options-summary"],
  source: SOURCES.deribit,
  schema: z.object({
    currency: z
      .enum(["BTC", "ETH"])
      .default("BTC")
      .describe("Which Deribit options book — BTC or ETH."),
  }),
});

export const optionsOiLadderHeatmapMeta = defineFrameMeta({
  name: "options-oi-ladder-heatmap",
  label: "OI Ladder Heatmap",
  category: "derivatives",
  iconUrl: widgetIcon("options-oi-ladder-heatmap"),
  layout: { w: 8, h: 5, minW: 2, minH: 1 },
  description:
    "Open interest across strike and expiry for BTC or ETH options, as a heatmap — expiries as rows (nearest first), strike bands as columns, cell shade by total call+put OI. Surfaces where positioning concentrates across the whole term structure, not just the nearest expiry. Keyless (Deribit).",
  interpretation: `Options exist at many strike prices and many expiry dates at once — a whole grid of contracts. Open interest counts the contracts standing at each point, and this heatmap shows that entire term structure rather than a single expiry.

Expiries run down as rows (nearest first), strike bands across as columns, and each cell's shading is total call-plus-put open interest — darker means more contracts standing there.

Hot cells show where the market's positioning concentrates: a bright band in the near rows means most exposure resolves soon (the weeks around it tend to be eventful), while heat deep in the far rows marks long-dated conviction. Cells sum calls and puts together, so a hot cell says how much positioning sits there — not which direction it leans.`,
  capabilities: ["options-summary"],
  source: SOURCES.deribit,
  schema: z.object({
    currency: z
      .enum(["BTC", "ETH"])
      .default("BTC")
      .describe("Which Deribit options book — BTC or ETH."),
    expiries: z
      .number()
      .int()
      .min(3)
      .max(16)
      .default(8)
      .describe("How many upcoming expiries (nearest-first) to show as rows."),
    buckets: z
      .number()
      .int()
      .min(6)
      .max(20)
      .default(10)
      .describe(
        "How many strike bands (columns) to bin open interest into, spanning the shown expiries' strike range.",
      ),
  }),
});

export const optionsMaxPainMultiMeta = defineFrameMeta({
  name: "options-max-pain-multi",
  label: "Max Pain by Expiry",
  category: "derivatives",
  iconUrl: widgetIcon("options-max-pain-multi"),
  layout: { w: 6, h: 4, minW: 2, minH: 1 },
  description:
    "Max pain strike for each upcoming Deribit options expiry (BTC or ETH), plotted as % deviation from spot — one bar per expiry, showing which dated books are pinned above versus below the current price. The term-structure sibling of Max Pain by Strike. Keyless (Deribit).",
  interpretation: `Max pain is the settlement price at which option holders collectively get paid the least — where the most contracts expire worthless. Each options expiry date has its own max-pain strike; this chart lines them up.

One bar per upcoming expiry, sized by how far that expiry's max-pain strike sits from the current price, in percent — above zero when the pain point is above spot, below when beneath it.

Bars clustered near zero mean the option books are pinned around the current price; a far expiry with a large deviation shows dated positioning centred well away from today's level. Max pain is a folk indicator, not a forecast: it assumes open interest stays frozen and ignores hedging, so the bars are a positioning map, not price targets.`,
  capabilities: ["options-summary"],
  source: SOURCES.deribit,
  schema: z.object({
    currency: z
      .enum(["BTC", "ETH"])
      .default("BTC")
      .describe("Which Deribit options book — BTC or ETH."),
    expiries: z
      .number()
      .int()
      .min(3)
      .max(16)
      .default(8)
      .describe("How many upcoming expiries (nearest-first) to chart."),
  }),
});

export const equityOptionsOiMeta = defineFrameMeta({
  name: "equity-options-oi",
  label: "Equity Options OI",
  category: "derivatives",
  iconUrl: widgetIcon("equity-options-oi"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Where the open interest sits on one listed stock's option chain — calls and puts stacked by strike for a chosen expiry, with the spot price marked, so the strikes the market has actually positioned around are visible. Also shows the chain's put/call open-interest ratio. Keyless Cboe data, delayed ~15 minutes (the card says so); requires the zframes runtime proxy.",
  interpretation: `Stock options come in calls (the right to buy at a strike price) and puts (the right to sell), and open interest counts the contracts outstanding at each strike. This chart stacks call and put open interest by strike for one expiry of a listed stock, with the current share price marked.

Taller stacks mark strikes the market has actually positioned around, and the mix within each stack shows whether that positioning is calls (upside exposure) or puts (protection). The card also reports the chain's overall put/call open-interest ratio.

Heavy strikes often behave like reference levels into expiry as dealers hedge around them — put-heavy strikes below spot read as defended floors, call-heavy strikes above as targets or lids. Quotes are delayed about 15 minutes: the shape of positioning moves slowly, but the prices here are not live.`,
  capabilities: ["options-chain"],
  source: SOURCES.cboe,
  schema: z.object({
    symbol: companySymbolField(),
    expiry: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Which expiry to chart, ISO "YYYY-MM-DD". Omit for the nearest expiry with meaningful open interest.',
      ),
    strikes: z
      .number()
      .int()
      .min(6)
      .max(40)
      .default(16)
      .describe("How many strikes to show, centred on spot."),
  }),
});

export const equityOptionsSmileMeta = defineFrameMeta({
  name: "equity-options-smile",
  label: "Equity Vol Smile",
  category: "derivatives",
  iconUrl: widgetIcon("equity-options-smile"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "Implied volatility across strikes for one listed stock at a single expiry — the smile (or smirk), plotted separately for calls and puts against strike, with spot marked. A steep downside skew means the market is paying up for crash protection. Contracts quoting no implied volatility are dropped rather than plotted at zero. Keyless Cboe data, delayed ~15 minutes.",
  interpretation: `Each option carries an implied volatility — the size of move its market price implies traders expect. Plotting it against strike for one expiry gives the smile: in theory flat, in practice bent, because the market pays more for options far from the current price.

Call and put IV are drawn as separate lines across strikes, with the current share price marked. Higher points mean pricier options at that strike, in volatility terms.

Stocks typically show a smirk rather than a symmetric smile: IV climbing toward low strikes means the market pays up for crash protection, and the steeper that slope, the more downside fear is priced. A lifted upside wing tends to appear around takeover or squeeze speculation. Contracts quoting no IV are dropped rather than plotted at zero — a zero would fake a collapse in expectations. Quotes are about 15 minutes delayed.`,
  capabilities: ["options-chain"],
  source: SOURCES.cboe,
  schema: z.object({
    symbol: companySymbolField(),
    expiry: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Which expiry to chart, ISO "YYYY-MM-DD". Omit for the nearest liquid expiry.',
      ),
    moneyness: z
      .number()
      .min(0.1)
      .max(1)
      .default(0.3)
      .describe(
        "How far from spot to plot, as a fraction of spot (0.3 = strikes within ±30%). Wide chains have far-out strikes whose quotes are noise.",
      ),
  }),
});

export const equityOptionsMaxPainMeta = defineFrameMeta({
  name: "equity-options-max-pain",
  label: "Equity Max Pain",
  category: "derivatives",
  iconUrl: widgetIcon("equity-options-max-pain"),
  layout: { w: 4, h: 3, minW: 3, minH: 3 },
  description:
    "The strike at which the most option value expires worthless for holders on one listed stock — total in-the-money payout across the chain plotted per strike, with the minimum (max pain) and the spot price marked, plus the gap between them. A widely-watched folk indicator, not a prediction: it assumes open interest is static and ignores hedging. Keyless Cboe data, delayed ~15 minutes.",
  interpretation: `Max pain is the share price at which the most option value expires worthless — the settlement level worst for option holders as a group, and by symmetry the friendliest to the traders who sold those options.

The curve plots, for each candidate strike, the total payout the stock's options would be worth if it expired there; the minimum of that curve is the max-pain strike, marked against the current share price along with the gap between them.

A wide gap between spot and max pain is the reading watchers flag: the folk theory holds that price drifts toward the pain point into expiry as dealers hedge. Treat it as a widely watched folk indicator, not a prediction — the maths assumes open interest is static and ignores hedging, and quotes here are about 15 minutes delayed.`,
  capabilities: ["options-chain"],
  source: SOURCES.cboe,
  schema: z.object({
    symbol: companySymbolField(),
    expiry: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Which expiry to evaluate, ISO "YYYY-MM-DD". Omit for the nearest expiry with meaningful open interest.',
      ),
  }),
});

export const equityOptionsGreeksMeta = defineFrameMeta({
  name: "equity-options-greeks",
  label: "Equity Options Greeks",
  category: "derivatives",
  iconUrl: widgetIcon("equity-options-greeks"),
  layout: { w: 5, h: 4, minW: 3, minH: 3 },
  description:
    "A chosen greek across the strike ladder for one listed stock at a single expiry — delta, gamma, vega or theta for calls and puts, with spot marked. Gamma in particular shows where dealer hedging concentrates, which is where price tends to get pinned or accelerate. Keyless Cboe data including published greeks, delayed ~15 minutes.",
  interpretation: `Greeks measure how an option's value responds to changes: delta to the share price, gamma to how fast delta itself changes, vega to implied volatility, theta to the passing of a day. Market makers who sell options hedge these exposures constantly, which is why the greeks map where mechanical buying and selling concentrates.

The chosen greek is plotted across strikes for one expiry, calls and puts separately, with the current share price marked.

Gamma is the headline read: it peaks near the money, and strikes where gamma concentrates are where dealer hedging is most intense — price tends to get pinned to a heavy strike in quiet markets, or accelerate through it in fast ones. Vega concentrations show sensitivity to a volatility repricing; theta, where time decay bites hardest. Values are the exchange's published greeks, about 15 minutes delayed.`,
  capabilities: ["options-chain"],
  source: SOURCES.cboe,
  schema: z.object({
    symbol: companySymbolField(),
    greek: z
      .enum(["delta", "gamma", "vega", "theta"])
      .default("gamma")
      .describe("Which greek to plot across the strike ladder."),
    expiry: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'Which expiry to chart, ISO "YYYY-MM-DD". Omit for the nearest liquid expiry.',
      ),
    strikes: z
      .number()
      .int()
      .min(6)
      .max(40)
      .default(20)
      .describe("How many strikes to show, centred on spot."),
  }),
});
