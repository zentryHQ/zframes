import { defineFrame } from "@zframes/core";
import { useEffect, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import { countdownMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { useCountdown } from "./use-countdown";

const schema = countdownMeta.schema;
type Config = z.output<typeof schema>;

const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

/** Break a (clamped, non-negative) remaining-ms span into d/h/m/s fields. */
function segments(remaining: number) {
  let rem = Math.max(0, remaining);
  const days = Math.floor(rem / DAY);
  rem -= days * DAY;
  const hours = Math.floor(rem / HOUR);
  rem -= hours * HOUR;
  const minutes = Math.floor(rem / MIN);
  rem -= minutes * MIN;
  const seconds = Math.floor(rem / 1_000);
  return { days, hours, minutes, seconds };
}

const accent = "hsl(var(--zf-accent-hue, 242) 96% 82%)";
const accentGlow = "0 0 16px hsl(var(--zf-accent-hue, 242) 92% 70% / 0.4)";
const pad = (n: number) => String(n).padStart(2, "0");

function Countdown({ config }: { config: Config }) {
  // One node per unit — useCountdown writes textContent, so each styled
  // segment needs its own ref (same shape as the clock frame).
  const dRef = useRef<HTMLSpanElement>(null);
  const hRef = useRef<HTMLSpanElement>(null);
  const mRef = useRef<HTMLSpanElement>(null);
  const sRef = useRef<HTMLSpanElement>(null);

  const target = config.target.trim();
  // null = not set; NaN = set but unparseable.
  const targetMs = useMemo(() => {
    if (!target) return null;
    const t = new Date(target).getTime();
    return Number.isFinite(t) ? t : NaN;
  }, [target]);

  const valid = targetMs != null && !Number.isNaN(targetMs);
  const [reached, setReached] = useState(valid && targetMs <= Date.now());

  // A single self-clearing timer flips to the reached state exactly at the
  // target — no per-frame polling, the readout itself rides the shared tick.
  useEffect(() => {
    if (!valid) return;
    const delay = targetMs - Date.now();
    if (delay <= 0) {
      setReached(true);
      return;
    }
    setReached(false);
    const id = window.setTimeout(() => setReached(true), delay);
    return () => window.clearTimeout(id);
  }, [valid, targetMs]);

  // Hooks must run unconditionally; a null ref no-ops, so the early returns
  // below (prompt / error states) stay safe.
  const getRemaining = () => (valid ? targetMs - Date.now() : 0);
  useCountdown({
    ref: dRef,
    getRemainingMs: getRemaining,
    format: (ms) => String(segments(ms).days),
  });
  useCountdown({
    ref: hRef,
    getRemainingMs: getRemaining,
    format: (ms) => pad(segments(ms).hours),
  });
  useCountdown({
    ref: mRef,
    getRemainingMs: getRemaining,
    format: (ms) => pad(segments(ms).minutes),
  });
  useCountdown({
    ref: sRef,
    getRemainingMs: getRemaining,
    format: (ms) => pad(segments(ms).seconds),
  });

  const targetFmt = useMemo(
    () =>
      valid
        ? new Intl.DateTimeFormat(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(targetMs))
        : "",
    [valid, targetMs],
  );

  if (!target) return <FrameStatus>set a target date &amp; time</FrameStatus>;
  if (!valid) return <FrameStatus>invalid target date: {target}</FrameStatus>;

  const seed = segments(getRemaining());
  const cols: Array<[React.RefObject<HTMLSpanElement | null>, string, string]> =
    [
      [dRef, String(seed.days), "days"],
      [hRef, pad(seed.hours), "hrs"],
      [mRef, pad(seed.minutes), "min"],
      [sRef, pad(seed.seconds), "sec"],
    ];

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center [container-type:size]">
      {config.label && (
        <div className="caption text-soft inline-flex items-center gap-1.5 uppercase tracking-[0.18em]">
          <span
            aria-hidden
            className="inline-block h-1 w-1 rounded-full"
            style={{ background: accent, boxShadow: accentGlow }}
          />
          {config.label}
        </div>
      )}

      <div
        className="flex items-start justify-center gap-[0.5em] leading-none tabular-nums"
        style={{ fontSize: "clamp(0.9rem, 20cqmin, 2.8rem)" }}
      >
        {cols.map(([ref, seedVal, unit], i) => (
          <div key={unit} className="flex flex-col items-center gap-[0.25em]">
            <span
              ref={ref}
              suppressHydrationWarning
              className="text-strong font-dmsans font-extrabold tracking-[-0.01em]"
              style={{
                fontSize: "1em",
                color: i === 3 && !reached ? accent : undefined,
                textShadow: i === 3 && !reached ? accentGlow : undefined,
              }}
            >
              {seedVal}
            </span>
            <span
              className="text-soft uppercase tracking-[0.12em]"
              style={{ fontSize: "0.26em" }}
            >
              {unit}
            </span>
          </div>
        ))}
      </div>

      {reached ? (
        <div
          className="caption font-semibold uppercase tracking-[0.2em]"
          style={{ color: accent, textShadow: accentGlow }}
        >
          reached
        </div>
      ) : (
        config.showTarget &&
        targetFmt && <div className="caption text-soft tabular-nums">{targetFmt}</div>
      )}
    </div>
  );
}

export const countdownFrame = defineFrame({
  ...countdownMeta,
  component: Countdown,
});
