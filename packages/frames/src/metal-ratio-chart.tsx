import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import { defineFrame, useMetalHistory } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct } from "./format";
import {
  downsample,
  metalName,
  pctChange,
  ratioSeries,
  sliceYears,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { metalRatioChartMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = metalRatioChartMeta.schema;

/** Module-level (not an inline arrow) so the chart's D3 draw effect doesn't
 *  re-run every render. Any metal over any other spans three orders of
 *  magnitude — gold/silver past 100, platinum/palladium near 1.3, the inverted
 *  silver/gold around 0.012 — so a fixed decimal count would print every tick
 *  of an inverted pair as "0.01". Precision follows the magnitude instead. */
const formatRatio = (value: number) => {
  if (value >= 100) return value.toFixed(1);
  if (value >= 1) return value.toFixed(2);
  return value.toPrecision(3);
};

function MetalRatioChart({ config }: { config: z.output<typeof schema> }) {
  const sameMetal = config.numerator === config.denominator;
  // Hook first, unconditionally — the same-metal guard is an early return
  // below. Ask for one symbol when they match, so the misconfigured case
  // doesn't fetch the same fix file twice.
  const { histories, isLoading } = useMetalHistory(
    sameMetal ? [config.numerator] : [config.numerator, config.denominator],
  );

  const view = useMemo(() => {
    const top =
      histories.find((h) => h.symbol === config.numerator)?.points ?? [];
    const bottom =
      histories.find((h) => h.symbol === config.denominator)?.points ?? [];
    // Window each leg BEFORE dividing (metals-shared's "windowing before
    // maths") — a ratio needs no warm-up, so day-aligning two full 58-year fix
    // files and then discarding all but the window is wasted work.
    const windowed = ratioSeries(
      sliceYears(top, config.years),
      sliceYears(bottom, config.years),
    );
    // A single shared day is a dot, not a line — treat it as no history.
    if (windowed.length < 2) return null;

    const thinned = downsample(windowed);
    const current = windowed[windowed.length - 1].value;
    const series: MultiSeriesData[] = [
      {
        id: "ratio",
        name: `${metalName(config.numerator)} / ${metalName(config.denominator)}`,
        color: CHART_COLORS_MULTI_SERIES[0],
        data: toChartData(thinned),
      },
    ];
    return {
      series,
      current,
      changePct: pctChange(windowed[0].value, current),
    };
  }, [histories, config.numerator, config.denominator, config.years]);

  if (sameMetal)
    return (
      <FrameStatus>
        a ratio needs two different metals — pick a different numerator or
        denominator
      </FrameStatus>
    );
  if (isLoading) return <FrameStatus loading>loading fix history…</FrameStatus>;
  if (!view)
    return (
      <FrameStatus>
        no overlapping {metalName(config.numerator)} /{" "}
        {metalName(config.denominator)} fixes yet
      </FrameStatus>
    );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="caption text-soft truncate uppercase">
          {metalName(config.numerator)} / {metalName(config.denominator)}
        </span>
        <span className="flex shrink-0 items-baseline gap-2">
          <span className="body-md text-strong font-bold tabular-nums">
            {formatRatio(view.current)}
          </span>
          <span
            className="body-sm font-bold tabular-nums"
            style={{ color: changeColor(view.changePct) }}
          >
            {formatChangePct(view.changePct)}
          </span>
        </span>
      </div>

      <TimeSeriesChart
        series={view.series}
        timeframe={timeframeFor(config.years)}
        height={200}
        formatValue={formatRatio}
      />
    </div>
  );
}

export const metalRatioChartFrame = defineFrame({
  ...metalRatioChartMeta,
  component: MetalRatioChart,
});
