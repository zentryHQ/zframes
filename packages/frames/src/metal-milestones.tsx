import { defineFrame, useMetalHistory, type SeriesPoint } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatPrice } from "./format";
import { MetricRow } from "./metric-row";
import { allTimeHigh, durationSince, metalName } from "./metals-shared";
import { metalMilestonesMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = metalMilestonesMeta.schema;

/**
 * One ladder of the round numbers a market actually talks in, spanning $1 to
 * $10,000. Filtered to the metal's own range it yields gold's $50 → $5,000
 * climb and silver's $2 → $50 one without four hand-kept lists.
 */
const MILESTONE_LADDER = [
  1, 2, 5, 10, 20, 30, 50, 100, 200, 300, 500, 1000, 1500, 2000, 2500, 3000,
  4000, 5000, 7500, 10000,
];

type Milestone = { level: number; time: number; leg: string | null };

/** First fix at or above each rung, with how long the leg from the previous
 *  rung took. One pass, since a price clearing a level has cleared every lower
 *  one — a single violent day can print several rungs on the same date. */
function firstCrossings(points: readonly SeriesPoint[]): Milestone[] {
  if (points.length === 0) return [];
  const start = points[0].value;
  const high = allTimeHigh(points)?.value ?? 0;
  // A rung the series already sat above on its first fix was never crossed:
  // gold's history opens at $35, so $1 and $20 aren't gold milestones.
  const ladder = MILESTONE_LADDER.filter(
    (level) => level > start && level <= high,
  );

  const out: Milestone[] = [];
  let next = 0;
  let prevTime: number | null = null;
  for (const point of points) {
    while (next < ladder.length && point.value >= ladder[next]) {
      out.push({
        level: ladder[next],
        time: point.time,
        leg: prevTime === null ? null : durationSince(prevTime, point.time),
      });
      prevTime = point.time;
      next += 1;
    }
    if (next >= ladder.length) break;
  }
  return out;
}

const formatDay = (time: number) =>
  new Date(time).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

function MetalMilestones({ config }: { config: z.output<typeof schema> }) {
  const { histories, isLoading } = useMetalHistory([config.symbol]);
  const points = histories[0]?.points;

  const rows = useMemo(() => {
    const crossings = firstCrossings(points ?? []);
    return config.newestFirst ? crossings.reverse() : crossings;
  }, [points, config.newestFirst]);

  // Two different nothings: no history at all, versus a history that never
  // crossed a rung (a short window, or a metal that has only ever traded
  // between two round numbers). Reporting the second as "no fix history" would
  // blame the feed for what is really an empty ladder.
  const hasHistory = (points?.length ?? 0) > 0;
  if (isLoading && !hasHistory)
    return <FrameStatus loading>loading fix history…</FrameStatus>;
  if (!hasHistory) return <FrameStatus>no fix history yet</FrameStatus>;
  if (rows.length === 0)
    return (
      <FrameStatus>
        {metalName(config.symbol)} has never crossed a round-number level
      </FrameStatus>
    );

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="caption text-soft uppercase">
          {metalName(config.symbol)} first close above
        </div>
        <div className="caption text-soft shrink-0">leg</div>
      </div>

      <div className={scrollAreaClass}>
        {rows.map((row) => (
          <MetricRow
            key={row.level}
            label={formatPrice(row.level)}
            meta={formatDay(row.time)}
            value={row.leg ?? "first"}
          />
        ))}
      </div>
    </div>
  );
}

export const metalMilestonesFrame = defineFrame({
  ...metalMilestonesMeta,
  component: MetalMilestones,
});
