import { TreeChart, type TreeNode } from "@zframes/charts";
import { defineFrame, useEtfFlows, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatPct } from "./format";
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
  const money = useMoney();
  const aum = money.compact(data.netAssets);
  return (
    <TreemapLeaf
      width={width}
      height={height}
      label={data.id}
      secondary={aum}
    />
  );
}

function EtfIssuerTreemap({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
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

  const totalAssets = flows?.totalNetAssets ?? 0;

  if (isLoading) return <FrameStatus loading>loading ETF flows…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>ETF flows unavailable</FrameStatus>;

  return (
    <TreeChart
      data={data}
      LeafComponent={Leaf}
      getColorValue={(node) => node.dailyNetInflow}
      formatTooltip={(node) => {
        const share =
          totalAssets > 0 ? (node.netAssets / totalAssets) * 100 : 0;
        return {
          title: node.id,
          rows: [
            { label: "AUM", value: money.compact(node.netAssets) },
            {
              label: "today",
              value: `${node.dailyNetInflow >= 0 ? "+" : ""}${money.compact(node.dailyNetInflow)}`,
              color: changeColor(node.dailyNetInflow),
            },
          ],
          footer:
            share > 0
              ? `${formatPct(share, 1)} of ${config.asset.toUpperCase()} ETF assets`
              : undefined,
        };
      }}
    />
  );
}

export const etfIssuerTreemapFrame = defineFrame({
  ...etfIssuerTreemapMeta,
  component: EtfIssuerTreemap,
  // Tiles are issuer names — which asset's ETFs they issue lives in the title.
  titleContent: ({ config }) => <>{config.asset.toUpperCase()} · ETF Issuers</>,
});
