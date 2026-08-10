import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useMetalHistory } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR, formatPct } from "./format";
import {
  downsample,
  metalName,
  percentileRank,
  rollingVolatility,
  sliceYears,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { metalVolatilityMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = metalVolatilityMeta.schema;

/** Stable reference (not an inline arrow) so the chart's D3 effect doesn't
 *  redraw every render. Whole percent is all an axis tick needs. */
const formatVolValue = (value: number) => formatPct(value, 0);

/** "38th", "1st", "22nd" — the percentile reads as a rank, not a quantity. */
function ordinal(n: number): string {
  const teens = n % 100;
  if (teens >= 11 && teens <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

/** Volatility is a risk reading, so the semantic pair is inverted the way
 *  `financial-stress` inverts it: calm is "up", violent is "down". The middle
 *  of the range gets no tint at all — it isn't news either way. */
function volatilityColor(percentile: number): string | undefined {
  if (percentile >= 70) return DOWN_COLOR;
  if (percentile <= 30) return UP_COLOR;
  return undefined;
}

function MetalVolatility({ config }: { config: z.output<typeof schema> }) {
  const { histories, isLoading } = useMetalHistory([config.symbol]);

  const { series, current, percentile } = useMemo(() => {
    // The FULL series first: a rolling window needs its warm-up, so slicing
    // before the maths would cost the first `window` days of the chart.
    const vol = rollingVolatility(histories[0]?.points ?? [], config.window);
    const windowed = sliceYears(vol, config.years);
    if (windowed.length === 0)
      return { series: [] as MultiSeriesData[], current: 0, percentile: 0 };

    const values = windowed.map((p) => p.value);
    const latest = values[values.length - 1];
    return {
      series: [
        {
          id: config.symbol,
          name: `${metalName(config.symbol)} ${config.window}d`,
          color: CHART_COLORS_MULTI_SERIES[0],
          data: toChartData(downsample(windowed)),
        },
      ],
      current: latest,
      // Ranked against exactly what is charted, so the headline and the line
      // can't disagree about which window "the range" means.
      percentile: percentileRank(values, latest),
    };
  }, [histories, config.symbol, config.window, config.years]);

  if (isLoading) return <FrameStatus loading>loading fix history…</FrameStatus>;
  if (series.length === 0)
    return <FrameStatus>not enough fix history yet</FrameStatus>;

  // Clamped to 1…100: the reading is itself one of the ranked samples, so it can
  // never be "0th", but a 10y window holds ~2,500 of them and a fresh low rounds
  // 0.04 down to a nonsensical "0th pctile".
  const rank = Math.min(100, Math.max(1, Math.round(percentile)));

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div
            className="metric-md text-strong leading-none"
            style={{ color: volatilityColor(percentile) }}
          >
            {formatPct(current, 1)}
          </div>
          <div className="caption text-soft mt-1">
            {metalName(config.symbol)} · {config.window}d realised, annualised
          </div>
        </div>
        <div className="text-right">
          <div className="body-md text-strong tabular-nums">
            {ordinal(rank)} pctile
          </div>
          <div className="caption text-soft">of the last {config.years}y</div>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <TimeSeriesChart
          series={series}
          timeframe={timeframeFor(config.years)}
          fill
          formatValue={formatVolValue}
        />
      </div>
    </div>
  );
}

export const metalVolatilityFrame = defineFrame({
  ...metalVolatilityMeta,
  component: MetalVolatility,
});
