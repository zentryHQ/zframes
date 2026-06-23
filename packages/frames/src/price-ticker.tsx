import { defineFrame, useDayStatsState, useMidsState } from "@zframes/core";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import { MoverRow } from "./mover-row";
import { priceTickerMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = priceTickerMeta.schema;

function PriceTicker({ config }: { config: z.output<typeof schema> }) {
  const { mids, isLoading: midsLoading } = useMidsState(config.symbols);
  const { stats, isLoading: statsLoading } = useDayStatsState(config.symbols);
  const hasAnyPrice = config.symbols.some(
    (symbol) =>
      mids[symbol] !== undefined || stats[symbol]?.markPx !== undefined,
  );

  if ((midsLoading || statsLoading) && !hasAnyPrice)
    return <FrameStatus loading>loading prices…</FrameStatus>;

  return (
    <div className={`flex flex-col gap-1.5 ${scrollAreaClass}`}>
      {config.symbols.map((symbol) => (
        <MoverRow
          key={symbol}
          symbol={symbol}
          label={tickerOf(symbol)}
          price={mids[symbol] ?? stats[symbol]?.markPx}
          changePct={stats[symbol]?.changePct}
          logoSize={18}
          gap="gap-3"
        />
      ))}
    </div>
  );
}

export const priceTickerFrame = defineFrame({
  ...priceTickerMeta,
  component: PriceTicker,
});
