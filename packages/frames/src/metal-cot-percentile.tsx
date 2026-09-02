import { HistogramChart, sampleStats } from "@zframes/charts";
import { defineFrame, useMetalPositioning, type CotWeek } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { formatCompact } from "./format";
import {
  cotNet,
  durationSince,
  metalName,
  percentileRank,
  sliceYears,
} from "./metals-shared";
import { metalCotPercentileMeta } from "./schemas";
import { Stat } from "./stat";
import { FrameStatus } from "./ui";

const schema = metalCotPercentileMeta.schema;

type TraderClass = z.output<typeof schema>["traderClass"];

/**
 * The three legacy-report trader classes, keyed as the config spells them.
 *
 * Labels and the `meta` line match `metal-cot-breakdown` on purpose: the two
 * cards sit on the same board reading the same report, and the commercial book
 * being deeply net short is structural (miners and refiners hedge forward), not
 * a bearish call — a card that renders that as a bare "−212K" without saying so
 * reads as a bug.
 */
const CLASSES: Record<
  TraderClass,
  { label: string; meta: string; net: (w: CotWeek) => number }
> = {
  noncommercial: {
    label: "Speculators",
    meta: "non-commercial",
    // The shared helper, so this card's "net spec" is the same number the
    // gauge and the net chart beside it plot.
    net: cotNet,
  },
  commercial: {
    label: "Commercials",
    meta: "hedgers · structurally short",
    net: (w) => w.commercialLong - w.commercialShort,
  },
  nonreportable: {
    label: "Small traders",
    meta: "non-reportable",
    net: (w) => w.nonreportableLong - w.nonreportableShort,
  },
};

/** Mid-range readings carry no signal, so the accent — not either half of the
 *  semantic gain/loss pair, which would assert a direction this card doesn't. */
const ACCENT = "hsl(var(--zf-accent-hue, 242) 82% 70%)";

/**
 * Positioning nets are LEVELS, not returns, so the histogram's two return-shaped
 * defaults are both wrong here:
 *  - `anchorZero: false` — the commercial book has not been within 100k contracts
 *    of flat in years, and forcing zero into the axis crams its whole
 *    distribution into one bar at the far edge.
 *  - `tailTrim: 0` — trimming folds the extremes into an open end bar, and the
 *    extremes are precisely what a percentile is measured against. A 520-week
 *    feed is also two orders of magnitude smaller than the daily fix histories
 *    the default was tuned for, so one outlier is 0.2% of the sample, not noise.
 */
const BIN_OPTIONS = { anchorZero: false, tailTrim: 0 } as const;

/** Contracts are a count, so compact magnitude with an explicit sign — a net is
 *  only meaningful as "long by" or "short by". */
function signedContracts(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatCompact(value)}`;
}

/** "+1.62σ" — a standard-deviation distance, so it carries a sign and its unit
 *  rather than going through the percent formatters. */
function formatZ(z: number): string {
  return `${z >= 0 ? "+" : ""}${z.toFixed(2)}σ`;
}

/**
 * Where the reading sits in its own range, said WITHOUT a directional claim.
 *
 * Deliberately not the gauge's contrarian vocabulary ("crowded long"): that
 * reading is only true for the speculator classes. Commercials take the other
 * side of the same trade, so their *low* percentile is the crowded end, and one
 * shared set of words would be exactly backwards on a third of this frame's
 * configurations. The caption names that inversion instead.
 */
function extremity(pct: number): string {
  if (pct >= 95) return "historic high";
  if (pct >= 80) return "upper range";
  if (pct > 20) return "mid-range";
  if (pct > 5) return "lower range";
  return "historic low";
}

function MetalCotPercentile({ config }: { config: z.output<typeof schema> }) {
  const { positioning, isLoading } = useMetalPositioning(config.symbol);

  const stats = useMemo(() => {
    const all = positioning?.weeks ?? [];
    if (all.length === 0) return null;
    const net = CLASSES[config.traderClass].net;
    // `sliceYears` is the shared metals window, so "5 years" here spans the same
    // weeks the gauge and the net chart mean by it.
    const windowed = sliceYears(
      all.map((w) => ({ time: w.time, value: net(w) })),
      config.years,
    );
    const values = windowed.map((p) => p.value);
    // Under two reports there is no distribution to rank against: the latest
    // week would score 100th percentile on no evidence at all.
    const sample = sampleStats(values);
    if (!sample) return null;

    const latest = values[values.length - 1];
    return {
      values,
      sample,
      latest,
      pct: percentileRank(values, latest),
      // A z-score needs the window to actually vary. Undefined rather than
      // Infinity when it doesn't, so the card shows "—" instead of a number
      // that would look authoritative.
      z: sample.stdev > 0 ? (latest - sample.mean) / sample.stdev : null,
      reportedAt: windowed[windowed.length - 1].time,
      // The years actually covered — the CFTC feed is capped at 520 weeks, so a
      // 10-year request on a market with a shorter history gets what exists.
      span: `${new Date(windowed[0].time).getUTCFullYear()}–${new Date(
        windowed[windowed.length - 1].time,
      ).getUTCFullYear()}`,
    };
  }, [positioning, config.traderClass, config.years]);

  // Only blank the card before the first report lands; a background refresh
  // keeps the distribution on screen instead of flashing to a skeleton.
  if (isLoading && !stats)
    return <FrameStatus loading>loading COT positioning…</FrameStatus>;
  if (!stats)
    return <FrameStatus>not enough COT positioning history yet</FrameStatus>;

  const { values, sample, latest, pct, z, reportedAt, span } = stats;
  const cls = CLASSES[config.traderClass];

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* The meta line under each figure is a `Stat.Hint`: it qualifies the
          number ("hedgers · structurally short", "vs mean +12K") rather than
          being a second figure, which is exactly what a hint is for. */}
      <Stat.Strip cols={3} gap={3}>
        <Stat>
          <Stat.Label>net</Stat.Label>
          <Stat.Value size="metric-md">{signedContracts(latest)}</Stat.Value>
          <Stat.Hint>{cls.meta}</Stat.Hint>
        </Stat>
        <Stat>
          <Stat.Label>{`percentile · ${config.years}y`}</Stat.Label>
          <Stat.Value size="metric-md" tint={ACCENT}>
            {Math.round(pct)}
          </Stat.Value>
          <Stat.Hint>{extremity(pct)}</Stat.Hint>
        </Stat>
        <Stat>
          <Stat.Label>z-score</Stat.Label>
          <Stat.Value size="metric-md" absent={z === null}>
            {z === null ? "—" : formatZ(z)}
          </Stat.Value>
          <Stat.Hint>{`vs mean ${signedContracts(sample.mean)}`}</Stat.Hint>
        </Stat>
      </Stat.Strip>

      <HistogramChart
        values={values}
        fill
        color="hsl(var(--zf-accent-hue, 242) 45% 55%)"
        {...BIN_OPTIONS}
        // The normal the z-score is *defined* against. Positioning is nothing
        // like normal — it clusters and it trends — so the gap between the bars
        // and the curve is the card's second finding: how rough a scale that
        // "+1.6σ" really is.
        showNormalCurve
        formatValue={signedContracts}
        formatCount={formatCompact}
        markers={[
          { value: sample.mean, label: "mean" },
          { value: latest, label: "now", color: ACCENT },
        ]}
      />

      <div className="caption text-soft text-center">
        {metalName(config.symbol)} {cls.label.toLowerCase()} ·{" "}
        {formatCompact(sample.count)} weekly reports {span} · range{" "}
        {signedContracts(sample.min)} … {signedContracts(sample.max)} ·{" "}
        {durationSince(reportedAt)} old
        {config.traderClass === "commercial" &&
          " — hedgers sit structurally short, so the LOW end is the crowded one"}
      </div>
    </div>
  );
}

export const metalCotPercentileFrame = defineFrame({
  ...metalCotPercentileMeta,
  component: MetalCotPercentile,
});
