import { defineFrame } from "@zframes/core";
import { useEffect, useMemo, useState } from "react";
import type { z } from "zod";
import { interactiveSurface } from "./content-shared";
import { DOWN_COLOR, UP_COLOR, formatChangePct, formatPrice } from "./format";
import { riskRewardMeta } from "./schemas";
import { scrollAreaClass } from "./ui";

const schema = riskRewardMeta.schema;
type Config = z.output<typeof schema>;
type Direction = Config["direction"];

const accent = "var(--color-highlight)";

function toNum(v: string): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="caption text-soft uppercase tracking-[0.12em]">
        {label}
      </span>
      <span className={`flex items-center px-2 py-1.5 ${interactiveSurface}`}>
        <span className="body-sm text-soft">$</span>
        <input
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="body-sm text-normal min-w-0 flex-1 bg-transparent text-right tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </span>
    </label>
  );
}

function DirectionToggle({
  value,
  onChange,
}: {
  value: Direction;
  onChange: (v: Direction) => void;
}) {
  return (
    <div className={`flex gap-1 p-1 ${interactiveSurface}`}>
      {(["long", "short"] as const).map((opt) => {
        const active = opt === value;
        return (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`caption flex-1 rounded px-2 py-1 text-center uppercase tracking-[0.12em] transition-colors ${
              active ? "bg-white/[0.06] font-semibold" : "text-soft"
            }`}
            style={active ? { color: accent } : undefined}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function RiskReward({ config }: { config: Config }) {
  const [entry, setEntry] = useState(String(config.entry));
  const [stop, setStop] = useState(String(config.stop));
  const [target, setTarget] = useState(String(config.target));
  const [direction, setDirection] = useState<Direction>(config.direction);

  // Reflect config-rail edits into the live inputs (config only changes via the
  // rail, never mid-typing, so this never clobbers in-progress input).
  useEffect(() => setEntry(String(config.entry)), [config.entry]);
  useEffect(() => setStop(String(config.stop)), [config.stop]);
  useEffect(() => setTarget(String(config.target)), [config.target]);
  useEffect(() => setDirection(config.direction), [config.direction]);

  const r = useMemo(() => {
    const e = toNum(entry);
    const s = toNum(stop);
    const t = toNum(target);
    const riskPerUnit = Math.abs(e - s);
    const rewardPerUnit = Math.abs(t - e);
    const rr = riskPerUnit > 0 ? rewardPerUnit / riskPerUnit : 0;
    // As signed percentages of entry — risk is the downside, reward the upside.
    const riskPct = e !== 0 ? (riskPerUnit / e) * 100 : 0;
    const rewardPct = e !== 0 ? (rewardPerUnit / e) * 100 : 0;
    const total = riskPerUnit + rewardPerUnit;
    const riskShare = total > 0 ? (riskPerUnit / total) * 100 : 50;
    // A valid setup brackets entry correctly for the chosen direction; we still
    // compute magnitudes when inverted, and just flag the mismatch.
    const valid = direction === "long" ? s < e && e < t : t < e && e < s;
    return {
      riskPerUnit,
      rewardPerUnit,
      rr,
      riskPct,
      rewardPct,
      riskShare,
      hasRisk: riskPerUnit > 0,
      hasData: total > 0,
      valid,
    };
  }, [entry, stop, target, direction]);

  const ratioLabel = !r.hasData
    ? "—"
    : !r.hasRisk
      ? "∞"
      : `1 : ${r.rr.toFixed(r.rr >= 10 ? 0 : 1)}`;

  const label = config.label.trim();

  return (
    <div className={`${scrollAreaClass} flex flex-col gap-3`}>
      {label && (
        <span className="caption text-soft uppercase tracking-[0.12em]">
          {label}
        </span>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Field label="Entry" value={entry} onChange={setEntry} />
        <Field label="Stop" value={stop} onChange={setStop} />
        <Field label="Target" value={target} onChange={setTarget} />
      </div>

      <DirectionToggle value={direction} onChange={setDirection} />

      <div className="flex flex-col gap-2.5 rounded-lg border border-white/[0.07] bg-white/[0.03] p-3">
        <div className="flex flex-col items-center gap-0.5">
          <span className="caption text-soft uppercase tracking-[0.12em]">
            Risk : Reward
          </span>
          <span
            className="metric-md"
            style={{ color: r.hasData ? accent : undefined }}
          >
            {ratioLabel}
          </span>
        </div>

        {/* Two-segment bar: risk leg (red) vs reward leg (green), widths
            proportional to per-unit risk vs reward. */}
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
          <span
            className="h-full"
            style={{ width: `${r.riskShare}%`, background: DOWN_COLOR }}
          />
          <span
            className="h-full"
            style={{ width: `${100 - r.riskShare}%`, background: UP_COLOR }}
          />
        </div>

        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-col">
            <span
              className="caption uppercase tracking-[0.12em]"
              style={{ color: DOWN_COLOR }}
            >
              Risk
            </span>
            <span
              className="body-sm tabular-nums"
              style={{ color: DOWN_COLOR }}
            >
              {formatChangePct(-r.riskPct)}
            </span>
            <span className="caption text-soft tabular-nums">
              {formatPrice(r.riskPerUnit)} / unit
            </span>
          </div>
          <div className="flex min-w-0 flex-col items-end text-right">
            <span
              className="caption uppercase tracking-[0.12em]"
              style={{ color: UP_COLOR }}
            >
              Reward
            </span>
            <span className="body-sm tabular-nums" style={{ color: UP_COLOR }}>
              {formatChangePct(r.rewardPct)}
            </span>
            <span className="caption text-soft tabular-nums">
              {formatPrice(r.rewardPerUnit)} / unit
            </span>
          </div>
        </div>

        {r.hasData && !r.valid && (
          <span className="caption text-soft">
            ⚠ Prices don't bracket entry for a {direction} setup.
          </span>
        )}
      </div>
    </div>
  );
}

export const riskRewardFrame = defineFrame({
  ...riskRewardMeta,
  component: RiskReward,
});
