import { BarChart } from "@zframes/charts";
import { defineFrame, useEthSupply } from "@zframes/core";
import { useMemo } from "react";
import { DOWN_COLOR, UP_COLOR, formatChangePct } from "./format";
import { ethIssuanceImpactMeta } from "./schemas";
import { FrameStatus } from "./ui";

function EthIssuanceImpact() {
  const { supply, isLoading } = useEthSupply();

  const data = useMemo(
    () =>
      supply
        ? [
            { label: "PoS (actual)", value: supply.supplyGrowthYearlyPct },
            {
              label: "PoW (counterfactual)",
              value: supply.supplyGrowthYearlyPowPct,
            },
          ]
        : [],
    [supply],
  );

  if (isLoading)
    return <FrameStatus loading>loading ETH issuance…</FrameStatus>;
  if (!supply) return <FrameStatus>no ETH data yet</FrameStatus>;

  // Net negative supply growth = deflationary ("ultrasound") = bullish
  // scarcity, so the sign→color mapping inverts the usual gain/loss tint.
  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart
        data={data}
        orientation="horizontal"
        color={DOWN_COLOR}
        negativeColor={UP_COLOR}
        height={Math.max(data.length * 28, 84)}
        formatValue={formatChangePct}
      />
      <div className="caption text-soft text-center">
        Net{" "}
        {supply.supplyGrowthYearlyPct <= 0 ? "deflationary" : "inflationary"} ·{" "}
        {formatChangePct(supply.supplyGrowthYearlyPct)}/yr
      </div>
    </div>
  );
}

export const ethIssuanceImpactFrame = defineFrame({
  ...ethIssuanceImpactMeta,
  component: EthIssuanceImpact,
});
