import { defineFrame, useCoinMovers } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { MoverRow } from "./mover-row";
import { coinMoversMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = coinMoversMeta.schema;

function CoinMovers({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useCoinMovers();

  const { gainers, losers } = useMemo(() => {
    const rows = entries
      // Liquidity floor: skip dust below the rank cutoff / with no volume.
      .filter((e) => e.rank <= config.minRank && e.volume24hUsd > 0)
      .map((e) => ({
        symbol: e.symbol,
        price: e.priceUsd,
        chg: e.changePct[config.window] ?? 0,
      }))
      .sort((a, b) => b.chg - a.chg);
    return {
      gainers: rows.slice(0, config.count),
      losers: rows.slice(-config.count).reverse(),
    };
  }, [entries, config.window, config.count, config.minRank]);

  if (isLoading) return <FrameStatus loading>loading movers…</FrameStatus>;
  if (gainers.length === 0) return <FrameStatus>no mover data yet</FrameStatus>;

  return (
    <div className="grid h-full grid-cols-2 gap-x-4 overflow-hidden">
      <div className="flex flex-col gap-1.5">
        <div className="caption text-soft uppercase tracking-wide">
          gainers · {config.window}
        </div>
        {gainers.map((row) => (
          <MoverRow
            key={row.symbol}
            symbol={row.symbol}
            label={row.symbol}
            price={row.price}
            changePct={row.chg}
          />
        ))}
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="caption text-soft uppercase tracking-wide">
          losers · {config.window}
        </div>
        {losers.map((row) => (
          <MoverRow
            key={row.symbol}
            symbol={row.symbol}
            label={row.symbol}
            price={row.price}
            changePct={row.chg}
          />
        ))}
      </div>
    </div>
  );
}

export const coinMoversFrame = defineFrame({
  ...coinMoversMeta,
  component: CoinMovers,
});
