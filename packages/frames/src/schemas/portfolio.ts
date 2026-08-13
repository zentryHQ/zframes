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
