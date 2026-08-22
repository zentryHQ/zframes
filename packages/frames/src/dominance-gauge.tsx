import { RadialGauge } from "@zframes/charts";
import { defineFrame, useGlobalMarket } from "@zframes/core";
import type { z } from "zod";
import { GaugeCard } from "./chart-card";
import { formatPct } from "./format";
import { dominanceGaugeMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = dominanceGaugeMeta.schema;

// Derive the arc color from the dashboard accent hue so it recolors with the
// theme (dominance carries no gain/loss semantics — not the up/down pair).
const ACCENT = "hsl(var(--zf-accent-hue, 242) 82% 70%)";

function DominanceGauge({ config }: { config: z.output<typeof schema> }) {
  const { market, isLoading } = useGlobalMarket();

  if (isLoading) return <FrameStatus loading>loading dominance…</FrameStatus>;
  if (!market) return <FrameStatus>no market data yet</FrameStatus>;

  const value = market.dominance[config.coin] ?? 0;
  const symbol = config.coin.toUpperCase();

  return (
    <GaugeCard>
      <RadialGauge value={value} min={0} max={100} color={ACCENT} fill>
        {/* Explicit bloom colour: the tint is an hsl(var(…)) expression, so the
            derived-from-hex default cannot apply to it. */}
        <GaugeCard.Value
          tint={ACCENT}
          glow="hsl(var(--zf-accent-hue, 242) 82% 70% / 0.33)"
        >
          {formatPct(value, 1)}
        </GaugeCard.Value>
        <GaugeCard.Label>{symbol} dominance</GaugeCard.Label>
      </RadialGauge>
      <GaugeCard.Caption>share of total market cap</GaugeCard.Caption>
    </GaugeCard>
  );
}

export const dominanceGaugeFrame = defineFrame({
  ...dominanceGaugeMeta,
  component: DominanceGauge,
});
