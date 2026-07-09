import { defineFrame, useEthSupply } from "@zframes/core";
import { MetricGauge, ZONE_NEUTRAL } from "./cycle-shared";
import { UP_COLOR, formatPct } from "./format";
import { ethStakingMeta } from "./schemas";
import { FrameStatus } from "./ui";

function EthStaking() {
  const { supply, isLoading } = useEthSupply();

  if (isLoading) return <FrameStatus loading>loading staking APR…</FrameStatus>;
  if (!supply) return <FrameStatus>no ETH data yet</FrameStatus>;

  return (
    <MetricGauge
      caption="ETH Staking APR"
      headline={formatPct(supply.stakingAprPct)}
      headlineColor={UP_COLOR}
      zone={{ label: "validator yield", color: ZONE_NEUTRAL }}
      sub="issuance + MEV + tips"
      sparkline={[]}
      sparkColor={ZONE_NEUTRAL}
    />
  );
}

export const ethStakingFrame = defineFrame({
  ...ethStakingMeta,
  component: EthStaking,
});
