import { BarChart, type BarDatum } from "@zframes/charts";
import { defineFrame, useTreasuryAuctions } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompactUsd } from "./format";
import { treasuryAuctionSizeBarsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = treasuryAuctionSizeBarsMeta.schema;

// Not a gain/loss pair, so this deliberately does NOT reach for UP_COLOR/
// DOWN_COLOR (reserved for semantic gain/loss) — a neutral tone for the
// offering amount beside the accent hue for what was actually accepted.
const OFFER_COLOR = "rgba(255,255,255,0.32)";
const ACCEPT_COLOR = "hsl(var(--zf-accent-hue, 242) 85% 72%)";

function dayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function TreasuryAuctionSizeBars({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { auctions, isLoading } = useTreasuryAuctions(config.count);

  // Two bars per auction (offering, accepted) fake a grouped chart on top of
  // the single-series BarChart primitive — oldest first so the pairs read
  // left-to-right like a trend.
  const data: BarDatum[] = useMemo(
    () =>
      [...auctions]
        .filter((a) => a.offeringAmount !== null && a.totalAccepted !== null)
        .slice(0, config.count)
        .reverse()
        .flatMap((a) => {
          const label = dayLabel(a.auctionDate);
          return [
            { label, value: a.offeringAmount!, color: OFFER_COLOR },
            { label, value: a.totalAccepted!, color: ACCEPT_COLOR },
          ];
        }),
    [auctions, config.count],
  );

  if (isLoading)
    return <FrameStatus loading>loading auction sizes…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>no auction-size data yet</FrameStatus>;

  return (
    <div className="flex h-full flex-col justify-center gap-1 text-normal">
      <BarChart
        data={data}
        height={200}
        formatValue={formatCompactUsd}
        showValues={false}
        maxTickLabels={Math.min(config.count, 8)}
      />
      <div className="flex items-center justify-center gap-3">
        <span className="caption text-soft flex items-center gap-1">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: OFFER_COLOR }}
          />
          offering
        </span>
        <span className="caption text-soft flex items-center gap-1">
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: ACCEPT_COLOR }}
          />
          accepted
        </span>
      </div>
    </div>
  );
}

export const treasuryAuctionSizeBarsFrame = defineFrame({
  ...treasuryAuctionSizeBarsMeta,
  component: TreasuryAuctionSizeBars,
});
