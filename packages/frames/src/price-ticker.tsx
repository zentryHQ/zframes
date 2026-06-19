import { defineFrame, useDayStatsState, useMidsState } from "@zframes/core";
import type { z } from "zod";
import { AssetLogo, tickerOf } from "./asset-logo";
import { changeColor, formatChangePct, formatPrice } from "./format";
import { priceTickerMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = priceTickerMeta.schema;

function PriceTicker({ config }: { config: z.output<typeof schema> }) {
  const { mids, isLoading: midsLoading } = useMidsState(config.symbols);
  const { stats, isLoading: statsLoading } = useDayStatsState(config.symbols);
  const hasAnyPrice = config.symbols.some(
    (symbol) =>
      mids[symbol] !== undefined || stats[symbol]?.markPx !== undefined,
  );

  if ((midsLoading || statsLoading) && !hasAnyPrice)
    return <FrameStatus loading>loading prices...</FrameStatus>;

  return (
    <div className="flex flex-col gap-1.5 overflow-auto">
      {config.symbols.map((symbol) => {
        const mid = mids[symbol] ?? stats[symbol]?.markPx;
        const changePct = stats[symbol]?.changePct;
        return (
          <div
            key={symbol}
            className="body-sm grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-3"
          >
            <AssetLogo symbol={symbol} size={18} />
            <span className="truncate font-semibold text-white" title={symbol}>
              {tickerOf(symbol)}
            </span>
            <span className="tabular-nums">
              {mid !== undefined ? formatPrice(mid) : "—"}
            </span>
            <span
              className="min-w-[64px] text-right tabular-nums"
              style={{
                color:
                  changePct !== undefined ? changeColor(changePct) : undefined,
                opacity: changePct !== undefined ? 1 : 0.4,
              }}
            >
              {changePct !== undefined ? formatChangePct(changePct) : "…"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export const priceTickerFrame = defineFrame({
  ...priceTickerMeta,
  component: PriceTicker,
});
