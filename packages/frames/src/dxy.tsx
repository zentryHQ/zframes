import { defineFrame, useDollarIndex } from "@zframes/core";
import { MetricGauge, ZONE_NEUTRAL } from "./cycle-shared";
import { changeColor, formatChangePct } from "./format";
import { dxyMeta } from "./schemas";
import { FrameStatus } from "./ui";

function Dxy() {
  const { dxy, isLoading } = useDollarIndex();

  if (isLoading) return <FrameStatus loading>loading DXY…</FrameStatus>;
  if (!dxy) return <FrameStatus>no FX data yet</FrameStatus>;

  const dirColor = changeColor(dxy.changePct);

  return (
    <MetricGauge
      caption="US Dollar Index"
      headline={dxy.value.toFixed(2)}
      headlineColor={ZONE_NEUTRAL}
      zone={{
        label: dxy.changePct >= 0 ? "Stronger USD" : "Weaker USD",
        color: dirColor,
      }}
      sub={formatChangePct(dxy.changePct)}
      sparkline={dxy.history}
      sparkColor={dirColor}
    />
  );
}

export const dxyFrame = defineFrame({ ...dxyMeta, component: Dxy });
