import { RadialGauge } from "@zframes/charts";
import { defineFrame, useMetalPositioning } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR, formatCompact } from "./format";
import { cotNet, metalName, percentileRank, sliceYears } from "./metals-shared";
import { metalCotGaugeMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = metalCotGaugeMeta.schema;

/** Mid-range readings carry no signal, so they take the dashboard accent rather
 *  than either half of the semantic pair. */
const ACCENT = "hsl(var(--zf-accent-hue, 242) 82% 70%)";

/** How the reading reads to a positioning-watcher: the tails are the signal. */
function classify(pct: number): string {
  if (pct < 20) return "washed out";
  if (pct < 40) return "light";
  if (pct <= 60) return "neutral";
  if (pct <= 80) return "crowded";
  return "very crowded long";
}

/**
 * CONTRARIAN colouring, not gain/loss: a crowded speculative long is the
 * warning (DOWN_COLOR) and a washed-out one is the opportunity (UP_COLOR) —
 * the inverse of a price delta. The caption says so on the card.
 */
function gaugeColor(pct: number): string {
  if (pct > 80) return DOWN_COLOR;
  if (pct < 20) return UP_COLOR;
  return ACCENT;
}

/** Contracts are a count, so compact magnitude with an explicit sign. */
function signedContracts(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatCompact(value)}`;
}

function MetalCotGauge({ config }: { config: z.output<typeof schema> }) {
  const { positioning, isLoading } = useMetalPositioning(config.symbol);

  const stats = useMemo(() => {
    const all = positioning?.weeks ?? [];
    if (all.length === 0) return null;
    // `sliceYears` is the shared metals window, so "5 years" means the same
    // span here as on the net chart beside it.
    const nets = sliceYears(
      all.map((w) => ({ time: w.time, value: cotNet(w) })),
      config.years,
    ).map((p) => p.value);
    // A percentile needs a distribution to rank against: a single report would
    // always come out 100th ("very crowded long") on no evidence at all.
    if (nets.length < 2) return null;
    let low = nets[0];
    let high = nets[0];
    for (const net of nets) {
      if (net < low) low = net;
      if (net > high) high = net;
    }
    const latest = nets[nets.length - 1];
    return { latest, pct: percentileRank(nets, latest), low, high };
  }, [positioning, config.years]);

  if (isLoading && !stats)
    return <FrameStatus loading>loading COT positioning…</FrameStatus>;
  if (!stats)
    return <FrameStatus>not enough COT positioning history yet</FrameStatus>;

  const color = gaugeColor(stats.pct);

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-1">
      <RadialGauge value={stats.pct} min={0} max={100} color={color} size={140}>
        <div className="metric-xl leading-none tabular-nums" style={{ color }}>
          {Math.round(stats.pct)}
        </div>
        <div
          className="caption mt-1 rounded-full bg-white/[0.07] px-2 py-0.5 uppercase tracking-wide"
          style={{ color }}
        >
          {classify(stats.pct)}
        </div>
      </RadialGauge>

      <div className="body-sm text-normal tabular-nums">
        net {signedContracts(stats.latest)}
      </div>
      <div className="caption text-soft text-center">
        {metalName(config.symbol)} spec net percentile, {config.years}y range{" "}
        {signedContracts(stats.low)} … {signedContracts(stats.high)}
      </div>
      {/* Kept to one line: at the card's minimum height a two-line explainer
          is the thing that clips, and a half-shown caption reads as a bug. */}
      <div className="caption text-soft text-center">
        contrarian scale — crowded long is the warning colour
      </div>
    </div>
  );
}

export const metalCotGaugeFrame = defineFrame({
  ...metalCotGaugeMeta,
  component: MetalCotGauge,
});
