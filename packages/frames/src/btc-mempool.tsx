import { defineFrame, useMempoolState } from "@zframes/core";
import type { z } from "zod";
import { btcMempoolMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = btcMempoolMeta.schema;

/** Tint a projected block by its median fee rate (sat/vB). */
function feeColor(medianFee: number): string {
  if (medianFee >= 100) return "#ff6b81";
  if (medianFee >= 50) return "#ffa057";
  if (medianFee >= 20) return "#ffd166";
  if (medianFee >= 5) return "#9bd45f";
  return "#3fd08f";
}

function BtcMempool({ config }: { config: z.output<typeof schema> }) {
  const { state, isLoading } = useMempoolState();

  if (isLoading) return <FrameStatus loading>loading mempool…</FrameStatus>;
  if (!state) return <FrameStatus>no mempool data</FrameStatus>;

  const blocks = state.projected.slice(0, config.projectedBlocks);
  const vMb = (state.vsize / 1e6).toFixed(1);

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="caption text-soft uppercase">unconfirmed</div>
          <div className="font-dmsans text-strong text-4xl font-bold leading-none tabular-nums">
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

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {blocks.map((b, i) => {
          const color = feeColor(b.medianFee);
          return (
            <div
              key={i}
              className="flex min-w-[72px] flex-col items-center justify-center rounded-md px-2 py-2"
              style={{
                background: `${color}14`,
                border: `1px solid ${color}33`,
              }}
            >
              <span
                className="body-md font-bold tabular-nums"
                style={{ color }}
              >
                ~{Math.round(b.medianFee)}
              </span>
              <span className="caption text-soft">sat/vB</span>
              <span className="caption text-soft mt-1">
                {b.nTx.toLocaleString("en-US")} tx
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const btcMempoolFrame = defineFrame({
  ...btcMempoolMeta,
  component: BtcMempool,
});
