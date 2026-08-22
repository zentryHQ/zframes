import { defineFrame, useDifficultyAdjustment } from "@zframes/core";
import type { z } from "zod";
import { CardHeader } from "./card-header";
import { changeColor, formatChangePct, formatPct } from "./format";
import { btcDifficultyMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = btcDifficultyMeta.schema;

/** "in 9d 4h" / "in 14h" / "in 38m" for a future epoch-ms instant. */
function untilLabel(ms: number): string {
  const sec = Math.max(0, Math.round((ms - Date.now()) / 1000));
  const day = Math.floor(sec / 86_400);
  const hr = Math.floor((sec % 86_400) / 3600);
  const min = Math.floor((sec % 3600) / 60);
  if (day > 0) return `in ${day}d ${hr}h`;
  if (hr > 0) return `in ${hr}h ${min}m`;
  return `in ${min}m`;
}

function BtcDifficulty({ config }: { config: z.output<typeof schema> }) {
  const { adjustment, isLoading } = useDifficultyAdjustment();

  if (isLoading) return <FrameStatus loading>loading difficulty…</FrameStatus>;
  if (!adjustment) return <FrameStatus>no difficulty data yet</FrameStatus>;

  const { progressPercent, difficultyChange, remainingBlocks } = adjustment;
  const color = changeColor(difficultyChange);
  const accent = "hsl(var(--zf-accent-hue, 242) 85% 72%)";

  return (
    // gap-2, not gap-3: at its own 2-row floor this stack stood 3px taller than
    // the card body, so the previous-retarget footer was sliced through the
    // middle. The gaps are the only fixed part that can yield — every block
    // below is a single line of type — and 8px of them is enough to fit.
    <div className="flex h-full min-h-0 flex-col justify-center gap-2">
      <CardHeader>
        <CardHeader.Main>
          <CardHeader.Eyebrow>next adjustment</CardHeader.Eyebrow>
          <CardHeader.Value size="metric-lg" tint={color}>
            {formatChangePct(difficultyChange)}
          </CardHeader.Value>
          <CardHeader.Sub>
            {difficultyChange >= 0 ? "harder" : "easier"}
          </CardHeader.Sub>
        </CardHeader.Main>
        <CardHeader.Aside>
          <CardHeader.Value>
            {untilLabel(adjustment.estimatedRetargetDate)}
          </CardHeader.Value>
          <CardHeader.Sub>
            {remainingBlocks.toLocaleString("en-US")} blocks left
          </CardHeader.Sub>
        </CardHeader.Aside>
      </CardHeader>

      <div>
        <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="absolute left-0 top-0 h-full rounded-full"
            style={{
              width: `${Math.min(100, Math.max(0, progressPercent))}%`,
              background: accent,
            }}
          />
        </div>
        <div className="caption text-soft mt-1 tabular-nums">
          {formatPct(progressPercent, 1)} through this epoch
        </div>
      </div>

      {config.showPrevious && (
        <div className="caption text-soft border-t border-white/[0.08] pt-1.5">
          previous retarget{" "}
          <span
            className="font-bold tabular-nums"
            style={{ color: changeColor(adjustment.previousRetarget) }}
          >
            {formatChangePct(adjustment.previousRetarget)}
          </span>
        </div>
      )}
    </div>
  );
}

export const btcDifficultyFrame = defineFrame({
  ...btcDifficultyMeta,
  component: BtcDifficulty,
});
