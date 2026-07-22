import type { BubbleNode } from "@zframes/charts";
import { defineFrame, usePredictionMarkets } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { BubbleCloud } from "./bubbles-shared";
import { formatCompactUsd, formatPct } from "./format";
import { predictionMarketsBubbleMeta } from "./schemas";

const schema = predictionMarketsBubbleMeta.schema;

interface MarketBubble extends BubbleNode {
  question: string;
  topLabel: string;
  topProb: number;
  volume24h: number;
}

/** Truncate a market question to a bubble-sized label, breaking on a word
 *  boundary where possible instead of cutting mid-word. */
function shortLabel(question: string, max = 18): string {
  const trimmed = question.trim();
  if (trimmed.length <= max) return trimmed;
  const cut = trimmed.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut}…`;
}

/** Bubble tint by leading-outcome confidence — a near-toss-up (50%) stays the
 *  chart's neutral default hue, a near-certain outcome (100%) reads as a vivid
 *  emerald. This is a confidence read, not gain/loss, so it stays a local ramp
 *  rather than reusing changeColor/UP_COLOR. */
function confidenceColor(prob: number): string {
  const t = Math.max(0, Math.min(1, (prob - 0.5) / 0.5));
  const lightness = Math.round(64 - t * 22); // 64% (muted) -> 42% (vivid)
  const saturation = Math.round(30 + t * 50); // 30% (grey) -> 80% (saturated)
  return `hsl(152 ${saturation}% ${lightness}%)`;
}

function PredictionMarketsBubble({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { markets, isLoading } = usePredictionMarkets(config.limit);

  const nodes: MarketBubble[] = useMemo(
    () =>
      markets
        .filter((m) => m.volume24h > 0)
        .map((m, i) => {
          const top = [...m.outcomes].sort((a, b) => b.prob - a.prob)[0];
          const color = confidenceColor(top.prob);
          return {
            id: `${i}-${m.question}`,
            label: shortLabel(m.question),
            value: m.volume24h,
            color,
            borderColor: color,
            question: m.question,
            topLabel: top.label,
            topProb: top.prob,
            volume24h: m.volume24h,
          };
        }),
    [markets],
  );

  return (
    <BubbleCloud
      nodes={nodes}
      isLoading={isLoading}
      loadingText="loading markets…"
      emptyText="no markets yet"
      caption={`area by 24h volume · tint by leading-outcome confidence · top ${nodes.length}`}
      formatTitle={(n) => {
        const m = n as MarketBubble;
        return `${m.question} — ${m.topLabel} ${formatPct(m.topProb * 100, 0)} · vol ${formatCompactUsd(m.volume24h)}`;
      }}
    />
  );
}

export const predictionMarketsBubbleFrame = defineFrame({
  ...predictionMarketsBubbleMeta,
  component: PredictionMarketsBubble,
});
