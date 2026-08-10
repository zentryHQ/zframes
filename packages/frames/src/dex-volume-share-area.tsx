import { CHART_COLORS_MULTI_SERIES, StackedAreaChart } from "@zframes/charts";
import { defineFrame, useDexVolumeHistory, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { prettySlug } from "./format";
import { dexVolumeShareAreaMeta } from "./schemas";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus } from "./ui";

const LOOKBACKS = {
  "7D": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
  "3M": 90 * 24 * 60 * 60 * 1000,
} as const;

const schema = dexVolumeShareAreaMeta.schema;

const LOOKBACK_OPTIONS = ["7D", "1M", "3M"] as const;

function formatMonthDay(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function DexVolumeShareArea({ config }: { config: z.output<typeof schema> }) {
  const [lookback, setLookback] = useFrameChoice("lookback", config.lookback);
  // History is fetched in full once; the lookback only slices it client-side.
  const cutoff = useMemo(() => Date.now() - LOOKBACKS[lookback], [lookback]);
  const { history, isLoading } = useDexVolumeHistory(config.protocols);
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

  if (isLoading) return <FrameStatus loading>loading DEX volume…</FrameStatus>;
  if (series.every((s) => s.data.length === 0))
    return <FrameStatus>no DEX volume data yet</FrameStatus>;

  return (
    <div className="relative h-full min-h-0">
      <StackedAreaChart
        series={series}
        fill
        formatXAxis={formatMonthDay}
        formatYAxis={money.compact}
        formatValue={money.compact}
      />
      {/* No header row to place the control in — overlaid top-right rather
          than stacked above, which would steal height from the chart. */}
      <div className="pointer-events-none absolute top-0 right-0 z-10">
        <div className="pointer-events-auto">
          <TimeframeToggle
            options={LOOKBACK_OPTIONS}
            value={lookback}
            onChange={setLookback}
            label="DEX volume share lookback"
          />
        </div>
      </div>
    </div>
  );
}

export const dexVolumeShareAreaFrame = defineFrame({
  ...dexVolumeShareAreaMeta,
  component: DexVolumeShareArea,
});
