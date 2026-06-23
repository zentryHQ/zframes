import { defineFrame, useDayStatsState } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { MoverRow } from "./mover-row";
import { topMoversMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = topMoversMeta.schema;

const MOVER_UNIVERSE = [
  "xyz:*",
  "km:GOLD",
  "km:SILVER",
  "km:USOIL",
  "km:USENERGY",
  "km:US500",
  "km:SMALL2000",
  "km:USTECH",
  "km:SEMI",
  "km:GLDMINE",
] as const;

function TopMovers({ config }: { config: z.output<typeof schema> }) {
  const { stats, isLoading } = useDayStatsState(MOVER_UNIVERSE, 60_000);

  const { gainers, losers } = useMemo(() => {
    const rows = Object.entries(stats)
      .map(([symbol, stat]) => ({ symbol, ...stat }))
      // Dust assets produce absurd % moves with no liquidity behind them.
      .filter(
        (row) =>
          row.symbol.includes(":") && row.markPx > 0 && row.prevDayPx > 0,
      )
      .sort((a, b) => b.changePct - a.changePct);
    return {
      gainers: rows.slice(0, config.count),
      losers: rows.slice(-config.count).reverse(),
    };
  }, [stats, config.count]);

  if (isLoading) return <FrameStatus loading>loading movers…</FrameStatus>;
  if (gainers.length === 0) return <FrameStatus>no mover data yet</FrameStatus>;

  return (
    <div className="grid h-full grid-cols-2 gap-x-4 overflow-hidden">
      <div className="flex flex-col gap-1.5">
        <div className="caption text-soft uppercase tracking-wide">gainers</div>
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
      <div className="flex flex-col gap-1.5">
        <div className="caption text-soft uppercase tracking-wide">losers</div>
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
  );
}

export const topMoversFrame = defineFrame({
  ...topMoversMeta,
  component: TopMovers,
});
