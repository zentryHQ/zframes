import {
  ChartTimeframe,
  MultiSeriesLineChart,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useDollarIndex } from "@zframes/core";
import { useMemo } from "react";
import { DOWN_COLOR_HEX, UP_COLOR_HEX } from "./format";
import { dxyChartMeta } from "./schemas";
import { FrameStatus } from "./ui";

/** Stable reference (not an inline arrow) so the chart's D3 effect doesn't
 *  re-run its draw every render. */
const formatDxyValue = (v: number) => v.toFixed(2);

function DxyChart() {
  const { dxy, isLoading } = useDollarIndex();

  const series: MultiSeriesData[] = useMemo(() => {
    if (!dxy) return [];
    return [
      {
        id: "dxy",
        name: "DXY",
        // D3 draws this via .attr(), which can't resolve a CSS var — use the
        // literal hex pair, not changeColor()/UP_COLOR/DOWN_COLOR.
        color: dxy.changePct >= 0 ? UP_COLOR_HEX : DOWN_COLOR_HEX,
        data: dxy.history.map((p) => ({
          date: new Date(p.time).toISOString(),
          value: p.value,
        })),
      },
    ];
  }, [dxy]);

  if (isLoading) return <FrameStatus loading>loading DXY…</FrameStatus>;
  if (series.length === 0 || series[0].data.length === 0)
    return <FrameStatus>no FX data yet</FrameStatus>;

  return (
    <MultiSeriesLineChart
      series={series}
      timeframe={ChartTimeframe["1M"]}
      height={220}
      formatValue={formatDxyValue}
    />
  );
}

export const dxyChartFrame = defineFrame({
  ...dxyChartMeta,
  component: DxyChart,
});
