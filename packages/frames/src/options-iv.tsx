import { MiniLineChart } from "@zframes/charts";
import { defineFrame, useVolatilityIndex } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor } from "./format";
import { optionsIvMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = optionsIvMeta.schema;

const LOOKBACK: Record<string, { ms: number; res: number }> = {
  "7D": { ms: 7 * 86_400_000, res: 3_600 },
  "1M": { ms: 30 * 86_400_000, res: 43_200 },
  "3M": { ms: 90 * 86_400_000, res: 86_400 },
};

function OptionsIv({ config }: { config: z.output<typeof schema> }) {
  const { ms, res } = LOOKBACK[config.lookback];
  // Snap the window start to its resolution so it's stable across remounts:
  // the provider's cache key includes startMs, and TtlCache has no eviction,
  // so a drifting Date.now()-based start would churn a fresh entry each mount.
  const startMs = useMemo(() => {
    const resMs = res * 1000;
    return Math.floor((Date.now() - ms) / resMs) * resMs;
  }, [ms, res]);
  const { points, isLoading } = useVolatilityIndex(
    config.currency,
    startMs,
    res,
  );

  const sparkline = useMemo(
    () =>
      points.map((p) => ({
        date: new Date(p.time).toISOString(),
        value: p.value,
      })),
    [points],
  );

  if (isLoading) return <FrameStatus loading>loading volatility…</FrameStatus>;
  if (points.length === 0)
    return <FrameStatus>no volatility data yet</FrameStatus>;

  const current = points[points.length - 1].value;
  const change = current - points[0].value;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="caption text-soft uppercase">
            {config.currency} DVOL · implied vol
          </div>
          <div className="metric-lg text-strong leading-none">
            {current.toFixed(1)}
          </div>
        </div>
        <div className="text-right">
          <div
            className="body-md font-bold tabular-nums"
            style={{ color: changeColor(change) }}
          >
            {change >= 0 ? "+" : ""}
            {change.toFixed(1)}
          </div>
          <div className="caption text-soft">past {config.lookback}</div>
        </div>
      </div>

      <MiniLineChart
        data={sparkline}
        width={320}
        height={54}
        color="hsl(var(--zf-accent-hue, 242) 85% 72%)"
      />
    </div>
  );
}

export const optionsIvFrame = defineFrame({
  ...optionsIvMeta,
  component: OptionsIv,
});
