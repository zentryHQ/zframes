import { CHART_COLORS_MULTI_SERIES, PieChart } from "@zframes/charts";
import { defineFrame, type Portfolio } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { formatCompactUsd, formatPct } from "./format";
import {
  PortfolioGate,
  PortfolioLabel,
  usePricedHoldings,
} from "./portfolio-common";
import { portfolioAllocationMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = portfolioAllocationMeta.schema;

function AllocationDonut({
  portfolio,
  config,
}: {
  portfolio: Portfolio;
  config: z.output<typeof schema>;
}) {
  const { priced } = usePricedHoldings(portfolio.holdings);
  const slices = useMemo(
    () =>
      priced
        .map((holding, i) => ({
          name: tickerOf(holding.symbol),
          value: holding.value ?? 0,
          color: CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
        }))
        .filter((slice) => slice.value > 0)
        .sort((a, b) => b.value - a.value),
    [priced],
  );
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (slices.length === 0)
    return <FrameStatus>no live prices yet</FrameStatus>;

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <PieChart
        data={slices}
        width={200}
        height={200}
        innerRadius={58}
        outerRadius={92}
        colors={slices.map((slice) => slice.color)}
      >
        <div className="flex flex-col items-center gap-0.5">
          <PortfolioLabel
            portfolio={portfolio}
            config={config}
            className="caption text-soft"
          />
          <span className="metric-lg text-strong">
            {formatCompactUsd(total)}
          </span>
        </div>
      </PieChart>

      <div className="flex w-full max-w-xs flex-wrap justify-center gap-x-5 gap-y-1.5">
        {slices.map((slice) => (
          <div key={slice.name} className="flex items-center gap-1.5">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: slice.color }}
            />
            <span className="body-sm text-soft">{slice.name}</span>
            <span className="body-sm text-normal font-bold tabular-nums">
              {formatPct((slice.value / total) * 100, 1)}
            </span>
            <span className="caption text-soft tabular-nums">
              {formatCompactUsd(slice.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PortfolioAllocation({ config }: { config: z.output<typeof schema> }) {
  return (
    <PortfolioGate config={config} loadingLabel="loading allocation…">
      {(portfolio) => <AllocationDonut portfolio={portfolio} config={config} />}
    </PortfolioGate>
  );
}

export const portfolioAllocationFrame = defineFrame({
  ...portfolioAllocationMeta,
  component: PortfolioAllocation,
});
