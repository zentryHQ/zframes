import { CHART_COLORS_MULTI_SERIES, StackedAreaChart } from "@zframes/charts";
import { defineFrame, useMoney, useProtocolTvlHistory } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { prettySlug } from "./format";
import { protocolTvlShareAreaMeta } from "./schemas";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus } from "./ui";

const LOOKBACKS = {
  "7D": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
  "3M": 90 * 24 * 60 * 60 * 1000,
} as const;

const LOOKBACK_OPTIONS = ["7D", "1M", "3M"] as const;

const schema = protocolTvlShareAreaMeta.schema;

function formatMonthDay(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ProtocolTvlShareArea({ config }: { config: z.output<typeof schema> }) {
  const [lookback, setLookback] = useFrameChoice("lookback", config.lookback);
  // History is fetched in full once; the lookback only slices it client-side.
  const cutoff = useMemo(() => Date.now() - LOOKBACKS[lookback], [lookback]);
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
    // No existing header row to slot the toggle into — overlay it top-right
    // rather than adding a row that would shrink the chart.
    <div className="relative h-full">
      <TimeframeToggle
        options={LOOKBACK_OPTIONS}
        value={lookback}
        onChange={setLookback}
        label="protocol TVL lookback"
        className="absolute top-0 right-0 z-10"
      />
      <StackedAreaChart
        series={series}
        fill
        formatXAxis={formatMonthDay}
        formatYAxis={money.compact}
        formatValue={money.compact}
      />
    </div>
  );
}

export const protocolTvlShareAreaFrame = defineFrame({
  ...protocolTvlShareAreaMeta,
  component: ProtocolTvlShareArea,
  // StackedAreaChart draws no legend, so the compared protocols must be named
  // in the title — identity first so truncation trims the tail, not the names.
  titleContent: ({ config }) => (
    <>{config.protocols.map(prettySlug).join(" / ")} · TVL Share</>
  ),
});
