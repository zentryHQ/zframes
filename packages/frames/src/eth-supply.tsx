import { defineFrame, useEthSupply } from "@zframes/core";
import { MetricGauge } from "./cycle-shared";
import { DOWN_COLOR, UP_COLOR } from "./format";
import { ethSupplyMeta } from "./schemas";
import { FrameStatus } from "./ui";

const ethPerYr = (eth: number) =>
  `${Math.round(eth).toLocaleString("en-US")} ETH/yr`;

function EthSupply() {
  const { supply, isLoading } = useEthSupply();

  if (isLoading) return <FrameStatus loading>loading ETH supply…</FrameStatus>;
  if (!supply) return <FrameStatus>no ETH data yet</FrameStatus>;

  const g = supply.supplyGrowthYearlyPct;
  // Net negative supply growth = deflationary ("ultrasound") = bullish scarcity.
  const color = g <= 0 ? UP_COLOR : DOWN_COLOR;

  return (
    <MetricGauge
      caption="ETH Net Supply Growth · yr"
      headline={`${g >= 0 ? "+" : ""}${g.toFixed(2)}%`}
      headlineColor={color}
      zone={{ label: g <= 0 ? "Deflationary" : "Inflationary", color }}
      sub={`burn ${ethPerYr(supply.burnRateYearlyEth)} · issue ${ethPerYr(supply.issuanceRateYearlyEth)}`}
      sparkline={supply.history}
      sparkColor={color}
    />
  );
}

export const ethSupplyFrame = defineFrame({
  ...ethSupplyMeta,
  component: EthSupply,
});
