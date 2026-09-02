import { defineFrame, useCoinMovers } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { MoverRow, splitMovers } from "./mover-row";
import { coinMoversMeta } from "./schemas";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = coinMoversMeta.schema;

const WINDOWS = ["1h", "24h", "7d", "30d"] as const;

function CoinMovers({ config }: { config: z.output<typeof schema> }) {
  const [moversWindow, setWindow] = useFrameChoice("window", config.window);
  const { entries, isLoading } = useCoinMovers();

  const { gainers, losers } = useMemo(() => {
    const rows = entries
      // Liquidity floor: skip dust below the rank cutoff / with no volume.
      .filter((e) => e.rank <= config.minRank && e.volume24hUsd > 0)
      .map((e) => ({
        symbol: e.symbol,
        price: e.priceUsd,
        chg: e.changePct[moversWindow] ?? 0,
      }))
      .sort((a, b) => b.chg - a.chg);
    return splitMovers(rows, config.count);
  }, [entries, moversWindow, config.count, config.minRank]);

  if (isLoading) return <FrameStatus loading>loading movers…</FrameStatus>;
  if (gainers.length === 0) return <FrameStatus>no mover data yet</FrameStatus>;

  return (
    // `grid-rows-1` is minmax(0,1fr), not the implicit auto row: an auto row is
    // sized by its tallest item, so the columns below would grow the grid past
    // the card instead of scrolling inside it.
    <div className="grid h-full min-h-0 grid-cols-2 grid-rows-1 gap-x-4">
      <div className="flex min-h-0 flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="caption text-soft uppercase tracking-wide">
            gainers
          </span>
          <TimeframeToggle
            options={WINDOWS}
            value={moversWindow}
            onChange={setWindow}
            label="movers window"
          />
        </div>
        {/* Scrolls rather than clips, as in `rates-board`/`fx-board`: `count`
            decides how many rows each column holds, so on a card too short for
            them the ones that don't fit stay reachable instead of the last one
            being sliced through the middle. The heading stays pinned. */}
        <div className={`${scrollAreaClass} flex flex-col gap-1.5`}>
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
      </div>
      <div className="flex min-h-0 flex-col gap-1.5">
        {/* Just "losers" — the toggle beside "gainers" already shows which
            window both columns are on, so repeating it here (and only here)
            read lopsided. */}
        <div className="caption text-soft uppercase tracking-wide">losers</div>
        <div className={`${scrollAreaClass} flex flex-col gap-1.5`}>
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
    </div>
  );
}

export const coinMoversFrame = defineFrame({
  ...coinMoversMeta,
  component: CoinMovers,
});
