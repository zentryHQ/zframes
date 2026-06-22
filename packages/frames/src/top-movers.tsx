import { defineFrame, useDayStatsState } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { AssetLogo, tickerOf } from "./asset-logo";
import { changeColor, formatChangePct, formatPrice } from "./format";
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

function MoverRow({
  symbol,
  markPx,
  changePct,
}: {
  symbol: string;
  markPx: number;
  changePct: number;
}) {
  return (
    <div
      className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2"
      title={`${tickerOf(symbol)} · ${formatPrice(markPx)}`}
    >
      <AssetLogo symbol={symbol} size={16} />
      <span className="body-sm truncate font-bold text-white">
        {tickerOf(symbol)}
      </span>
      <span className="caption text-soft text-right tabular-nums">
        {formatPrice(markPx)}
      </span>
      <span
        className="caption text-right font-bold tabular-nums"
        style={{ color: changeColor(changePct) }}
      >
        {formatChangePct(changePct)}
      </span>
    </div>
  );
}

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

  if (isLoading) return <FrameStatus loading>loading movers...</FrameStatus>;
  if (gainers.length === 0) return <FrameStatus>no mover data yet</FrameStatus>;

  return (
    <div className="grid h-full grid-cols-2 gap-x-4 overflow-hidden">
      <div className="flex flex-col gap-1.5">
        <div className="caption text-soft uppercase tracking-wide">gainers</div>
        {gainers.map((row) => (
          <MoverRow key={row.symbol} {...row} />
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="caption text-soft uppercase tracking-wide">losers</div>
        {losers.map((row) => (
          <MoverRow key={row.symbol} {...row} />
        ))}
      </div>
    </div>
  );
}

export const topMoversFrame = defineFrame({
  ...topMoversMeta,
  component: TopMovers,
});
