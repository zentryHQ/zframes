import { defineFrame, useCandles, useMoney } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { UP_COLOR } from "./format";
import { AssetLogo, tickerOf } from "./asset-logo";
import { volumeProfileMeta } from "./schemas";
import { Stat } from "./stat";
import { FrameStatus } from "./ui";

const schema = volumeProfileMeta.schema;

interface Bin {
  low: number;
  high: number;
  mid: number;
  volume: number;
}

/**
 * One price level of the profile. Value above label — the order IS the layout,
 * no prop for it — and the figure repeats in a `title` because a converted
 * price can outgrow a half-width tile and `Stat.Value` truncates.
 */
function LevelStat({ label, value }: { label: string; value: string }) {
  return (
    <Stat surface="tile" align="center" className="gap-0.5">
      <Stat.Value size="metric-sm">
        <span title={value}>{value}</span>
      </Stat.Value>
      <Stat.Label>{label}</Stat.Label>
    </Stat>
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
  const money = useMoney();

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
      <Stat.Strip cols={2} gap={1.5}>
        <LevelStat label="Price" value={money.price(price)} />
        <LevelStat label="POC" value={money.price(poc)} />
        <LevelStat label="VAH" value={money.price(vah)} />
        <LevelStat label="VAL" value={money.price(val)} />
      </Stat.Strip>
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
            // A 1px floor, not 3px: it only exists so a near-zero bucket still
            // paints a hairline, but at 3px × up to 48 buckets it also made the
            // histogram taller than a short card — and column-reverse puts that
            // overflow off the TOP, clipped away with no scrollbar to reach it.
            // A compressed profile still reads as a shape; a beheaded one
            // doesn't.
            <div
              key={i}
              className="flex min-h-[1px] flex-1 items-center"
              title={money.price(b.mid)}
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
  titleIcon: ({ config }) => <AssetLogo symbol={config.symbol} size={14} />,
  titleContent: ({ config }) => <>{tickerOf(config.symbol)} · Volume Profile</>,
});
