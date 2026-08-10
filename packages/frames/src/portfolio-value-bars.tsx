import { BarChart } from "@zframes/charts";
import { defineFrame, useMoney, type Portfolio } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import {
  PortfolioGate,
  PortfolioLabel,
  usePricedHoldings,
} from "./portfolio-common";
import { portfolioValueBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = portfolioValueBarsMeta.schema;

function ValueBars({
  portfolio,
  config,
}: {
  portfolio: Portfolio;
  config: z.output<typeof schema>;
}) {
  const money = useMoney();
  const { priced, total } = usePricedHoldings(portfolio.holdings);

  const data = useMemo(
    () =>
      priced
        .filter((h) => (h.value ?? 0) > 0)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
        .slice(0, config.limit)
        .map((h) => ({ label: tickerOf(h.symbol), value: h.value ?? 0 })),
    [priced, config.limit],
  );

  if (data.length === 0) return <FrameStatus>no live prices yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1 text-normal">
      <div className="flex items-baseline justify-between px-0.5">
        <PortfolioLabel
          portfolio={portfolio}
          config={config}
          className="caption text-soft"
        />
        <span className="metric-sm text-strong">{money.compact(total)}</span>
      </div>
      {/* `fill`, not `24px × holdings`: a pixel height pins the chart's wrapper,
          so a card shorter than that number can't shrink it and the bars spill
          out of the card body, clipped. Filling makes the chart the card's
          dependent — the bars just get thinner. */}
      <div className="min-h-0 flex-1">
        <BarChart
          data={data}
          orientation="horizontal"
          fill
          formatValue={money.compact}
        />
      </div>
    </div>
  );
}

function PortfolioValueBars({ config }: { config: z.output<typeof schema> }) {
  return (
    <PortfolioGate config={config} loadingLabel="loading holdings…">
      {(portfolio) => <ValueBars portfolio={portfolio} config={config} />}
    </PortfolioGate>
  );
}

export const portfolioValueBarsFrame = defineFrame({
  ...portfolioValueBarsMeta,
  component: PortfolioValueBars,
});
