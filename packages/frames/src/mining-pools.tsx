import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useMiningPools } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import { miningPoolsMeta } from "./schemas";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { TreemapLeaf } from "./treemap-leaf";
import { FrameStatus } from "./ui";

const schema = miningPoolsMeta.schema;

const WINDOW_OPTIONS = ["24h", "3d", "1w", "1m"] as const;

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
  const pct = formatPct(data.sharePct, 1);
  return (
    <TreemapLeaf
      width={width}
      height={height}
      label={data.id}
      secondary={pct}
      title={`${data.id} · ${pct} of blocks`}
    />
  );
}

function MiningPoolsFrame({ config }: { config: z.output<typeof schema> }) {
  const [chartWindow, setChartWindow] = useFrameChoice("window", config.window);
  const { pools, isLoading } = useMiningPools(chartWindow);

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
  if (data.length === 0) return <FrameStatus>no mining data yet</FrameStatus>;

  return (
    // No existing header row to slot the toggle into — treemap fills the
    // whole card, so it overlays top-right rather than costing a row.
    <div className="relative h-full">
      <TimeframeToggle
        options={WINDOW_OPTIONS}
        value={chartWindow}
        onChange={setChartWindow}
        label="mining pool window"
        className="absolute top-0 right-0 z-10"
      />
      <TreeChart
        data={data}
        LeafComponent={Leaf}
        getColorValue={(node) => node.sharePct}
      />
    </div>
  );
}

export const miningPoolsFrame = defineFrame({
  ...miningPoolsMeta,
  component: MiningPoolsFrame,
});
