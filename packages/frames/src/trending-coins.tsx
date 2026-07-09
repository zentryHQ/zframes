import { defineFrame, useTrendingCoins } from "@zframes/core";
import type { z } from "zod";
import { changeColor, formatChangePct, formatPrice } from "./format";
import { MetricRow } from "./metric-row";
import { trendingCoinsMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = trendingCoinsMeta.schema;

function TrendingCoins({ config }: { config: z.output<typeof schema> }) {
  const { coins, isLoading } = useTrendingCoins();
  const rows = coins.slice(0, config.limit);

  if (isLoading) return <FrameStatus loading>loading trending…</FrameStatus>;
  if (rows.length === 0) return <FrameStatus>no trending data yet</FrameStatus>;

  return (
    <div className={`${scrollAreaClass} flex flex-col`}>
      {rows.map((c) => (
        <MetricRow
          key={c.id}
          label={c.symbol}
          meta={`${c.name}${c.rank ? ` · #${c.rank}` : ""}`}
          value={
            c.changePct24h != null ? (
              <span style={{ color: changeColor(c.changePct24h) }}>
                {formatChangePct(c.changePct24h)}
              </span>
            ) : c.price != null ? (
              formatPrice(c.price)
            ) : (
              "—"
            )
          }
        />
      ))}
    </div>
  );
}

export const trendingCoinsFrame = defineFrame({
  ...trendingCoinsMeta,
  component: TrendingCoins,
});
