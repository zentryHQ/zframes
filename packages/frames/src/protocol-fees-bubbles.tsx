import type { BubbleNode } from "@zframes/charts";
import { defineFrame, useProtocolFees } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { BubbleCloud } from "./bubbles-shared";
import { changeColor, formatChangePct, formatCompactUsd } from "./format";
import { protocolFeesBubblesMeta } from "./schemas";

const schema = protocolFeesBubblesMeta.schema;

interface FeesBubble extends BubbleNode {
  changePct: number;
}

function ProtocolFeesBubbles({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useProtocolFees();

  const nodes: FeesBubble[] = useMemo(
    () =>
      entries
        .filter((e) => e.fees24h > 0)
        .slice(0, config.topN)
        .map((e) => ({
          id: e.name,
          label: e.name,
          value: e.fees24h,
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
      loadingText="loading protocol fees…"
      emptyText="no protocol fee data"
      caption={`area by 24h fees · ring by 1d change · top ${nodes.length}`}
      formatTitle={(n) =>
        `${n.label} · ${formatCompactUsd(n.value)} fees · ${formatChangePct((n as FeesBubble).changePct)}`
      }
    />
  );
}

export const protocolFeesBubblesFrame = defineFrame({
  ...protocolFeesBubblesMeta,
  component: ProtocolFeesBubbles,
});
