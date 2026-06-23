import { MiniLineChart } from "@zframes/charts";
import { defineFrame, useFearGreed } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { fearGreedMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = fearGreedMeta.schema;

/** 0 = extreme fear (red) … 100 = extreme greed (green). A bespoke sentiment
 *  ramp (NOT the up/down semantic pair) — it encodes a mood scale, so it's a
 *  deliberate exception to the shared green/red. */
function indexColor(value: number): string {
  if (value <= 25) return "#F21553";
  if (value <= 45) return "#F97316";
  if (value <= 55) return "#F59E0B";
  if (value <= 75) return "#84CC16";
  return "#25A78D";
}

function FearGreed({ config }: { config: z.output<typeof schema> }) {
  const { points, isLoading } = useFearGreed(config.sparklineDays);
  const latest = points[0];

  const sparkline = useMemo(
    () =>
      [...points].reverse().map((point) => ({
        date: new Date(point.time).toISOString(),
        value: point.value,
      })),
    [points],
  );

  if (isLoading) return <FrameStatus loading>loading index…</FrameStatus>;
  if (!latest) return <FrameStatus>no sentiment data yet</FrameStatus>;

  const color = indexColor(latest.value);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2.5">
      <div
        className="metric-xl leading-none"
        style={{ color, textShadow: `0 0 28px ${color}55` }}
      >
        {latest.value}
      </div>
      <div
        className="body-sm rounded-full px-2.5 py-0.5 font-semibold uppercase tracking-wide"
        style={{
          color,
          background: `${color}1f`,
          border: `1px solid ${color}33`,
        }}
      >
        {latest.classification}
      </div>

      {/* Striped mood bar */}
      <div className="relative w-full max-w-[180px] overflow-hidden rounded-xl">
        <div
          className="h-[11px] w-full opacity-40"
          style={{
            background:
              "linear-gradient(90deg, #FF1F5F 4.89%, #464646 34.15%, #464646 69.98%, #81FE90 100%)",
          }}
        />
        <div
          className="absolute left-0 top-0 h-full w-full"
          style={{
            background:
              "repeating-linear-gradient(to right, var(--color-background-terminal), var(--color-background-terminal) 2px, transparent 2px, transparent 3px)",
          }}
        />
        <div
          className="absolute top-1/2 h-3 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-xs"
          style={{
            left: `${latest.value}%`,
            background: color,
          }}
        />
      </div>

      <MiniLineChart data={sparkline} width={150} height={30} color={color} />
      <div className="caption text-soft">
        crypto fear &amp; greed · {config.sparklineDays}d
      </div>
    </div>
  );
}

export const fearGreedFrame = defineFrame({
  ...fearGreedMeta,
  component: FearGreed,
});
