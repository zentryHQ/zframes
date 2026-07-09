import { defineFrame, useStablecoinSupply } from "@zframes/core";
import { MetricGauge, ZONE_NEUTRAL } from "./cycle-shared";
import { changeColor, formatChangePct, formatCompactUsd } from "./format";
import { stablecoinSupplyMeta } from "./schemas";
import { FrameStatus } from "./ui";

function StablecoinSupply() {
  const { supply, isLoading } = useStablecoinSupply();

  if (isLoading)
    return <FrameStatus loading>loading stablecoin supply…</FrameStatus>;
  if (!supply) return <FrameStatus>no stablecoin data yet</FrameStatus>;

  const color = changeColor(supply.changePct7d);
  const chains = supply.topChains
    .slice(0, 3)
    .map((c) => c.name)
    .join(" · ");

  return (
    <MetricGauge
      caption="Stablecoin Supply"
      headline={formatCompactUsd(supply.totalUsd)}
      headlineColor={ZONE_NEUTRAL}
      zone={{
        label: supply.changePct7d >= 0 ? "Expanding" : "Contracting",
        color,
      }}
      sub={`7d ${formatChangePct(supply.changePct7d)}${chains ? ` · ${chains}` : ""}`}
      sparkline={supply.history}
      sparkColor={color}
    />
  );
}

export const stablecoinSupplyFrame = defineFrame({
  ...stablecoinSupplyMeta,
  component: StablecoinSupply,
});
