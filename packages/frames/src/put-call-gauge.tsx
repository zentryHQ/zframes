import { RadialGauge } from "@zframes/charts";
import { defineFrame, useOptionsSummary } from "@zframes/core";
import type { z } from "zod";
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
    <div className="flex h-full flex-col items-center justify-center gap-1">
      <RadialGauge value={value} min={0} max={2} color={color} size={170}>
        <div className="metric-xl leading-none" style={{ color }}>
          {value.toFixed(2)}
        </div>
        <div className="caption text-soft mt-1 uppercase tracking-wide">
          put / call
        </div>
      </RadialGauge>
      <div className="caption text-soft">
        {config.currency} · by{" "}
        {config.basis === "oi" ? "open interest" : "volume"}
      </div>
    </div>
  );
}

export const putCallGaugeFrame = defineFrame({
  ...putCallGaugeMeta,
  component: PutCallGauge,
});
