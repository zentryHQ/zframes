import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useMetalHistory, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import {
  downsample,
  formatFixPrice,
  metalName,
  onSharedFixDays,
  sliceYears,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { metalPriceChartMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = metalPriceChartMeta.schema;

function MetalPriceChart({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  const { histories, isLoading } = useMetalHistory(
    config.symbols,
    config.currency,
  );

  const series: MultiSeriesData[] = useMemo(() => {
    // Window first (and onto one shared date grid), then thin: a 58-year daily
    // fix file is ~14,600 points and the path can only show a few hundred.
    const windows = onSharedFixDays(
      histories.map((history) => sliceYears(history.points, config.years)),
    );
    const out: MultiSeriesData[] = [];
    windows.forEach((windowed, i) => {
      const thinned = downsample(windowed);
      // No log axis in the chart layer, so plot log10(price) and format the
      // ticks back through 10**v — a decade of gold reads as one even step.
      const plotted = config.logScale
        ? thinned
            .filter((p) => p.value > 0)
            .map((p) => ({ time: p.time, value: Math.log10(p.value) }))
        : thinned;
      // One point draws no path — that's an empty chart shell, not a chart.
      if (plotted.length < 2) return;
      out.push({
        id: histories[i].symbol,
        name: metalName(histories[i].symbol),
        color: CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
        data: toChartData(plotted),
      });
    });
    return out;
  }, [histories, config.years, config.logScale]);

  const formatValue = useMemo(() => {
    const currency = config.currency;
    return config.logScale
      ? (value: number) => formatFixPrice(10 ** value, currency, money)
      : (value: number) => formatFixPrice(value, currency, money);
  }, [config.currency, config.logScale, money]);

  if (isLoading && series.length === 0)
    return <FrameStatus loading>loading London fix history…</FrameStatus>;
  if (series.length === 0)
    return (
      <FrameStatus>
        {histories.length > 1
          ? "no fix days these metals share in this window"
          : "no London fix history yet"}
      </FrameStatus>
    );

  return (
    <TimeSeriesChart
      series={series}
      timeframe={timeframeFor(config.years)}
      height={250}
      formatValue={formatValue}
    />
  );
}

export const metalPriceChartFrame = defineFrame({
  ...metalPriceChartMeta,
  component: MetalPriceChart,
});
