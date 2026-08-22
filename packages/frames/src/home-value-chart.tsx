import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useHomeValueIndex, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import {
  downsample,
  sliceYears,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { homeValueChartMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = homeValueChartMeta.schema;

function HomeValueChart({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  const regions = useMemo(() => [...config.regions], [config.regions]);
  const { index, isLoading } = useHomeValueIndex(regions);

  const series: MultiSeriesData[] = useMemo(() => {
    const entries = index?.entries ?? [];
    return entries
      .map((entry, i) => ({
        entry,
        points: downsample(sliceYears(entry.points, config.years)),
        i,
      }))
      .filter(({ points }) => points.length >= 2)
      .map(({ entry, points, i }) => ({
        id: entry.region,
        name: entry.region,
        color: CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
        data: toChartData(points),
      }));
  }, [index, config.years]);

  // The axis wants converted-but-unitless magnitudes ("745K"), so `money` is
  // captured by the closure — `formatValue` is a D3 render callback, not a
  // component, and can't call the hook itself.
  const formatValue = useMemo(
    () => (value: number) => money.magnitude(value),
    [money],
  );

  if (isLoading && series.length === 0)
    return <FrameStatus loading>loading home values…</FrameStatus>;
  if (series.length === 0)
    return <FrameStatus>no home-value history yet</FrameStatus>;

  return (
    <ChartCard gap={2}>
      <ChartCard.Body>
        <TimeSeriesChart
          series={series}
          timeframe={timeframeFor(config.years)}
          fill
          formatValue={formatValue}
        />
      </ChartCard.Body>
      <ChartCard.Caption>
        Zillow ZHVI · typical home value · monthly
        {index?.asOf ? ` · through ${index.asOf}` : ""}
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const homeValueChartFrame = defineFrame({
  ...homeValueChartMeta,
  component: HomeValueChart,
  titleContent: ({ config }) => <>{config.regions.join(" / ")} · Home Values</>,
});
