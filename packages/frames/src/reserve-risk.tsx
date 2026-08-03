import { defineFrame, useOnchainExtras } from "@zframes/core";
import type { z } from "zod";
import { MetricGauge, ZONE_NEUTRAL, zoneOf } from "./cycle-shared";
import { DOWN_COLOR, UP_COLOR } from "./format";
import { tail, windowDays } from "./indicators";
import { reserveRiskMeta } from "./schemas";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus } from "./ui";

const schema = reserveRiskMeta.schema;

const WINDOW_OPTIONS = ["90D", "180D", "1Y"] as const;

function ReserveRisk({ config }: { config: z.output<typeof schema> }) {
  const [chartWindow, setChartWindow] = useFrameChoice("window", config.window);
  const { extras, isLoading } = useOnchainExtras();

  if (isLoading)
    return <FrameStatus loading>loading reserve risk…</FrameStatus>;
  if (!extras || extras.reserveRisk === null)
    return <FrameStatus>Reserve Risk unavailable</FrameStatus>;

  // Low reserve risk = strong holder conviction at a low price (attractive);
  // high = conviction being spent into a high price.
  const zone = zoneOf(
    extras.reserveRisk,
    [
      { upTo: 0.0015, zone: { label: "Attractive", color: UP_COLOR } },
      { upTo: 0.008, zone: { label: "Neutral", color: ZONE_NEUTRAL } },
    ],
    { label: "Elevated", color: DOWN_COLOR },
  );

  return (
    <MetricGauge
      caption="Reserve Risk"
      headline={extras.reserveRisk.toPrecision(2)}
      headlineColor={zone.color}
      zone={zone}
      sparkline={tail(extras.history.reserveRisk, windowDays(chartWindow))}
      sparkColor={zone.color}
      control={
        <TimeframeToggle
          options={WINDOW_OPTIONS}
          value={chartWindow}
          onChange={setChartWindow}
          label="Reserve Risk history window"
        />
      }
    />
  );
}

export const reserveRiskFrame = defineFrame({
  ...reserveRiskMeta,
  component: ReserveRisk,
});
