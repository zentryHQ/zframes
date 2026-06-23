import { defineFrame, useMempoolState } from "@zframes/core";
import type { z } from "zod";
import { FeePill, feeRateColor } from "./btc-shared";
import { formatCompact } from "./format";
import { btcMempoolMeta } from "./schemas";
import { FrameStatus, scrollAreaXClass } from "./ui";

const schema = btcMempoolMeta.schema;

function BtcMempool({ config }: { config: z.output<typeof schema> }) {
  const { state, isLoading } = useMempoolState();

  if (isLoading) return <FrameStatus loading>loading mempool…</FrameStatus>;
  if (!state) return <FrameStatus>no mempool data yet</FrameStatus>;

  const blocks = state.projected.slice(0, config.projectedBlocks);
  const vMb = (state.vsize / 1e6).toFixed(1);

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="caption text-soft uppercase">unconfirmed</div>
          <div className="metric-lg text-strong leading-none">
            {state.count.toLocaleString("en-US")}
          </div>
          <div className="body-sm text-soft">transactions</div>
        </div>
        <div className="text-right">
          <div className="body-md text-normal font-bold tabular-nums">
            {vMb} MvB
          </div>
          <div className="caption text-soft">pending vsize</div>
        </div>
      </div>

      <div className={`flex gap-1.5 ${scrollAreaXClass}`}>
        {blocks.map((b, i) => (
          <FeePill
            key={i}
            className="min-w-[76px]"
            color={feeRateColor(b.medianFee)}
            value={`~${Math.round(b.medianFee)}`}
            caption={`${formatCompact(b.nTx)} tx`}
          />
        ))}
      </div>
    </div>
  );
}

export const btcMempoolFrame = defineFrame({
  ...btcMempoolMeta,
  component: BtcMempool,
});
