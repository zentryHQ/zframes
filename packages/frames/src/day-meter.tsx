import { defineFrame } from "@zframes/core";
import type { z } from "zod";
import { EXCHANGES, exchangeDateParts, isHoliday } from "./market-data";
import { dayMeterMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = dayMeterMeta.schema;
type Config = z.output<typeof schema>;

const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Matches market-hours' holiday amber — a deliberate, shared exception to the
// accent-driven palette (closures read the same across the schedule frames).
const HOLIDAY_COLOR = "#f2b066";
const DAY_MS = 86_400_000;

interface Cell {
  ymd: string;
  dow: number;
  day: number;
  isToday: boolean;
  isHoliday: boolean;
  isTrading: boolean;
}

function DayMeter({ config }: { config: Config }) {
  const ex = EXCHANGES[config.exchange];
  const today = ex ? exchangeDateParts(config.exchange) : null;
  if (!ex || !today) return <FrameStatus>unknown exchange</FrameStatus>;

  const now = new Date();
  const dowMon0 = (today.dow + 6) % 7; // Monday-anchored week
  const cells: Cell[] = [];
  for (let i = 0; i < 7; i++) {
    const parts = exchangeDateParts(
      config.exchange,
      new Date(now.getTime() + (i - dowMon0) * DAY_MS),
    );
    if (!parts) continue;
    const trades = ex.days.includes(parts.dow);
    const hol = trades && isHoliday(config.exchange, parts.ymd);
    cells.push({
      ymd: parts.ymd,
      dow: parts.dow,
      day: Number(parts.ymd.split("-")[2]),
      isToday: parts.ymd === today.ymd,
      isHoliday: hol,
      isTrading: trades && !hol,
    });
  }

  const shown = config.weekdaysOnly
    ? cells.filter((c) => ex.days.includes(c.dow))
    : cells;
  const label = config.label.trim();

  return (
    <div className="flex h-full w-full flex-col justify-center gap-1.5">
      {label && (
        <div className="caption text-soft shrink-0 uppercase tracking-[0.12em]">
          {label}
        </div>
      )}
      <div className="flex min-h-0 flex-1 items-stretch gap-1">
        {shown.map((c) => {
          const dim = !c.isTrading && !c.isHoliday;
          return (
            <div
              key={c.ymd}
              title={
                c.isHoliday
                  ? "Market holiday"
                  : c.isTrading
                    ? "Trading day"
                    : "Closed"
              }
              className={`flex flex-1 flex-col items-center justify-center rounded-md border px-1 py-1 ${
                c.isToday ? "text-strong" : dim ? "text-disabled" : "text-normal"
              }`}
              style={{
                borderColor: c.isToday
                  ? "var(--color-highlight)"
                  : "rgba(255,255,255,0.06)",
                color: c.isHoliday && !c.isToday ? HOLIDAY_COLOR : undefined,
              }}
            >
              <span className="caption opacity-80">{WEEKDAY_ABBR[c.dow]}</span>
              <span className="metric-sm">{c.day}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const dayMeterFrame = defineFrame({
  ...dayMeterMeta,
  component: DayMeter,
});
