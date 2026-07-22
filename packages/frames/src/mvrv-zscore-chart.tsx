import {
  CHART_COLORS_MULTI_SERIES,
  ChartTimeframe,
  MultiSeriesLineChart,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useOnchainValuation } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tail, toSparkline, windowDays } from "./indicators";
import { mvrvZscoreChartMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = mvrvZscoreChartMeta.schema;

function MvrvZscoreChart({ config }: { config: z.output<typeof schema> }) {
  const { valuation, isLoading } = useOnchainValuation();

  const series: MultiSeriesData[] = useMemo(() => {
    if (!valuation) return [];
    const n = windowDays(config.window);
    return [
      {
        id: "mvrv-zscore",
        name: "MVRV Z-Score",
        color: CHART_COLORS_MULTI_SERIES[0],
        data: toSparkline(tail(valuation.history.mvrvZScore, n)),
      },
    ];
  }, [valuation, config.window]);

  if (isLoading)
    return <FrameStatus loading>loading MVRV Z-Score…</FrameStatus>;
  if (!valuation || series.every((s) => s.data.length === 0))
    return <FrameStatus>no on-chain data yet</FrameStatus>;

  return (
    <MultiSeriesLineChart
      series={series}
      timeframe={ChartTimeframe.YTD}
      height={220}
      formatValue={(v) => v.toFixed(2)}
    />
  );
}

export const mvrvZscoreChartFrame = defineFrame({
  ...mvrvZscoreChartMeta,
  component: MvrvZscoreChart,
});
