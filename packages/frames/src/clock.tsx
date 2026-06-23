import { defineFrame } from "@zframes/core";
import { useMemo, useRef } from "react";
import type { z } from "zod";
import { clockMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { useCountdown } from "./use-countdown";

const schema = clockMeta.schema;

type TimeParts = {
  hour: string;
  minute: string;
  second: string;
  fractional: string;
  period: string;
};

/**
 * Split a time formatter's output into its individual fields so each can be
 * styled separately: the steady HH:MM reads calm and bold while the live
 * SS.mmm tail glows in the accent, smaller, like a ticking detail. One shared
 * formatter, read per segment — `formatToParts` keeps it locale-correct
 * (and drops AM/PM out of the main readout into its own tag).
 */
function readParts(fmt: Intl.DateTimeFormat): TimeParts {
  const out: TimeParts = {
    hour: "",
    minute: "",
    second: "",
    fractional: "",
    period: "",
  };
  for (const part of fmt.formatToParts(new Date())) {
    if (part.type === "hour") out.hour = part.value;
    else if (part.type === "minute") out.minute = part.value;
    else if (part.type === "second") out.second = part.value;
    else if (part.type === "fractionalSecond") out.fractional = part.value;
    else if (part.type === "dayPeriod") out.period = part.value;
  }
  return out;
}

function Clock({ config }: { config: z.output<typeof schema> }) {
  // Each visually-distinct segment writes to its own node — useCountdown sets
  // textContent, so a single shared node can't carry mixed styling.
  const mainRef = useRef<HTMLSpanElement>(null);
  const secRef = useRef<HTMLSpanElement>(null);
  const msRef = useRef<HTMLSpanElement>(null);
  const periodRef = useRef<HTMLSpanElement>(null);
  const dateRef = useRef<HTMLDivElement>(null);

  const tz = config.timezone.trim() || undefined;
  // Milliseconds imply seconds — ms without a seconds digit reads as noise.
  const withSeconds = config.showSeconds || config.showMillis;

  // Build the formatters once per config. An invalid IANA zone throws on
  // construction — we catch it and surface a readable message instead of
  // crashing the frame (the string passes the schema, so this is the only
  // place a bad zone can be caught).
  const fmt = useMemo(() => {
    try {
      const time = new Intl.DateTimeFormat(undefined, {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        second: withSeconds ? "2-digit" : undefined,
        // `fractionalSecondDigits` appends ".mmm" after the seconds.
        fractionalSecondDigits: config.showMillis ? 3 : undefined,
        hour12: config.hour12,
      });
      const date = config.showDate
        ? new Intl.DateTimeFormat(undefined, {
            timeZone: tz,
            weekday: "short",
            month: "short",
            day: "numeric",
          })
        : null;
      // The short zone name ("EST", "GMT+7", "UTC") is static per render — it
      // only shifts on a DST boundary, so we read it once here rather than
      // through the per-frame tick. `timeZoneName` is pulled from formatToParts
      // so we get just the abbreviation, not a full formatted time.
      let zone = "";
      if (config.showTimezone) {
        const zoneFmt = new Intl.DateTimeFormat(undefined, {
          timeZone: tz,
          hour: "2-digit",
          timeZoneName: "short",
        });
        zone =
          zoneFmt
            .formatToParts(new Date())
            .find((part) => part.type === "timeZoneName")?.value ?? "";
      }
      return { time, date, zone, error: null as string | null };
    } catch {
      return { time: null, date: null, zone: "", error: tz ?? "invalid timezone" };
    }
  }, [
    tz,
    withSeconds,
    config.showMillis,
    config.hour12,
    config.showDate,
    config.showTimezone,
  ]);

  // Drive every readout through zhive's shared 24fps global tick (see
  // use-countdown.ts): one timer for every clock on the page, viewport-gated,
  // writing straight to the node. Each segment re-reads `new Date()` so it
  // honours the configured timezone. Segments not rendered have a null ref and
  // no-op, so the hooks can stay unconditional.
  useCountdown({
    ref: mainRef,
    getRemainingMs: () => Date.now(),
    format: () => {
      if (!fmt.time) return "";
      const p = readParts(fmt.time);
      return `${p.hour}:${p.minute}`;
    },
  });
  useCountdown({
    ref: secRef,
    getRemainingMs: () => Date.now(),
    format: () => (fmt.time ? `:${readParts(fmt.time).second}` : ""),
  });
  useCountdown({
    ref: msRef,
    getRemainingMs: () => Date.now(),
    format: () => (fmt.time ? `.${readParts(fmt.time).fractional}` : ""),
  });
  useCountdown({
    ref: periodRef,
    getRemainingMs: () => Date.now(),
    format: () => (fmt.time ? readParts(fmt.time).period : ""),
  });
  useCountdown({
    ref: dateRef,
    getRemainingMs: () => Date.now(),
    format: () => (fmt.date ? fmt.date.format(new Date()) : ""),
  });

  if (fmt.error) return <FrameStatus>unknown timezone: {fmt.error}</FrameStatus>;

  // Seed the spans for the first paint, before the tick takes over.
  const seed = readParts(fmt.time!);
  const accent = "var(--color-highlight)";
  const accentGlow = "0 0 18px hsl(var(--zf-accent-hue, 242) 92% 70% / 0.45)";

  return (
    // container-type lets the readout scale to the card (cqmin), not the
    // viewport — a 2×1 clock and a 6×3 one both fill their space sensibly.
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center [container-type:size]">
      <div
        className="text-strong inline-flex max-w-full items-baseline justify-center whitespace-nowrap font-dmsans font-extrabold leading-none tracking-[-0.01em] tabular-nums"
        style={{ fontSize: "clamp(1.6rem, 37cqmin, 5.5rem)" }}
      >
        <span ref={mainRef} suppressHydrationWarning>
          {`${seed.hour}:${seed.minute}`}
        </span>
        {withSeconds && (
          <span
            ref={secRef}
            suppressHydrationWarning
            className="font-bold"
            style={{
              fontSize: "0.46em",
              color: accent,
              textShadow: accentGlow,
            }}
          >
            {`:${seed.second}`}
          </span>
        )}
        {config.showMillis && (
          <span
            ref={msRef}
            suppressHydrationWarning
            className="font-semibold"
            style={{ fontSize: "0.3em", color: accent, opacity: 0.65 }}
          >
            {`.${seed.fractional}`}
          </span>
        )}
        {config.hour12 && (
          <span
            ref={periodRef}
            suppressHydrationWarning
            className="text-soft ml-[0.3em] self-center font-semibold uppercase"
            style={{ fontSize: "0.3em", letterSpacing: "0.08em" }}
          >
            {seed.period}
          </span>
        )}
      </div>

      {config.showDate && fmt.date && (
        <div
          ref={dateRef}
          suppressHydrationWarning
          className="caption text-soft tabular-nums"
        >
          {fmt.date.format(new Date())}
        </div>
      )}
      {(config.label || fmt.zone) && (
        <div className="caption text-soft inline-flex items-center gap-1.5 uppercase tracking-[0.18em]">
          <span
            aria-hidden
            className="inline-block h-1 w-1 rounded-full"
            style={{ background: accent, boxShadow: accentGlow }}
          />
          {config.label && fmt.zone
            ? `${config.label} · ${fmt.zone}`
            : config.label || fmt.zone}
        </div>
      )}
    </div>
  );
}

export const clockFrame = defineFrame({
  ...clockMeta,
  component: Clock,
});
