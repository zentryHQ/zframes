import { parseMarketData, TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useProtocolFees } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { protocolFeesTreemapMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = protocolFeesTreemapMeta.schema;

interface FeesNode extends TreeNode {
  fees24h: number;
  changePct: number;
}

function Leaf({
  width,
  height,
  data,
}: {
  width: number;
  height: number;
  data: FeesNode;
}) {
  if (width < 48 || height < 30) return null;
  const compact = width < 70 || height < 44;
  return (
    <div
      className="flex h-full w-full flex-col items-center justify-center overflow-hidden p-1 text-center"
      title={`${data.id} · $${parseMarketData(data.fees24h)} 24h fees`}
    >
      <span className="body-sm truncate font-bold text-white">{data.id}</span>
      {!compact && (
        <span className="caption text-white/70">
          ${parseMarketData(data.fees24h)}
        </span>
      )}
    </div>
  );
}

function ProtocolFeesTreemap({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useProtocolFees();

  const data: FeesNode[] = useMemo(
    () =>
      entries.slice(0, config.topN).map((entry) => ({
        id: entry.name,
        value: entry.fees24h,
        fees24h: entry.fees24h,
        changePct: entry.changePct ?? 0,
      })),
    [entries, config.topN],
  );

  if (isLoading) return <FrameStatus loading>loading protocol fees…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no protocol fee data</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.changePct}
    />
  );
}

export const protocolFeesTreemapFrame = defineFrame({
  ...protocolFeesTreemapMeta,
  component: ProtocolFeesTreemap,
});
