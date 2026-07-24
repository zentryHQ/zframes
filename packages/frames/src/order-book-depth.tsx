import { defineFrame, useMoney, useOrderBook, type Money } from "@zframes/core";
import type { OrderBookLevel } from "@zframes/spec";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR, formatCompact, formatPct } from "./format";
import { orderBookDepthMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = orderBookDepthMeta.schema;

/**
 * One ladder row. The cumulative-depth bar is painted as a background gradient
 * rather than a nested element so the row stays a single grid line — a book
 * reads as a shape first, numbers second.
 */
function Level({
  level,
  maxCumulative,
  color,
  money,
}: {
  level: OrderBookLevel;
  maxCumulative: number;
  color: string;
  money: Money;
}) {
  const pct =
    maxCumulative > 0
      ? Math.min((level.cumulativeSize / maxCumulative) * 100, 100)
      : 0;
  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-1 tabular-nums"
      style={{
        background: `linear-gradient(to left, color-mix(in srgb, ${color} 22%, transparent) ${pct}%, transparent ${pct}%)`,
      }}
      title={`${money.price(level.price)} · ${formatCompact(level.size)} resting · ${formatCompact(level.cumulativeSize)} cumulative`}
    >
      <span className="caption font-bold" style={{ color }}>
        {money.price(level.price)}
      </span>
      <span className="caption text-soft">{formatCompact(level.size)}</span>
    </div>
  );
}

function OrderBookDepth({ config }: { config: z.output<typeof schema> }) {
  const { book, isLoading } = useOrderBook(
    config.symbol,
    config.levels,
    undefined,
    config.venue,
  );
  // Prices arrive in USD like every capability; this renders them in the card's
  // display currency, so a THB board shows the venue's own baht ladder.
  const money = useMoney();

  if (isLoading) return <FrameStatus loading>loading order book…</FrameStatus>;
  if (!book || (book.bids.length === 0 && book.asks.length === 0))
    return <FrameStatus>no book for {config.symbol}</FrameStatus>;

  const asks = book.asks.slice(0, config.levels);
  const bids = book.bids.slice(0, config.levels);
  // One shared scale across both sides, so the bars compare bid depth against
  // ask depth instead of each side against itself.
  const maxCumulative = Math.max(
    asks.at(-1)?.cumulativeSize ?? 0,
    bids.at(-1)?.cumulativeSize ?? 0,
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <div className={scrollAreaClass}>
        {/* Asks descend toward the spread, so the best ask sits just above it. */}
        {[...asks].reverse().map((level) => (
          <Level
            key={`ask-${level.price}`}
            level={level}
            maxCumulative={maxCumulative}
            color={DOWN_COLOR}
            money={money}
          />
        ))}
        <div className="flex items-baseline justify-between gap-2 border-y border-white/10 px-1 py-1">
          <span className="body-sm font-bold text-strong tabular-nums">
            {money.price(book.mid)}
          </span>
          <span className="caption text-soft tabular-nums">
            {formatPct(book.spreadPct)} spread
          </span>
        </div>
        {bids.map((level) => (
          <Level
            key={`bid-${level.price}`}
            level={level}
            maxCumulative={maxCumulative}
            color={UP_COLOR}
            money={money}
          />
        ))}
      </div>
      <div className="caption text-soft shrink-0">
        {book.pair} · size in {book.symbol}
      </div>
    </div>
  );
}

export const orderBookDepthFrame = defineFrame({
  ...orderBookDepthMeta,
  component: OrderBookDepth,
});
