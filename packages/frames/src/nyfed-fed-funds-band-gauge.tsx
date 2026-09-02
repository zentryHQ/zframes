import { RadialGauge } from "@zframes/charts";
import { defineFrame, useReferenceRates } from "@zframes/core";
import type { z } from "zod";
import { GaugeCard } from "./chart-card";
import { formatPct } from "./format";
import { GaugeReading, gaugeRingValue } from "./gauge-scale";
import { nyfedFedFundsBandGaugeMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = nyfedFedFundsBandGaugeMeta.schema;
const accent = (a = 1) => `hsl(var(--zf-accent-hue, 242) 85% 72% / ${a})`;

/**
 * Two decimals, matching the centre figure and the caption's band. Hoisted so
 * the ring's draw effect keeps one `formatValue` identity — and so the tooltip
 * stops printing an EFFR of 4.33 as a raw float.
 */
function formatRate(value: number): string {
  return formatPct(value);
}

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
      {/* The dial IS the FOMC's target band, and the effective rate is only
          normally inside it — it has printed below the floor at quarter-ends and
          above the ceiling under funding stress. Those are the readings this
          card exists to show, so the marker matters here more than anywhere:
          clamped silently, an EFFR through the ceiling drew a full ring and read
          as "at the top of the band". */}
      <RadialGauge
        value={gaugeRingValue(effr.rate, effr.targetRateFrom)}
        min={effr.targetRateFrom}
        max={effr.targetRateTo}
        color={accent()}
        formatValue={formatRate}
        fill
      >
        {/* Own bloom colour: the accent is an hsl(var(…)) expression, so the
            derived-from-hex default cannot apply. */}
        <GaugeReading
          value={effr.rate}
          min={effr.targetRateFrom}
          max={effr.targetRateTo}
          format={formatRate}
          tint={accent()}
          glow={accent(0.35)}
          label="effective fed funds"
        />
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
