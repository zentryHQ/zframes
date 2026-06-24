import { defineFrame } from "@zframes/core";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { EXCHANGES, evaluate, formatCountdown } from "./market-data";
import { sessionProgressMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = sessionProgressMeta.schema;
type Config = z.output<typeof schema>;

/** Parse a local "HH:MM" into minutes-since-midnight (hhmmToMin isn't exported
 *  from market-data, and we only need it for the session start/end here). */
function hhmmToMin(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + m;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

function SessionProgress({ config }: { config: Config }) {
  // A 30s tick is plenty for a session-progress readout (the bar moves <0.3%
  // of a 6.5h session per tick); store the moment and recompute each render.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const ex = EXCHANGES[config.exchange] ?? EXCHANGES["NYSE"];
  if (!ex) return <FrameStatus>unknown exchange</FrameStatus>;

  const state = evaluate(ex, now);
  const open = state.status === "open";
  const label = config.label.trim();

  // Fraction of the session elapsed: only meaningful while open. Closed and
  // holiday render an empty, neutral bar.
  const total = hhmmToMin(state.close) - hhmmToMin(state.open);
  const fill =
    open && total > 0 ? clamp01((total - state.nextChangeMin) / total) : 0;
  const pct = Math.round(fill * 100);

  const statusLabel =
    state.status === "holiday" ? "Holiday" : open ? `${pct}%` : "Closed";

  const caption = open
    ? `closes in ${formatCountdown(state.nextChangeMin)}`
    : config.showCountdown
      ? `opens in ${formatCountdown(state.nextChangeMin)}`
      : null;

  return (
    <div className="flex h-full w-full flex-col justify-center gap-2">
      <div className="caption text-soft flex items-center gap-1.5 uppercase tracking-[0.14em]">
        <span className="text-normal font-semibold">{ex.mark}</span>
        <span>{ex.code}</span>
        {label && (
          <span className="text-disabled truncate tracking-normal normal-case">
            · {label}
          </span>
        )}
      </div>

      <div
        className={`metric-md leading-none ${open ? "text-strong" : "text-soft"}`}
      >
        {statusLabel}
      </div>

      <div className="bg-surface h-2 w-full overflow-hidden rounded-full">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${fill * 100}%`, background: "var(--color-highlight)" }}
        />
      </div>

      {caption && <div className="caption text-soft">{caption}</div>}
    </div>
  );
}

export const sessionProgressFrame = defineFrame({
  ...sessionProgressMeta,
  component: SessionProgress,
});
