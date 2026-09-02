import { RadialGauge } from "@zframes/charts";
import { defineFrame, useOptionsSummary } from "@zframes/core";
import type { z } from "zod";
import { GaugeCard } from "./chart-card";
import { DOWN_COLOR, UP_COLOR } from "./format";
import { GaugeReading, gaugeRingValue } from "./gauge-scale";
import { putCallGaugeMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = putCallGaugeMeta.schema;

/** The dial covers a call-heavy 0 to a put-heavy 2; a ratio can exceed either. */
const MIN = 0;
const MAX = 2;

/**
 * Two decimals, the same as the centre figure. Hoisted so the ring's draw
 * effect keeps one `formatValue` identity across renders.
 */
function formatRatio(value: number): string {
  return value.toFixed(2);
}

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
      <RadialGauge
        value={gaugeRingValue(value, MIN)}
        min={MIN}
        max={MAX}
        color={color}
        formatValue={formatRatio}
        fill
      >
        {/* No bloom: this card never drew one, unlike the vol/sentiment gauges. */}
        <GaugeReading
          value={value}
          min={MIN}
          max={MAX}
          format={formatRatio}
          tint={color}
          glow={false}
          label="put / call"
        />
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
