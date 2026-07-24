import { BarChart, type BarDatum } from "@zframes/charts";
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

/** Bin widths a human reads without doing arithmetic: 0.25%, 1%, 2.5%, 5%… */
const NICE_MULTIPLES = [1, 1.5, 2, 2.5, 5];
const TARGET_BINS = 18;
const MAX_BINS = 21;
/**
 * Share of the sample trimmed off each tail before the axis is sized. Metal
 * returns are fat-tailed — one 1980-style day stretches a min→max axis so far
 * that every other observation piles into two bars, which is a histogram of
 * nothing. Binning the central 99% and folding the tails into the end bars
 * (marked `<` / `≥`) shows the actual shape; the true extremes are still
 * reported in the stat row underneath, so nothing is hidden.
 */
const TAIL_TRIM = 0.005;

/** Linear-interpolated quantile of an ascending sample. */
function quantile(sorted: readonly number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const next = sorted[base + 1];
  return next === undefined
    ? sorted[base]
    : sorted[base] + (pos - base) * (next - sorted[base]);
}

/** How many bins of `width` the sample spans, with edges anchored at zero. */
function binCount(min: number, max: number, width: number): number {
  return Math.floor(max / width) - Math.floor(min / width) + 1;
}

/**
 * Pick a readable bin width that lands the histogram near {@link TARGET_BINS}
 * bars without exceeding {@link MAX_BINS}. Edges are anchored at zero (see
 * {@link binCount}) so no single bar straddles the sign boundary and the
 * red/green split is honest.
 */
function chooseBinWidth(min: number, max: number): number {
  const span = Math.max(max - min, 1e-9);
  const startExp = Math.floor(Math.log10(span / TARGET_BINS)) - 1;
  const widths: number[] = [];
  for (let exp = startExp; exp <= startExp + 4; exp += 1)
    for (const mult of NICE_MULTIPLES) widths.push(mult * 10 ** exp);
  widths.sort((a, b) => a - b);

  // Widest candidate is the safe fallback: it yields the fewest bars, so a
  // pathological sample degrades to a coarse histogram rather than 500 slivers.
  let best = widths[widths.length - 1];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const width of widths) {
    const count = binCount(min, max, width);
    if (count > MAX_BINS || count < 2) continue;
    const score = Math.abs(count - TARGET_BINS);
    if (score < bestScore) {
      bestScore = score;
      best = width;
    }
  }
  return best;
}

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

  const stats = useMemo(() => {
    const windowed = sliceYears(histories[0]?.points ?? [], config.years);
    const sample =
      config.period === "daily"
        ? simpleReturns(windowed)
        : monthlyReturns(windowed).map((m) => m.pct);
    if (sample.length < 2) return null;

    // Sorted once, then read for both the extremes and the tail-trimmed axis.
    // (`Math.min(...sample)` would spread ~15k arguments onto the stack.)
    const sorted = [...sample].sort((a, b) => a - b);
    const worst = sorted[0];
    const best = sorted[sorted.length - 1];

    // Zero always stays inside the axis so the red/green split is on screen
    // even for a window that only ever went one way.
    const lowEdge = Math.min(quantile(sorted, TAIL_TRIM), 0);
    const highEdge = Math.max(quantile(sorted, 1 - TAIL_TRIM), 0);
    const width = chooseBinWidth(lowEdge, highEdge);
    const lo = Math.floor(lowEdge / width);
    const hi = Math.floor(highEdge / width);
    const counts = new Array<number>(hi - lo + 1).fill(0);
    let total = 0;
    for (const value of sample) {
      total += value;
      // Clamped, so the trimmed tails land in the end bars rather than falling
      // out of the sample the histogram claims to show.
      const index = Math.min(
        Math.max(Math.floor(value / width) - lo, 0),
        counts.length - 1,
      );
      counts[index] += 1;
    }
    const mean = total / sample.length;
    let sumSquares = 0;
    for (const value of sample) sumSquares += (value - mean) ** 2;

    const bars: BarDatum[] = counts.map((count, i) => {
      const edge = (lo + i) * width;
      // The bar's lower edge labels it; bins below zero are entirely negative.
      // The end bars carry the folded tail, so they're labelled by the bound
      // they're open past instead of pretending to be one bin wide.
      const label =
        i === 0 && worst < edge
          ? `< ${formatChangePct(edge + width)}`
          : i === counts.length - 1 && best >= edge + width
            ? `≥ ${formatChangePct(edge)}`
            : formatChangePct(edge);
      return { label, value: count, color: edge < 0 ? DOWN_COLOR : UP_COLOR };
    });

    return {
      bars,
      mean,
      stdev: Math.sqrt(sumSquares / (sample.length - 1)),
      best,
      worst,
      count: sample.length,
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
  if (isLoading && !stats)
    return <FrameStatus loading>loading return history…</FrameStatus>;
  if (!stats) return <FrameStatus>not enough fix history yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1.5 text-normal">
      <BarChart
        data={stats.bars}
        orientation="vertical"
        height={140}
        formatValue={formatCompact}
        showValues={false}
        maxTickLabels={7}
      />
      <div className="caption text-soft text-center">
        {metalName(config.symbol)} · {formatCompact(stats.count)}{" "}
        {config.period} returns · {stats.span}
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
          value={formatChangePct(stats.best)}
          color={UP_COLOR}
        />
        <Stat
          label="worst"
          value={formatChangePct(stats.worst)}
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
