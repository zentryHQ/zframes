import { CHART_COLORS_MULTI_SERIES, StackedAreaChart } from "@zframes/charts";
import { defineFrame, useFundingHistory } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { formatFundingPct } from "./format";
import { fundingCarryAreaMeta } from "./schemas";
import { FrameStatus } from "./ui";

const LOOKBACKS = {
  "24h": 24 * 60 * 60 * 1000,
  "7D": 7 * 24 * 60 * 60 * 1000,
  "1M": 30 * 24 * 60 * 60 * 1000,
} as const;

const schema = fundingCarryAreaMeta.schema;

function formatCarryAxisDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function FundingCarryArea({ config }: { config: z.output<typeof schema> }) {
  const ms = LOOKBACKS[config.lookback];
  const startTimeMs = useMemo(() => Date.now() - ms, [ms]);
  const { history, isLoading } = useFundingHistory(config.symbols, startTimeMs);

  // Not annotated with a named StackedAreaSeries[] type — that type isn't
  // re-exported from @zframes/charts' public barrel (only the components
  // themselves are, since no built-in frame has used this primitive yet);
  // StackedAreaChart's own generic infers the shape fine structurally.
  const series = useMemo(
    () =>
      config.symbols.map((symbol, i) => {
        let cumulative = 0;
        const data = [...(history[symbol] ?? [])]
          .sort((a, b) => a.time - b.time)
          .map((point) => {
            cumulative += point.fundingRate * 100;
            return { date: new Date(point.time), value: cumulative };
          });
        return {
          id: symbol,
          name: tickerOf(symbol),
          color:
            CHART_COLORS_MULTI_SERIES[i % CHART_COLORS_MULTI_SERIES.length],
          data,
        };
      }),
    [config.symbols, history],
  );

  if (isLoading)
    return <FrameStatus loading>loading funding carry…</FrameStatus>;
  if (series.every((s) => s.data.length === 0))
    return <FrameStatus>no funding data yet</FrameStatus>;

  return (
    <StackedAreaChart
      series={series}
      height={250}
      formatXAxis={formatCarryAxisDate}
      formatYAxis={formatFundingPct}
      formatValue={formatFundingPct}
    />
  );
}

export const fundingCarryAreaFrame = defineFrame({
  ...fundingCarryAreaMeta,
  component: FundingCarryArea,
});
