import { RadialGauge } from "@zframes/charts";
import { defineFrame, useReferenceRates } from "@zframes/core";
import type { z } from "zod";
import { GaugeCard } from "./chart-card";
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
    <GaugeCard>
      <RadialGauge
        value={effr.rate}
        min={effr.targetRateFrom}
        max={effr.targetRateTo}
        color={accent()}
        fill
      >
        {/* Own bloom colour: the accent is an hsl(var(…)) expression, so the
            derived-from-hex default cannot apply. */}
        <GaugeCard.Value tint={accent()} glow={accent(0.35)}>
          {formatPct(effr.rate)}
        </GaugeCard.Value>
        <GaugeCard.Label>effective fed funds</GaugeCard.Label>
      </RadialGauge>
      <GaugeCard.Caption>
        target {formatPct(effr.targetRateFrom)}–{formatPct(effr.targetRateTo)}
      </GaugeCard.Caption>
    </GaugeCard>
  );
}

export const nyfedFedFundsBandGaugeFrame = defineFrame({
  ...nyfedFedFundsBandGaugeMeta,
  component: NyfedFedFundsBandGauge,
});
