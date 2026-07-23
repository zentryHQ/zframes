import {
  CHART_COLORS_MULTI_SERIES,
  ChartTimeframe,
  MultiSeriesLineChart,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useEtfFlows } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompactUsd } from "./format";
import { etfFlowsChartMeta } from "./schemas";
import { FrameStatus } from "./ui";

const LOOKBACKS = {
  "1M": { ms: 30 * 86_400_000, timeframe: ChartTimeframe["1M"] },
  "3M": { ms: 90 * 86_400_000, timeframe: ChartTimeframe["3M"] },
  "6M": { ms: 180 * 86_400_000, timeframe: ChartTimeframe.YTD },
} as const;

const schema = etfFlowsChartMeta.schema;

function EtfFlowsChart({ config }: { config: z.output<typeof schema> }) {
  const { ms, timeframe } = LOOKBACKS[config.lookback];
  const cutoff = useMemo(() => Date.now() - ms, [ms]);
  const { flows, isLoading } = useEtfFlows(config.asset);

  const series: MultiSeriesData[] = useMemo(
    () => [
      {
        id: config.asset,
        name: `${config.asset.toUpperCase()} net flow`,
        color: CHART_COLORS_MULTI_SERIES[0],
        data: (flows?.history ?? [])
          .filter((p) => p.time >= cutoff)
          .map((p) => ({
            date: new Date(p.time).toISOString(),
            value: p.value,
          })),
      },
    ],
    [flows, config.asset, cutoff],
  );

  if (isLoading) return <FrameStatus loading>loading ETF flows…</FrameStatus>;
  if (series[0].data.length === 0)
    return <FrameStatus>ETF flows unavailable</FrameStatus>;

  return (
    <MultiSeriesLineChart
      series={series}
      timeframe={timeframe}
      height={220}
      formatValue={formatCompactUsd}
    />
  );
}

export const etfFlowsChartFrame = defineFrame({
  ...etfFlowsChartMeta,
  component: EtfFlowsChart,
});
