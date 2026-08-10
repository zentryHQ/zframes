import {
  CHART_COLORS_MULTI_SERIES,
  ChartTimeframe,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useOnchainExtras } from "@zframes/core";
import { useMemo } from "react";
import type { SeriesPoint } from "@zframes/spec";
import type { z } from "zod";
import { formatPct } from "./format";
import { normalize, tail, toSparkline, windowDays } from "./indicators";
import { onchainOscillatorOverlayMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";

const schema = onchainOscillatorOverlayMeta.schema;

function formatOscillator(v: number) {
  return formatPct(v * 100, 0);
}

const WINDOW_OPTIONS = ["90D", "180D", "1Y"] as const;

function OnchainOscillatorOverlay({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const [chartWindow, setChartWindow] = useFrameChoice("window", config.window);
  const { extras, isLoading } = useOnchainExtras();

  const series: MultiSeriesData[] = useMemo(() => {
    if (!extras) return [];
    const n = windowDays(chartWindow);
    const prep = (s: SeriesPoint[]) => toSparkline(normalize(tail(s, n)));
    return [
      {
        id: "sopr",
        name: "SOPR",
        color: CHART_COLORS_MULTI_SERIES[0],
        data: prep(extras.history.sopr),
      },
      {
        id: "puell",
        name: "Puell Multiple",
        color: CHART_COLORS_MULTI_SERIES[1],
        data: prep(extras.history.puell),
      },
      {
        id: "reserve-risk",
        name: "Reserve Risk",
        color: CHART_COLORS_MULTI_SERIES[2],
        data: prep(extras.history.reserveRisk),
      },
    ];
  }, [extras, chartWindow]);

  if (isLoading && series.length === 0)
    return <FrameStatus loading>loading on-chain oscillators…</FrameStatus>;
  if (series.every((s) => s.data.length === 0))
    return <FrameStatus>no on-chain data yet</FrameStatus>;

  return (
    <TimeSeriesChart
      series={series}
      timeframe={ChartTimeframe.YTD}
      fill
      formatValue={formatOscillator}
      control={
        <TimeframeToggle
          options={WINDOW_OPTIONS}
          value={chartWindow}
          onChange={setChartWindow}
          label="on-chain oscillator overlay window"
        />
      }
    />
  );
}

export const onchainOscillatorOverlayFrame = defineFrame({
  ...onchainOscillatorOverlayMeta,
  component: OnchainOscillatorOverlay,
});
