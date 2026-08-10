import { defineFrame, useDayStatsState } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { MoverRow } from "./mover-row";
import { topMoversMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = topMoversMeta.schema;

// The "xyz:*" wildcard returns that dex's entire 97-symbol universe — every
// equity, index (XYZ100/SP500), commodity (GOLD/SILVER/CL/BRENTOIL/…), and FX
// pair. It's the only HIP-3 dex with real liquidity, so one wildcard covers the
// whole cross-asset movers board; the other builder dexes (km/flx/vntl/…) are
// effectively $0-volume and were only ever duplicating symbols already in xyz.
const MOVER_UNIVERSE = ["xyz:*"] as const;

// Another source has no HIP-3 dex to wildcard, so asking for "xyz:*" there would
// return nothing: pass no symbols and take that source's whole universe instead.
const ALL_SYMBOLS = undefined;

function TopMovers({ config }: { config: z.output<typeof schema> }) {
  const hyperliquid = !config.source || config.source === "hyperliquid";
  const { stats, isLoading } = useDayStatsState(
    hyperliquid ? MOVER_UNIVERSE : ALL_SYMBOLS,
    60_000,
    config.source,
  );

  const { gainers, losers } = useMemo(() => {
    const rows = Object.entries(stats)
      .map(([symbol, stat]) => ({ symbol, ...stat }))
      // Dust assets produce absurd % moves with no liquidity behind them.
      // On Hyperliquid the ":" test keeps this a stocks/commodities board (bare
      // crypto is excluded by design); another source lists bare tickers only, so
      // there the test would reject everything.
      .filter(
        (row) =>
          (!hyperliquid || row.symbol.includes(":")) &&
          row.markPx > 0 &&
          row.prevDayPx > 0,
      )
      .sort((a, b) => b.changePct - a.changePct);
    return {
      gainers: rows.slice(0, config.count),
      losers: rows.slice(-config.count).reverse(),
    };
  }, [stats, config.count, hyperliquid]);

  if (isLoading) return <FrameStatus loading>loading movers…</FrameStatus>;
  if (gainers.length === 0) return <FrameStatus>no mover data yet</FrameStatus>;

  return (
    <div className="grid h-full grid-cols-2 gap-x-4 overflow-hidden">
      {/* Each column scrolls under its own pinned heading rather than clipping:
          `count` is the card's substance, so a short card should let you reach
          the movers that don't fit instead of slicing the last row in half. The
          `min-h-0` is what lets a grid item shrink below its rows at all. */}
      <div className="flex min-h-0 flex-col gap-1.5">
        <div className="caption text-soft uppercase tracking-wide">gainers</div>
        <div className={`${scrollAreaClass} flex flex-col gap-1.5`}>
          {gainers.map((row) => (
            <MoverRow
              key={row.symbol}
              symbol={row.symbol}
              label={tickerOf(row.symbol)}
              price={row.markPx}
              changePct={row.changePct}
            />
          ))}
        </div>
      </div>
      <div className="flex min-h-0 flex-col gap-1.5">
        <div className="caption text-soft uppercase tracking-wide">losers</div>
        <div className={`${scrollAreaClass} flex flex-col gap-1.5`}>
          {losers.map((row) => (
            <MoverRow
              key={row.symbol}
              symbol={row.symbol}
              label={tickerOf(row.symbol)}
              price={row.markPx}
              changePct={row.changePct}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export const topMoversFrame = defineFrame({
  ...topMoversMeta,
  component: TopMovers,
});
