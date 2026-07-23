import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useEtfFlows } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompactUsd } from "./format";
import { etfIssuerTreemapMeta } from "./schemas";
import { TreemapLeaf } from "./treemap-leaf";
import { FrameStatus } from "./ui";

const schema = etfIssuerTreemapMeta.schema;

interface IssuerNode extends TreeNode {
  netAssets: number;
  dailyNetInflow: number;
}

function Leaf({
  width,
  height,
  data,
}: {
  width: number;
  height: number;
  data: IssuerNode;
}) {
  const aum = formatCompactUsd(data.netAssets);
  const flow = formatCompactUsd(data.dailyNetInflow);
  return (
    <TreemapLeaf
      width={width}
      height={height}
      label={data.id}
      secondary={aum}
      title={`${data.id} · ${aum} AUM · ${data.dailyNetInflow >= 0 ? "+" : ""}${flow} today`}
    />
  );
}

function EtfIssuerTreemap({ config }: { config: z.output<typeof schema> }) {
  const { flows, isLoading } = useEtfFlows(config.asset);

  const data: IssuerNode[] = useMemo(
    () =>
      (flows?.issuers ?? [])
        .filter((is) => is.netAssets > 0)
        .slice(0, config.limit)
        .map((is) => ({
          id: is.ticker,
          value: is.netAssets,
          netAssets: is.netAssets,
          dailyNetInflow: is.dailyNetInflow,
        })),
    [flows, config.limit],
  );

  if (isLoading) return <FrameStatus loading>loading ETF flows…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>ETF flows unavailable</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.dailyNetInflow}
    />
  );
}

export const etfIssuerTreemapFrame = defineFrame({
  ...etfIssuerTreemapMeta,
  component: EtfIssuerTreemap,
});
