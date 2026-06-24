import { defineFrame, useFramePatch } from "@zframes/core";
import { useCallback, useEffect, useState } from "react";
import type { z } from "zod";
import { interactiveSurface } from "./content-shared";
import { stopwatchMeta } from "./schemas";

const schema = stopwatchMeta.schema;
type Config = z.output<typeof schema>;

const accent = "var(--color-highlight)";
const accentGlow = "0 0 18px hsl(var(--zf-accent-hue, 242) 92% 70% / 0.45)";

const pad = (n: number) => String(n).padStart(2, "0");

/** Render an elapsed-ms span as `H:MM:SS`, dropping the hour under an hour. */
function formatElapsed(ms: number): string {
  const totalSec = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function Stopwatch({ config }: { config: Config }) {
  const patch = useFramePatch();

  // When persistence is available, `config` is the source of truth (edits
  // round-trip through dashboard.json). In the bare renderer `patch` is null,
  // so we fall back to local state and the stopwatch still runs — just isn't
  // persisted across reloads.
  const [local, setLocal] = useState({
    startedAt: config.startedAt,
    accumulatedMs: config.accumulatedMs,
  });
  const startedAt = patch ? config.startedAt : local.startedAt;
  const accumulatedMs = patch ? config.accumulatedMs : local.accumulatedMs;
  const running = startedAt !== 0;

  // Persist ONLY on discrete events (start/pause/reset), never per tick — same
  // partial-patch shape as note.tsx. Guard the write: `patch` is null in the
  // bare renderer, where we merge into local state instead.
  const commit = useCallback(
    (next: Partial<{ startedAt: number; accumulatedMs: number }>) => {
      if (patch) patch(next);
      else setLocal((prev) => ({ ...prev, ...next }));
    },
    [patch],
  );

  // Re-render the readout while running. The interval changes nothing
  // persisted — it only bumps a tick so the derived elapsed value re-reads
  // Date.now(). Cleared on pause/reset (via `running`) and on unmount.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 250);
    return () => window.clearInterval(id);
  }, [running]);

  const elapsed = accumulatedMs + (running ? Date.now() - startedAt : 0);

  const start = () => commit({ startedAt: Date.now() });
  const pause = () => commit({ startedAt: 0, accumulatedMs: elapsed });
  const reset = () => commit({ startedAt: 0, accumulatedMs: 0 });

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center">
      {config.label && (
        <div className="caption text-soft inline-flex items-center gap-1.5 uppercase tracking-[0.18em]">
          <span
            aria-hidden
            className="inline-block h-1 w-1 rounded-full"
            style={{ background: accent, boxShadow: running ? accentGlow : undefined }}
          />
          {config.label}
        </div>
      )}

      <div
        className="metric-lg text-strong leading-none"
        style={running ? { color: accent, textShadow: accentGlow } : undefined}
      >
        {formatElapsed(elapsed)}
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={running ? pause : start}
          className={`caption text-normal px-3 py-1 uppercase tracking-[0.12em] ${interactiveSurface}`}
          style={running ? undefined : { color: accent }}
        >
          {running ? "Pause" : "Start"}
        </button>
        <button
          type="button"
          onClick={reset}
          disabled={!running && elapsed === 0}
          className={`caption text-soft px-3 py-1 uppercase tracking-[0.12em] transition-opacity disabled:opacity-40 ${interactiveSurface}`}
        >
          Reset
        </button>
      </div>
    </div>
  );
}

export const stopwatchFrame = defineFrame({
  ...stopwatchMeta,
  component: Stopwatch,
});
