import { ScatterChart, type ScatterDatum } from "@zframes/charts";
import { defineFrame, useTreasuryAuctions } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPct } from "./format";
import { treasuryAuctionDemandScatterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = treasuryAuctionDemandScatterMeta.schema;

// Hoisted (not inline) so it's a stable reference across renders, like every
// other chart-prop formatter in this package — an inline arrow here would
// give ScatterChart's render effect a new `formatY` identity every render.
function formatBidToCover(value: number): string {
  return `${value.toFixed(2)}×`;
}

function TreasuryAuctionDemandScatter({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { auctions, isLoading } = useTreasuryAuctions(config.count);

  const data: ScatterDatum[] = useMemo(
    () =>
      auctions
        .filter((a) => a.rate !== null && a.bidToCover !== null)
        .slice(0, config.count)
        .map((a, i) => ({
          id: `${a.auctionDate}-${a.securityType}-${i}`,
          label: a.securityTerm || a.securityType,
          x: a.rate!,
          y: a.bidToCover!,
        })),
    [auctions, config.count],
  );

  if (isLoading)
    return <FrameStatus loading>loading auction demand…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>no auction-demand data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <ScatterChart
        data={data}
        height={210}
        formatX={formatPct}
        formatY={formatBidToCover}
        maxLabels={data.length}
      />
      <div className="caption text-soft text-center">
        awarded rate (x) vs bid-to-cover (y) · last {data.length} auctions
      </div>
    </div>
  );
}

export const treasuryAuctionDemandScatterFrame = defineFrame({
  ...treasuryAuctionDemandScatterMeta,
  component: TreasuryAuctionDemandScatter,
});
