import { defineFrame, useDayStatsState } from "@zframes/core";
import { HIP3_DEX_WILDCARDS, preferOneDexPerTicker } from "@zframes/spec/hip3";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { MoverRow, splitMovers } from "./mover-row";
import { prettySlug } from "./format";
import { topMoversMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = topMoversMeta.schema;

// The whole universe of every HIP-3 builder dex the boards scan — equities,
// indices, commodities and FX pairs — read from the one shared list so this
// board cannot drift from the picker and the other universe scans. Bare crypto
// is left out by design, keeping this a stocks/commodities board: the default
// (crypto) dex is never requested, and the ":" test below drops a bare ticker.
const MOVER_UNIVERSE = HIP3_DEX_WILDCARDS;

// Another source has no HIP-3 dex to wildcard, so asking for those wildcards
// there would return nothing: pass no symbols and take that source's whole
// universe instead.
const ALL_SYMBOLS = undefined;

function TopMovers({ config }: { config: z.output<typeof schema> }) {
  const hyperliquid = !config.source || config.source === "hyperliquid";
  const { stats, isLoading } = useDayStatsState(
    hyperliquid ? MOVER_UNIVERSE : ALL_SYMBOLS,
    60_000,
    config.source,
  );

  const { gainers, losers } = useMemo(() => {
    // A row shows the bare ticker, so a name two dexes both list keeps one row.
    const rows = Object.entries(preferOneDexPerTicker(stats))
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
    return splitMovers(rows, config.count);
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
  // The venue picks the whole universe, so a pinned source is worth naming in
  // the title; the default one is left unsaid.
  titleContent: ({ config }) => (
    <>{config.source ? `${prettySlug(config.source)} · ` : ""}Top Movers</>
  ),
});
