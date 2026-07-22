import { RadialGauge } from "@zframes/charts";
import { defineFrame, useGlobalMarket } from "@zframes/core";
import type { z } from "zod";
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
    <div className="flex h-full flex-col items-center justify-center gap-1">
      <RadialGauge value={value} min={0} max={100} color={ACCENT} size={170}>
        <div
          className="metric-xl leading-none"
          style={{ color: ACCENT, textShadow: "0 0 28px hsl(var(--zf-accent-hue, 242) 82% 70% / 0.33)" }}
        >
          {formatPct(value, 1)}
        </div>
        <div className="caption text-soft mt-1 uppercase tracking-wide">
          {symbol} dominance
        </div>
      </RadialGauge>
      <div className="caption text-soft">share of total market cap</div>
    </div>
  );
}

export const dominanceGaugeFrame = defineFrame({
  ...dominanceGaugeMeta,
  component: DominanceGauge,
});
