import {
  CHART_COLORS_MULTI_SERIES,
  ChartTimeframe,
  MultiSeriesLineChart,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useFundingHistory } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { formatFundingPct } from "./format";
import { fundingRateChartMeta } from "./schemas";
import { FrameStatus } from "./ui";

const LOOKBACKS = {
  "24h": { ms: 24 * 60 * 60 * 1000, timeframe: ChartTimeframe["24h"] },
  "7D": { ms: 7 * 24 * 60 * 60 * 1000, timeframe: ChartTimeframe["7D"] },
  "1M": { ms: 30 * 24 * 60 * 60 * 1000, timeframe: ChartTimeframe["1M"] },
} as const;

const schema = fundingRateChartMeta.schema;

function FundingRateChart({ config }: { config: z.output<typeof schema> }) {
  const { ms, timeframe } = LOOKBACKS[config.lookback];
  // Stable start time: recompute only when the lookback changes, so the
  // useFundingHistory effect doesn't re-run every render.
  const startTimeMs = useMemo(() => Date.now() - ms, [ms]);
  const { history, isLoading } = useFundingHistory(config.symbols, startTimeMs);

  const series: MultiSeriesData[] = useMemo(
    () =>
      config.symbols.map((symbol, i) => ({
        id: symbol,
        name: tickerOf(symbol),
        color: CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
        data: (history[symbol] ?? []).map((point) => ({
          date: new Date(point.time).toISOString(),
          // hourly funding rate as a percentage
          value: point.fundingRate * 100,
        })),
      })),
    [config.symbols, history],
  );

  if (isLoading)
    return <FrameStatus loading>loading funding rates…</FrameStatus>;
  if (series.every((s) => s.data.length === 0))
    return <FrameStatus>no funding data yet</FrameStatus>;

  return (
    <MultiSeriesLineChart
      series={series}
      timeframe={timeframe}
      height={250}
      formatValue={formatFundingPct}
    />
  );
}

export const fundingRateChartFrame = defineFrame({
  ...fundingRateChartMeta,
  component: FundingRateChart,
});
