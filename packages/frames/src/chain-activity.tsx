import { defineFrame, useChainActivity } from "@zframes/core";
import { formatCompact } from "./format";
import { MetricRow } from "./metric-row";
import { chainActivityMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

function ChainActivity() {
  const { chains, isLoading } = useChainActivity();

  if (isLoading)
    return <FrameStatus loading>loading chain activity…</FrameStatus>;
  if (chains.length === 0) return <FrameStatus>no chain data</FrameStatus>;

  return (
    <div className={scrollAreaClass}>
      {chains.map((c) => (
        <MetricRow
          key={c.chain}
          label={c.label}
          meta={`${formatCompact(c.mempoolTxns)} mempool · ${formatCompact(c.blocks24h)} blocks`}
          value={`${formatCompact(c.transactions24h)} tx`}
        />
      ))}
    </div>
  );
}

export const chainActivityFrame = defineFrame({
  ...chainActivityMeta,
  component: ChainActivity,
});
