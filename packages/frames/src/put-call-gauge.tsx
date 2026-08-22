import { RadialGauge } from "@zframes/charts";
import { defineFrame, useOptionsSummary } from "@zframes/core";
import type { z } from "zod";
import { GaugeCard } from "./chart-card";
import { DOWN_COLOR, UP_COLOR } from "./format";
import { putCallGaugeMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = putCallGaugeMeta.schema;

function PutCallGauge({ config }: { config: z.output<typeof schema> }) {
  const { summary, isLoading } = useOptionsSummary(config.currency);

  if (isLoading) return <FrameStatus loading>loading options…</FrameStatus>;
  if (!summary) return <FrameStatus>no options data yet</FrameStatus>;

  const value =
    config.basis === "oi" ? summary.putCallRatioOi : summary.putCallRatioVolume;
  // PCR > 1 = puts outweigh calls (defensive) → red; < 1 = call-heavy → green.
  const color = value > 1 ? DOWN_COLOR : UP_COLOR;

  return (
    <GaugeCard>
      <RadialGauge value={value} min={0} max={2} color={color} fill>
        {/* No bloom: this card never drew one, unlike the vol/sentiment gauges. */}
        <GaugeCard.Value tint={color} glow={false}>
          {value.toFixed(2)}
        </GaugeCard.Value>
        <GaugeCard.Label>put / call</GaugeCard.Label>
      </RadialGauge>
      <GaugeCard.Caption>
        {config.currency} · by{" "}
        {config.basis === "oi" ? "open interest" : "volume"}
      </GaugeCard.Caption>
    </GaugeCard>
  );
}

export const putCallGaugeFrame = defineFrame({
  ...putCallGaugeMeta,
  component: PutCallGauge,
});
