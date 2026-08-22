import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useHousingPriceIndex } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { formatChangePct, formatLevel } from "./format";
import {
  downsample,
  sliceYears,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { SeriesHeader } from "./official-series-shared";
import { homePriceIndexMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = homePriceIndexMeta.schema;

/** Monthly series, so a year back is exactly twelve prints. */
const MONTHS_PER_YEAR = 12;

const formatIndex = (value: number) => formatLevel(value);

function HomePriceIndex({ config }: { config: z.output<typeof schema> }) {
  const { series: official, isLoading } = useHousingPriceIndex();

  const series: MultiSeriesData[] = useMemo(() => {
    if (!official) return [];
    const windowed = downsample(sliceYears(official.points, config.years));
    if (windowed.length < 2) return [];
    return [
      {
        id: official.seriesId,
        name: official.label,
        color: CHART_COLORS_MULTI_SERIES[0],
        data: toChartData(windowed),
      },
    ];
  }, [official, config.years]);

  /** Year-over-year from the index itself — the number housing is judged on. */
  const yoy = useMemo(() => {
    const points = official?.points;
    if (!points || points.length <= MONTHS_PER_YEAR) return null;
    const latest = points[points.length - 1].value;
    const yearAgo = points[points.length - 1 - MONTHS_PER_YEAR].value;
    if (yearAgo <= 0) return null;
    return ((latest - yearAgo) / yearAgo) * 100;
  }, [official]);

  if (isLoading && !official)
    return <FrameStatus loading>loading home-price index…</FrameStatus>;
  if (!official || series.length === 0)
    return <FrameStatus>no home-price history yet</FrameStatus>;

  return (
    <ChartCard gap={2}>
      <SeriesHeader
        series={official}
        note={
          config.showYoY && yoy !== null
            ? `${formatChangePct(yoy)} y/y`
            : undefined
        }
      />
      <ChartCard.Body>
        <TimeSeriesChart
          series={series}
          timeframe={timeframeFor(config.years)}
          fill
          formatValue={formatIndex}
        />
      </ChartCard.Body>
      <ChartCard.Caption>
        Case-Shiller national index · January 2000 = 100
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const homePriceIndexFrame = defineFrame({
  ...homePriceIndexMeta,
  component: HomePriceIndex,
});
