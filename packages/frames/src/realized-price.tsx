import {
  CHART_COLORS_MULTI_SERIES,
  ChartTimeframe,
  MultiSeriesLineChart,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useOnchainValuation } from "@zframes/core";
import { useMemo } from "react";
import type { SeriesPoint } from "@zframes/spec";
import type { z } from "zod";
import { formatCompactUsd } from "./format";
import { tail, windowDays } from "./indicators";
import { realizedPriceMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = realizedPriceMeta.schema;

const toDataPoints = (s: SeriesPoint[]) =>
  s.map((p) => ({ date: new Date(p.time).toISOString(), value: p.value }));

function RealizedPrice({ config }: { config: z.output<typeof schema> }) {
  const { valuation, isLoading } = useOnchainValuation();

  const series: MultiSeriesData[] = useMemo(() => {
    if (!valuation) return [];
    const n = windowDays(config.window);
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
  }, [valuation, config.window]);

  if (isLoading)
    return <FrameStatus loading>loading realized price…</FrameStatus>;
  if (!valuation || series.every((s) => s.data.length === 0))
    return <FrameStatus>no on-chain data yet</FrameStatus>;

  return (
    <MultiSeriesLineChart
      series={series}
      timeframe={ChartTimeframe.YTD}
      height={220}
      formatValue={formatCompactUsd}
    />
  );
}

export const realizedPriceFrame = defineFrame({
  ...realizedPriceMeta,
  component: RealizedPrice,
});
