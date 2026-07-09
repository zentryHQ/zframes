import { defineFrame, useOnchainValuation } from "@zframes/core";
import type { z } from "zod";
import { MetricGauge, ZONE_NEUTRAL, ZONE_WARN, zoneOf } from "./cycle-shared";
import { DOWN_COLOR, UP_COLOR, formatPrice } from "./format";
import { tail, windowDays } from "./indicators";
import { mvrvMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = mvrvMeta.schema;

function Mvrv({ config }: { config: z.output<typeof schema> }) {
  const { valuation, isLoading } = useOnchainValuation();

  if (isLoading) return <FrameStatus loading>loading MVRV…</FrameStatus>;
  if (!valuation) return <FrameStatus>no on-chain data yet</FrameStatus>;

  const zone = zoneOf(
    valuation.mvrv,
    [
      { upTo: 1, zone: { label: "Undervalued", color: UP_COLOR } },
      { upTo: 2, zone: { label: "Fair value", color: ZONE_NEUTRAL } },
      { upTo: 3, zone: { label: "Elevated", color: ZONE_WARN } },
    ],
    { label: "Overvalued", color: DOWN_COLOR },
  );

  return (
    <MetricGauge
      caption="MVRV Ratio"
      headline={valuation.mvrv.toFixed(2)}
      headlineColor={zone.color}
      zone={zone}
      sub={`Z ${valuation.mvrvZScore.toFixed(2)} · RP ${formatPrice(valuation.realizedPrice)}`}
      sparkline={tail(valuation.history.mvrv, windowDays(config.window))}
      sparkColor={zone.color}
    />
  );
}

export const mvrvFrame = defineFrame({ ...mvrvMeta, component: Mvrv });
