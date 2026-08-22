import {
  CHART_COLORS_MULTI_SERIES,
  type MultiSeriesData,
} from "@zframes/charts";
import {
  defineFrame,
  useMetalPositioning,
  useMetalSpot,
  useMoney,
} from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { CardHeader } from "./card-header";
import { ChartCard } from "./chart-card";
import { changeColor, formatCompact } from "./format";
import {
  METAL_UNIT,
  cotNet,
  downsample,
  durationSince,
  metalName,
  sliceYears,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { metalSpecNotionalMeta } from "./schemas";
import { TimeSeriesChart } from "./series-chart";
import { FrameStatus } from "./ui";

const schema = metalSpecNotionalMeta.schema;

/** Contracts are a count, so compact magnitude with an explicit sign. */
function signedContracts(value: number): string {
  return `${value >= 0 ? "+" : ""}${formatCompact(value)}`;
}

function MetalSpecNotional({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  const { positioning, isLoading } = useMetalPositioning(config.symbol);
  const { metals, isLoading: spotLoading } = useMetalSpot([config.symbol]);

  const spot = useMemo(
    () => metals.find((m) => m.symbol === config.symbol)?.price ?? null,
    [metals, config.symbol],
  );

  const weeks = positioning?.weeks;
  const contractSize = positioning?.contractSize ?? 0;

  const { chartData, yDomain, latest, weekChange, lastReport } = useMemo(() => {
    const empty = {
      chartData: [] as { date: string; value: number }[],
      yDomain: undefined as [number, number] | undefined,
      latest: null as number | null,
      weekChange: null as number | null,
      lastReport: null as number | null,
    };
    const all = weeks ?? [];
    if (all.length === 0 || contractSize <= 0 || spot === null || spot <= 0)
      return empty;

    // Dollars of exposure per contract. `contractSize` is in the metal's own
    // quote unit — troy ounces for the four precious metals, pounds for copper,
    // which gold-api also quotes per pound — so the product is dollars for
    // every symbol this frame offers, with no per-metal special case.
    //
    // ONE spot for the whole series, deliberately: we only have *today's* quote,
    // so every week is valued at it. That makes the line a history of
    // POSITIONING, not a mark-to-market of what the position was worth at the
    // time — a real mark-to-market would need each week's own settlement price
    // and would blend two moves into one line. The caption says so on the card.
    const dollarsPerContract = contractSize * spot;

    const windowed = sliceYears(
      all.map((w) => ({ time: w.time, value: cotNet(w) * dollarsPerContract })),
      config.years,
    );
    if (windowed.length === 0) return empty;

    const thinned = downsample(windowed);
    // Zero has to stay on the axis: this line is read as net long above it and
    // net short below, and gold's specs have sat far above zero for years, so an
    // auto domain would crop the only reference that matters.
    const plotted = thinned.map((p) => p.value);
    const low = Math.min(0, ...plotted);
    const high = Math.max(0, ...plotted);
    const pad = (high - low) * 0.06 || 1;

    // Week-over-week reads off the RAW rows — the thinning can drop the
    // penultimate report, and "vs last week" has to mean last week. Both legs
    // share the multiplier, so this is a pure positioning change.
    const last = all[all.length - 1];
    const prior = all.length > 1 ? all[all.length - 2] : null;
    return {
      chartData: toChartData(thinned),
      yDomain: [low - pad, high + pad] as [number, number],
      latest: cotNet(last) * dollarsPerContract,
      weekChange: prior
        ? (cotNet(last) - cotNet(prior)) * dollarsPerContract
        : null,
      lastReport: last.time,
    };
  }, [weeks, contractSize, spot, config.years]);

  const series: MultiSeriesData[] = useMemo(
    () => [
      {
        id: "notional",
        name: `${metalName(config.symbol)} spec net`,
        color: CHART_COLORS_MULTI_SERIES[0],
        data: chartData,
      },
    ],
    [chartData, config.symbol],
  );

  if ((isLoading || spotLoading) && chartData.length === 0)
    return <FrameStatus loading>loading COT positioning…</FrameStatus>;
  if (!weeks || weeks.length === 0)
    return <FrameStatus>no COT positioning yet</FrameStatus>;
  // Name the input that's actually missing. Unlike `metal-open-interest` there
  // is no contract-count fallback to degrade to — a notional card with no price
  // has nothing to show — so it says which number it's waiting for.
  if (latest === null)
    return (
      <FrameStatus>
        waiting for a {contractSize > 0 ? "spot quote" : "contract size"} to
        value the position
      </FrameStatus>
    );

  const nativeUnit = METAL_UNIT[config.symbol] ?? "oz";
  const netContracts = cotNet(weeks[weeks.length - 1]);

  return (
    <ChartCard>
      <CardHeader>
        <CardHeader.Main>
          <CardHeader.Eyebrow>
            {metalName(config.symbol)} spec net notional
          </CardHeader.Eyebrow>
          <CardHeader.Value size="metric-lg">
            {latest >= 0 ? "+" : ""}
            {money.compact(latest)}
          </CardHeader.Value>
          {/* `caption`: the metals family's third line is quieter than the main
              column's default `body-sm` sub. */}
          <CardHeader.Sub size="caption" className="mt-0.5 truncate">
            net {netContracts >= 0 ? "long" : "short"} ·{" "}
            {signedContracts(netContracts)} contracts ×{" "}
            {formatCompact(contractSize)} {nativeUnit}
          </CardHeader.Sub>
        </CardHeader.Main>
        <CardHeader.Aside>
          <CardHeader.Sub>week over week</CardHeader.Sub>
          {weekChange === null ? (
            <CardHeader.Value absent>—</CardHeader.Value>
          ) : (
            <CardHeader.Value tint={changeColor(weekChange)}>
              {weekChange >= 0 ? "+" : ""}
              {money.compact(weekChange)}
            </CardHeader.Value>
          )}
          {lastReport !== null && (
            <CardHeader.Sub>
              reported {durationSince(lastReport)} ago
            </CardHeader.Sub>
          )}
        </CardHeader.Aside>
      </CardHeader>

      <ChartCard.Body>
        <TimeSeriesChart
          series={series}
          timeframe={timeframeFor(config.years)}
          fill
          yDomain={yDomain}
          formatValue={money.compact}
        />
      </ChartCard.Body>

      <ChartCard.Caption>
        every week valued at today's {spot === null ? "" : money.price(spot)}/
        {nativeUnit} spot, so the line moves only when positioning does — not a
        mark-to-market of what the position was worth at the time
      </ChartCard.Caption>
    </ChartCard>
  );
}

export const metalSpecNotionalFrame = defineFrame({
  ...metalSpecNotionalMeta,
  component: MetalSpecNotional,
});
