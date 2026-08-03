import { RadialGauge } from "@zframes/charts";
import { defineFrame, useIndexSeries } from "@zframes/core";
import type { z } from "zod";
import { formatLevel } from "./format";
import { vixGaugeMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = vixGaugeMeta.schema;

/** FRED's series id for the VIX close — this frame is about one index only. */
const VIX_SERIES = "VIXCLS";

/**
 * The volatility-regime ramp. A deliberate exception to the up/down semantic
 * pair (like the fear-greed mood ramp): a rising VIX is not a "gain", it is a
 * move along a calm → panic scale, so the colour tracks the REGIME rather than
 * the direction of the last print.
 */
function regimeOf(value: number): { label: string; color: string } {
  if (value < 15) return { label: "Calm", color: "#25A78D" };
  if (value < 20) return { label: "Normal", color: "#84CC16" };
  if (value < 30) return { label: "Elevated", color: "#F59E0B" };
  if (value < 40) return { label: "Stressed", color: "#F97316" };
  return { label: "Panic", color: "#F21553" };
}

function VixGauge({ config }: { config: z.output<typeof schema> }) {
  const { series, isLoading } = useIndexSeries(VIX_SERIES);

  if (isLoading && !series)
    return <FrameStatus loading>loading VIX…</FrameStatus>;
  if (!series) return <FrameStatus>no VIX data yet</FrameStatus>;

  const regime = regimeOf(series.latest);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1">
      <RadialGauge
        value={series.latest}
        max={config.max}
        color={regime.color}
        size={170}
      >
        <div
          className="metric-xl leading-none"
          style={{
            color: regime.color,
            textShadow: `0 0 28px ${regime.color}55`,
          }}
        >
          {formatLevel(series.latest)}
        </div>
        <div className="caption text-soft mt-1 tracking-wide uppercase">
          {regime.label}
        </div>
      </RadialGauge>
      <div className="caption text-soft">
        30-day implied S&amp;P volatility · {series.date}
      </div>
    </div>
  );
}

export const vixGaugeFrame = defineFrame({
  ...vixGaugeMeta,
  component: VixGauge,
});
