import { RadialGauge } from "@zframes/charts";
import { defineFrame, useGlobalMarket } from "@zframes/core";
import type { z } from "zod";
import { GaugeCard } from "./chart-card";
import { formatPct } from "./format";
import { GaugeReading, gaugeRingValue } from "./gauge-scale";
import { dominanceGaugeMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = dominanceGaugeMeta.schema;

// Derive the arc color from the dashboard accent hue so it recolors with the
// theme (dominance carries no gain/loss semantics — not the up/down pair).
const ACCENT = "hsl(var(--zf-accent-hue, 242) 82% 70%)";

/** A share of the total, so the dial is the whole 0–100%. */
const MIN = 0;
const MAX = 100;

/** One decimal, matching the centre figure. Hoisted for a stable identity. */
function formatShare(value: number): string {
  return formatPct(value, 1);
}

function DominanceGauge({ config }: { config: z.output<typeof schema> }) {
  const { market, isLoading } = useGlobalMarket();

  if (isLoading) return <FrameStatus loading>loading dominance…</FrameStatus>;
  if (!market) return <FrameStatus>no market data yet</FrameStatus>;

  const value = market.dominance[config.coin] ?? 0;
  const symbol = config.coin.toUpperCase();

  return (
    <GaugeCard>
      <RadialGauge
        value={gaugeRingValue(value, MIN)}
        min={MIN}
        max={MAX}
        color={ACCENT}
        formatValue={formatShare}
        fill
      >
        {/* Explicit bloom colour: the tint is an hsl(var(…)) expression, so the
            derived-from-hex default cannot apply to it. */}
        <GaugeReading
          value={value}
          min={MIN}
          max={MAX}
          format={formatShare}
          tint={ACCENT}
          glow="hsl(var(--zf-accent-hue, 242) 82% 70% / 0.33)"
          label={`${symbol} dominance`}
        />
      </RadialGauge>
      <GaugeCard.Caption>share of total market cap</GaugeCard.Caption>
    </GaugeCard>
  );
}

export const dominanceGaugeFrame = defineFrame({
  ...dominanceGaugeMeta,
  component: DominanceGauge,
});
