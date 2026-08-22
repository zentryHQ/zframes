import { CHART_COLORS_MULTI_SERIES, PieChart } from "@zframes/charts";
import { defineFrame, useMoney, type Portfolio } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { formatPct } from "./format";
import {
  PortfolioGate,
  PortfolioLabel,
  usePricedHoldings,
} from "./portfolio-common";
import { portfolioAllocationMeta } from "./schemas";
import { SliceLegend } from "./slice-legend";
import { FrameStatus } from "./ui";

const schema = portfolioAllocationMeta.schema;

function AllocationDonut({
  portfolio,
  config,
}: {
  portfolio: Portfolio;
  config: z.output<typeof schema>;
}) {
  const money = useMoney();
  const { priced } = usePricedHoldings(portfolio.holdings);
  const slices = useMemo(
    () =>
      priced
        .map((holding, i) => ({
          name: tickerOf(holding.symbol),
          value: holding.value ?? 0,
          color:
            CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
        }))
        .filter((slice) => slice.value > 0)
        .sort((a, b) => b.value - a.value),
    [priced],
  );
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (slices.length === 0) return <FrameStatus>no live prices yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 w-full flex-col items-center justify-center gap-4">
      <div className="min-h-0 w-full flex-1">
        {/* `fill` scales the ring to the card; width/height stay behind it as
            the reference box the radii keep their proportions against. */}
        <PieChart
          data={slices}
          fill
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
            <span className="metric-md text-strong">
              {money.compact(total)}
            </span>
          </div>
        </PieChart>
      </div>

      <SliceLegend>
        {slices.map((slice) => (
          <SliceLegend.Item
            key={slice.name}
            color={slice.color}
            label={slice.name}
          >
            {formatPct((slice.value / total) * 100, 1)}
            {/* The holding's value rides inside the share, quieter than it —
                `SliceLegend.Item` has one value slot, and the share is the
                figure the legend is for. */}
            <span className="caption text-soft ml-1.5">
              {money.compact(slice.value)}
            </span>
          </SliceLegend.Item>
        ))}
      </SliceLegend>
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
