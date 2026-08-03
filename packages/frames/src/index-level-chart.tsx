import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useIndexSeries } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatLevel } from "./format";
// Generic series maths that happens to live in the metals module: windowing and
// thinning are the same arithmetic for a fix history and an index level.
import {
  downsample,
  sliceYears,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { SeriesHeader } from "./official-series-shared";
import { indexLevelChartMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = indexLevelChartMeta.schema;

/** Stable references so the chart's D3 effect doesn't redraw every render. */
const formatIndexValue = (value: number) => formatLevel(value);
const formatLogIndexValue = (value: number) => formatLevel(10 ** value);

function IndexLevelChart({ config }: { config: z.output<typeof schema> }) {
  const { series: official, isLoading } = useIndexSeries(config.series);

  const series: MultiSeriesData[] = useMemo(() => {
    if (!official) return [];
    const windowed = downsample(sliceYears(official.points, config.years));
    // No log axis in the chart layer, so plot log10(level) and format the ticks
    // back through 10**v — the same approach the metals price chart takes.
    const plotted = config.logScale
      ? windowed
          .filter((p) => p.value > 0)
          .map((p) => ({
            time: p.time,
            value: Math.log10(p.value),
          }))
      : windowed;
    // A single point draws no path — that's an empty shell, not a chart.
    if (plotted.length < 2) return [];
    return [
      {
        id: official.seriesId,
        name: official.label,
        color: CHART_COLORS_MULTI_SERIES[0],
        data: toChartData(plotted),
      },
    ];
  }, [official, config.years, config.logScale]);

  if (isLoading && !official)
    return <FrameStatus loading>loading index history…</FrameStatus>;
  if (!official || series.length === 0)
    return <FrameStatus>no index history yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <SeriesHeader series={official} />
      <TimeSeriesChart
        series={series}
        timeframe={timeframeFor(config.years)}
        height={200}
        formatValue={config.logScale ? formatLogIndexValue : formatIndexValue}
      />
    </div>
  );
}

export const indexLevelChartFrame = defineFrame({
  ...indexLevelChartMeta,
  component: IndexLevelChart,
});
