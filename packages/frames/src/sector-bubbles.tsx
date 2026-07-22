import type { BubbleNode } from "@zframes/charts";
import { defineFrame, useSectorPerformance } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { BubbleCloud } from "./bubbles-shared";
import { changeColor, formatChangePct, formatCompactUsd } from "./format";
import { sectorBubblesMeta } from "./schemas";

const schema = sectorBubblesMeta.schema;

interface SectorBubble extends BubbleNode {
  changePct24h: number;
}

function SectorBubbles({ config }: { config: z.output<typeof schema> }) {
  const { sectors, isLoading } = useSectorPerformance();

  const nodes: SectorBubble[] = useMemo(
    () =>
      sectors
        .filter((s) => s.marketCap > 0)
        .slice(0, config.limit)
        .map((s) => ({
          id: s.name,
          label: s.name,
          value: s.marketCap,
          color: changeColor(s.changePct24h),
          borderColor: changeColor(s.changePct24h),
          changePct24h: s.changePct24h,
        })),
    [sectors, config.limit],
  );

  return (
    <BubbleCloud
      nodes={nodes}
      isLoading={isLoading}
      loadingText="loading sectors…"
      emptyText="no sector data yet"
      caption={`area by sector mcap · ring by 24h change · top ${nodes.length}`}
      formatTitle={(n) =>
        `${n.label} · ${formatCompactUsd(n.value)} mcap · ${formatChangePct((n as SectorBubble).changePct24h)}`
      }
    />
  );
}

export const sectorBubblesFrame = defineFrame({
  ...sectorBubblesMeta,
  component: SectorBubbles,
});
