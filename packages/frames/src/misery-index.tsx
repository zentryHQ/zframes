import { CHART_COLORS_MULTI_SERIES, StackedAreaChart } from "@zframes/charts";
import { defineFrame, useMacroSeries } from "@zframes/core";
import type { MacroPoint } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { CardHeader } from "./card-header";
import { ChartCard } from "./chart-card";
import { formatPct } from "./format";
import { miseryIndexMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = miseryIndexMeta.schema;

function formatAxis(v: number) {
  return formatPct(v, 0);
}

function formatPoint(v: number) {
  return formatPct(v, 1);
}
const CPI_SERIES_ID = "CUUR0000SA0";
const UNEMPLOYMENT_SERIES_ID = "LNS14000000";

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

function axisMonth(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    year: "2-digit",
    timeZone: "UTC",
  });
}

function MiseryIndex({ config }: { config: z.output<typeof schema> }) {
  const now = new Date();
  const endYear = now.getUTCFullYear();
  const startYear = endYear - 3; // extra year of CPI history so YoY covers the whole display window
  const { series: cpi, isLoading: cpiLoading } = useMacroSeries(
    CPI_SERIES_ID,
    startYear,
    endYear,
  );
  const { series: unemployment, isLoading: unemploymentLoading } =
    useMacroSeries(UNEMPLOYMENT_SERIES_ID, startYear, endYear);

  const points = useMemo(() => {
    if (!cpi || !unemployment) return [];
    const cpiYoyByTime = new Map(
      yoySeries(cpi.points).map((p) => [p.time, p.value]),
    );
    return unemployment.points
      .flatMap((u) => {
        const cpiYoy = cpiYoyByTime.get(u.time);
        return cpiYoy === undefined
          ? []
          : [{ time: u.time, date: u.date, cpiYoy, unemploymentRate: u.value }];
      })
      .slice(-config.months);
  }, [cpi, unemployment, config.months]);

  const isLoading = cpiLoading || unemploymentLoading;
  if (isLoading && points.length === 0)
    return <FrameStatus loading>loading misery index…</FrameStatus>;
  if (points.length === 0)
    return <FrameStatus>no misery-index data yet</FrameStatus>;

  const latest = points.at(-1)!;
  const misery = latest.cpiYoy + latest.unemploymentRate;

  const series = [
    {
      id: "unemployment",
      name: "Unemployment",
      color: CHART_COLORS_MULTI_SERIES[0],
      data: points.map((p) => ({
        date: new Date(p.time).toISOString(),
        value: p.unemploymentRate,
      })),
    },
    {
      id: "cpi",
      name: "CPI YoY",
      color: CHART_COLORS_MULTI_SERIES[2],
      data: points.map((p) => ({
        date: new Date(p.time).toISOString(),
        value: p.cpiYoy,
      })),
    },
  ];

  return (
    <ChartCard>
      <CardHeader align="start">
        <CardHeader.Main>
          <CardHeader.Eyebrow>misery index</CardHeader.Eyebrow>
          {/* `ink="normal"`, not the sub-line's default `soft`: the
              publisher's own print date reads as data here. */}
          <CardHeader.Sub ink="normal">{latest.date}</CardHeader.Sub>
        </CardHeader.Main>
        <CardHeader.Aside>
          {/* The hero figure is on the RIGHT on this card, so it asks for
              `ink="strong"` — a hero reads strong wherever it sits, and the
              column default would give it a supporting figure's weight. */}
          <CardHeader.Value size="metric-lg" ink="strong">
            {formatPct(misery, 1)}
          </CardHeader.Value>
          <CardHeader.Sub className="mt-1">
            CPI YoY + unemployment
          </CardHeader.Sub>
        </CardHeader.Aside>
      </CardHeader>
      <StackedAreaChart
        series={series}
        height={200}
        formatXAxis={axisMonth}
        formatYAxis={formatAxis}
        formatValue={formatPoint}
      />
      <ChartCard.Caption>
        BLS CPI-U + unemployment · {points.length} monthly observations
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const miseryIndexFrame = defineFrame({
  ...miseryIndexMeta,
  component: MiseryIndex,
});
