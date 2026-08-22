import { defineFrame, useMempoolState } from "@zframes/core";
import type { z } from "zod";
import { FeePill, feeRateColor } from "./btc-shared";
import { CardHeader } from "./card-header";
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
      <CardHeader>
        <CardHeader.Main>
          <CardHeader.Eyebrow>unconfirmed</CardHeader.Eyebrow>
          <CardHeader.Value size="metric-lg">
            {state.count.toLocaleString("en-US")}
          </CardHeader.Value>
          <CardHeader.Sub>transactions</CardHeader.Sub>
        </CardHeader.Main>
        <CardHeader.Aside>
          <CardHeader.Value>{vMb} MvB</CardHeader.Value>
          <CardHeader.Sub>pending vsize</CardHeader.Sub>
        </CardHeader.Aside>
      </CardHeader>

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
