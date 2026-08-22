import { RadialGauge } from "@zframes/charts";
import { defineFrame, useFearGreed } from "@zframes/core";
import type { z } from "zod";
import { GaugeCard } from "./chart-card";
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
    <GaugeCard>
      <RadialGauge value={latest.value} color={color} fill>
        <GaugeCard.Value tint={color}>{latest.value}</GaugeCard.Value>
        <GaugeCard.Label>{latest.classification}</GaugeCard.Label>
      </RadialGauge>
      <GaugeCard.Caption>crypto fear &amp; greed</GaugeCard.Caption>
    </GaugeCard>
  );
}

export const sentimentGaugeFrame = defineFrame({
  ...sentimentGaugeMeta,
  component: SentimentGauge,
});
