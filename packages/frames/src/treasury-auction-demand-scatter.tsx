import {
  CHART_COLORS_MULTI_SERIES,
  ScatterChart,
  type ScatterDatum,
} from "@zframes/charts";
import { defineFrame, useTreasuryAuctions } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { ChartCard } from "./chart-card";
import { formatCompactUsd, formatPct } from "./format";
import { treasuryAuctionDemandScatterMeta } from "./schemas";
import { SliceLegend } from "./slice-legend";
import { FrameStatus } from "./ui";

const schema = treasuryAuctionDemandScatterMeta.schema;

// Hoisted (not inline) so it's a stable reference across renders, like every
// other chart-prop formatter in this package — an inline arrow here would
// give ScatterChart's render effect a new `formatY` identity every render.
function formatBidToCover(value: number): string {
  return `${value.toFixed(2)}×`;
}

/**
 * Twenty auctions in a card-sized plot, so the cloud is read as a shape rather
 * than as points: small bubbles, so a cluster still shows its members.
 *
 * NO per-point labels. Every auction printing its own term put five texts —
 * "4-Week" twice, "6-Week" twice — inside the one dense cluster the bills form,
 * each sitting on a neighbouring bubble. The term class it was there to convey
 * is the one categorical variable in the data, so it moves to COLOUR with a
 * legend: rate on x, demand on y, offering as area, class as hue, and the exact
 * term still on hover.
 */
const RADIUS_RANGE: [number, number] = [4, 10];

/**
 * Fixed hue per security class, so a board's two auction cards agree and a
 * class keeps its colour when an auction cycle drops out of the window. Order
 * is the Treasury's own maturity ladder, not first-seen.
 */
const CLASS_ORDER = ["Bill", "Note", "Bond", "TIPS", "FRN"] as const;
const CLASS_COLOR: Record<string, string> = {
  Bill: CHART_COLORS_MULTI_SERIES[0],
  Note: CHART_COLORS_MULTI_SERIES[1],
  Bond: CHART_COLORS_MULTI_SERIES[2],
  TIPS: CHART_COLORS_MULTI_SERIES[3],
  FRN: CHART_COLORS_MULTI_SERIES[4],
};
const OTHER_COLOR = CHART_COLORS_MULTI_SERIES[5];

function classColor(securityType: string): string {
  return CLASS_COLOR[securityType] ?? OTHER_COLOR;
}

function TreasuryAuctionDemandScatter({
  config,
}: {
  config: z.output<typeof schema>;
}) {
  const { auctions, isLoading } = useTreasuryAuctions(config.count);

  const { data, classes } = useMemo(() => {
    const shown = auctions
      .filter((a) => a.rate !== null && a.bidToCover !== null)
      .slice(0, config.count);
    const points: ScatterDatum[] = shown.map((a, i) => ({
      id: `${a.auctionDate}-${a.securityType}-${i}`,
      // Still the term: it is the tooltip's title, which is where the exact
      // term is read now that no point prints one.
      label: a.securityTerm || a.securityType,
      x: a.rate!,
      y: a.bidToCover!,
      // Offering size as bubble area. `?? undefined` keeps an unreported
      // offering at the chart's own default weight instead of collapsing it to
      // a 4px dot.
      weight: a.offeringAmount ?? undefined,
      color: classColor(a.securityType),
    }));
    // Only the classes this window actually auctioned — a legend row for a
    // colour that is nowhere in the plot is noise.
    const present = new Set(shown.map((a) => a.securityType));
    const known = CLASS_ORDER.filter((name) => present.has(name));
    const unknown = [...present]
      .filter((name) => !(name in CLASS_COLOR))
      .sort();
    return {
      data: points,
      classes: [...known, ...unknown].map((name) => ({
        name,
        color: classColor(name),
      })),
    };
  }, [auctions, config.count]);

  if (isLoading)
    return <FrameStatus loading>loading auction demand…</FrameStatus>;
  if (data.length === 0)
    return <FrameStatus>no auction-demand data yet</FrameStatus>;

  return (
    <ChartCard align="center" gap={1} className="text-normal">
      <ChartCard.Body>
        <ScatterChart
          data={data}
          fill
          formatX={formatPct}
          formatY={formatBidToCover}
          radiusRange={RADIUS_RANGE}
          maxLabels={0}
          xLabel="awarded rate"
          yLabel="bid-to-cover"
          weightLabel="offering"
          formatWeight={formatCompactUsd}
        />
      </ChartCard.Body>
      <SliceLegend size="sm">
        {classes.map((cls) => (
          <SliceLegend.Item key={cls.name} color={cls.color} label={cls.name} />
        ))}
      </SliceLegend>
      <ChartCard.Caption>
        rate (x) vs bid-to-cover (y) · size = offering · last {data.length}
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const treasuryAuctionDemandScatterFrame = defineFrame({
  ...treasuryAuctionDemandScatterMeta,
  component: TreasuryAuctionDemandScatter,
});
