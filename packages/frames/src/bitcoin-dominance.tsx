import { defineFrame, useGlobalMarket } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import {
  changeColor,
  formatChangePct,
  formatCompactUsd,
  formatPct,
} from "./format";
import { bitcoinDominanceMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = bitcoinDominanceMeta.schema;

// BTC keeps its semantic orange; ETH + Others derive from the dashboard accent
// hue so the bar recolors with the theme instead of being a fixed indigo/purple.
const SEGMENT_STYLE: Record<string, string> = {
  BTC: "linear-gradient(90deg, #FF810F 0%, #FF9E37 100%)",
  ETH: "hsl(var(--zf-accent-hue, 242) 85% 72%)",
  Others: "hsl(var(--zf-accent-hue, 242) 38% 52%)",
};

/** Segmented BTC / ETH / Others dominance bar. */
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

  if (isLoading) return <FrameStatus loading>loading dominance…</FrameStatus>;
  if (!market) return <FrameStatus>no market data</FrameStatus>;

  const lead = segments[0];
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3">
      <div className="flex items-baseline gap-2">
        <span className="metric-xl text-strong">
          {formatPct(lead.value, 1)}
        </span>
        <span className="body-md text-soft">{lead.type}</span>
      </div>

      <div className="flex h-3 w-full max-w-sm gap-1 overflow-hidden rounded-full">
        {segments.map((item, i) => (
          <div
            key={item.type}
            className={`h-full ${i === 0 ? "rounded-l-full" : ""} ${i === segments.length - 1 ? "rounded-r-full" : ""}`}
            style={{
              width: `${item.value}%`,
              background: SEGMENT_STYLE[item.type],
            }}
          />
        ))}
      </div>

      <div className="grid w-full max-w-sm grid-cols-3">
        {segments.map((item) => (
          <div
            key={item.type}
            className="flex items-center justify-center gap-1.5"
          >
            <div
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ background: SEGMENT_STYLE[item.type] }}
            />
            <span className="body-sm text-soft">{item.type}</span>
            <span className="body-sm text-normal font-bold tabular-nums">
              {formatPct(item.value, 1)}
            </span>
          </div>
        ))}
      </div>

      {config.showTotalMarketCap && (
        <div className="caption text-soft">
          total mcap {formatCompactUsd(market.totalMarketCapUsd)} ·{" "}
          <span style={{ color: changeColor(market.marketCapChangePct24h) }}>
            {formatChangePct(market.marketCapChangePct24h)} 24h
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
