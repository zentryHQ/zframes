import { BarChart } from "@zframes/charts";
import { defineFrame, type Portfolio } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { formatCompactUsd } from "./format";
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
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <div className="flex items-baseline justify-between px-0.5">
        <PortfolioLabel
          portfolio={portfolio}
          config={config}
          className="caption text-soft"
        />
        <span className="metric-sm text-strong">
          {formatCompactUsd(total)}
        </span>
      </div>
      <BarChart
        data={data}
        orientation="horizontal"
        height={Math.max(data.length * 24, 96)}
        formatValue={formatCompactUsd}
      />
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
