import { defineFrameMeta } from "@zframes/spec/frame";
import { z } from "zod";
import { widgetIcon, portfolioConfigShape } from "./shared";

export const portfolioValueMeta = defineFrameMeta({
  name: "portfolio-value",
  label: "Portfolio Value",
  category: "portfolio",
  iconUrl: widgetIcon("portfolio-value"),
  layout: { w: 5, h: 4, minW: 1, minH: 2, maxH: 4 },
  description:
    "Your connected portfolio's total USD value as a live equity line, ticking with the market. Source is a connected Binance account (read-only key, entered in-app) or a public on-chain wallet address. Shows total value + session change. Renders a connect prompt until a source is set.",
  interpretation: `The headline number is the combined market value of every holding in the connected account or wallet, priced at live market rates. The line beneath it is that total re-plotted every few seconds, so it ticks up and down with the market in real time.

The change figure compares the current total against where it stood when the dashboard opened — a session change, colored green for a gain and red for a loss. The line rises when holdings appreciate (or funds arrive) and falls when they lose value.

One common misreading: treating the line as performance history. It accumulates only from the moment the dashboard opened, so a flat or dramatic-looking line says something about the last few minutes, not about how the portfolio has done over days or months. A steep wiggle on a short window can represent a fraction of a percent.`,
  capabilities: ["portfolio", "quote-stream"],
  account: true,
  schema: z.object({
    ...portfolioConfigShape,
    windowSec: z
      .number()
      .int()
      .positive()
      .default(300)
      .describe(
        "Seconds of live history the equity line shows; it accumulates from when the dashboard opens.",
      ),
  }),
});

export const portfolioAllocationMeta = defineFrameMeta({
  name: "portfolio-allocation",
  label: "Portfolio Allocation",
  category: "portfolio",
  iconUrl: widgetIcon("portfolio-allocation"),
  layout: { w: 4, h: 4, minW: 1, minH: 2, maxH: 4 },
  description:
    "Donut of your connected portfolio's allocation — each slice sized by live USD value, total in the center. Source is a connected Binance account (read-only key, in-app) or a public on-chain wallet address. Renders a connect prompt until a source is set.",
  interpretation: `The donut shows how the connected portfolio's value is divided among its holdings. Each slice is one asset, sized by its current market value, and the number in the center is the portfolio's total.

Reading it is proportional: a slice taking half the ring means that asset is half the portfolio's value, however many coins or shares that represents. Slices grow and shrink as live prices move, so the shape drifts even when nothing is bought or sold.

A ring dominated by one or two wide slices signals concentration — the portfolio's fate is tied to those few assets — while many similar slices signal diversification. One common misreading: slice size reflects value, not quantity or conviction; a large slice may simply be an asset whose price has run up, quietly making the portfolio more concentrated than it was when the positions were opened.`,
  capabilities: ["portfolio", "quote-stream"],
  account: true,
  schema: z.object({ ...portfolioConfigShape }),
});

export const portfolioHoldingsMeta = defineFrameMeta({
  name: "portfolio-holdings",
  label: "Portfolio Holdings",
  category: "portfolio",
  iconUrl: widgetIcon("portfolio-holdings"),
  layout: { w: 4, h: 4, minW: 1, minH: 2, maxH: 4 },
  description:
    "Table of your connected portfolio's positions — asset, amount, live USD value, share of total, 24h change. Source is a connected Binance account (read-only key, in-app) or a public on-chain wallet address. Renders a connect prompt until a source is set.",
  interpretation: `Each row is one position in the connected account or wallet: the asset, how many units are held, what that holding is worth at the current market price, what share of the whole portfolio it represents, and how its price has moved over the last 24 hours.

The value column updates live, so the table's totals drift with the market. The 24h change column is colored green for gainers and red for losers — it describes the asset's price move, applying equally to anyone holding it.

One common misreading: the 24h change is not the portfolio's profit on that position. It says what the price did today, not what was paid for the holding — a position can show a green day while still sitting far below its purchase price, and vice versa. The share-of-total column is the quicker risk read: rows commanding a large share are the ones whose price moves actually move the portfolio.`,
  capabilities: ["portfolio", "quote-stream"],
  account: true,
  schema: z.object({ ...portfolioConfigShape }),
});

export const portfolioMoversMeta = defineFrameMeta({
  name: "portfolio-movers",
  label: "Portfolio Movers",
  category: "portfolio",
  iconUrl: widgetIcon("portfolio-movers"),
  layout: { w: 4, h: 5, minW: 1, minH: 2, maxH: 5 },
  description:
    "Your connected portfolio's holdings as a diverging bar chart of 24h price change — gainers right in green, losers left in red. Source is a connected Binance account (read-only key, in-app) or a public on-chain wallet address. Only holdings the source reports a 24h change for are shown — currently that's on-chain wallet holdings (priced via CoinGecko); a Binance-only portfolio will show its empty state until the account layer adds a price-change feed. Renders a connect prompt until a source is set.",
  interpretation: `Each bar is one holding in the connected portfolio, and its length is that asset's price change over the last 24 hours. Bars diverge from a center line: gainers extend right in green, losers extend left in red, so the day's winners and losers within the portfolio read at a glance.

Longer bars mean bigger percentage moves. A chart leaning heavily to one side says most holdings moved together — common when the whole market rises or falls — while a balanced spread says the portfolio's assets are moving independently.

One common misreading: bar length is the asset's percentage price move, not its dollar impact on the portfolio. A tiny position with a wild day can draw the longest bar while barely denting the total, and a large position's modest move can matter far more. Only holdings whose source reports a 24h change appear here, so the chart may show fewer rows than the holdings table.`,
  capabilities: ["portfolio"],
  account: true,
  schema: z.object({
    ...portfolioConfigShape,
    limit: z
      .number()
      .int()
      .min(4)
      .max(30)
      .default(15)
      .describe("How many holdings (by absolute 24h change) to chart."),
  }),
});

export const portfolioValueBarsMeta = defineFrameMeta({
  name: "portfolio-value-bars",
  label: "Portfolio Value Bars",
  category: "portfolio",
  iconUrl: widgetIcon("portfolio-value-bars"),
  layout: { w: 4, h: 5, minW: 1, minH: 2, maxH: 5 },
  description:
    "Your connected portfolio's positions as a horizontal bar chart ranked by live USD value, largest first. The chart-first sibling of the Portfolio Holdings table. Source is a connected Binance account (read-only key, in-app) or a public on-chain wallet address. Renders a connect prompt until a source is set.",
  interpretation: `Each bar is one position in the connected account or wallet, and its length is that holding's current market value. Bars are ranked largest first, so the portfolio's biggest positions sit at the top and the tail of small holdings trails below.

Because values are priced live, bar lengths shift with the market even when nothing is traded. The shape of the ranking is the quick read: one bar dwarfing the rest means the portfolio is concentrated in a single asset, while a gentle stair-step means value is spread more evenly.

One common misreading: bar length reflects market value, not the number of units held or how well the position has done. A long bar can be a small stake in an expensive asset or a huge stake in a cheap one, and it says nothing about profit or loss — only about how much of the portfolio rides on that holding right now.`,
  capabilities: ["portfolio", "quote-stream"],
  account: true,
  schema: z.object({
    ...portfolioConfigShape,
    limit: z
      .number()
      .int()
      .min(3)
      .max(25)
      .default(12)
      .describe("How many holdings (by USD value, descending) to chart."),
  }),
});
