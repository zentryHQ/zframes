import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useCreditSpreads } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { CardHeader } from "./card-header";
import { ChartCard } from "./chart-card";
import { formatPct } from "./format";
import {
  downsample,
  percentileRank,
  sliceYears,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { formatSeriesChange } from "./official-series-shared";
import { creditQualityGapMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = creditQualityGapMeta.schema;

const HY_SERIES = "BAMLH0A0HYM2";
const IG_SERIES = "BAMLC0A0CM";

const formatGap = (value: number) => formatPct(value);

function CreditQualityGap({ config }: { config: z.output<typeof schema> }) {
  const { spreads, isLoading } = useCreditSpreads();

  /**
   * High-yield minus investment-grade, point by point. The provider fetches both
   * series in ONE request precisely so their date grids are identical — but the
   * grids can still differ where one grade had no print that day, so pair by
   * timestamp rather than by index.
   */
  const gap = useMemo(() => {
    const hy = spreads.find((s) => s.seriesId === HY_SERIES);
    const ig = spreads.find((s) => s.seriesId === IG_SERIES);
    if (!hy || !ig) return [];
    const igByTime = new Map(ig.points.map((p) => [p.time, p.value]));
    return hy.points.flatMap((p) => {
      const igValue = igByTime.get(p.time);
      return igValue === undefined
        ? []
        : [{ time: p.time, value: p.value - igValue }];
    });
  }, [spreads]);

  const windowed = useMemo(
    () => sliceYears(gap, config.years),
    [gap, config.years],
  );

  const series: MultiSeriesData[] = useMemo(() => {
    const thinned = downsample(windowed);
    if (thinned.length < 2) return [];
    return [
      {
        id: "quality-gap",
        name: "HY − IG",
        color: CHART_COLORS_MULTI_SERIES[0],
        data: toChartData(thinned),
      },
    ];
  }, [windowed]);

  const stats = useMemo(() => {
    if (windowed.length === 0) return null;
    const values = windowed.map((p) => p.value);
    const latest = values[values.length - 1];
    const previous = values[values.length - 2] ?? latest;
    return {
      latest,
      change: latest - previous,
      // Where today sits in the window's own range — a spread level means little
      // without knowing whether it is historically tight or wide.
      percentile: percentileRank(values, latest),
      low: Math.min(...values),
      high: Math.max(...values),
    };
  }, [windowed]);

  if (isLoading && spreads.length === 0)
    return <FrameStatus loading>loading credit spreads…</FrameStatus>;
  if (!stats || series.length === 0)
    return <FrameStatus>no spread history yet</FrameStatus>;

  return (
    <ChartCard>
      <CardHeader align="start">
        <CardHeader.Main>
          <CardHeader.Eyebrow>High Yield − Investment Grade</CardHeader.Eyebrow>
          {/* `ink="normal"` and tabular: the percentile is a figure read
              alongside the level, not a quiet unit note. */}
          <CardHeader.Sub ink="normal" className="tabular-nums">
            {stats.percentile.toFixed(0)}th percentile of {config.years}y
          </CardHeader.Sub>
        </CardHeader.Main>
        <CardHeader.Aside>
          {/* `ink="strong"`, same as `SeriesHeader`: this head inverts the
              columns, so the hero lives in the aside and needs the emphasis its
              column default would not give it. */}
          <CardHeader.Value
            size="metric-md"
            ink="strong"
            className="tabular-nums"
          >
            {formatPct(stats.latest)}
          </CardHeader.Value>
          <CardHeader.Sub className="tabular-nums">
            {formatSeriesChange(stats.change, "percent")}
          </CardHeader.Sub>
        </CardHeader.Aside>
      </CardHeader>
      <ChartCard.Body>
        <TimeSeriesChart
          series={series}
          timeframe={timeframeFor(config.years)}
          fill
          formatValue={formatGap}
        />
      </ChartCard.Body>
      <ChartCard.Caption className="tabular-nums">
        window range {formatPct(stats.low)}–{formatPct(stats.high)} · wider =
        less risk appetite
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const creditQualityGapFrame = defineFrame({
  ...creditQualityGapMeta,
  component: CreditQualityGap,
});
