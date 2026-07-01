import {
  CHART_COLORS_MULTI_SERIES,
  ChartTimeframe,
  MultiSeriesLineChart,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useProtocolTvlHistory } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompactUsd, prettySlug } from "./format";
import { protocolTvlChartMeta } from "./schemas";
import { FrameStatus } from "./ui";

const LOOKBACKS = {
  "7D": { ms: 7 * 24 * 60 * 60 * 1000, timeframe: ChartTimeframe["7D"] },
  "1M": { ms: 30 * 24 * 60 * 60 * 1000, timeframe: ChartTimeframe["1M"] },
  "3M": { ms: 90 * 24 * 60 * 60 * 1000, timeframe: ChartTimeframe["3M"] },
} as const;

const schema = protocolTvlChartMeta.schema;

function ProtocolTvlChart({ config }: { config: z.output<typeof schema> }) {
  const { ms, timeframe } = LOOKBACKS[config.lookback];
  // History is fetched in full once; the lookback only slices it client-side.
  const cutoff = useMemo(() => Date.now() - ms, [ms]);
  const { history, isLoading } = useProtocolTvlHistory(config.protocols);

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

  if (isLoading)
    return <FrameStatus loading>loading protocol TVL…</FrameStatus>;
  if (series.every((s) => s.data.length === 0))
    return <FrameStatus>no protocol TVL data yet</FrameStatus>;

  return (
    <MultiSeriesLineChart
      series={series}
      timeframe={timeframe}
      height={250}
      formatValue={formatCompactUsd}
    />
  );
}

export const protocolTvlChartFrame = defineFrame({
  ...protocolTvlChartMeta,
  component: ProtocolTvlChart,
});
