import { type MultiSeriesData } from "@zframes/charts";
import { defineFrame, useMetalHistory, type SeriesPoint } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, DOWN_COLOR, DOWN_COLOR_HEX, formatPct } from "./format";
import {
  downsample,
  drawdownSeries,
  metalName,
  sliceYears,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { metalDrawdownMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = metalDrawdownMeta.schema;

/** Stable reference (not an inline arrow) so the chart's D3 draw effect doesn't
 *  re-run on every render. */
const formatDrawdownValue = (value: number) => formatPct(value, 0);

const formatMonth = (time: number) =>
  new Date(time).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
  });

function MetalDrawdown({ config }: { config: z.output<typeof schema> }) {
  const { histories, isLoading } = useMetalHistory([config.symbol]);
  const points = histories[0]?.points;

  const { series, current, worst } = useMemo(() => {
    // Drawdown is measured from the RUNNING all-time high, so the FULL history
    // is walked first and only then windowed — slicing first would measure the
    // distance from the window's own high, which isn't a drawdown at all.
    const windowed = sliceYears(drawdownSeries(points ?? []), config.years);
    let worstPoint: SeriesPoint | null = null;
    for (const p of windowed)
      if (!worstPoint || p.value < worstPoint.value) worstPoint = p;
    const data = toChartData(downsample(windowed));
    return {
      series:
        data.length > 0
          ? ([
              {
                id: "drawdown",
                name: `${metalName(config.symbol)} drawdown`,
                // D3 draws the path via .attr(), which can't resolve a CSS var.
                color: DOWN_COLOR_HEX,
                data,
              },
            ] satisfies MultiSeriesData[])
          : [],
      current: windowed.at(-1)?.value ?? 0,
      worst: worstPoint,
    };
  }, [points, config.symbol, config.years]);

  if (isLoading && series.length === 0)
    return <FrameStatus loading>loading fix history…</FrameStatus>;
  if (series.length === 0) return <FrameStatus>no fix history yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="caption text-soft uppercase">below record</div>
          <div
            className="metric-lg leading-none"
            style={{ color: changeColor(current) }}
          >
            {formatPct(current, 1)}
          </div>
        </div>
        {worst && (
          <div className="shrink-0 text-right">
            <div className="caption text-soft uppercase">
              worst · {config.years}y
            </div>
            <div className="metric-sm" style={{ color: DOWN_COLOR }}>
              {formatPct(worst.value, 1)}
            </div>
            <div className="caption text-soft">{formatMonth(worst.time)}</div>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1">
        <TimeSeriesChart
          series={series}
          timeframe={timeframeFor(config.years)}
          fill
          formatValue={formatDrawdownValue}
        />
      </div>
    </div>
  );
}

export const metalDrawdownFrame = defineFrame({
  ...metalDrawdownMeta,
  component: MetalDrawdown,
});
