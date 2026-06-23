import { defineFrame, useTreasuryAuctions } from "@zframes/core";
import type { TreasuryAuction } from "@zframes/core";
import type { z } from "zod";
import { formatPct } from "./format";
import { MetricRow } from "./metric-row";
import { treasuryAuctionsMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = treasuryAuctionsMeta.schema;

function AuctionRow({ auction }: { auction: TreasuryAuction }) {
  const term = [auction.securityTerm, auction.securityType]
    .filter(Boolean)
    .join(" ");
  return (
    <MetricRow
      label={term || auction.securityType}
      meta={
        auction.auctionDate +
        (auction.bidToCover !== null
          ? ` · ${auction.bidToCover.toFixed(2)}× bid-to-cover`
          : "")
      }
      value={auction.rate !== null ? formatPct(auction.rate) : "—"}
    />
  );
}

function TreasuryAuctions({ config }: { config: z.output<typeof schema> }) {
  const { auctions, isLoading } = useTreasuryAuctions(config.count);

  if (isLoading) return <FrameStatus loading>loading auctions…</FrameStatus>;
  if (!auctions.length) return <FrameStatus>no auction data yet</FrameStatus>;

  const shown = auctions.slice(0, config.count);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <div className="caption text-soft uppercase">treasury auctions</div>
          <div className="body-sm text-normal">high yield · bid-to-cover</div>
        </div>
        <div className="caption text-soft text-right">results</div>
      </div>

      <div className={scrollAreaClass}>
        {shown.map((auction, i) => (
          <AuctionRow
            key={`${auction.auctionDate}-${auction.securityType}-${auction.securityTerm}-${i}`}
            auction={auction}
          />
        ))}
      </div>
    </div>
  );
}

export const treasuryAuctionsFrame = defineFrame({
  ...treasuryAuctionsMeta,
  component: TreasuryAuctions,
});
