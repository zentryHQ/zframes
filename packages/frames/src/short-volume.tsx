import { defineFrame, useShortVolume } from "@zframes/core";
import type { ShortVolumeEntry } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { AssetLogo } from "./asset-logo";
import { formatCompact, formatPct } from "./format";
import { shortVolumeMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = shortVolumeMeta.schema;

const accent = (alpha = 1) =>
  `hsl(var(--zf-accent-hue, 242) 85% 72% / ${alpha})`;

function ShortVolumeRow({
  symbol,
  entry,
}: {
  symbol: string;
  entry: ShortVolumeEntry;
}) {
  const logoSymbol = symbol.includes(":") ? symbol : `xyz:${entry.symbol}`;
  const pct = Math.max(0, Math.min(100, entry.shortPct));
  return (
    <div className="flex min-w-0 items-center gap-3 border-b border-white/[0.06] py-2 last:border-b-0">
      <AssetLogo symbol={logoSymbol} size={20} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="body-sm text-strong truncate font-semibold">
            {entry.symbol}
          </span>
          <span className="body-md text-strong font-bold tabular-nums">
            {formatPct(pct, 1)}
          </span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className="h-full rounded-full"
            style={{
              width: `${pct}%`,
              background: accent(0.85),
              boxShadow: `0 0 8px ${accent(0.5)}`,
            }}
          />
        </div>
        <div className="caption text-soft mt-1 tabular-nums">
          short {formatCompact(entry.shortVolume)} /{" "}
          {formatCompact(entry.totalVolume)}
        </div>
      </div>
    </div>
  );
}

function ShortVolume({ config }: { config: z.output<typeof schema> }) {
  const { data, isLoading } = useShortVolume(config.symbols);

  const rows = useMemo(() => {
    const present = config.symbols
      .map((symbol) => ({ symbol, entry: data[symbol] }))
      .filter((r): r is { symbol: string; entry: ShortVolumeEntry } =>
        Boolean(r.entry),
      );
    present.sort((a, b) =>
      config.sort === "symbol"
        ? a.entry.symbol.localeCompare(b.entry.symbol)
        : config.sort === "volume"
          ? b.entry.totalVolume - a.entry.totalVolume
          : b.entry.shortPct - a.entry.shortPct,
    );
    return present;
  }, [data, config.symbols, config.sort]);

  if (isLoading)
    return <FrameStatus loading>loading short volume…</FrameStatus>;
  if (rows.length === 0)
    return <FrameStatus>no FINRA short-volume data yet</FrameStatus>;

  const date = rows[0].entry.date;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="caption text-soft uppercase">short volume</div>
          <div className="body-sm text-normal">
            {date ? `FINRA · ${date}` : "FINRA"}
          </div>
        </div>
        <div className="caption text-soft text-right">
          reported volume
          <br />
          not short interest
        </div>
      </div>

      <div className={scrollAreaClass}>
        {rows.map(({ symbol, entry }) => (
          <ShortVolumeRow key={symbol} symbol={symbol} entry={entry} />
        ))}
      </div>
    </div>
  );
}

export const shortVolumeFrame = defineFrame({
  ...shortVolumeMeta,
  component: ShortVolume,
});
