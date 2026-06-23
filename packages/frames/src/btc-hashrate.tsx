import { MiniLineChart } from "@zframes/charts";
import { defineFrame, useNetworkHashrate } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompact, formatHashrate } from "./format";
import { btcHashrateMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = btcHashrateMeta.schema;

function BtcHashrate({ config }: { config: z.output<typeof schema> }) {
  const { data, isLoading } = useNetworkHashrate(config.window);

  const sparkline = useMemo(
    () =>
      (data?.hashrates ?? []).map((p) => ({
        date: new Date(p.time).toISOString(),
        value: p.hashrate,
      })),
    [data?.hashrates],
  );

  if (isLoading) return <FrameStatus loading>loading hashrate…</FrameStatus>;
  if (!data) return <FrameStatus>no hashrate data yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="caption text-soft uppercase">network hashrate</div>
          <div className="metric-lg text-strong leading-none">
            {formatHashrate(data.currentHashrate)}
          </div>
        </div>
        <div className="text-right">
          <div className="body-md text-normal font-bold tabular-nums">
            {formatCompact(data.currentDifficulty)}
          </div>
          <div className="caption text-soft">difficulty</div>
        </div>
      </div>

      <MiniLineChart
        data={sparkline}
        width={320}
        height={54}
        color="hsl(var(--zf-accent-hue, 242) 85% 72%)"
      />

      <div className="caption text-soft">past {config.window}</div>
    </div>
  );
}

export const btcHashrateFrame = defineFrame({
  ...btcHashrateMeta,
  component: BtcHashrate,
});
