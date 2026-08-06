import { HistogramChart, quantile, sampleStats } from "@zframes/charts";
import { defineFrame, useMetalHistory } from "@zframes/core";
import { useMemo } from "react";
import type { ReactNode } from "react";
import type { z } from "zod";
import { formatCompact, formatPct } from "./format";
import {
  metalName,
  percentileRank,
  ratioSeries,
  sliceYears,
} from "./metals-shared";
import { metalRatioPercentileMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = metalRatioPercentileMeta.schema;

/** Module-level (not an inline arrow) so the chart's D3 draw effect doesn't
 *  re-run every render. Mirrors `metal-ratio-chart`'s formatter for the same
 *  reason: any metal over any other spans three orders of magnitude — gold/silver
 *  past 100, platinum/palladium near 1.3, an inverted silver/gold around 0.012 —
 *  so a fixed decimal count would print every bin edge of an inverted pair as
 *  "0.01". Precision follows the magnitude instead. */
const formatRatio = (value: number) => {
  if (value >= 100) return value.toFixed(1);
  if (value >= 1) return value.toFixed(2);
  return value.toPrecision(3);
};

/**
 * Plain-language read of the percentile, generalised from `gold-silver-ratio`'s
 * fixed-pair version — including its sign convention: a HIGH ratio means one
 * ounce of the numerator buys a LOT of the denominator, so the denominator is
 * the cheap leg. A high percentile reads "denominator cheap", not "denominator
 * strong".
 */
function readPercentile(
  percentile: number,
  numerator: string,
  denominator: string,
): string {
  const cheap = metalName(denominator);
  const dear = metalName(numerator);
  if (percentile >= 90) return `${cheap} historically cheap vs ${dear}`;
  if (percentile >= 70) return `${cheap} on the cheap side`;
  if (percentile > 30) return "mid-range — neither leg stretched";
  if (percentile > 10) return `${cheap} on the dear side`;
  return `${cheap} historically dear vs ${dear}`;
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="caption text-soft truncate uppercase">{label}</div>
      <div className="body-sm truncate font-bold tabular-nums">{value}</div>
    </div>
  );
}

function MetalRatioPercentile({ config }: { config: z.output<typeof schema> }) {
  const samePair = config.numerator === config.denominator;
  // Hook first, unconditionally — the same-metal guard is an early return below.
  // Ask for one symbol when they match, so the misconfigured case doesn't fetch
  // the same fix file twice.
  const { histories, isLoading } = useMetalHistory(
    samePair ? [config.numerator] : [config.numerator, config.denominator],
  );

  const view = useMemo(() => {
    const top =
      histories.find((h) => h.symbol === config.numerator)?.points ?? [];
    const bottom =
      histories.find((h) => h.symbol === config.denominator)?.points ?? [];
    // Window each leg BEFORE dividing (metals-shared's "windowing before
    // maths") — a ratio needs no warm-up. `ratioSeries` pairs the legs on the
    // days they SHARE rather than zipping by index: the LBMA runs a different
    // holiday calendar per metal and platinum/palladium only start in 1990, so
    // the two files are neither the same length nor the same date set, and an
    // index-wise divide would quote a Tuesday over a Thursday.
    const windowed = ratioSeries(
      sliceYears(top, config.years),
      sliceYears(bottom, config.years),
    );
    const values = windowed.map((p) => p.value);
    // sampleStats needs two finite observations to have a distribution at all;
    // it also gives the true (untrimmed) extremes the stat row reports.
    const stats = sampleStats(values);
    if (!stats) return null;

    const current = values[values.length - 1];
    const sorted = [...values].sort((a, b) => a - b);
    return {
      values,
      stats,
      current,
      median: quantile(sorted, 0.5),
      percentile: percentileRank(values, current),
      // The years actually covered — shorter than `config.years` whenever the
      // overlap is (a platinum pair can't reach past 1990), so the caption never
      // claims a window the data can't back.
      span: `${new Date(windowed[0].time).getUTCFullYear()}–${new Date(
        windowed[windowed.length - 1].time,
      ).getUTCFullYear()}`,
    };
  }, [histories, config.numerator, config.denominator, config.years]);

  if (samePair)
    return (
      <FrameStatus>
        a ratio needs two different metals — pick a different numerator or
        denominator
      </FrameStatus>
    );
  // Only blank the card before the first fix history lands — a background
  // refresh keeps the histogram on screen instead of flashing to a skeleton.
  if (isLoading && !view)
    return <FrameStatus loading>loading fix history…</FrameStatus>;
  if (!view)
    return (
      <FrameStatus>
        no overlapping {metalName(config.numerator)} /{" "}
        {metalName(config.denominator)} fixes yet
      </FrameStatus>
    );

  const { values, stats, current, median, percentile, span } = view;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1.5 text-normal">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="caption text-soft truncate uppercase">
            {metalName(config.numerator)} / {metalName(config.denominator)}
          </div>
          <div className="metric-lg text-strong leading-none tabular-nums">
            {formatRatio(current)}
          </div>
        </div>
        <div className="min-w-0 shrink text-right">
          <div className="body-md text-strong font-bold tabular-nums">
            {formatPct(percentile, 0)} of {config.years}y range
          </div>
          <div className="caption text-soft truncate">
            {readPercentile(percentile, config.numerator, config.denominator)}
          </div>
        </div>
      </div>

      {/* No negativeColor, and bin edges NOT anchored to zero: a ratio of two
          positive prices can never cross or reach zero, so a diverging split
          would imply a sign boundary that cannot happen and anchoring the axis
          at zero would spend half the card on empty space below a gold/silver
          range that lives between 30 and 125. */}
      <HistogramChart
        values={values}
        height={130}
        anchorZero={false}
        formatValue={formatRatio}
        formatCount={formatCompact}
        markers={[
          { value: median, label: "median" },
          { value: current, label: "now" },
        ]}
      />

      <div className="caption text-soft text-center">
        {formatCompact(stats.count)} daily fixes · {span}
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-white/[0.08] pt-1.5">
        <Stat label="low" value={formatRatio(stats.min)} />
        <Stat label="median" value={formatRatio(median)} />
        <Stat label="high" value={formatRatio(stats.max)} />
      </div>
    </div>
  );
}

export const metalRatioPercentileFrame = defineFrame({
  ...metalRatioPercentileMeta,
  component: MetalRatioPercentile,
});
