import type { BubbleNode } from "@zframes/charts";
import { defineFrame, useDexVolume } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { BubbleCloud } from "./bubbles-shared";
import { changeColor, formatChangePct, formatCompactUsd } from "./format";
import { dexVolumeBubblesMeta } from "./schemas";

const schema = dexVolumeBubblesMeta.schema;

interface DexBubble extends BubbleNode {
  changePct: number;
}

function DexVolumeBubbles({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useDexVolume();

  const nodes: DexBubble[] = useMemo(
    () =>
      entries
        .filter((e) => e.volume24h > 0)
        .slice(0, config.topN)
        .map((e) => ({
          id: e.name,
          label: e.name,
          value: e.volume24h,
          color: changeColor(e.changePct ?? 0),
          borderColor: changeColor(e.changePct ?? 0),
          changePct: e.changePct ?? 0,
        })),
    [entries, config.topN],
  );

  return (
    <BubbleCloud
      nodes={nodes}
      isLoading={isLoading}
      loadingText="loading DEX volume…"
      emptyText="no DEX volume data"
      caption={`area by 24h volume · ring by 1d change · top ${nodes.length}`}
      formatTitle={(n) =>
        `${n.label} · ${formatCompactUsd(n.value)} vol · ${formatChangePct((n as DexBubble).changePct)}`
      }
    />
  );
}

export const dexVolumeBubblesFrame = defineFrame({
  ...dexVolumeBubblesMeta,
  component: DexVolumeBubbles,
});
