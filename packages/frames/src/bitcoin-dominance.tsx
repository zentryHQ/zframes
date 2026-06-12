import { defineFrame, useGlobalMarket } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { bitcoinDominanceMeta } from "./schemas";

const schema = bitcoinDominanceMeta.schema;

const SEGMENT_STYLE: Record<string, string> = {
  BTC: "linear-gradient(90deg, #FF810F 0%, #FF9E37 81.48%)",
  ETH: "#6366F1",
  Others: "#6B7280",
};

/** UI ported from zTerminal's BitcoinDominance (features/market). */
function BitcoinDominance({ config }: { config: z.output<typeof schema> }) {
  const { market, isLoading } = useGlobalMarket();

  const segments = useMemo(() => {
    if (!market) return [];
    const btc = market.dominance.btc ?? 0;
    const eth = market.dominance.eth ?? 0;
    return [
      { type: "BTC", value: btc },
      { type: "ETH", value: eth },
      { type: "Others", value: Math.max(0, 100 - btc - eth) },
    ].sort((a, b) => b.value - a.value);
  }, [market]);

  if (isLoading)
    return <div className="body-sm text-soft animate-pulse">loading dominance…</div>;
  if (!market) return <div className="body-sm text-soft">no market data</div>;

  const lead = segments[0];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="flex items-baseline gap-2">
        <span className="font-dmsans text-strong text-4xl font-bold tabular-nums">
          {lead.value.toFixed(1)}%
        </span>
        <span className="body-md text-soft">{lead.type}</span>
      </div>

      <div className="flex h-2.5 w-full max-w-xs gap-0.5 overflow-hidden">
        {segments.map((item) => (
          <div
            key={item.type}
            className="h-full rounded-[2px] first:rounded-l-[10px] last:rounded-r-[10px]"
            style={{ width: `${item.value}%`, background: SEGMENT_STYLE[item.type] }}
          />
        ))}
      </div>

      <div className="flex w-full max-w-xs items-center justify-between">
        {segments.map((item) => (
          <div key={item.type} className="flex items-center gap-1.5">
            <div
              className="h-[5px] w-[7px] rounded-full"
              style={{ background: SEGMENT_STYLE[item.type] }}
            />
            <span className="body-sm text-soft">{item.type}</span>
            <span className="body-sm text-normal font-bold tabular-nums">
              {item.value.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>

      {config.showTotalMarketCap && (
        <div className="caption text-soft">
          total mcap ${(market.totalMarketCapUsd / 1e12).toFixed(2)}T ·{" "}
          <span style={{ color: market.marketCapChangePct24h >= 0 ? "#3fd08f" : "#ff6b81" }}>
            {market.marketCapChangePct24h >= 0 ? "+" : ""}
            {market.marketCapChangePct24h.toFixed(2)}% 24h
          </span>
        </div>
      )}
    </div>
  );
}

export const bitcoinDominanceFrame = defineFrame({
  ...bitcoinDominanceMeta,
  component: BitcoinDominance,
});
