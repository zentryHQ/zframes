import { defineFrame, useOnchainValuation } from "@zframes/core";
import type { z } from "zod";
import { MetricGauge, ZONE_NEUTRAL, ZONE_WARN, zoneOf } from "./cycle-shared";
import { DOWN_COLOR, UP_COLOR } from "./format";
import { tail, windowDays } from "./indicators";
import { nuplMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = nuplMeta.schema;

function Nupl({ config }: { config: z.output<typeof schema> }) {
  const { valuation, isLoading } = useOnchainValuation();

  if (isLoading) return <FrameStatus loading>loading NUPL…</FrameStatus>;
  if (!valuation) return <FrameStatus>no on-chain data yet</FrameStatus>;

  // High NUPL = greed / late-cycle risk (red); capitulation (<0) = accumulation
  // opportunity (green); the middle bands are progressively warmer.
  const zone = zoneOf(
    valuation.nupl,
    [
      { upTo: 0, zone: { label: "Capitulation", color: UP_COLOR } },
      { upTo: 0.25, zone: { label: "Hope / Fear", color: ZONE_NEUTRAL } },
      { upTo: 0.5, zone: { label: "Optimism", color: ZONE_NEUTRAL } },
      { upTo: 0.75, zone: { label: "Belief", color: ZONE_WARN } },
    ],
    { label: "Euphoria / Greed", color: DOWN_COLOR },
  );

  return (
    <MetricGauge
      caption="Net Unrealized P/L"
      headline={`${(valuation.nupl * 100).toFixed(1)}%`}
      headlineColor={zone.color}
      zone={zone}
      sparkline={tail(valuation.history.nupl, windowDays(config.window))}
      sparkColor={zone.color}
    />
  );
}

export const nuplFrame = defineFrame({ ...nuplMeta, component: Nupl });
