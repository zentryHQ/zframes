import type { BubbleNode } from "@zframes/charts";
import { defineFrame, useCoinMovers } from "@zframes/core";
import { useCallback, useMemo } from "react";
import type { z } from "zod";
import { assetLogoUrl } from "./asset-logo";
import { BubbleCloud } from "./bubbles-shared";
import { changeColor, formatChangePct } from "./format";
import { moversBubblesMeta } from "./schemas";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";

const schema = moversBubblesMeta.schema;

const WINDOW_OPTIONS = ["1h", "24h", "7d", "30d"] as const;

interface MoverBubble extends BubbleNode {
  changePct: number;
}

function MoversBubbles({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useCoinMovers();
  // Not named `window` — that would shadow the global inside a browser
  // component.
  const [chartWindow, setChartWindow] = useFrameChoice("window", config.window);

  const nodes: MoverBubble[] = useMemo(() => {
    const ranked = entries
      .filter(
        (e) =>
          Number.isFinite(e.changePct?.[chartWindow]) && e.volume24hUsd > 0,
      )
      .sort((a, b) => b.changePct[chartWindow] - a.changePct[chartWindow]);
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
      value: Math.max(Math.abs(e.changePct[chartWindow]), 0.05),
      imageUrl: assetLogoUrl(e.symbol),
      color: changeColor(e.changePct[chartWindow]),
      borderColor: changeColor(e.changePct[chartWindow]),
      changePct: e.changePct[chartWindow],
    }));
  }, [entries, chartWindow, config.limit]);

  const formatTitle = useCallback(
    (n: BubbleNode) =>
      `${n.label} · ${formatChangePct((n as MoverBubble).changePct)} ${chartWindow}`,
    [chartWindow],
  );

  return (
    // BubbleCloud's caption row is shared, centered, and has no room for a
    // control — overlay the toggle top-right instead of adding a row.
    <div className="relative h-full">
      <TimeframeToggle
        options={WINDOW_OPTIONS}
        value={chartWindow}
        onChange={setChartWindow}
        label="movers window"
        className="absolute top-0 right-0 z-10"
      />
      <BubbleCloud
        nodes={nodes}
        isLoading={isLoading}
        loadingText="loading movers…"
        emptyText="no mover data yet"
        caption={`area by ${chartWindow} move · green gainers / red losers`}
        formatTitle={formatTitle}
      />
    </div>
  );
}

export const moversBubblesFrame = defineFrame({
  ...moversBubblesMeta,
  component: MoversBubbles,
});
