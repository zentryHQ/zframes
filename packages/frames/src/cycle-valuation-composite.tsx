import {
  CHART_COLORS_MULTI_SERIES,
  ChartTimeframe,
  type MultiSeriesData,
} from "@zframes/charts";
import {
  defineFrame,
  useDailyCloseHistory,
  useOnchainValuation,
} from "@zframes/core";
import { useMemo } from "react";
import type { SeriesPoint } from "@zframes/spec";
import type { z } from "zod";
import { formatPct } from "./format";
import { normalize, rsi, tail, toSparkline, windowDays } from "./indicators";
import { cycleValuationCompositeMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";

const schema = cycleValuationCompositeMeta.schema;

function formatComposite(v: number) {
  return formatPct(v * 100, 0);
}

const WINDOW_OPTIONS = ["1Y", "2Y", "4Y", "all"] as const;

function CycleValuationComposite({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const [chartWindow, setChartWindow] = useFrameChoice("window", config.window);
  const { valuation, isLoading: vLoading } = useOnchainValuation();
  const { history, isLoading: hLoading } = useDailyCloseHistory("btc");

  const series: MultiSeriesData[] = useMemo(() => {
    if (!valuation) return [];
    const n = windowDays(chartWindow);
    const prep = (s: SeriesPoint[]) => toSparkline(normalize(tail(s, n)));

    // RSI(14) over the FULL daily close history, seeded before windowing so
    // the tail below is never short the first ~14 days of real signal.
    const rsiValues = rsi(
      history.map((p) => p.value),
      14,
    );
    const rsiSeries: SeriesPoint[] = [];
    for (let i = 0; i < history.length; i++) {
      const v = rsiValues[i];
      if (v !== null) rsiSeries.push({ time: history[i].time, value: v });
    }

    return [
      {
        id: "mvrv-zscore",
        name: "MVRV Z-Score",
        color: CHART_COLORS_MULTI_SERIES[0],
        data: prep(valuation.history.mvrvZScore),
      },
      {
        id: "nupl",
        name: "NUPL",
        color: CHART_COLORS_MULTI_SERIES[1],
        data: prep(valuation.history.nupl),
      },
      {
        id: "rsi14",
        name: "RSI (14)",
        color: CHART_COLORS_MULTI_SERIES[2],
        data: prep(rsiSeries),
      },
    ];
  }, [valuation, history, chartWindow]);

  if ((vLoading || hLoading) && series.length === 0)
    return <FrameStatus loading>loading cycle composite…</FrameStatus>;
  if (series.every((s) => s.data.length === 0))
    return <FrameStatus>no on-chain data yet</FrameStatus>;

  return (
    <TimeSeriesChart
      series={series}
      timeframe={ChartTimeframe.YTD}
      fill
      formatValue={formatComposite}
      control={
        <TimeframeToggle
          options={WINDOW_OPTIONS}
          value={chartWindow}
          onChange={setChartWindow}
          label="cycle valuation composite window"
        />
      }
    />
  );
}

export const cycleValuationCompositeFrame = defineFrame({
  ...cycleValuationCompositeMeta,
  component: CycleValuationComposite,
});
