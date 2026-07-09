import { defineFrame, useFeesOverview } from "@zframes/core";
import { MetricGauge, ZONE_NEUTRAL } from "./cycle-shared";
import { changeColor, formatChangePct, formatCompactUsd } from "./format";
import { defiRevenueMeta } from "./schemas";
import { FrameStatus } from "./ui";

function DefiRevenue() {
  const { fees, isLoading } = useFeesOverview();

  if (isLoading) return <FrameStatus loading>loading DeFi fees…</FrameStatus>;
  if (!fees) return <FrameStatus>no fees data yet</FrameStatus>;

  const color = fees.changePct != null ? changeColor(fees.changePct) : ZONE_NEUTRAL;

  return (
    <MetricGauge
      caption="DeFi Fees · 24h"
      headline={formatCompactUsd(fees.total24h)}
      headlineColor={ZONE_NEUTRAL}
      zone={{ label: "protocol fees", color: ZONE_NEUTRAL }}
      sub={fees.changePct != null ? `1d ${formatChangePct(fees.changePct)}` : undefined}
      sparkline={fees.history}
      sparkColor={color}
    />
  );
}

export const defiRevenueFrame = defineFrame({
  ...defiRevenueMeta,
  component: DefiRevenue,
});
