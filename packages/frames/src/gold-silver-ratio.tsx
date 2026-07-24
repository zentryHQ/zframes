import { MiniLineChart } from "@zframes/charts";
import { defineFrame, useMetalHistory } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct, formatPct } from "./format";
import {
  downsample,
  pctChange,
  percentileRank,
  ratioSeries,
  sliceYears,
  toChartData,
} from "./metals-shared";
import { goldSilverRatioMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = goldSilverRatioMeta.schema;

/** The ratio is a bare multiple of ounces, so it wants neither the "$" of
 *  formatPrice nor the 4dp of formatRate — one decimal is how the desk quotes
 *  it ("69.1"). */
const formatRatio = (value: number) => value.toFixed(1);

/**
 * Plain-language read of the percentile. Note the sign convention: a HIGH ratio
 * means one ounce of gold buys a LOT of silver, i.e. silver is the cheap leg —
 * so a high percentile reads "silver cheap", not "silver strong".
 */
function readPercentile(percentile: number): string {
  if (percentile >= 85) return "silver historically cheap vs gold";
  if (percentile >= 60) return "silver on the cheap side";
  if (percentile > 40) return "mid-range — neither leg stretched";
  if (percentile > 15) return "silver on the dear side";
  return "silver historically dear vs gold";
}

function GoldSilverRatio({ config }: { config: z.output<typeof schema> }) {
  // Inline literal is safe: the hook keys its poll off symbols.join(",").
  const { histories, isLoading } = useMetalHistory(["XAU", "XAG"]);

  const view = useMemo(() => {
    const gold = histories.find((h) => h.symbol === "XAU")?.points ?? [];
    const silver = histories.find((h) => h.symbol === "XAG")?.points ?? [];
    // Window each leg BEFORE dividing (metals-shared's "windowing before
    // maths"): a ratio needs no warm-up, so day-aligning two 14,600-point fix
    // files and then throwing most of the result away is pure waste.
    const windowed = ratioSeries(
      sliceYears(gold, config.years),
      sliceYears(silver, config.years),
    );
    if (windowed.length === 0) return null;

    // reduce, not Math.min(...values) — a 58-year window is ~14,600 points and
    // spreading that into an argument list is a stack risk for no gain.
    let low = Infinity;
    let high = -Infinity;
    const values: number[] = [];
    for (const point of windowed) {
      values.push(point.value);
      if (point.value < low) low = point.value;
      if (point.value > high) high = point.value;
    }
    const current = values[values.length - 1];

    return {
      current,
      low,
      high,
      changePct: pctChange(values[0], current),
      percentile: percentileRank(values, current),
      spark: toChartData(downsample(windowed, 240)),
    };
  }, [histories, config.years]);

  if (isLoading)
    return <FrameStatus loading>loading gold &amp; silver fixes…</FrameStatus>;
  if (!view)
    return (
      <FrameStatus>no overlapping gold &amp; silver fixes yet</FrameStatus>
    );

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="caption text-soft uppercase">gold / silver</div>
          <div className="metric-xl text-strong leading-none">
            {formatRatio(view.current)}
          </div>
          <div className="caption text-soft mt-1">
            oz of silver per oz of gold
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className="body-md font-bold tabular-nums"
            style={{ color: changeColor(view.changePct) }}
          >
            {formatChangePct(view.changePct)}
          </div>
          <div className="caption text-soft">{config.years}y change</div>
        </div>
      </div>

      {/* One point is a dot, not a trend — skip the chart rather than draw an
          empty shell under the headline. */}
      {view.spark.length > 1 && (
        <MiniLineChart
          data={view.spark}
          width={320}
          height={48}
          color="hsl(var(--zf-accent-hue, 242) 85% 72%)"
        />
      )}

      {config.showPercentile && (
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] pt-2">
          <div className="min-w-0">
            <div className="body-sm text-normal font-bold tabular-nums">
              {formatPct(view.percentile, 0)} of {config.years}y range
            </div>
            <div className="caption text-soft truncate">
              {readPercentile(view.percentile)}
            </div>
          </div>
          <div className="caption text-soft shrink-0 text-right tabular-nums">
            low {formatRatio(view.low)}
            <br />
            high {formatRatio(view.high)}
          </div>
        </div>
      )}
    </div>
  );
}

export const goldSilverRatioFrame = defineFrame({
  ...goldSilverRatioMeta,
  component: GoldSilverRatio,
});
