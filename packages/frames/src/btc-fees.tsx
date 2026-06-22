import { defineFrame, useBtcFees } from "@zframes/core";
import type { z } from "zod";
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

// Warm = urgent (pay up to go next block), cool = patient (cheapest relayable).
const TIER_COLOR: Record<string, string> = {
  fastest: "#ff6b81",
  halfHour: "#ffa057",
  hour: "#ffd166",
  economy: "#9bd45f",
  minimum: "#3fd08f",
};

function BtcFees({ config }: { config: z.output<typeof schema> }) {
  const { fees, isLoading } = useBtcFees();

  if (isLoading) return <FrameStatus loading>loading fees…</FrameStatus>;
  if (!fees) return <FrameStatus>no fee data</FrameStatus>;

  return (
    <div className="flex h-full flex-wrap content-center items-stretch justify-center gap-2">
      {config.tiers.map((tier) => {
        const color = TIER_COLOR[tier];
        return (
          <div
            key={tier}
            className="flex min-w-[64px] flex-1 flex-col items-center justify-center rounded-lg px-2 py-2"
            style={{ background: `${color}14`, border: `1px solid ${color}33` }}
          >
            <span
              className="font-dmsans text-2xl font-bold leading-none tabular-nums"
              style={{ color }}
            >
              {fees[tier]}
            </span>
            <span className="caption text-soft mt-0.5">sat/vB</span>
            <span className="caption text-soft mt-1 text-center">
              {TIER_LABEL[tier]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const btcFeesFrame = defineFrame({
  ...btcFeesMeta,
  component: BtcFees,
});
