import {
  CHART_COLORS_MULTI_SERIES,
  ChartTimeframe,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useEtfFlows, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { etfFlowsChartMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";

const LOOKBACKS = {
  "1M": { ms: 30 * 86_400_000, timeframe: ChartTimeframe["1M"] },
  "3M": { ms: 90 * 86_400_000, timeframe: ChartTimeframe["3M"] },
  "6M": { ms: 180 * 86_400_000, timeframe: ChartTimeframe.YTD },
} as const;

const LOOKBACK_OPTIONS = ["1M", "3M", "6M"] as const;

const schema = etfFlowsChartMeta.schema;

function EtfFlowsChart({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  const [lookback, setLookback] = useFrameChoice("lookback", config.lookback);
  const { ms, timeframe } = LOOKBACKS[lookback];
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
    <TimeSeriesChart
      series={series}
      timeframe={timeframe}
      fill
      formatValue={money.compact}
      control={
        <TimeframeToggle
          options={LOOKBACK_OPTIONS}
          value={lookback}
          onChange={setLookback}
          label="ETF flows history window"
        />
      }
    />
  );
}

export const etfFlowsChartFrame = defineFrame({
  ...etfFlowsChartMeta,
  component: EtfFlowsChart,
});
