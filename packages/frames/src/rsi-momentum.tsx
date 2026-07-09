import { defineFrame, useDailyCloseHistory } from "@zframes/core";
import { useMemo } from "react";
import type { SeriesPoint } from "@zframes/spec";
import type { z } from "zod";
import { MetricGauge, ZONE_NEUTRAL, zoneOf } from "./cycle-shared";
import { DOWN_COLOR, UP_COLOR } from "./format";
import { rsi, tail, windowDays } from "./indicators";
import { rsiMomentumMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = rsiMomentumMeta.schema;

function RsiMomentum({ config }: { config: z.output<typeof schema> }) {
  const { history, isLoading } = useDailyCloseHistory("btc");

  const series = useMemo<SeriesPoint[]>(() => {
    const closes = history.map((p) => p.value);
    const values = rsi(closes, config.period);
    const out: SeriesPoint[] = [];
    for (let i = 0; i < history.length; i++) {
      const v = values[i];
      if (v !== null) out.push({ time: history[i].time, value: v });
    }
    return out;
  }, [history, config.period]);

  if (isLoading) return <FrameStatus loading>loading RSI…</FrameStatus>;
  if (series.length === 0)
    return <FrameStatus>not enough price history yet</FrameStatus>;

  const latest = series[series.length - 1].value;
  const zone = zoneOf(
    latest,
    [
      { upTo: 30, zone: { label: "Oversold", color: UP_COLOR } },
      { upTo: 45, zone: { label: "Risk-off", color: DOWN_COLOR } },
      { upTo: 55, zone: { label: "Neutral", color: ZONE_NEUTRAL } },
      { upTo: 80, zone: { label: "Risk-on", color: UP_COLOR } },
    ],
    { label: "Overbought", color: DOWN_COLOR },
  );

  return (
    <MetricGauge
      caption={`RSI ${config.period} · daily`}
      headline={latest.toFixed(0)}
      headlineColor={zone.color}
      zone={zone}
      sparkline={tail(series, windowDays(config.window))}
      sparkColor={zone.color}
    />
  );
}

export const rsiMomentumFrame = defineFrame({
  ...rsiMomentumMeta,
  component: RsiMomentum,
});
