import {
  CHART_COLORS_MULTI_SERIES,
  ChartTimeframe,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useOnchainValuation } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tail, toSparkline, windowDays } from "./indicators";
import { mvrvZscoreChartMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";

const schema = mvrvZscoreChartMeta.schema;

function formatZscore(v: number) {
  return v.toFixed(2);
}

const WINDOW_OPTIONS = ["1Y", "2Y", "4Y", "all"] as const;

function MvrvZscoreChart({ config }: { config: z.output<typeof schema> }) {
  const [chartWindow, setChartWindow] = useFrameChoice("window", config.window);
  const { valuation, isLoading } = useOnchainValuation();

  const series: MultiSeriesData[] = useMemo(() => {
    if (!valuation) return [];
    const n = windowDays(chartWindow);
    return [
      {
        id: "mvrv-zscore",
        name: "MVRV Z-Score",
        color: CHART_COLORS_MULTI_SERIES[0],
        data: toSparkline(tail(valuation.history.mvrvZScore, n)),
      },
    ];
  }, [valuation, chartWindow]);

  if (isLoading)
    return <FrameStatus loading>loading MVRV Z-Score…</FrameStatus>;
  if (!valuation || series.every((s) => s.data.length === 0))
    return <FrameStatus>no on-chain data yet</FrameStatus>;

  return (
    <TimeSeriesChart
      series={series}
      timeframe={ChartTimeframe.YTD}
      height={220}
      formatValue={formatZscore}
      control={
        <TimeframeToggle
          options={WINDOW_OPTIONS}
          value={chartWindow}
          onChange={setChartWindow}
          label="MVRV Z-Score history window"
        />
      }
    />
  );
}

export const mvrvZscoreChartFrame = defineFrame({
  ...mvrvZscoreChartMeta,
  component: MvrvZscoreChart,
});
