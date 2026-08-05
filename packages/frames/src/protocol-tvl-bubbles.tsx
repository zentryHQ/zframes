import type { BubbleNode } from "@zframes/charts";
import { defineFrame, useMoney, useProtocolTvl } from "@zframes/core";
import { useCallback, useMemo } from "react";
import type { z } from "zod";
import { BubbleCloud } from "./bubbles-shared";
import { changeColor, formatChangePct } from "./format";
import { protocolTvlBubblesMeta } from "./schemas";

const schema = protocolTvlBubblesMeta.schema;

interface ProtocolBubble extends BubbleNode {
  changePct: number;
}

function ProtocolTvlBubbles({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useProtocolTvl();
  const money = useMoney();

  const nodes: ProtocolBubble[] = useMemo(
    () =>
      entries
        .filter((e) => e.tvl > 0)
        .slice(0, config.topN)
        .map((e) => ({
          id: e.name,
          label: e.name,
          value: e.tvl,
          color: changeColor(e.changePct ?? 0),
          borderColor: changeColor(e.changePct ?? 0),
          changePct: e.changePct ?? 0,
        })),
    [entries, config.topN],
  );

  const formatTitle = useCallback(
    (n: BubbleNode) =>
      `${n.label} · ${money.compact(n.value)} TVL · ${formatChangePct((n as ProtocolBubble).changePct)}`,
    [money],
  );

  return (
    <BubbleCloud
      nodes={nodes}
      isLoading={isLoading}
      loadingText="loading protocol TVL…"
      emptyText="no protocol TVL data"
      caption={`area by TVL · ring by 1d change · top ${nodes.length}`}
      formatTitle={formatTitle}
    />
  );
}

export const protocolTvlBubblesFrame = defineFrame({
  ...protocolTvlBubblesMeta,
  component: ProtocolTvlBubbles,
});
