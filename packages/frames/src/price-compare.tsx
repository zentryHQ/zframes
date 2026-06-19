import {
  CHART_COLORS_MULTI_SERIES,
  ChartTimeframe,
  MultiSeriesLineChart,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useCandlesMulti } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPrice } from "./format";
import { priceCompareMeta } from "./schemas";

// Candle interval picked per lookback so each window is ~50–100 points: dense
// enough to read, light enough to keep the fetch cheap.
const LOOKBACKS = {
  "24h": {
    ms: 24 * 60 * 60 * 1000,
    interval: "15m",
    timeframe: ChartTimeframe["24h"],
  },
  "7D": {
    ms: 7 * 24 * 60 * 60 * 1000,
    interval: "1h",
    timeframe: ChartTimeframe["7D"],
  },
  "1M": {
    ms: 30 * 24 * 60 * 60 * 1000,
    interval: "4h",
    timeframe: ChartTimeframe["1M"],
  },
} as const;

const schema = priceCompareMeta.schema;

function PriceCompare({ config }: { config: z.output<typeof schema> }) {
  const { ms, interval, timeframe } = LOOKBACKS[config.lookback];
  // Stable start time: recompute only when the window changes, so the
  // useCandlesMulti effect doesn't re-run every render.
  const startTimeMs = useMemo(() => Date.now() - ms, [ms]);
  const { candles, isLoading } = useCandlesMulti(
    config.symbols,
    interval,
    startTimeMs,
  );

  const series: MultiSeriesData[] = useMemo(
    () =>
      config.symbols.map((symbol, i) => {
        const points = candles[symbol] ?? [];
        // Rebase against the first candle's close when normalizing.
        const base = points[0]?.close;
        return {
          id: symbol,
          name: symbol,
          color:
            CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
          data: points.map((candle) => ({
            date: new Date(candle.time).toISOString(),
            value:
              config.normalize && base
                ? (candle.close / base - 1) * 100
                : candle.close,
          })),
        };
      }),
    [config.symbols, config.normalize, candles],
  );

  return (
    <MultiSeriesLineChart
      series={series}
      timeframe={timeframe}
      height={250}
      isLoading={isLoading}
      formatValue={
        config.normalize
          ? (value) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`
          : (value) => `$${formatPrice(value)}`
      }
    />
  );
}

export const priceCompareFrame = defineFrame({
  ...priceCompareMeta,
  component: PriceCompare,
});
