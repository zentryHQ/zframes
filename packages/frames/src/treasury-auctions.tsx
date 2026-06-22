import { defineFrame, useTreasuryAuctions } from "@zframes/core";
import type { TreasuryAuction } from "@zframes/core";
import type { z } from "zod";
import { treasuryAuctionsMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = treasuryAuctionsMeta.schema;

function AuctionRow({ auction }: { auction: TreasuryAuction }) {
  const term = [auction.securityTerm, auction.securityType]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-white/[0.06] py-1.5 last:border-b-0">
      <div className="min-w-0">
        <div className="body-sm text-normal truncate font-semibold">
          {term || auction.securityType}
        </div>
        <div className="caption text-soft truncate">
          {auction.auctionDate}
          {auction.bidToCover !== null
            ? ` · ${auction.bidToCover.toFixed(2)}× bid-to-cover`
            : ""}
        </div>
      </div>
      <div className="font-dmsans text-strong text-lg font-bold tabular-nums">
        {auction.rate !== null ? `${auction.rate.toFixed(2)}%` : "—"}
      </div>
    </div>
  );
}

function TreasuryAuctions({ config }: { config: z.output<typeof schema> }) {
  const { auctions, isLoading } = useTreasuryAuctions(config.count);

  if (isLoading) return <FrameStatus loading>loading auctions…</FrameStatus>;
  if (!auctions.length) return <FrameStatus>no auction data</FrameStatus>;

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

      <div className="min-h-0 flex-1 overflow-y-auto">
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
