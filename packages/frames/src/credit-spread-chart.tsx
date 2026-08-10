import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useCreditSpreads } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import {
  downsample,
  sliceYears,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { formatSeriesChange } from "./official-series-shared";
import { creditSpreadChartMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = creditSpreadChartMeta.schema;

/**
 * Which published series backs each grade the schema offers. The provider
 * returns high-yield first, but matching on the series id rather than position
 * means a re-ordered provider can't silently mislabel the lines.
 */
const GRADE_SERIES: Record<string, string> = {
  "high-yield": "BAMLH0A0HYM2",
  "investment-grade": "BAMLC0A0CM",
};

/** Short legend labels — the provider's full names are too long for a chart pill. */
const GRADE_LABEL: Record<string, string> = {
  BAMLH0A0HYM2: "High Yield",
  BAMLC0A0CM: "Investment Grade",
};

const formatSpread = (value: number) => formatPct(value);

function CreditSpreadChart({ config }: { config: z.output<typeof schema> }) {
  const { spreads, isLoading } = useCreditSpreads();

  const wanted = useMemo(() => {
    const ids = config.grades.map((grade) => GRADE_SERIES[grade]);
    return spreads.filter((series) => ids.includes(series.seriesId));
  }, [spreads, config.grades]);

  const series: MultiSeriesData[] = useMemo(
    () =>
      wanted
        .map((official, i) => ({
          official,
          points: downsample(sliceYears(official.points, config.years)),
          i,
        }))
        .filter(({ points }) => points.length >= 2)
        .map(({ official, points, i }) => ({
          id: official.seriesId,
          name: GRADE_LABEL[official.seriesId] ?? official.label,
          color:
            CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
          data: toChartData(points),
        })),
    [wanted, config.years],
  );

  if (isLoading && spreads.length === 0)
    return <FrameStatus loading>loading credit spreads…</FrameStatus>;
  if (series.length === 0)
    return <FrameStatus>no spread history yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-start justify-between gap-3">
        {wanted.map((official) => (
          <div key={official.seriesId} className="min-w-0">
            <div className="caption text-soft truncate uppercase">
              {GRADE_LABEL[official.seriesId] ?? official.label}
            </div>
            <div className="metric-sm text-strong tabular-nums">
              {formatPct(official.latest)}
              <span className="caption text-soft ml-1.5">
                {formatSeriesChange(official.change, "percent")}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        <TimeSeriesChart
          series={series}
          timeframe={timeframeFor(config.years)}
          fill
          formatValue={formatSpread}
        />
      </div>
      <div className="caption text-soft text-center">
        option-adjusted spread over Treasuries · wider = more default risk
        priced
      </div>
    </div>
  );
}

export const creditSpreadChartFrame = defineFrame({
  ...creditSpreadChartMeta,
  component: CreditSpreadChart,
});
