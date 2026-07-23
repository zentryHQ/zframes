import { BarChart } from "@zframes/charts";
import { defineFrame, useBtcBlocks } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompact } from "./format";
import { btcBlockSizeBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = btcBlockSizeBarsMeta.schema;

function BtcBlockSizeBars({ config }: { config: z.output<typeof schema> }) {
  const { blocks, isLoading } = useBtcBlocks(config.count);

  const data = useMemo(
    () =>
      [...blocks].reverse().map((b) => ({
        label: b.height.toLocaleString("en-US"),
        value: b.size,
      })),
    [blocks],
  );

  if (isLoading) return <FrameStatus loading>loading blocks…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no block data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart
        data={data}
        height={200}
        formatValue={formatCompact}
        showValues={false}
        maxTickLabels={6}
      />
      <div className="caption text-soft text-center">
        block size (bytes) · latest {formatCompact(blocks[0]?.size ?? 0)}
      </div>
    </div>
  );
}

export const btcBlockSizeBarsFrame = defineFrame({
  ...btcBlockSizeBarsMeta,
  component: BtcBlockSizeBars,
});
