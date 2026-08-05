import { BarChart } from "@zframes/charts";
import { defineFrame, useMetalPositioning, type CotWeek } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatCompact } from "./format";
import { MetricRow } from "./metric-row";
import { divergingBars, durationSince, metalName } from "./metals-shared";
import { metalCotBreakdownMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = metalCotBreakdownMeta.schema;

function formatContracts(v: number) {
  return formatCompact(Math.abs(v));
}

/** "23 Jul 2026" — the reported Tuesday, matching the rest of the metals family. */
function formatWeek(time: number): string {
  return new Date(time).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** Contracts are a count, so compact magnitude with an explicit sign — a net is
 *  only meaningful as "long by" or "short by". */
function signedContracts(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatCompact(value)}`;
}

/** The three legacy-report trader classes, each as its long and short leg. The
 *  short leg is negated so the bars oppose across a zero line; commercials
 *  being deeply short is structural (miners hedge), not a bearish signal. */
const CLASSES: {
  key: string;
  label: string;
  meta: string;
  long: (w: CotWeek) => number;
  short: (w: CotWeek) => number;
}[] = [
  {
    key: "spec",
    label: "Speculators",
    meta: "non-commercial",
    long: (w) => w.noncommercialLong,
    short: (w) => w.noncommercialShort,
  },
  {
    key: "comm",
    label: "Commercials",
    meta: "hedgers · structurally short",
    long: (w) => w.commercialLong,
    short: (w) => w.commercialShort,
  },
  {
    key: "small",
    label: "Small traders",
    meta: "non-reportable",
    long: (w) => w.nonreportableLong,
    short: (w) => w.nonreportableShort,
  },
];

const BAR_LABELS: Record<string, string> = {
  spec: "Spec",
  comm: "Comm",
  small: "Small",
};

function MetalCotBreakdown({ config }: { config: z.output<typeof schema> }) {
  const { positioning, isLoading } = useMetalPositioning(config.symbol);

  const latest = positioning?.weeks.at(-1) ?? null;
  const prev = positioning?.weeks.at(-2) ?? null;

  const bars = useMemo(() => {
    if (!latest) return [];
    return divergingBars(
      CLASSES.flatMap((c) => [
        { label: `${BAR_LABELS[c.key]} long`, value: c.long(latest) },
        { label: `${BAR_LABELS[c.key]} short`, value: -c.short(latest) },
      ]),
    );
  }, [latest]);

  if (isLoading && !latest)
    return <FrameStatus loading>loading COT report…</FrameStatus>;
  if (!latest) return <FrameStatus>no COT positioning yet</FrameStatus>;
  // A row where every leg is zero is a placeholder, not a position — six bars
  // of length zero would render as an empty axis with no way to tell.
  if (!bars.some((b) => b.value !== 0))
    return <FrameStatus>no reported COT positions this week</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <BarChart
        data={bars}
        orientation="horizontal"
        height={Math.max(bars.length * 24, 96)}
        formatValue={formatContracts}
      />

      <div className={scrollAreaClass}>
        {CLASSES.map((c) => {
          const net = c.long(latest) - c.short(latest);
          const delta = prev ? net - (c.long(prev) - c.short(prev)) : null;
          return (
            <MetricRow
              key={c.key}
              label={c.label}
              meta={c.meta}
              value={
                <span className="flex items-baseline justify-end gap-2 tabular-nums">
                  <span>{signedContracts(net)}</span>
                  {delta === null ? (
                    <span className="body-sm text-disabled">—</span>
                  ) : (
                    <span
                      className="body-sm font-bold"
                      style={{ color: changeColor(delta) }}
                    >
                      {signedContracts(delta)}
                    </span>
                  )}
                </span>
              }
            />
          );
        })}
      </div>

      <div className="caption text-soft text-center">
        {metalName(config.symbol)} · week of {formatWeek(latest.time)} (
        {durationSince(latest.time)} old) — the CFTC publishes Tuesday positions
        on Friday, so this lags by design. Net and change in contracts.
      </div>
    </div>
  );
}

export const metalCotBreakdownFrame = defineFrame({
  ...metalCotBreakdownMeta,
  component: MetalCotBreakdown,
});
