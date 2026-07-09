import { defineFrame, useOnchainExtras } from "@zframes/core";
import type { z } from "zod";
import { MetricGauge, ZONE_NEUTRAL, ZONE_WARN, zoneOf } from "./cycle-shared";
import { DOWN_COLOR, UP_COLOR } from "./format";
import { tail, windowDays } from "./indicators";
import { soprMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = soprMeta.schema;

function Sopr({ config }: { config: z.output<typeof schema> }) {
  const { extras, isLoading } = useOnchainExtras();

  if (isLoading) return <FrameStatus loading>loading SOPR…</FrameStatus>;
  if (!extras || extras.sopr === null)
    return <FrameStatus>SOPR unavailable</FrameStatus>;

  // <1 = coins moving at a loss (capitulation, a bottoming tell → green);
  // hovering ~1 is neutral; sustained >1 = profit-taking / distribution.
  const zone = zoneOf(
    extras.sopr,
    [
      { upTo: 0.99, zone: { label: "Loss / capitulation", color: UP_COLOR } },
      { upTo: 1.01, zone: { label: "Neutral", color: ZONE_NEUTRAL } },
    ],
    { label: "Profit-taking", color: ZONE_WARN },
  );

  return (
    <MetricGauge
      caption="Spent Output Profit Ratio"
      headline={extras.sopr.toFixed(3)}
      headlineColor={zone.color}
      zone={zone}
      sub={
        extras.reserveRisk !== null
          ? `Reserve Risk ${extras.reserveRisk.toPrecision(2)}`
          : undefined
      }
      sparkline={tail(extras.history.sopr, windowDays(config.window))}
      sparkColor={zone.color}
    />
  );
}

export const soprFrame = defineFrame({ ...soprMeta, component: Sopr });
