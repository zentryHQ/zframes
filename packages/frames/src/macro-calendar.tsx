import { defineFrame } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { MetricRow } from "./metric-row";
import { macroCalendarMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = macroCalendarMeta.schema;

function MacroCalendar({ config }: { config: z.output<typeof schema> }) {
  const rows = useMemo(() => {
    const now = Date.now();
    return (
      config.events
        .map((e) => ({ ...e, t: Date.parse(`${e.date}T12:00:00Z`) }))
        // keep today + future (allow a 1-day grace so "today" doesn't drop early)
        .filter((e) => Number.isFinite(e.t) && e.t >= now - 86_400_000)
        .sort((a, b) => a.t - b.t)
        .slice(0, config.limit)
        .map((e) => ({
          ...e,
          days: Math.max(0, Math.ceil((e.t - now) / 86_400_000)),
        }))
    );
  }, [config.events, config.limit]);

  if (rows.length === 0) return <FrameStatus>no upcoming events</FrameStatus>;

  return (
    <div className={`${scrollAreaClass} flex flex-col`}>
      {rows.map((e, i) => (
        <MetricRow
          key={i}
          label={e.label}
          meta={new Date(e.t).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
          value={e.days === 0 ? "today" : `${e.days}d`}
        />
      ))}
    </div>
  );
}

export const macroCalendarFrame = defineFrame({
  ...macroCalendarMeta,
  component: MacroCalendar,
});
