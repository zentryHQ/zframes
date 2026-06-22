import { MiniLineChart } from "@zframes/charts";
import { defineFrame, useNetworkHashrate } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatHashrate } from "./format";
import { btcHashrateMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = btcHashrateMeta.schema;

function formatDifficulty(d: number): string {
  if (d >= 1e12) return `${(d / 1e12).toFixed(2)}T`;
  if (d >= 1e9) return `${(d / 1e9).toFixed(2)}G`;
  return d.toLocaleString("en-US", { maximumFractionDigits: 0 });
}

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
  if (!data) return <FrameStatus>no hashrate data</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="caption text-soft uppercase">network hashrate</div>
          <div className="font-dmsans text-strong text-4xl font-bold leading-none tabular-nums">
            {formatHashrate(data.currentHashrate)}
          </div>
        </div>
        <div className="text-right">
          <div className="body-md text-normal font-bold tabular-nums">
            {formatDifficulty(data.currentDifficulty)}
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
