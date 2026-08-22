import { BubbleChart, type BubbleNode } from "@zframes/charts";
import type { ReactNode } from "react";
import { ChartCard } from "./chart-card";
import { FrameStatus } from "./ui";

/**
 * Shared interior for the bubble-cloud frame family (market-bubbles,
 * tvl-bubbles, movers-bubbles, …): loading/empty via FrameStatus, the chart
 * filling the card, an optional one-line caption underneath. Frames own the
 * data mapping; this owns the layout.
 */
export function BubbleCloud({
  nodes,
  isLoading,
  loadingText,
  emptyText,
  caption,
  formatTitle,
}: {
  nodes: BubbleNode[];
  isLoading: boolean;
  loadingText: string;
  emptyText: string;
  caption?: ReactNode;
  formatTitle?: (node: BubbleNode) => string;
}) {
  if (isLoading) return <FrameStatus loading>{loadingText}</FrameStatus>;
  if (nodes.length === 0) return <FrameStatus>{emptyText}</FrameStatus>;

  return (
    <ChartCard gap={1} className="text-normal">
      <ChartCard.Body>
        <BubbleChart nodes={nodes} formatTitle={formatTitle} />
      </ChartCard.Body>
      {caption && <ChartCard.Caption>{caption}</ChartCard.Caption>}
    </ChartCard>
  );
}
