import { type MultiSeriesData } from "@zframes/charts";
import { defineFrame, useIndexSeries } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR_HEX, formatChangePct } from "./format";
import {
  allTimeHigh,
  downsample,
  drawdownSeries,
  sliceYears,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { indexDrawdownMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = indexDrawdownMeta.schema;

function IndexDrawdown({ config }: { config: z.output<typeof schema> }) {
  const { series: official, isLoading } = useIndexSeries(config.series);

  const windowed = useMemo(
    () => sliceYears(official?.points ?? [], config.years),
    [official, config.years],
  );

  // Window FIRST, then measure the peak — so the curve answers "below the high
  // of this window", which is what the chart can actually show. Running the
  // drawdown over the full history and then slicing would open mid-curve at an
  // unexplained −40%.
  const drawdown = useMemo(() => drawdownSeries(windowed), [windowed]);

  const series: MultiSeriesData[] = useMemo(() => {
    const thinned = downsample(drawdown);
    if (thinned.length < 2) return [];
    return [
      {
        id: config.series,
        name: "Drawdown",
        // Underwater is always a loss, so the semantic down colour is right
        // here rather than a rotating chart palette entry.
        color: DOWN_COLOR_HEX,
        data: toChartData(thinned),
      },
    ];
  }, [drawdown, config.series]);

  const peak = useMemo(() => allTimeHigh(windowed), [windowed]);
  const trough = useMemo(
    () => drawdown.reduce((worst, p) => (p.value < worst ? p.value : worst), 0),
    [drawdown],
  );

  if (isLoading && !official)
    return <FrameStatus loading>loading index history…</FrameStatus>;
  if (!official || series.length === 0)
    return <FrameStatus>no index history yet</FrameStatus>;

  const current = drawdown[drawdown.length - 1]?.value ?? 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="caption text-soft truncate uppercase">
            {official.label} · below high
          </div>
          <div className="body-sm text-normal">
            worst in window {formatChangePct(trough)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className="metric-md leading-none tabular-nums"
            // At a new high the drawdown is exactly 0 — that's a good state, so
            // it must not read as a loss.
            style={current < 0 ? { color: DOWN_COLOR_HEX } : undefined}
          >
            {formatChangePct(current)}
          </div>
          {peak !== null && (
            <div className="caption text-soft">
              high {new Date(peak.time).toISOString().slice(0, 10)}
            </div>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <TimeSeriesChart
          series={series}
          timeframe={timeframeFor(config.years)}
          fill
          formatValue={formatChangePct}
        />
      </div>
    </div>
  );
}

export const indexDrawdownFrame = defineFrame({
  ...indexDrawdownMeta,
  component: IndexDrawdown,
});
