import {
  CHART_COLORS_MULTI_SERIES,
  ChartTimeframe,
  MultiSeriesLineChart,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useOnchainValuation } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import { tail, windowDays } from "./indicators";
import { nuplCycleChartMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = nuplCycleChartMeta.schema;

function NuplCycleChart({ config }: { config: z.output<typeof schema> }) {
  const { valuation, isLoading } = useOnchainValuation();

  const series: MultiSeriesData[] = useMemo(() => {
    if (!valuation) return [];
    const n = windowDays(config.window);
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
  }, [valuation, config.window]);

  if (isLoading) return <FrameStatus loading>loading NUPL…</FrameStatus>;
  if (!valuation || series.every((s) => s.data.length === 0))
    return <FrameStatus>no on-chain data yet</FrameStatus>;

  return (
    <MultiSeriesLineChart
      series={series}
      timeframe={ChartTimeframe.YTD}
      height={220}
      formatValue={(v) => formatPct(v, 1)}
    />
  );
}

export const nuplCycleChartFrame = defineFrame({
  ...nuplCycleChartMeta,
  component: NuplCycleChart,
});
