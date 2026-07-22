import {
  CHART_COLORS_MULTI_SERIES,
  ChartTimeframe,
  MultiSeriesLineChart,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useMacroSeries } from "@zframes/core";
import type { MacroPoint } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatChangePct, formatPct } from "./format";
import { realWagesMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = realWagesMeta.schema;
const CPI_SERIES_ID = "CUUR0000SA0";
const EARNINGS_SERIES_ID = "CES0500000003"; // avg hourly earnings, all employees, total private

/** Year-over-year % change for each point, matched against the same month a year earlier. */
function yoySeries(points: MacroPoint[]): MacroPoint[] {
  const byTime = new Map(points.map((p) => [p.time, p.value]));
  return points.flatMap((p) => {
    const d = new Date(p.time);
    const priorTime = Date.UTC(d.getUTCFullYear() - 1, d.getUTCMonth(), 1);
    const prior = byTime.get(priorTime);
    return prior === undefined || prior <= 0
      ? []
      : [{ ...p, value: (p.value / prior - 1) * 100 }];
  });
}

function RealWages({ config }: { config: z.output<typeof schema> }) {
  const now = new Date();
  const endYear = now.getUTCFullYear();
  const startYear = endYear - 3;
  const { series: cpi, isLoading: cpiLoading } = useMacroSeries(
    CPI_SERIES_ID,
    startYear,
    endYear,
  );
  const { series: earnings, isLoading: earningsLoading } = useMacroSeries(
    EARNINGS_SERIES_ID,
    startYear,
    endYear,
  );

  const series: MultiSeriesData[] = useMemo(() => {
    if (!cpi || !earnings) return [];
    const earningsYoy = yoySeries(earnings.points).slice(-config.months);
    const cpiYoy = yoySeries(cpi.points).slice(-config.months);
    return [
      {
        id: "earnings",
        name: "Avg hourly earnings",
        color: CHART_COLORS_MULTI_SERIES[1],
        data: earningsYoy.map((p) => ({
          date: new Date(p.time).toISOString(),
          value: p.value,
        })),
      },
      {
        id: "cpi",
        name: "CPI-U",
        color: CHART_COLORS_MULTI_SERIES[3],
        data: cpiYoy.map((p) => ({
          date: new Date(p.time).toISOString(),
          value: p.value,
        })),
      },
    ];
  }, [cpi, earnings, config.months]);

  const isLoading = cpiLoading || earningsLoading;
  if (isLoading && series.every((s) => s.data.length === 0))
    return <FrameStatus loading>loading real wages…</FrameStatus>;
  if (series.every((s) => s.data.length === 0))
    return <FrameStatus>no wage data yet</FrameStatus>;

  const latestEarnings = series[0].data.at(-1)?.value;
  const latestCpi = series[1].data.at(-1)?.value;
  const gap =
    latestEarnings !== undefined && latestCpi !== undefined
      ? latestEarnings - latestCpi
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <MultiSeriesLineChart
        series={series}
        timeframe={ChartTimeframe.YTD}
        height={250}
        formatValue={formatChangePct}
      />
      {gap !== null && (
        <div className="caption text-soft text-center">
          pay {gap >= 0 ? "outrunning" : "trailing"} inflation by{" "}
          {formatPct(Math.abs(gap), 2)}
        </div>
      )}
    </div>
  );
}

export const realWagesFrame = defineFrame({
  ...realWagesMeta,
  component: RealWages,
});
