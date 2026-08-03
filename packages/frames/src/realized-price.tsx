import {
  CHART_COLORS_MULTI_SERIES,
  ChartTimeframe,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useMoney, useOnchainValuation } from "@zframes/core";
import { useMemo } from "react";
import type { SeriesPoint } from "@zframes/spec";
import type { z } from "zod";
import { tail, windowDays } from "./indicators";
import { realizedPriceMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";

const schema = realizedPriceMeta.schema;

const WINDOW_OPTIONS = ["1Y", "2Y", "4Y", "all"] as const;

const toDataPoints = (s: SeriesPoint[]) =>
  s.map((p) => ({ date: new Date(p.time).toISOString(), value: p.value }));

function RealizedPrice({ config }: { config: z.output<typeof schema> }) {
  const { valuation, isLoading } = useOnchainValuation();
  const money = useMoney();
  const [chartWindow, setChartWindow] = useFrameChoice("window", config.window);

  const series: MultiSeriesData[] = useMemo(() => {
    if (!valuation) return [];
    const n = windowDays(chartWindow);
    return [
      {
        id: "price",
        name: "Market Price",
        color: CHART_COLORS_MULTI_SERIES[0],
        data: toDataPoints(tail(valuation.history.price, n)),
      },
      {
        id: "realized",
        name: "Realized Price",
        color: CHART_COLORS_MULTI_SERIES[1],
        data: toDataPoints(tail(valuation.history.realizedPrice, n)),
      },
    ];
  }, [valuation, chartWindow]);

  if (isLoading)
    return <FrameStatus loading>loading realized price…</FrameStatus>;
  if (!valuation || series.every((s) => s.data.length === 0))
    return <FrameStatus>no on-chain data yet</FrameStatus>;

  return (
    <TimeSeriesChart
      series={series}
      timeframe={ChartTimeframe.YTD}
      height={220}
      formatValue={money.compact}
      control={
        <TimeframeToggle
          options={WINDOW_OPTIONS}
          value={chartWindow}
          onChange={setChartWindow}
          label="realized price history window"
        />
      }
    />
  );
}

export const realizedPriceFrame = defineFrame({
  ...realizedPriceMeta,
  component: RealizedPrice,
});
