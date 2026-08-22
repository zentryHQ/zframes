import {
  CHART_COLORS_MULTI_SERIES,
  ChartTimeframe,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useMacroSeries } from "@zframes/core";
import type { MacroPoint } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { formatPct } from "./format";
import { laborForceFlowMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = laborForceFlowMeta.schema;

function formatRate(v: number) {
  return formatPct(v, 1);
}
const UNEMPLOYMENT_SERIES_ID = "LNS14000000";
const PARTICIPATION_SERIES_ID = "LNS11300000";

function toPoints(points: MacroPoint[] | undefined, months: number) {
  return (points ?? [])
    .slice(-months)
    .map((p) => ({ date: new Date(p.time).toISOString(), value: p.value }));
}

function LaborForceFlow({ config }: { config: z.output<typeof schema> }) {
  const now = new Date();
  const endYear = now.getUTCFullYear();
  const startYear = endYear - 2;
  const { series: unemployment, isLoading: unemploymentLoading } =
    useMacroSeries(UNEMPLOYMENT_SERIES_ID, startYear, endYear);
  const { series: participation, isLoading: participationLoading } =
    useMacroSeries(PARTICIPATION_SERIES_ID, startYear, endYear);

  const series: MultiSeriesData[] = useMemo(
    () => [
      {
        id: "unemployment",
        name: "Unemployment rate",
        color: CHART_COLORS_MULTI_SERIES[3],
        data: toPoints(unemployment?.points, config.months),
      },
      {
        id: "participation",
        name: "Labor-force participation",
        color: CHART_COLORS_MULTI_SERIES[0],
        data: toPoints(participation?.points, config.months),
      },
    ],
    [unemployment, participation, config.months],
  );

  const isLoading = unemploymentLoading || participationLoading;
  if (isLoading && series.every((s) => s.data.length === 0))
    return <FrameStatus loading>loading labor-force data…</FrameStatus>;
  if (series.every((s) => s.data.length === 0))
    return <FrameStatus>no labor-force data yet</FrameStatus>;

  return (
    <ChartCard gap={1}>
      <ChartCard.Body>
        <TimeSeriesChart
          series={series}
          timeframe={ChartTimeframe.YTD}
          fill
          formatValue={formatRate}
        />
      </ChartCard.Body>
      <ChartCard.Caption>
        unemployment vs labor-force participation · monthly, BLS
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const laborForceFlowFrame = defineFrame({
  ...laborForceFlowMeta,
  component: LaborForceFlow,
});
