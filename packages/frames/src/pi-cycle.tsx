import { defineFrame, useDailyCloseHistory } from "@zframes/core";
import { useMemo } from "react";
import type { SeriesPoint } from "@zframes/spec";
import type { z } from "zod";
import { MetricGauge, ZONE_NEUTRAL, ZONE_WARN, zoneOf } from "./cycle-shared";
import { DOWN_COLOR } from "./format";
import { sma, tail, windowDays } from "./indicators";
import { piCycleMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = piCycleMeta.schema;

function PiCycle({ config }: { config: z.output<typeof schema> }) {
  const { history, isLoading } = useDailyCloseHistory("btc");

  // Ratio of the 111-day MA to 2× the 350-day MA. Crossing 1 = the classic Pi
  // Cycle Top trigger.
  const series = useMemo<SeriesPoint[]>(() => {
    const closes = history.map((p) => p.value);
    const ma111 = sma(closes, 111);
    const ma350 = sma(closes, 350);
    const out: SeriesPoint[] = [];
    for (let i = 0; i < history.length; i++) {
      const a = ma111[i];
      const b = ma350[i];
      if (a !== null && b !== null && b > 0)
        out.push({ time: history[i].time, value: a / (2 * b) });
    }
    return out;
  }, [history]);

  if (isLoading) return <FrameStatus loading>loading Pi Cycle…</FrameStatus>;
  if (series.length === 0)
    return <FrameStatus>not enough price history yet</FrameStatus>;

  const latest = series[series.length - 1].value;
  const zone = zoneOf(
    latest,
    [
      { upTo: 0.85, zone: { label: "Normal", color: ZONE_NEUTRAL } },
      { upTo: 1, zone: { label: "Approaching top", color: ZONE_WARN } },
    ],
    { label: "TOP SIGNAL", color: DOWN_COLOR },
  );

  return (
    <MetricGauge
      caption="Pi Cycle · 111DMA ÷ 2×350DMA"
      headline={latest.toFixed(2)}
      headlineColor={zone.color}
      zone={zone}
      sub="crosses 1 at cycle tops"
      sparkline={tail(series, windowDays(config.window))}
      sparkColor={zone.color}
    />
  );
}

export const piCycleFrame = defineFrame({ ...piCycleMeta, component: PiCycle });
