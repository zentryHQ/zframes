import { parseMarketData, TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useProtocolTvl } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { protocolTvlTreemapMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = protocolTvlTreemapMeta.schema;

interface ProtocolNode extends TreeNode {
  tvl: number;
  changePct: number;
}

function Leaf({
  width,
  height,
  data,
}: {
  width: number;
  height: number;
  data: ProtocolNode;
}) {
  if (width < 48 || height < 30) return null;
  const compact = width < 70 || height < 44;
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center overflow-hidden p-1 text-center"
      title={`${data.id} · $${parseMarketData(data.tvl)} TVL`}
    >
      <span className="body-sm truncate font-bold text-white">{data.id}</span>
      {!compact && (
        <span className="caption text-white/70">
          ${parseMarketData(data.tvl)}
        </span>
      )}
    </div>
  );
}

function ProtocolTvlTreemap({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useProtocolTvl();

  const data: ProtocolNode[] = useMemo(
    () =>
      entries.slice(0, config.topN).map((entry) => ({
        id: entry.name,
        value: entry.tvl,
        tvl: entry.tvl,
        changePct: entry.changePct ?? 0,
      })),
    [entries, config.topN],
  );

  if (isLoading) return <FrameStatus loading>loading protocol TVL…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no protocol TVL data</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.changePct}
    />
  );
}

export const protocolTvlTreemapFrame = defineFrame({
  ...protocolTvlTreemapMeta,
  component: ProtocolTvlTreemap,
});
