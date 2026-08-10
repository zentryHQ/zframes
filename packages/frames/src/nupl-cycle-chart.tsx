import {
  CHART_COLORS_MULTI_SERIES,
  ChartTimeframe,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useOnchainValuation } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import { tail, windowDays } from "./indicators";
import { nuplCycleChartMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";

const schema = nuplCycleChartMeta.schema;

function formatNupl(v: number) {
  return formatPct(v, 1);
}

const WINDOW_OPTIONS = ["1Y", "2Y", "4Y", "all"] as const;

function NuplCycleChart({ config }: { config: z.output<typeof schema> }) {
  const [chartWindow, setChartWindow] = useFrameChoice("window", config.window);
  const { valuation, isLoading } = useOnchainValuation();

  const series: MultiSeriesData[] = useMemo(() => {
    if (!valuation) return [];
    const n = windowDays(chartWindow);
    return [
      {
        id: "nupl",
        name: "NUPL",
        color: CHART_COLORS_MULTI_SERIES[0],
        data: tail(valuation.history.nupl, n).map((p) => ({
          date: new Date(p.time).toISOString(),
          // Fraction (−1…1) → percent, matching the NUPL gauge's own readout.
          value: p.value * 100,
        })),
      },
    ];
  }, [valuation, chartWindow]);

  if (isLoading) return <FrameStatus loading>loading NUPL…</FrameStatus>;
  if (!valuation || series.every((s) => s.data.length === 0))
    return <FrameStatus>no on-chain data yet</FrameStatus>;

  return (
    <TimeSeriesChart
      series={series}
      timeframe={ChartTimeframe.YTD}
      fill
      formatValue={formatNupl}
      control={
        <TimeframeToggle
          options={WINDOW_OPTIONS}
          value={chartWindow}
          onChange={setChartWindow}
          label="NUPL history window"
        />
      }
    />
  );
}

export const nuplCycleChartFrame = defineFrame({
  ...nuplCycleChartMeta,
  component: NuplCycleChart,
});
