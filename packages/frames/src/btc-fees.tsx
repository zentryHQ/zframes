import { defineFrame, useBtcFees } from "@zframes/core";
import type { z } from "zod";
import { FEE_RAMP, FeePill } from "./btc-shared";
import { btcFeesMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = btcFeesMeta.schema;

const TIER_LABEL: Record<string, string> = {
  fastest: "Next block",
  halfHour: "~30 min",
  hour: "~1 hour",
  economy: "Economy",
  minimum: "Minimum",
};

// Priority tiers map onto the shared fee ramp by urgency (fastest = warmest).
const TIER_COLOR: Record<string, string> = {
  fastest: FEE_RAMP[0],
  halfHour: FEE_RAMP[1],
  hour: FEE_RAMP[2],
  economy: FEE_RAMP[3],
  minimum: FEE_RAMP[4],
};

function BtcFees({ config }: { config: z.output<typeof schema> }) {
  const { fees, isLoading } = useBtcFees();

  if (isLoading) return <FrameStatus loading>loading fees…</FrameStatus>;
  if (!fees) return <FrameStatus>no fee data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-wrap content-center items-stretch justify-center gap-2">
      {config.tiers.map((tier) => (
        <FeePill
          key={tier}
          className="min-w-[64px] flex-1"
          color={TIER_COLOR[tier]}
          value={fees[tier]}
          caption={TIER_LABEL[tier]}
        />
      ))}
    </div>
  );
}

export const btcFeesFrame = defineFrame({
  ...btcFeesMeta,
  component: BtcFees,
});
