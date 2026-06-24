import { defineFrame } from "@zframes/core";
import type { z } from "zod";
import { EXCHANGES, exchangeDateParts, nextHolidays } from "./market-data";
import { MetricRow } from "./metric-row";
import { holidayCalendarMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = holidayCalendarMeta.schema;
type Config = z.output<typeof schema>;

/** Calendar-day gap between two exchange-local "YYYY-MM-DD" dates. */
function daysUntil(fromYmd: string, toYmd: string): number {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  return Math.round(
    (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000,
  );
}

/** "Fri, Jul 3" from a "YYYY-MM-DD" calendar date (rendered tz-agnostic). */
function weekdayDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function countdownLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days}d`;
}

function HolidayCalendar({ config }: { config: Config }) {
  const ex = EXCHANGES[config.exchange];
  if (!ex) return <FrameStatus>unknown exchange</FrameStatus>;

  const today = exchangeDateParts(config.exchange)?.ymd;
  const dates = nextHolidays(config.exchange, config.count);
  const label = config.label.trim();

  if (!today || dates.length === 0)
    return <FrameStatus>no upcoming holidays on file</FrameStatus>;

  return (
    <div className="flex h-full w-full flex-col">
      {label && (
        <div className="caption text-soft mb-1 shrink-0 uppercase tracking-[0.12em]">
          {label}
        </div>
      )}
      <div className={`min-h-0 flex-1 ${scrollAreaClass}`}>
        {dates.map((ymd) => (
          <MetricRow
            key={ymd}
            label={weekdayDate(ymd)}
            value={countdownLabel(daysUntil(today, ymd))}
          />
        ))}
      </div>
    </div>
  );
}

export const holidayCalendarFrame = defineFrame({
  ...holidayCalendarMeta,
  component: HolidayCalendar,
});
