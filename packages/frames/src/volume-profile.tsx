import { defineFrame, useCandles } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { UP_COLOR, formatPrice } from "./format";
import { tickerOf } from "./asset-logo";
import { volumeProfileMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = volumeProfileMeta.schema;

interface Bin {
  low: number;
  high: number;
  mid: number;
  volume: number;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-md bg-white/[0.04] px-2 py-1 text-center">
      <div
        className="metric-sm text-strong truncate leading-none tabular-nums"
        title={value}
      >
        {value}
      </div>
      <div className="caption text-soft mt-0.5">{label}</div>
    </div>
  );
}

function VolumeProfile({ config }: { config: z.output<typeof schema> }) {
  const startTimeMs = useMemo(
    () => Date.now() - config.lookbackDays * 86_400_000,
    [config.lookbackDays],
  );
  const { candles, isLoading } = useCandles(
    config.symbol,
    config.interval,
    startTimeMs,
  );

  const profile = useMemo(() => {
    if (candles.length === 0) return null;
    let lo = Infinity;
    let hi = -Infinity;
    for (const c of candles) {
      lo = Math.min(lo, c.low);
      hi = Math.max(hi, c.high);
    }
    if (!(hi > lo)) return null;
    const n = config.bins;
    const width = (hi - lo) / n;
    const bins: Bin[] = Array.from({ length: n }, (_, i) => ({
      low: lo + i * width,
      high: lo + (i + 1) * width,
      mid: lo + (i + 0.5) * width,
      volume: 0,
    }));
    for (const c of candles) {
      const typical = (c.high + c.low + c.close) / 3;
      const vol = c.volume ?? 0;
      let idx = Math.floor((typical - lo) / width);
      if (idx < 0) idx = 0;
      if (idx >= n) idx = n - 1;
      bins[idx].volume += vol;
    }
    const total = bins.reduce((sum, b) => sum + b.volume, 0);
    if (total <= 0) return null;
    let pocIdx = 0;
    for (let i = 1; i < n; i++)
      if (bins[i].volume > bins[pocIdx].volume) pocIdx = i;
    // Expand out from the POC until the covered bins hold ≥70% of volume.
    let loI = pocIdx;
    let hiI = pocIdx;
    let acc = bins[pocIdx].volume;
    while (acc < total * 0.7 && (loI > 0 || hiI < n - 1)) {
      const down = loI > 0 ? bins[loI - 1].volume : -1;
      const up = hiI < n - 1 ? bins[hiI + 1].volume : -1;
      if (up >= down) acc += bins[++hiI].volume;
      else acc += bins[--loI].volume;
    }
    return {
      bins,
      pocIdx,
      loI,
      hiI,
      maxVol: bins[pocIdx].volume || 1,
      poc: bins[pocIdx].mid,
      vah: bins[hiI].high,
      val: bins[loI].low,
      price: candles[candles.length - 1].close,
    };
  }, [candles, config.bins]);

  if (isLoading)
    return <FrameStatus loading>loading volume profile…</FrameStatus>;
  if (!profile)
    return <FrameStatus>no candles for {tickerOf(config.symbol)}</FrameStatus>;

  const { bins, pocIdx, loI, hiI, maxVol, poc, vah, val, price } = profile;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Price" value={formatPrice(price)} />
        <Stat label="POC" value={formatPrice(poc)} />
        <Stat label="VAH" value={formatPrice(vah)} />
        <Stat label="VAL" value={formatPrice(val)} />
      </div>
      <div className="flex min-h-0 flex-1 flex-col-reverse gap-px overflow-hidden">
        {bins.map((b, i) => {
          const inVA = i >= loI && i <= hiI;
          const isPoc = i === pocIdx;
          const color = isPoc
            ? UP_COLOR
            : inVA
              ? "rgba(148,163,184,0.55)"
              : "rgba(148,163,184,0.22)";
          return (
            <div
              key={i}
              className="flex min-h-[3px] flex-1 items-center"
              title={formatPrice(b.mid)}
            >
              <div
                className="h-full rounded-sm"
                style={{
                  width: `${Math.max(2, (b.volume / maxVol) * 100)}%`,
                  background: color,
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const volumeProfileFrame = defineFrame({
  ...volumeProfileMeta,
  component: VolumeProfile,
});
