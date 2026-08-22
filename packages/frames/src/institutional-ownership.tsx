import { defineFrame, useInstitutionalOwnership } from "@zframes/core";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { CardHeader } from "./card-header";
import {
  DOWN_COLOR,
  UP_COLOR,
  formatCompact,
  formatCompactUsd,
  formatPct,
} from "./format";
import { institutionalOwnershipMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = institutionalOwnershipMeta.schema;

/** A published field is only usable once it's a real finite number. */
function usable(n: number | undefined): number | undefined {
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}

function InstitutionalOwnership({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { data, isLoading } = useInstitutionalOwnership(config.symbol);

  // Every field on the aggregate is optional; each row below renders only if
  // its own value survived, so a card with just the percentage is still a card.
  const pct = usable(data?.institutionalOwnershipPct);
  const holdingsValue = usable(data?.totalHoldingsValue);
  const sharesOut = usable(data?.sharesOutstanding);
  const addedShares = usable(data?.increasedShares);
  const soldShares = usable(data?.decreasedShares);
  const addedHolders = usable(data?.increasedHolders);
  const soldHolders = usable(data?.decreasedHolders);

  const flowTotal = (addedShares ?? 0) + (soldShares ?? 0);
  const addedPct =
    flowTotal > 0 ? ((addedShares ?? 0) / flowTotal) * 100 : undefined;

  const hasAny =
    pct !== undefined ||
    holdingsValue !== undefined ||
    sharesOut !== undefined ||
    addedPct !== undefined ||
    addedHolders !== undefined ||
    soldHolders !== undefined;

  if (isLoading && !hasAny)
    return <FrameStatus loading>loading 13F ownership…</FrameStatus>;
  if (!hasAny)
    return (
      <FrameStatus>
        no institutional ownership for “{tickerOf(config.symbol)}”
      </FrameStatus>
    );

  return (
    // gap-2, not gap-3: the 13F caveat wraps to a second line on a card four
    // columns or narrower, and those 8px are what let the whole stack — hero,
    // flow bar, caveat — sit inside a two-row card instead of being centred
    // over it and clipped at both ends.
    <div className="flex h-full min-h-0 flex-col justify-center gap-2">
      <CardHeader>
        <CardHeader.Main>
          <CardHeader.Eyebrow>
            {tickerOf(config.symbol)} · institutional
          </CardHeader.Eyebrow>
          <CardHeader.Value>
            {pct !== undefined ? formatPct(pct, 1) : "—"}
          </CardHeader.Value>
        </CardHeader.Main>
        <CardHeader.Aside>
          {holdingsValue !== undefined && (
            <>
              <CardHeader.Value>
                {formatCompactUsd(holdingsValue)}
              </CardHeader.Value>
              <CardHeader.Sub>held</CardHeader.Sub>
            </>
          )}
          {sharesOut !== undefined && (
            // Its own element rather than `CardHeader.Sub`: this line is a
            // figure, and the shared sub-line deliberately has no
            // `tabular-nums` — adding it there would retro-fit tabular digits
            // onto every other frame's word-shaped sub-line.
            <div className="caption text-soft tabular-nums">
              {formatCompact(sharesOut)} shares out
            </div>
          )}
        </CardHeader.Aside>
      </CardHeader>

      {/* One two-sided bar, so the net direction of last quarter's repositioning
          reads before any of the numbers do. Holder counts support it. */}
      {addedPct !== undefined && (
        <div>
          <div className="flex h-3 w-full gap-1 overflow-hidden rounded-full">
            <div
              className="h-full rounded-l-full"
              style={{ width: `${addedPct}%`, background: UP_COLOR }}
            />
            <div
              className="h-full rounded-r-full"
              style={{ width: `${100 - addedPct}%`, background: DOWN_COLOR }}
            />
          </div>
          <div className="caption text-soft mt-1 flex justify-between gap-2 tabular-nums">
            <span className="truncate">
              <span style={{ color: UP_COLOR }}>added</span>{" "}
              {formatCompact(addedShares ?? 0)}
              {addedHolders !== undefined &&
                ` · ${formatCompact(addedHolders)} holders`}
            </span>
            <span className="truncate text-right">
              {formatCompact(soldShares ?? 0)}
              {soldHolders !== undefined &&
                ` · ${formatCompact(soldHolders)} holders`}{" "}
              <span style={{ color: DOWN_COLOR }}>sold</span>
            </span>
          </div>
        </div>
      )}

      {/* Holder counts published without the share counts behind them: no bar to
          draw, but the direction of the split is still the point of the card. */}
      {addedPct === undefined &&
        (addedHolders !== undefined || soldHolders !== undefined) && (
          <div className="caption text-soft flex justify-between gap-2 tabular-nums">
            {addedHolders !== undefined && (
              <span>
                <span style={{ color: UP_COLOR }}>
                  {formatCompact(addedHolders)}
                </span>{" "}
                holders increased
              </span>
            )}
            {soldHolders !== undefined && (
              <span className="text-right">
                <span style={{ color: DOWN_COLOR }}>
                  {formatCompact(soldHolders)}
                </span>{" "}
                decreased
              </span>
            )}
          </div>
        )}

      <div className="caption text-soft">
        Aggregated 13F filings — a quarter behind by construction, not a live
        position.
      </div>
    </div>
  );
}

export const institutionalOwnershipFrame = defineFrame({
  ...institutionalOwnershipMeta,
  component: InstitutionalOwnership,
});
