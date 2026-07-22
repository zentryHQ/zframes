import { CHART_COLORS_MULTI_SERIES, StackedAreaChart } from "@zframes/charts";
import { defineFrame, useDexVolumeHistory } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompactUsd, prettySlug } from "./format";
import { dexVolumeShareAreaMeta } from "./schemas";
import { FrameStatus } from "./ui";

const LOOKBACKS = {
  "7D": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
  "3M": 90 * 24 * 60 * 60 * 1000,
} as const;

const schema = dexVolumeShareAreaMeta.schema;

function formatMonthDay(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function DexVolumeShareArea({ config }: { config: z.output<typeof schema> }) {
  // History is fetched in full once; the lookback only slices it client-side.
  const cutoff = useMemo(
    () => Date.now() - LOOKBACKS[config.lookback],
    [config.lookback],
  );
  const { history, isLoading } = useDexVolumeHistory(config.protocols);

  const series = useMemo(
    () =>
      config.protocols.map((slug, i) => ({
        id: slug,
        name: prettySlug(slug),
        color: CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
        data: (history[slug] ?? [])
          .filter((point) => point.time >= cutoff)
          .map((point) => ({ date: new Date(point.time), value: point.value })),
      })),
    [config.protocols, history, cutoff],
  );

  if (isLoading) return <FrameStatus loading>loading DEX volume…</FrameStatus>;
  if (series.every((s) => s.data.length === 0))
    return <FrameStatus>no DEX volume data yet</FrameStatus>;

  return (
    <StackedAreaChart
      series={series}
      height={240}
      formatXAxis={formatMonthDay}
      formatYAxis={formatCompactUsd}
      formatValue={formatCompactUsd}
    />
  );
}

export const dexVolumeShareAreaFrame = defineFrame({
  ...dexVolumeShareAreaMeta,
  component: DexVolumeShareArea,
});
