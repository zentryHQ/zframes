import { defineFrame, useOnchainExtras } from "@zframes/core";
import type { z } from "zod";
import { MetricGauge, ZONE_NEUTRAL, ZONE_WARN, zoneOf } from "./cycle-shared";
import { DOWN_COLOR, UP_COLOR } from "./format";
import { tail, windowDays } from "./indicators";
import { puellMultipleMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = puellMultipleMeta.schema;

function PuellMultiple({ config }: { config: z.output<typeof schema> }) {
  const { extras, isLoading } = useOnchainExtras();

  if (isLoading) return <FrameStatus loading>loading Puell…</FrameStatus>;
  if (!extras || extras.puell === null)
    return <FrameStatus>Puell Multiple unavailable</FrameStatus>;

  const zone = zoneOf(
    extras.puell,
    [
      { upTo: 0.5, zone: { label: "Miner capitulation", color: UP_COLOR } },
      { upTo: 2, zone: { label: "Normal", color: ZONE_NEUTRAL } },
      { upTo: 4, zone: { label: "Elevated", color: ZONE_WARN } },
    ],
    { label: "Cycle-top zone", color: DOWN_COLOR },
  );

  return (
    <MetricGauge
      caption="Puell Multiple"
      headline={extras.puell.toFixed(2)}
      headlineColor={zone.color}
      zone={zone}
      sparkline={tail(extras.history.puell, windowDays(config.window))}
      sparkColor={zone.color}
    />
  );
}

export const puellMultipleFrame = defineFrame({
  ...puellMultipleMeta,
  component: PuellMultiple,
});
