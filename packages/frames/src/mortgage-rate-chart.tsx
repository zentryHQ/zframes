import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useMortgageRates } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import {
  downsample,
  sliceYears,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { SeriesHeader } from "./official-series-shared";
import { mortgageRateChartMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = mortgageRateChartMeta.schema;

const formatRatePct = (value: number) => formatPct(value);

function MortgageRateChart({ config }: { config: z.output<typeof schema> }) {
  const { series: official, isLoading } = useMortgageRates();

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

  if (isLoading && !official)
    return <FrameStatus loading>loading mortgage rates…</FrameStatus>;
  if (!official || series.length === 0)
    return <FrameStatus>no mortgage-rate history yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <SeriesHeader series={official} />
      <div className="min-h-0 flex-1">
        <TimeSeriesChart
          series={series}
          timeframe={timeframeFor(config.years)}
          fill
          formatValue={formatRatePct}
        />
      </div>
    </div>
  );
}

export const mortgageRateChartFrame = defineFrame({
  ...mortgageRateChartMeta,
  component: MortgageRateChart,
});
