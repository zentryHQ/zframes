import { CHART_COLORS_MULTI_SERIES, PieChart } from "@zframes/charts";
import { defineFrame, useMidsState } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { allocationMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = allocationMeta.schema;

function formatUsd(value: number): string {
  if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
}

function Allocation({ config }: { config: z.output<typeof schema> }) {
  const symbols = useMemo(
    () => config.holdings.map((holding) => holding.symbol),
    [config.holdings],
  );
  const { mids, isLoading } = useMidsState(symbols);

  const slices = useMemo(
    () =>
      config.holdings
        .map((holding, i) => ({
          name: tickerOf(holding.symbol),
          value: (mids[holding.symbol] ?? 0) * holding.amount,
          color:
            CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
        }))
        .filter((slice) => slice.value > 0)
        .sort((a, b) => b.value - a.value),
    [config.holdings, mids],
  );

  const total = slices.reduce((sum, slice) => sum + slice.value, 0);

  if (isLoading)
    return <FrameStatus loading>loading allocation...</FrameStatus>;
  if (slices.length === 0) return <FrameStatus>no live prices yet</FrameStatus>;

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
          <span className="caption text-soft">total</span>
          <span className="font-dmsans text-strong text-3xl font-bold tabular-nums">
            {formatUsd(total)}
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
              {((slice.value / total) * 100).toFixed(1)}%
            </span>
            <span className="caption text-soft tabular-nums">
              {formatUsd(slice.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const allocationFrame = defineFrame({
  ...allocationMeta,
  component: Allocation,
});
