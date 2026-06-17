import { defineFrame, useDayStats, useMids } from "@zframes/core";
import type { z } from "zod";
import { changeColor, formatChangePct, formatPrice } from "./format";
import { priceTickerMeta } from "./schemas";

const schema = priceTickerMeta.schema;

function PriceTicker({ config }: { config: z.output<typeof schema> }) {
  const mids = useMids(config.symbols);
  const stats = useDayStats(config.symbols);

  return (
    <div className="flex flex-col gap-1.5 overflow-auto">
      {config.symbols.map((symbol) => {
        const mid = mids[symbol] ?? stats[symbol]?.markPx;
        const changePct = stats[symbol]?.changePct;
        return (
          <div
            key={symbol}
            className="body-sm grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3"
          >
            <span className="truncate font-semibold text-white">{symbol}</span>
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
