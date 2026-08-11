import { BarChart } from "@zframes/charts";
import { defineFrame, useNftMarket } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompact } from "./format";
import { nftActivityBarsMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = nftActivityBarsMeta.schema;

function NftActivityBars({ config }: { config: z.output<typeof schema> }) {
  const { collections, isLoading } = useNftMarket();

  const data = useMemo(
    () =>
      [...collections]
        .sort((a, b) => b.sales24h - a.sales24h)
        .slice(0, config.limit)
        .map((c) => ({ label: c.name, value: c.sales24h })),
    [collections, config.limit],
  );

  if (isLoading)
    return <FrameStatus loading>loading NFT activity…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no NFT data yet</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-1 text-normal">
      {/* Scrolls rather than shrinks: the height is a COUNT of bars, each
          needing its own row to stay readable, so a card shorter than the
          list should let you reach the rest rather than squash every bar. */}
      <div className={scrollAreaClass}>
        <BarChart
          data={data}
          orientation="horizontal"
          height={Math.max(data.length * 26, 96)}
          formatValue={formatCompact}
        />
      </div>
      <div className="caption text-soft shrink-0 text-center">
        NFT sales · last 24h
      </div>
    </div>
  );
}

export const nftActivityBarsFrame = defineFrame({
  ...nftActivityBarsMeta,
  component: NftActivityBars,
});
