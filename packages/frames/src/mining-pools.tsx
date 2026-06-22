import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useMiningPools } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { miningPoolsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = miningPoolsMeta.schema;

interface PoolNode extends TreeNode {
  sharePct: number;
}

function Leaf({
  width,
  height,
  data,
}: {
  width: number;
  height: number;
  data: PoolNode;
}) {
  if (width < 48 || height < 30) return null;
  const compact = width < 70 || height < 44;
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center overflow-hidden p-1 text-center"
      title={`${data.id} · ${data.sharePct.toFixed(1)}% of blocks`}
    >
      <span className="body-sm truncate font-bold text-white">{data.id}</span>
      {!compact && (
        <span className="caption text-white/80">
          {data.sharePct.toFixed(1)}%
        </span>
      )}
    </div>
  );
}

function MiningPoolsFrame({ config }: { config: z.output<typeof schema> }) {
  const { pools, isLoading } = useMiningPools(config.window);

  const data: PoolNode[] = useMemo(() => {
    const all = pools?.pools ?? [];
    const top = all.slice(0, config.topN);
    const nodes: PoolNode[] = top.map((p) => ({
      id: p.name,
      value: p.blockCount,
      sharePct: p.sharePct,
    }));
    const rest = all.slice(config.topN);
    if (rest.length > 0) {
      const blocks = rest.reduce((sum, p) => sum + p.blockCount, 0);
      const share = rest.reduce((sum, p) => sum + p.sharePct, 0);
      if (blocks > 0)
        nodes.push({ id: "Other", value: blocks, sharePct: share });
    }
    return nodes;
  }, [pools, config.topN]);

  if (isLoading) return <FrameStatus loading>loading pools…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no mining data</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.sharePct}
    />
  );
}

export const miningPoolsFrame = defineFrame({
  ...miningPoolsMeta,
  component: MiningPoolsFrame,
});
