import {
  defineFrame,
  useDailyCloseHistory,
  useOnchainExtras,
  useOnchainValuation,
} from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { DOWN_COLOR, UP_COLOR } from "./format";
import { ZONE_NEUTRAL } from "./cycle-shared";
import { ema, rsi, sma } from "./indicators";
import { cycleSignalsMeta } from "./schemas";
import { MetricRow } from "./metric-row";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = cycleSignalsMeta.schema;

interface Signal {
  name: string;
  /** Current reading, or null if we don't have the data yet. */
  value: number | null;
  /** Formatted current reading. */
  display: string;
  /** Threshold text, e.g. "≥ 3". */
  threshold: string;
  /** Whether the signal is currently firing. */
  fired: boolean;
}

function lastNonNull(arr: (number | null)[]): number | null {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] !== null) return arr[i];
  return null;
}

function CycleSignals({ config }: { config: z.output<typeof schema> }) {
  const { valuation, isLoading: vLoading } = useOnchainValuation();
  const { extras } = useOnchainExtras();
  const { history, isLoading: hLoading } = useDailyCloseHistory("btc");
  const peak = config.mode === "peak";

  const signals = useMemo<Signal[]>(() => {
    if (!valuation) return [];
    const closes = history.map((p) => p.value);
    const price = closes.at(-1) ?? null;
    const sma200 = lastNonNull(sma(closes, 200));
    const mayer = price !== null && sma200 ? price / sma200 : null;
    const rsi14 = lastNonNull(rsi(closes, 14));
    const sma111 = lastNonNull(sma(closes, 111));
    const sma350 = lastNonNull(sma(closes, 350));
    const piTop = sma111 !== null && sma350 ? sma111 / (2 * sma350) : null;
    const ema150 = ema(closes, 150).at(-1) ?? null;
    const sma471 = lastNonNull(sma(closes, 471));
    const piBottom = ema150 !== null && sma471 ? ema150 / sma471 : null;
    const puell = extras?.puell ?? null;
    const { mvrv, mvrvZScore, nupl } = valuation;

    const mk = (
      name: string,
      value: number | null,
      display: string,
      threshold: string,
      fired: boolean,
    ): Signal => ({ name, value, display, threshold, fired: value !== null && fired });

    const pct = (v: number | null) => (v !== null ? `${(v * 100).toFixed(0)}%` : "—");
    const num = (v: number | null, dp = 2) => (v !== null ? v.toFixed(dp) : "—");

    if (peak)
      return [
        mk("MVRV", mvrv, num(mvrv), "≥ 3", (mvrv ?? 0) >= 3),
        mk("MVRV Z-Score", mvrvZScore, num(mvrvZScore), "≥ 7", (mvrvZScore ?? 0) >= 7),
        mk("NUPL", nupl, pct(nupl), "≥ 75%", (nupl ?? 0) >= 0.75),
        mk("Mayer Multiple", mayer, num(mayer), "≥ 2.4", (mayer ?? 0) >= 2.4),
        mk("Puell Multiple", puell, num(puell), "≥ 4", (puell ?? 0) >= 4),
        mk("RSI (14)", rsi14, num(rsi14, 0), "≥ 80", (rsi14 ?? 0) >= 80),
        mk("Pi Cycle Top", piTop, num(piTop), "≥ 1", (piTop ?? 0) >= 1),
      ];
    return [
      mk("MVRV", mvrv, num(mvrv), "≤ 1", (mvrv ?? Infinity) <= 1),
      mk("MVRV Z-Score", mvrvZScore, num(mvrvZScore), "≤ 0", (mvrvZScore ?? Infinity) <= 0),
      mk("NUPL", nupl, pct(nupl), "≤ 0%", (nupl ?? Infinity) <= 0),
      mk("Mayer Multiple", mayer, num(mayer), "≤ 0.8", (mayer ?? Infinity) <= 0.8),
      mk("Puell Multiple", puell, num(puell), "≤ 0.5", (puell ?? Infinity) <= 0.5),
      mk("RSI (14)", rsi14, num(rsi14, 0), "≤ 30", (rsi14 ?? Infinity) <= 30),
      mk("Pi Cycle Bottom", piBottom, num(piBottom), "≥ 0.745", (piBottom ?? 0) >= 0.745),
    ];
  }, [valuation, extras, history, peak]);

  if ((vLoading || hLoading) && signals.length === 0)
    return <FrameStatus loading>loading cycle signals…</FrameStatus>;
  if (signals.length === 0)
    return <FrameStatus>no on-chain data yet</FrameStatus>;

  const withData = signals.filter((s) => s.value !== null);
  const firing = withData.filter((s) => s.fired).length;
  const fireColor = peak ? DOWN_COLOR : UP_COLOR;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <span className="caption text-soft">
          {peak ? "Cycle-top signals" : "Cycle-bottom signals"}
        </span>
        <span className="metric-md" style={{ color: firing > 0 ? fireColor : ZONE_NEUTRAL }}>
          {firing}
          <span className="text-soft">/{withData.length}</span>
        </span>
      </div>
      <div className={`${scrollAreaClass} flex flex-col`}>
        {signals.map((s) => (
          <MetricRow
            key={s.name}
            label={s.name}
            meta={`fires ${s.threshold}`}
            value={
              <span style={{ color: s.fired ? fireColor : undefined }}>
                {s.fired ? "● " : ""}
                {s.display}
              </span>
            }
          />
        ))}
      </div>
    </div>
  );
}

export const cycleSignalsFrame = defineFrame({
  ...cycleSignalsMeta,
  component: CycleSignals,
});
