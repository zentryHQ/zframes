import { MiniLineChart } from "@zframes/charts";
import { defineFrame, useNetworkHashrate } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { CardHeader } from "./card-header";
import { formatCompact, formatHashrate } from "./format";
import { btcDifficultyChartMeta } from "./schemas";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus } from "./ui";

const schema = btcDifficultyChartMeta.schema;

const WINDOWS = ["1y", "2y", "3y"] as const;

function BtcDifficultyChart({ config }: { config: z.output<typeof schema> }) {
  // Not named `window` — that would shadow the global inside a browser component.
  const [historyWindow, setHistoryWindow] = useFrameChoice(
    "window",
    config.window,
  );
  const { data, isLoading } = useNetworkHashrate(historyWindow);

  const sparkline = useMemo(
    () =>
      (data?.difficulty ?? []).map((p) => ({
        date: new Date(p.time).toISOString(),
        value: p.difficulty,
      })),
    [data?.difficulty],
  );

  if (isLoading) return <FrameStatus loading>loading difficulty…</FrameStatus>;
  if (!data) return <FrameStatus>no difficulty data yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3">
      <CardHeader>
        <CardHeader.Main>
          <CardHeader.Eyebrow>network difficulty</CardHeader.Eyebrow>
          <CardHeader.Value size="metric-lg">
            {formatCompact(data.currentDifficulty)}
          </CardHeader.Value>
        </CardHeader.Main>
        <CardHeader.Aside>
          <CardHeader.Value>
            {formatHashrate(data.currentHashrate)}
          </CardHeader.Value>
          <CardHeader.Sub>hashrate</CardHeader.Sub>
        </CardHeader.Aside>
      </CardHeader>

      <MiniLineChart
        data={sparkline}
        width={320}
        height={54}
        color="hsl(var(--zf-accent-hue, 242) 85% 72%)"
      />

      {/* The static "past 1y" caption is now the control itself — same row, same
          height, but adjustable on the card. */}
      <div className="flex items-center justify-between gap-2">
        <span className="caption text-soft">past {historyWindow}</span>
        <TimeframeToggle
          options={WINDOWS}
          value={historyWindow}
          onChange={setHistoryWindow}
          label="difficulty history window"
        />
      </div>
    </div>
  );
}

export const btcDifficultyChartFrame = defineFrame({
  ...btcDifficultyChartMeta,
  component: BtcDifficultyChart,
});
