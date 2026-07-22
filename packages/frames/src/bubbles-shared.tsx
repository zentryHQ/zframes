import { BubbleChart, type BubbleNode } from "@zframes/charts";
import type { ReactNode } from "react";
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
    <div className="flex h-full flex-col gap-1 text-normal">
      <div className="min-h-0 flex-1">
        <BubbleChart nodes={nodes} formatTitle={formatTitle} />
      </div>
      {caption && (
        <div className="caption text-soft text-center">{caption}</div>
      )}
    </div>
  );
}
