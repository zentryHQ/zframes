import { BarChart, type BarDatum } from "@zframes/charts";
import { defineFrame, useMoney, useOptionsChain } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import {
  CONTRACT_MULTIPLIER,
  delayLabel,
  emptyChainLabel,
  expiryLabel,
  oiOf,
  resolveSpot,
  selectExpiry,
  strikeRows,
} from "./equity-options-shared";
import { formatChangePct } from "./format";
import { equityOptionsMaxPainMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = equityOptionsMaxPainMeta.schema;

/** Bar fills, mirrored by the coloured figures in the caption so the two
 *  markers on the curve are identifiable without a separate legend. */
const PAIN_COLOR = "var(--color-highlight)";
const SPOT_COLOR = "var(--color-normal)";

function EquityOptionsMaxPain({ config }: { config: z.output<typeof schema> }) {
  const { data: chain, isLoading } = useOptionsChain(config.symbol);
  const money = useMoney();

  const view = useMemo(() => {
    if (!chain) return null;
    const expiry = selectExpiry(chain, config.expiry);
    if (!expiry || expiry.totalOi === 0) return null;
    const spot = resolveSpot(chain, expiry.contracts);
    if (!spot) return null;
    const rows = strikeRows(expiry.contracts);
    if (rows.length === 0) return null;

    // Only legs that carry open interest contribute anything, and skipping the
    // empty ones keeps this O(strikes × live legs) rather than × the whole
    // expiry — a wide chain lists far more strikes than it trades.
    const legs = expiry.contracts.filter((c) => oiOf(c) > 0);

    // What option WRITERS owe if the underlying settles at each candidate
    // strike: every call struck below it and every put struck above it expires
    // in the money by the distance between them. The candidate that MINIMISES
    // that total is "max pain" — the settlement price at which the largest
    // share of open contracts expires worthless.
    let maxPainStrike = rows[0].strike;
    let minPain = Infinity;
    const pains = rows.map((row) => {
      let pain = 0;
      for (const leg of legs) {
        if (leg.side === "call") {
          if (leg.strike < row.strike)
            pain += (row.strike - leg.strike) * oiOf(leg);
        } else if (leg.strike > row.strike) {
          pain += (leg.strike - row.strike) * oiOf(leg);
        }
      }
      // Per-share distance × contracts is not yet money: a US listed option
      // delivers 100 shares.
      pain *= CONTRACT_MULTIPLIER;
      if (pain < minPain) {
        minPain = pain;
        maxPainStrike = row.strike;
      }
      return pain;
    });

    // The listed strike closest to spot — spot itself is almost never one, and
    // a bar chart has no room between categories to mark the true price.
    let spotStrike = rows[0].strike;
    for (const row of rows) {
      if (Math.abs(row.strike - spot.spot) < Math.abs(spotStrike - spot.spot))
        spotStrike = row.strike;
    }

    const bars: BarDatum[] = rows.map((row, i) => ({
      label: money.magnitude(row.strike),
      value: pains[i],
      color:
        row.strike === maxPainStrike
          ? PAIN_COLOR
          : row.strike === spotStrike
            ? SPOT_COLOR
            : undefined,
    }));

    return {
      bars,
      maxPainStrike,
      spot,
      expiry,
      // Signed: positive means max pain sits above where the stock trades.
      gapPct: ((maxPainStrike - spot.spot) / spot.spot) * 100,
      delay: delayLabel(chain.delayMinutes),
    };
  }, [chain, config.expiry, money]);

  const ticker = chain?.symbol ?? tickerOf(config.symbol).toUpperCase();
  if (isLoading)
    return <FrameStatus loading>loading option chain…</FrameStatus>;
  if (!view)
    return <FrameStatus>{emptyChainLabel(ticker, config.expiry)}</FrameStatus>;

  const { bars, maxPainStrike, spot, expiry, gapPct, delay } = view;

  return (
    <div className="text-normal flex h-full min-h-0 flex-col gap-1">
      <div className="caption text-soft flex justify-between gap-2">
        <span className="truncate">
          {ticker} max pain · {expiryLabel(expiry.expiry, expiry.dte)}
        </span>
        <span className="shrink-0 tabular-nums">
          <span className="font-bold" style={{ color: PAIN_COLOR }}>
            {money.price(maxPainStrike)}
          </span>{" "}
          <span className="text-soft">vs spot</span>{" "}
          <span style={{ color: SPOT_COLOR }}>{money.price(spot.spot)}</span>
          {spot.estimated && <span className="text-soft"> est.</span>}{" "}
          <span className="text-soft">{formatChangePct(gapPct)}</span>
        </span>
      </div>
      <BarChart
        data={bars}
        color="var(--color-disabled)"
        height={170}
        formatValue={money.compact}
        // Values on every bar are unreadable once a chain lists dozens of
        // strikes; the caption carries the two figures that matter.
        showValues={bars.length <= 12}
      />
      <div className="caption text-soft truncate">
        assumes open interest stays put and ignores hedging · {delay}
      </div>
    </div>
  );
}

export const equityOptionsMaxPainFrame = defineFrame({
  ...equityOptionsMaxPainMeta,
  component: EquityOptionsMaxPain,
});
