import {
  CHART_COLORS_MULTI_SERIES,
  ChartTimeframe,
  MultiSeriesLineChart,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useVolatilityIndex } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { optionsVolSpreadMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = optionsVolSpreadMeta.schema;

const LOOKBACKS: Record<
  string,
  { ms: number; res: number; timeframe: ChartTimeframe }
> = {
  "7D": { ms: 7 * 86_400_000, res: 3_600, timeframe: ChartTimeframe["7D"] },
  "1M": { ms: 30 * 86_400_000, res: 43_200, timeframe: ChartTimeframe["1M"] },
  "3M": { ms: 90 * 86_400_000, res: 86_400, timeframe: ChartTimeframe["3M"] },
};

function OptionsVolSpread({ config }: { config: z.output<typeof schema> }) {
  const { ms, res, timeframe } = LOOKBACKS[config.lookback];
  // Snap the window start to its resolution so it's stable across remounts —
  // same reasoning as Implied Volatility: the provider's cache key includes
  // startMs, and a drifting Date.now()-based start would churn a fresh entry
  // each mount.
  const startMs = useMemo(() => {
    const resMs = res * 1000;
    return Math.floor((Date.now() - ms) / resMs) * resMs;
  }, [ms, res]);

  const btc = useVolatilityIndex("BTC", startMs, res);
  const eth = useVolatilityIndex("ETH", startMs, res);

  const series: MultiSeriesData[] = useMemo(
    () =>
      [
        { id: "BTC", name: "BTC DVOL", points: btc.points },
        { id: "ETH", name: "ETH DVOL", points: eth.points },
      ].map((s, i) => ({
        id: s.id,
        name: s.name,
        color: CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
        data: s.points.map((p) => ({
          date: new Date(p.time).toISOString(),
          value: p.value,
        })),
      })),
    [btc.points, eth.points],
  );

  const isLoading = btc.isLoading || eth.isLoading;

  if (isLoading) return <FrameStatus loading>loading volatility…</FrameStatus>;
  if (series.every((s) => s.data.length === 0))
    return <FrameStatus>no volatility data yet</FrameStatus>;

  return (
    <MultiSeriesLineChart
      series={series}
      timeframe={timeframe}
      height={250}
      formatValue={(v) => v.toFixed(1)}
    />
  );
}

export const optionsVolSpreadFrame = defineFrame({
  ...optionsVolSpreadMeta,
  component: OptionsVolSpread,
});
