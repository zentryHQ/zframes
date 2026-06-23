import { defineFrame, useOpenInterest } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { AssetLogo, tickerOf } from "./asset-logo";
import { formatCompactUsd } from "./format";
import { openInterestMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = openInterestMeta.schema;

// A "<dex>:*" wildcard can resolve to a whole universe; cap the rendered rows.
const MAX_ROWS = 25;

function OpenInterest({ config }: { config: z.output<typeof schema> }) {
  const { entries, isLoading } = useOpenInterest(config.symbols);

  const rows = useMemo(() => entries.slice(0, MAX_ROWS), [entries]);
  const max = useMemo(
    () => rows.reduce((m, e) => Math.max(m, e.openInterestUsd), 0),
    [rows],
  );

  if (isLoading)
    return <FrameStatus loading>loading open interest…</FrameStatus>;
  if (rows.length === 0)
    return <FrameStatus>no open-interest data</FrameStatus>;

  return (
    <div className={`flex flex-col gap-1.5 ${scrollAreaClass}`}>
      {rows.map((entry) => (
        <div
          key={entry.symbol}
          className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"
          title={`${entry.symbol} · ${formatCompactUsd(entry.openInterestUsd)} open interest`}
        >
          <AssetLogo symbol={entry.symbol} size={16} />
          <div className="relative h-4 w-full overflow-hidden rounded-sm bg-white/[0.06]">
            <div
              className="absolute inset-y-0 left-0 rounded-sm"
              style={{
                width: `${max > 0 ? (entry.openInterestUsd / max) * 100 : 0}%`,
                background: "hsl(var(--zf-accent-hue, 242) 85% 72% / 0.5)",
              }}
            />
            <span className="absolute inset-y-0 left-1.5 flex items-center">
              <span className="body-sm truncate font-bold text-strong">
                {tickerOf(entry.symbol)}
              </span>
            </span>
          </div>
          <span className="caption text-soft text-right tabular-nums">
            {formatCompactUsd(entry.openInterestUsd)}
          </span>
        </div>
      ))}
    </div>
  );
}

export const openInterestFrame = defineFrame({
  ...openInterestMeta,
  component: OpenInterest,
});
