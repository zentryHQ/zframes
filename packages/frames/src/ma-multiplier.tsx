import { defineFrame, useDailyCloseHistory } from "@zframes/core";
import { useMemo } from "react";
import type { SeriesPoint } from "@zframes/spec";
import type { z } from "zod";
import {
  MetricGauge,
  ZONE_NEUTRAL,
  ZONE_WARN,
  zoneOf,
  type Zone,
} from "./cycle-shared";
import { DOWN_COLOR, UP_COLOR } from "./format";
import { sma, tail, windowDays } from "./indicators";
import { maMultiplierMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = maMultiplierMeta.schema;

function zoneFor(years: "2" | "4", value: number): Zone {
  if (years === "4")
    return zoneOf(
      value,
      [
        { upTo: 1, zone: { label: "Bottom", color: UP_COLOR } },
        { upTo: 2, zone: { label: "Normal", color: ZONE_NEUTRAL } },
        { upTo: 3.5, zone: { label: "Hot", color: ZONE_WARN } },
      ],
      { label: "Peak", color: DOWN_COLOR },
    );
  // 2-year multiplier: buy zone below ÷1.5 (≈0.667), sell tiers above ×2.
  return zoneOf(
    value,
    [
      { upTo: 0.667, zone: { label: "Buy zone", color: UP_COLOR } },
      { upTo: 2, zone: { label: "Normal", color: ZONE_NEUTRAL } },
      { upTo: 3, zone: { label: "Sell ×2–3", color: ZONE_WARN } },
    ],
    { label: "Sell zone", color: DOWN_COLOR },
  );
}

function MaMultiplier({ config }: { config: z.output<typeof schema> }) {
  const { history, isLoading } = useDailyCloseHistory("btc");
  const period = (config.years === "4" ? 4 : 2) * 365;

  const series = useMemo<SeriesPoint[]>(() => {
    const closes = history.map((p) => p.value);
    const ma = sma(closes, period);
    const out: SeriesPoint[] = [];
    for (let i = 0; i < history.length; i++) {
      const m = ma[i];
      if (m !== null && m > 0)
        out.push({ time: history[i].time, value: closes[i] / m });
    }
    return out;
  }, [history, period]);

  if (isLoading)
    return <FrameStatus loading>loading MA multiplier…</FrameStatus>;
  if (series.length === 0)
    return <FrameStatus>not enough price history yet</FrameStatus>;

  const latest = series[series.length - 1].value;
  const zone = zoneFor(config.years, latest);

  return (
    <MetricGauge
      caption={`Price / ${config.years}Y moving average`}
      headline={`${latest.toFixed(2)}×`}
      headlineColor={zone.color}
      zone={zone}
      sparkline={tail(series, windowDays(config.window))}
      sparkColor={zone.color}
    />
  );
}

export const maMultiplierFrame = defineFrame({
  ...maMultiplierMeta,
  component: MaMultiplier,
});
