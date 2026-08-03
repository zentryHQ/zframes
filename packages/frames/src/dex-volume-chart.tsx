import {
  CHART_COLORS_MULTI_SERIES,
  ChartTimeframe,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useDexVolumeHistory, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { prettySlug } from "./format";
import { dexVolumeChartMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";

const LOOKBACKS = {
  "7D": { ms: 7 * 24 * 60 * 60 * 1000, timeframe: ChartTimeframe["7D"] },
  "1M": { ms: 30 * 24 * 60 * 60 * 1000, timeframe: ChartTimeframe["1M"] },
  "3M": { ms: 90 * 24 * 60 * 60 * 1000, timeframe: ChartTimeframe["3M"] },
} as const;

const schema = dexVolumeChartMeta.schema;

const LOOKBACK_OPTIONS = ["7D", "1M", "3M"] as const;

function DexVolumeChart({ config }: { config: z.output<typeof schema> }) {
  const [lookback, setLookback] = useFrameChoice("lookback", config.lookback);
  const { ms, timeframe } = LOOKBACKS[lookback];
  // History is fetched in full once; the lookback only slices it client-side.
  const cutoff = useMemo(() => Date.now() - ms, [ms]);
  const { history, isLoading } = useDexVolumeHistory(config.protocols);
  const money = useMoney();

  const series: MultiSeriesData[] = useMemo(
    () =>
      config.protocols.map((slug, i) => ({
        id: slug,
        name: prettySlug(slug),
        color: CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
        data: (history[slug] ?? [])
          .filter((point) => point.time >= cutoff)
          .map((point) => ({
            date: new Date(point.time).toISOString(),
            value: point.value,
          })),
      })),
    [config.protocols, history, cutoff],
  );

  if (isLoading) return <FrameStatus loading>loading DEX volume…</FrameStatus>;
  if (series.every((s) => s.data.length === 0))
    return <FrameStatus>no DEX volume data yet</FrameStatus>;

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
          label="DEX volume history window"
        />
      }
    />
  );
}

export const dexVolumeChartFrame = defineFrame({
  ...dexVolumeChartMeta,
  component: DexVolumeChart,
});
