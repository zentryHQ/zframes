import type { BubbleNode } from "@zframes/charts";
import { defineFrame, useCoinMovers } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { assetLogoUrl } from "./asset-logo";
import { BubbleCloud } from "./bubbles-shared";
import { changeColor, formatChangePct } from "./format";
import { moversBubblesMeta } from "./schemas";

const schema = moversBubblesMeta.schema;

interface MoverBubble extends BubbleNode {
  changePct: number;
}

function MoversBubbles({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useCoinMovers();
  const window = config.window;

  const nodes: MoverBubble[] = useMemo(() => {
    const ranked = entries
      .filter(
        (e) => Number.isFinite(e.changePct?.[window]) && e.volume24hUsd > 0,
      )
      .sort((a, b) => b.changePct[window] - a.changePct[window]);
    // Gainers and losers in equal halves, so the cloud reads both sides of
    // the tape (skipped when there aren't enough distinct entries).
    const half = Math.floor(config.limit / 2);
    const picked =
      ranked.length <= config.limit
        ? ranked
        : [...ranked.slice(0, half), ...ranked.slice(-half)];
    return picked.map((e) => ({
      id: e.symbol,
      label: e.symbol,
      value: Math.max(Math.abs(e.changePct[window]), 0.05),
      imageUrl: assetLogoUrl(e.symbol),
      color: changeColor(e.changePct[window]),
      borderColor: changeColor(e.changePct[window]),
      changePct: e.changePct[window],
    }));
  }, [entries, window, config.limit]);

  return (
    <BubbleCloud
      nodes={nodes}
      isLoading={isLoading}
      loadingText="loading movers…"
      emptyText="no mover data yet"
      caption={`area by ${window} move · green gainers / red losers`}
      formatTitle={(n) =>
        `${n.label} · ${formatChangePct((n as MoverBubble).changePct)} ${window}`
      }
    />
  );
}

export const moversBubblesFrame = defineFrame({
  ...moversBubblesMeta,
  component: MoversBubbles,
});
