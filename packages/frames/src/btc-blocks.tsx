import { defineFrame, useBtcBlocks } from "@zframes/core";
import type { z } from "zod";
import { formatBtc, timeAgo } from "./format";
import { btcBlocksMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = btcBlocksMeta.schema;

function BtcBlocks({ config }: { config: z.output<typeof schema> }) {
  const { blocks, isLoading } = useBtcBlocks(config.count);

  if (isLoading) return <FrameStatus loading>loading blocks…</FrameStatus>;
  if (blocks.length === 0) return <FrameStatus>no block data yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={scrollAreaClass}>
        <div className="flex flex-col gap-1.5">
          {blocks.map((b) => (
            <div
              key={b.id}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md bg-white/[0.03] px-2 py-1.5"
              title={`Block ${b.height} · ${b.poolName} · ${b.txCount.toLocaleString("en-US")} txs`}
            >
              <div className="flex flex-col">
                <span className="body-sm text-strong font-bold tabular-nums">
                  {b.height.toLocaleString("en-US")}
                </span>
                <span className="caption text-soft">{timeAgo(b.time)}</span>
              </div>
              <div className="min-w-0">
                <span className="body-sm text-normal block truncate">
                  {b.poolName}
                </span>
                <span className="caption text-soft">
                  {b.txCount.toLocaleString("en-US")} txs
                </span>
              </div>
              <div className="text-right">
                <span className="body-sm text-normal block font-bold tabular-nums">
                  {formatBtc(b.totalFees)}
                </span>
                <span className="caption text-soft">
                  ~{Math.round(b.medianFee)} sat/vB
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export const btcBlocksFrame = defineFrame({
  ...btcBlocksMeta,
  component: BtcBlocks,
});
