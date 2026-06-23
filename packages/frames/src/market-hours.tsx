import { defineFrame } from "@zframes/core";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import type { z } from "zod";
import {
  DEFAULT_CODES,
  EXCHANGES,
  evaluate,
  formatCountdown,
  type MarketState,
  type Status,
  sortStates,
} from "./market-data";
import { UP_COLOR } from "./format";
import { marketHoursMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = marketHoursMeta.schema;

// One semantic colour per state, applied sparingly: a left status rail, the
// chip, and the countdown carry it — the row itself stays neutral so the list
// reads as a calm table, not a stack of coloured banners. `wash` is a barely
// there left-anchored tint that fades out by ~40%, giving open/holiday rows a
// hint of life without bleeding colour across the whole width.
const STATUS_STYLE: Record<
  Status,
  {
    color: string;
    chipBg: string;
    label: string;
    verb: string;
    rail: string;
    railOpacity: number;
    wash: string;
  }
> = {
  open: {
    // Shares the dashboard-wide "up" green so the open state never clashes with
    // gains tinting elsewhere on the board.
    color: UP_COLOR,
    chipBg: "rgba(63, 208, 143, 0.13)",
    label: "Open",
    verb: "closes",
    rail: UP_COLOR,
    railOpacity: 1,
    wash: "linear-gradient(90deg, rgba(63, 208, 143, 0.08), transparent 40%)",
  },
  closed: {
    color: "#8b92a1",
    chipBg: "rgba(255, 255, 255, 0.045)",
    label: "Closed",
    verb: "opens",
    rail: "rgba(255, 255, 255, 0.22)",
    railOpacity: 0.55,
    wash: "none",
  },
  holiday: {
    color: "#f2b066",
    chipBg: "rgba(242, 176, 102, 0.13)",
    label: "Holiday",
    verb: "opens",
    rail: "#f2b066",
    railOpacity: 1,
    wash: "linear-gradient(90deg, rgba(242, 176, 102, 0.07), transparent 40%)",
  },
};

function WorldMarketsIcon() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      fill="none"
      height="15"
      viewBox="0 0 20 20"
      width="15"
    >
      <circle
        cx="10"
        cy="10"
        r="7.25"
        stroke="currentColor"
        strokeOpacity="0.75"
        strokeWidth="1.5"
      />
      <path
        d="M2.75 10h14.5M10 2.75c2 2 3 4.42 3 7.25s-1 5.25-3 7.25M10 2.75c-2 2-3 4.42-3 7.25s1 5.25 3 7.25"
        stroke="currentColor"
        strokeLinecap="round"
        strokeOpacity="0.55"
        strokeWidth="1.2"
      />
      <path
        d="m5.25 12.75 2.6-2.3 2.1 1.55 3.95-4.8"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function formatLocalTime(now: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZoneName: "short",
    }).format(now);
  } catch {
    return tz;
  }
}

function flagEmoji(country: string): string {
  if (!/^[A-Z]{2}$/i.test(country)) return country;
  return [...country.toUpperCase()]
    .map((char) => String.fromCodePoint(0x1f1e6 + char.charCodeAt(0) - 65))
    .join("");
}

function ExternalLinkIcon() {
  return (
    <svg
      aria-hidden="true"
      className="opacity-50 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:opacity-95"
      fill="none"
      height="12"
      viewBox="0 0 16 16"
      width="12"
    >
      <path
        d="M6 4.5H4.5a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h5a2 2 0 0 0 2-2V10"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
      <path
        d="M9 2.5h4.5V7M8.25 7.75l5-5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function ExchangeMark({ state }: { state: MarketState }) {
  // The flag identifies the country; status lives in the rail + chip, so the
  // mark stays a clean, neutral chip (no overlaid dot or invented code badge).
  return (
    <span
      aria-hidden="true"
      className="grid h-[30px] w-[30px] shrink-0 place-items-center overflow-hidden rounded-[9px] border border-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_4px_10px_-7px_rgba(0,0,0,0.8)]"
      style={{
        background:
          "linear-gradient(150deg, rgba(255,255,255,0.1), rgba(255,255,255,0.02) 48%, rgba(0,0,0,0.22))",
      }}
    >
      <span className="text-[1.15rem] leading-none drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)]">
        {flagEmoji(state.country)}
      </span>
    </span>
  );
}

function StatusChip({ state }: { state: MarketState }) {
  const tone = STATUS_STYLE[state.status];
  const closed = state.status === "closed";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-2 py-[3px] font-dmsans text-[0.5rem] font-bold uppercase leading-none tracking-[0.09em]"
      style={{
        borderColor: closed ? "rgba(255,255,255,0.1)" : `${tone.color}33`,
        background: tone.chipBg,
        color: closed ? "rgba(255,255,255,0.62)" : tone.color,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{
          background: closed ? "rgba(255,255,255,0.45)" : tone.color,
          boxShadow:
            state.status === "open" ? `0 0 6px ${tone.color}` : undefined,
        }}
      />
      {tone.label}
    </span>
  );
}

function Row({ now, state }: { now: Date; state: MarketState }) {
  const tone = STATUS_STYLE[state.status];
  const countdown = formatCountdown(state.nextChangeMin);
  const localTime = formatLocalTime(now, state.tz);

  return (
    <a
      aria-label={`${state.name} website`}
      className="group text-normal relative grid min-h-[42px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.022] py-1.5 pr-2.5 pl-3 transition duration-200 hover:-translate-y-px hover:border-white/[0.14] hover:bg-white/[0.05] hover:text-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white/50"
      href={state.website}
      rel="noreferrer"
      style={{ backgroundImage: tone.wash } satisfies CSSProperties}
      target="_blank"
      title={`${state.name} · ${state.city} · ${state.open}-${state.close}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-[5px] left-0 w-[3px] rounded-r-full"
        style={{ background: tone.rail, opacity: tone.railOpacity }}
      />
      <ExchangeMark state={state} />
      <span className="relative min-w-0 pl-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="body-sm text-strong truncate font-bold">
            {state.name}
          </span>
          <ExternalLinkIcon />
        </span>
        <span className="caption text-soft flex min-w-0 items-center gap-1.5 tabular-nums">
          <span className="truncate">{state.city}</span>
          <span className="h-[3px] w-[3px] shrink-0 rounded-full bg-white/25" />
          <span className="shrink-0">{localTime}</span>
        </span>
      </span>
      <span className="relative flex min-w-[84px] flex-col items-end gap-1">
        <StatusChip state={state} />
        <span
          className="caption whitespace-nowrap text-right tabular-nums"
          style={{
            color:
              state.status === "closed" ? "rgba(255,255,255,0.55)" : tone.color,
          }}
        >
          {tone.verb} {countdown}
        </span>
      </span>
    </a>
  );
}

function MarketHours({ config }: { config: z.output<typeof schema> }) {
  // A 30s tick keeps the minute-resolution countdowns fresh without churn.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const codes = config.exchanges.length ? config.exchanges : DEFAULT_CODES;
  const key = codes.join(",");

  const states = useMemo(() => {
    const rows = codes
      .map((c) => EXCHANGES[c.toUpperCase()])
      .filter((ex): ex is NonNullable<typeof ex> => Boolean(ex))
      .map((ex) => evaluate(ex, now));
    return sortStates(rows, config.sort);
    // `key` stands in for `codes` (a fresh array each render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, now, config.sort]);

  if (states.length === 0)
    return <FrameStatus>no known exchanges — check the codes</FrameStatus>;

  const openCount = states.filter((s) => s.status === "open").length;
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="caption text-soft mb-2 flex items-center justify-between gap-3 uppercase tracking-wide">
        <span className="truncate">exchange sessions</span>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.045] px-2 py-0.5 tabular-nums">
          {openCount > 0 && (
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: UP_COLOR, boxShadow: `0 0 6px ${UP_COLOR}` }}
            />
          )}
          <span className="text-strong font-bold">{openCount}</span>
          <span className="text-soft">/ {states.length} open</span>
        </span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-auto pr-0.5">
        {states.map((s) => (
          <Row key={s.code} now={now} state={s} />
        ))}
      </div>
    </div>
  );
}

export const marketHoursFrame = defineFrame({
  ...marketHoursMeta,
  component: MarketHours,
  titleIcon: WorldMarketsIcon,
});
