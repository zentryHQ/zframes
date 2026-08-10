import { HistogramChart, sampleStats } from "@zframes/charts";
import { defineFrame, useCoinMovers } from "@zframes/core";
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
import { percentileRank } from "./metals-shared";
import { breadthHistogramMeta } from "./schemas";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus } from "./ui";

const schema = breadthHistogramMeta.schema;

const WINDOW_OPTIONS = ["1h", "24h", "7d", "30d"] as const;

/** A cross-section this thin isn't a distribution, it's a list. */
const MIN_COINS = 12;

/** Median of an unsorted sample. */
function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
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

function BreadthHistogram({ config }: { config: z.output<typeof schema> }) {
  const [window, setWindow] = useFrameChoice("window", config.window);
  const { entries, isLoading } = useCoinMovers(config.minRank);

  const sample = useMemo(() => {
    const eligible = entries.filter(
      (e) =>
        e.rank <= config.minRank && Number.isFinite(e.changePct[window] ?? NaN),
    );
    const values = eligible.map((e) => e.changePct[window]);
    const stats = sampleStats(values);
    if (!stats || values.length < MIN_COINS) return null;

    // Bitcoin's own move, so the field can be read as leading or lagging it —
    // the reason to look at a cross-section rather than a single chart.
    const btc = eligible.find((e) => e.symbol === "BTC");
    return {
      values,
      stats,
      med: median(values),
      btc: btc
        ? {
            change: btc.changePct[window],
            percentile: percentileRank(values, btc.changePct[window]),
          }
        : null,
    };
  }, [entries, window, config.minRank]);

  // Only blank the card before the first cross-section lands — a background
  // refresh keeps the histogram on screen instead of flashing to a skeleton.
  if (isLoading && !sample)
    return <FrameStatus loading>loading market breadth…</FrameStatus>;
  if (!sample) return <FrameStatus>breadth data unavailable</FrameStatus>;

  const { values, stats, med, btc } = sample;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1.5 text-normal">
      <div className="min-h-0 flex-1">
        <HistogramChart
          values={values}
          fill
          color={UP_COLOR}
          negativeColor={DOWN_COLOR}
          formatValue={formatChangePct}
          formatCount={formatCompact}
          showNormalCurve={config.showNormalCurve}
          markers={[
            { value: med, label: "median" },
            ...(btc
              ? [
                  {
                    value: btc.change,
                    label: "BTC",
                    color: changeColor(btc.change),
                  },
                ]
              : []),
          ]}
        />
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="caption text-soft min-w-0 truncate">
          {formatCompact(stats.count)} coins · {window} change
        </span>
        <TimeframeToggle
          options={WINDOW_OPTIONS}
          value={window}
          onChange={setWindow}
          label="breadth window"
        />
      </div>

      <div className="grid grid-cols-4 gap-2 border-t border-white/[0.08] pt-1.5">
        {/* Advancing share is the advance/decline read: 50% is a genuinely
            mixed tape, and a green median with 40% advancing means megacaps
            carried it. */}
        <Stat
          label="advancing"
          value={formatPct(stats.positivePct, 0)}
          color={changeColor(stats.positivePct - 50)}
        />
        <Stat
          label="median"
          value={formatChangePct(med)}
          color={changeColor(med)}
        />
        <Stat label="dispersion" value={formatPct(stats.stdev)} />
        <Stat
          label={btc ? `BTC · p${btc.percentile.toFixed(0)}` : "BTC"}
          value={btc ? formatChangePct(btc.change) : "–"}
          color={btc ? changeColor(btc.change) : undefined}
        />
      </div>
    </div>
  );
}

export const breadthHistogramFrame = defineFrame({
  ...breadthHistogramMeta,
  component: BreadthHistogram,
});
