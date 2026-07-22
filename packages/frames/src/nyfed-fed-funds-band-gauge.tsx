import { RadialGauge } from "@zframes/charts";
import { defineFrame, useReferenceRates } from "@zframes/core";
import type { z } from "zod";
import { formatPct } from "./format";
import { nyfedFedFundsBandGaugeMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = nyfedFedFundsBandGaugeMeta.schema;
const accent = (a = 1) => `hsl(var(--zf-accent-hue, 242) 85% 72% / ${a})`;

function NyfedFedFundsBandGauge(_props: { config: z.output<typeof schema> }) {
  const { rates, isLoading } = useReferenceRates();
  const effr = rates.find((r) => r.code === "EFFR");

  if (isLoading)
    return <FrameStatus loading>loading fed funds rate…</FrameStatus>;
  if (
    !effr ||
    effr.targetRateFrom === undefined ||
    effr.targetRateTo === undefined
  )
    return <FrameStatus>no fed-funds target data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1">
      <RadialGauge
        value={effr.rate}
        min={effr.targetRateFrom}
        max={effr.targetRateTo}
        color={accent()}
        size={170}
      >
        <div
          className="metric-xl leading-none"
          style={{ color: accent(), textShadow: `0 0 28px ${accent(0.35)}` }}
        >
          {formatPct(effr.rate)}
        </div>
        <div className="caption text-soft mt-1 uppercase tracking-wide">
          effective fed funds
        </div>
      </RadialGauge>
      <div className="caption text-soft">
        target {formatPct(effr.targetRateFrom)}–{formatPct(effr.targetRateTo)}
      </div>
    </div>
  );
}

export const nyfedFedFundsBandGaugeFrame = defineFrame({
  ...nyfedFedFundsBandGaugeMeta,
  component: NyfedFedFundsBandGauge,
});
