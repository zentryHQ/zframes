import { CHART_COLORS_MULTI_SERIES, StackedAreaChart } from "@zframes/charts";
import { defineFrame, useMoney, useProtocolTvlHistory } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { prettySlug } from "./format";
import { protocolTvlShareAreaMeta } from "./schemas";
import { FrameStatus } from "./ui";

const LOOKBACKS = {
  "7D": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
  "3M": 90 * 24 * 60 * 60 * 1000,
} as const;

const schema = protocolTvlShareAreaMeta.schema;

function formatMonthDay(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ProtocolTvlShareArea({ config }: { config: z.output<typeof schema> }) {
  // History is fetched in full once; the lookback only slices it client-side.
  const cutoff = useMemo(
    () => Date.now() - LOOKBACKS[config.lookback],
    [config.lookback],
  );
  const { history, isLoading } = useProtocolTvlHistory(config.protocols);
  const money = useMoney();

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

  if (isLoading)
    return <FrameStatus loading>loading protocol TVL…</FrameStatus>;
  if (series.every((s) => s.data.length === 0))
    return <FrameStatus>no protocol TVL data yet</FrameStatus>;

  return (
    <StackedAreaChart
      series={series}
      height={240}
      formatXAxis={formatMonthDay}
      formatYAxis={money.compact}
      formatValue={money.compact}
    />
  );
}

export const protocolTvlShareAreaFrame = defineFrame({
  ...protocolTvlShareAreaMeta,
  component: ProtocolTvlShareArea,
});
