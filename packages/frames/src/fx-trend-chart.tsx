import {
  CHART_COLORS_MULTI_SERIES,
  ChartTimeframe,
  MultiSeriesLineChart,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useFxRates } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatChangePct } from "./format";
import { fxTrendChartMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = fxTrendChartMeta.schema;

function FxTrendChart({ config }: { config: z.output<typeof schema> }) {
  const { rates, isLoading } = useFxRates(config.base, config.symbols);

  const series: MultiSeriesData[] = useMemo(
    () =>
      rates
        .filter((fx) => fx.history.length > 0)
        .map((fx, i) => {
          // Index every line to 0% at the window start so currencies with
          // wildly different magnitudes (JPY ~150 vs CHF ~0.9) compare on one
          // axis, matching the "cumulative return" convention.
          const start = fx.history[0].value;
          return {
            id: fx.symbol,
            name: fx.symbol,
            color:
              CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
            data: fx.history.map((p) => ({
              date: new Date(p.time).toISOString(),
              value: start > 0 ? ((p.value - start) / start) * 100 : 0,
            })),
          };
        }),
    [rates],
  );

  if (isLoading) return <FrameStatus loading>loading FX trends…</FrameStatus>;
  if (series.length === 0) return <FrameStatus>no FX data yet</FrameStatus>;

  return (
    <MultiSeriesLineChart
      series={series}
      timeframe={ChartTimeframe["1M"]}
      height={220}
      formatValue={formatChangePct}
    />
  );
}

export const fxTrendChartFrame = defineFrame({
  ...fxTrendChartMeta,
  component: FxTrendChart,
});
