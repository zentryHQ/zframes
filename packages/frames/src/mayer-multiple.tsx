import { defineFrame, useDailyCloseHistory } from "@zframes/core";
import { useMemo } from "react";
import type { SeriesPoint } from "@zframes/spec";
import type { z } from "zod";
import { MetricGauge, ZONE_NEUTRAL, ZONE_WARN, zoneOf } from "./cycle-shared";
import { DOWN_COLOR, UP_COLOR } from "./format";
import { sma, tail, windowDays } from "./indicators";
import { mayerMultipleMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = mayerMultipleMeta.schema;

function MayerMultiple({ config }: { config: z.output<typeof schema> }) {
  const { history, isLoading } = useDailyCloseHistory("btc");

  const series = useMemo<SeriesPoint[]>(() => {
    const closes = history.map((p) => p.value);
    const ma = sma(closes, 200);
    const out: SeriesPoint[] = [];
    for (let i = 0; i < history.length; i++) {
      const m = ma[i];
      if (m !== null && m > 0)
        out.push({ time: history[i].time, value: closes[i] / m });
    }
    return out;
  }, [history]);

  if (isLoading)
    return <FrameStatus loading>loading Mayer Multiple…</FrameStatus>;
  if (series.length === 0)
    return <FrameStatus>not enough price history yet</FrameStatus>;

  const latest = series[series.length - 1].value;
  const zone = zoneOf(
    latest,
    [
      { upTo: 0.8, zone: { label: "Value", color: UP_COLOR } },
      { upTo: 1, zone: { label: "Accumulation", color: ZONE_NEUTRAL } },
      { upTo: 2.4, zone: { label: "Neutral", color: ZONE_NEUTRAL } },
    ],
    { label: "Overheated", color: DOWN_COLOR },
  );

  return (
    <MetricGauge
      caption="Mayer Multiple · price / 200DMA"
      headline={latest.toFixed(2)}
      headlineColor={zone.color}
      zone={zone}
      sparkline={tail(series, windowDays(config.window))}
      sparkColor={zone.color}
    />
  );
}

export const mayerMultipleFrame = defineFrame({
  ...mayerMultipleMeta,
  component: MayerMultiple,
});
