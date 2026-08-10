import { HistogramChart, sampleStats } from "@zframes/charts";
import { defineFrame, useMetalHistory } from "@zframes/core";
import { useMemo } from "react";
import type { ReactNode } from "react";
import type { z } from "zod";
import {
  DOWN_COLOR,
  UP_COLOR,
  changeColor,
  formatChangePct,
  formatCompact,
  formatPct,
} from "./format";
import {
  metalName,
  monthlyReturns,
  simpleReturns,
  sliceYears,
} from "./metals-shared";
import { metalReturnDistributionMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = metalReturnDistributionMeta.schema;

/**
 * Share of the sample trimmed off each tail before the axis is sized.
 *
 * Metal returns are fat-tailed — one 1980-style day stretches a min→max axis so
 * far that every other observation piles into two bars, which is a histogram of
 * nothing. `HistogramChart` folds the trimmed tails into the end bars and marks
 * them « », and the true extremes are still reported in the stat row below, so
 * nothing is hidden. Tighter than the shorter-window frames use because a
 * 58-year daily history has thousands of observations to spare.
 */
const TAIL_TRIM = 0.005;

function Stat({
  label,
  value,
  color,
}: {
  label: string;
  value: ReactNode;
  color?: string;
}) {
  return (
    <div className="min-w-0">
      <div className="caption text-soft truncate uppercase">{label}</div>
      <div
        className="body-sm truncate font-bold tabular-nums"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function MetalReturnDistribution({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { histories, isLoading } = useMetalHistory([config.symbol]);

  const sample = useMemo(() => {
    const windowed = sliceYears(histories[0]?.points ?? [], config.years);
    const values =
      config.period === "daily"
        ? simpleReturns(windowed)
        : monthlyReturns(windowed).map((m) => m.pct);
    const stats = sampleStats(values);
    if (!stats) return null;

    return {
      values,
      stats,
      // The years actually covered — shorter than `config.years` whenever the
      // fix history is (platinum and palladium only start in 1990), so the
      // caption never claims a window the data can't back.
      span: `${new Date(windowed[0].time).getUTCFullYear()}–${new Date(
        windowed[windowed.length - 1].time,
      ).getUTCFullYear()}`,
    };
  }, [histories, config.period, config.years]);

  // Only blank the card before the first fix history lands — a background
  // refresh keeps the histogram on screen instead of flashing to a skeleton.
  if (isLoading && !sample)
    return <FrameStatus loading>loading return history…</FrameStatus>;
  if (!sample) return <FrameStatus>not enough fix history yet</FrameStatus>;

  const { values, stats, span } = sample;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1.5 text-normal">
      <div className="min-h-0 flex-1">
        <HistogramChart
          values={values}
          fill
          color={UP_COLOR}
          negativeColor={DOWN_COLOR}
          tailTrim={TAIL_TRIM}
          formatValue={formatChangePct}
          formatCount={formatCompact}
          markers={[{ value: stats.mean, label: "mean" }]}
        />
      </div>
      <div className="caption text-soft text-center">
        {metalName(config.symbol)} · {formatCompact(stats.count)}{" "}
        {config.period} returns · {span}
      </div>
      <div className="grid grid-cols-4 gap-2 border-t border-white/[0.08] pt-1.5">
        <Stat
          label="mean"
          value={formatChangePct(stats.mean)}
          color={changeColor(stats.mean)}
        />
        <Stat label="std dev" value={formatPct(stats.stdev)} />
        <Stat
          label="best"
          value={formatChangePct(stats.max)}
          color={UP_COLOR}
        />
        <Stat
          label="worst"
          value={formatChangePct(stats.min)}
          color={DOWN_COLOR}
        />
      </div>
    </div>
  );
}

export const metalReturnDistributionFrame = defineFrame({
  ...metalReturnDistributionMeta,
  component: MetalReturnDistribution,
});
