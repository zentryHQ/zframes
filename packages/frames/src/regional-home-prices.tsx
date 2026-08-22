import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useRegionalHousingPrice } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { formatChangePct, formatLevel } from "./format";
import {
  downsample,
  rebaseToPct,
  sliceYears,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { regionalHomePricesMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = regionalHomePricesMeta.schema;

const formatIndex = (value: number) => formatLevel(value);
const formatRebased = (value: number) => formatChangePct(value);

function RegionalHomePrices({ config }: { config: z.output<typeof schema> }) {
  // The hook keys its poll on the joined contents, but the array identity still
  // wants to be stable across renders.
  const regions = useMemo(() => config.regions, [config.regions]);
  const { housing, isLoading } = useRegionalHousingPrice(regions, config.level);

  const series: MultiSeriesData[] = useMemo(() => {
    const entries = housing?.series ?? [];
    return entries
      .map((entry, i) => {
        const windowed = sliceYears(entry.points, config.years);
        // Rebase inside the window (not over the full history) so every line
        // leaves 0% on the same date — FHFA indexes each region to 100 at its
        // own start, so raw levels across regions compare nothing.
        const plotted = downsample(
          config.rebase ? rebaseToPct(windowed) : windowed,
        );
        return { entry, plotted, i };
      })
      .filter(({ plotted }) => plotted.length >= 2)
      .map(({ entry, plotted, i }) => ({
        id: entry.region,
        name: entry.region,
        color: CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
        data: toChartData(plotted),
      }));
  }, [housing, config.years, config.rebase]);

  if (isLoading && !housing)
    return <FrameStatus loading>loading FHFA house-price index…</FrameStatus>;
  if (series.length === 0)
    return (
      <FrameStatus>
        {housing && housing.series.length === 0
          ? `no ${config.level} matched those regions`
          : "no regional house-price data yet"}
      </FrameStatus>
    );

  const latest = housing?.series[0]?.period;

  return (
    <ChartCard gap={2}>
      <ChartCard.Body>
        <TimeSeriesChart
          series={series}
          timeframe={timeframeFor(config.years)}
          fill
          formatValue={config.rebase ? formatRebased : formatIndex}
        />
      </ChartCard.Body>
      <ChartCard.Caption>
        FHFA HPI · {config.level} · {config.years}y
        {latest ? ` · through ${latest}` : ""}
        {config.rebase ? " · indexed to 0% at window start" : ""}
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const regionalHomePricesFrame = defineFrame({
  ...regionalHomePricesMeta,
  component: RegionalHomePrices,
});
