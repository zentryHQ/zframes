import {
  ChartTimeframe,
  MultiSeriesLineChart,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useFearGreed } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { fearGreedChartMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = fearGreedChartMeta.schema;

/** 0 = extreme fear (red) … 100 = extreme greed (green). A bespoke sentiment
 *  ramp (NOT the up/down semantic pair) mirroring fear-greed.tsx's badge tint —
 *  a deliberate exception to the shared green/red (see frames AGENTS.md). */
function indexColor(value: number): string {
  if (value <= 25) return "#F21553";
  if (value <= 45) return "#F97316";
  if (value <= 55) return "#F59E0B";
  if (value <= 75) return "#84CC16";
  return "#25A78D";
}

function timeframeFor(days: number): ChartTimeframe {
  if (days <= 35) return ChartTimeframe["1M"];
  if (days <= 100) return ChartTimeframe["3M"];
  return ChartTimeframe.YTD;
}

/** Stable reference (not an inline arrow) so the chart's D3 effect doesn't
 *  re-run its draw every render. */
const formatIndexValue = (v: number) => v.toFixed(0);

function FearGreedChart({ config }: { config: z.output<typeof schema> }) {
  const { points, isLoading } = useFearGreed(config.days);

  const series: MultiSeriesData[] = useMemo(() => {
    const ordered = [...points].reverse(); // hook returns newest-first
    const latest = ordered.at(-1);
    return [
      {
        id: "fear-greed",
        name: "Fear & Greed",
        color: latest ? indexColor(latest.value) : "#8b8bff",
        data: ordered.map((p) => ({
          date: new Date(p.time).toISOString(),
          value: p.value,
        })),
      },
    ];
  }, [points]);

  if (isLoading) return <FrameStatus loading>loading index…</FrameStatus>;
  if (series[0].data.length === 0)
    return <FrameStatus>no sentiment data yet</FrameStatus>;

  return (
    <MultiSeriesLineChart
      series={series}
      timeframe={timeframeFor(config.days)}
      height={220}
      formatValue={formatIndexValue}
    />
  );
}

export const fearGreedChartFrame = defineFrame({
  ...fearGreedChartMeta,
  component: FearGreedChart,
});
