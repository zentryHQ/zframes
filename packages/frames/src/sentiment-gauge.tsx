import { RadialGauge } from "@zframes/charts";
import { defineFrame, useFearGreed } from "@zframes/core";
import type { z } from "zod";
import { sentimentGaugeMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = sentimentGaugeMeta.schema;

/** The fear & greed mood ramp (same deliberate exception as the fear-greed
 *  frame — a sentiment scale, NOT the up/down semantic pair). */
function indexColor(value: number): string {
  if (value <= 25) return "#F21553";
  if (value <= 45) return "#F97316";
  if (value <= 55) return "#F59E0B";
  if (value <= 75) return "#84CC16";
  return "#25A78D";
}

function SentimentGauge(_props: { config: z.output<typeof schema> }) {
  const { points, isLoading } = useFearGreed(1);
  const latest = points[0];

  if (isLoading) return <FrameStatus loading>loading index…</FrameStatus>;
  if (!latest) return <FrameStatus>no sentiment data yet</FrameStatus>;

  const color = indexColor(latest.value);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1">
      <RadialGauge value={latest.value} color={color} size={170}>
        <div
          className="metric-xl leading-none"
          style={{ color, textShadow: `0 0 28px ${color}55` }}
        >
          {latest.value}
        </div>
        <div className="caption text-soft mt-1 uppercase tracking-wide">
          {latest.classification}
        </div>
      </RadialGauge>
      <div className="caption text-soft">crypto fear &amp; greed</div>
    </div>
  );
}

export const sentimentGaugeFrame = defineFrame({
  ...sentimentGaugeMeta,
  component: SentimentGauge,
});
