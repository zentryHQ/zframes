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
import { changeColor, formatChangePct, formatCompact } from "./format";
import {
  METAL_UNIT,
  downsample,
  durationSince,
  metalName,
  pctChange,
  sliceYears,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { metalOpenInterestMeta } from "./schemas";
import { FrameStatus } from "./ui";
import { TimeSeriesChart } from "./series-chart";

const schema = metalOpenInterestMeta.schema;

type Unit = z.output<typeof schema>["unit"];

/**
 * The unit we can actually render. "ounces" and "notional" are derived from
 * numbers that may not be there yet (the contract size, a live spot quote), so
 * rather than draw an all-zero line we fall back to contracts — the one unit
 * the CFTC reports directly — and say so in the caption.
 */
function resolveUnit(
  requested: Unit,
  contractSize: number,
  spot: number | null,
): Unit {
  if (requested === "contracts") return "contracts";
  if (contractSize <= 0) return "contracts";
  if (requested === "notional" && (spot === null || spot <= 0))
    return "contracts";
  return requested;
}

function MetalOpenInterest({ config }: { config: z.output<typeof schema> }) {
  const money = useMoney();
  const { positioning, isLoading } = useMetalPositioning(config.symbol);
  // Only "notional" needs the quote, but a hook can't be conditional — and the
  // spot poll is shared with every other metals frame on the board anyway.
  const { metals } = useMetalSpot([config.symbol]);

  const spot = useMemo(
    () => metals.find((m) => m.symbol === config.symbol)?.price ?? null,
    [metals, config.symbol],
  );

  const weeks = positioning?.weeks;
  const contractSize = positioning?.contractSize ?? 0;
  const unit = resolveUnit(config.unit, contractSize, spot);
  const fellBack = unit !== config.unit;

  const { chartData, latest, lastReport } = useMemo(() => {
    const raw = (weeks ?? []).map((w) => ({
      time: w.time,
      value: w.openInterest,
    }));
    const windowed = sliceYears(raw, config.years);
    // Notional prices the whole history at *today's* spot — it answers "what is
    // this paper claim worth now", not "what was it worth then".
    const multiplier =
      unit === "contracts"
        ? 1
        : unit === "ounces"
          ? contractSize
          : contractSize * (spot ?? 0);
    const scaled = windowed.map((p) => ({
      time: p.time,
      value: p.value * multiplier,
    }));
    return {
      chartData: toChartData(downsample(scaled)),
      latest: scaled.length > 0 ? scaled[scaled.length - 1].value : null,
      lastReport: scaled.length > 0 ? scaled[scaled.length - 1].time : null,
    };
  }, [weeks, config.years, unit, contractSize, spot]);

  // Week-over-week is unit-independent (both legs share the multiplier), so it
  // reads off the raw contract counts and survives the downsample.
  const wow = useMemo(() => {
    const w = weeks ?? [];
    if (w.length < 2) return null;
    return pctChange(
      w[w.length - 2].openInterest,
      w[w.length - 1].openInterest,
    );
  }, [weeks]);

  const series: MultiSeriesData[] = useMemo(
    () => [
      {
        id: "oi",
        name: `${metalName(config.symbol)} OI`,
        color: CHART_COLORS_MULTI_SERIES[0],
        data: chartData,
      },
    ],
    [chartData, config.symbol],
  );

  if (isLoading && chartData.length === 0)
    return <FrameStatus loading>loading open interest…</FrameStatus>;
  if (chartData.length === 0 || latest === null)
    return <FrameStatus>no COT open-interest data yet</FrameStatus>;

  const nativeUnit = METAL_UNIT[config.symbol] ?? "oz";
  const headline =
    unit === "notional" ? money.compact(latest) : formatCompact(latest);
  const suffix =
    unit === "contracts" ? "contracts" : unit === "ounces" ? nativeUnit : null;
  const sub =
    unit === "notional" && spot !== null
      ? `at ${money.price(spot)}/${nativeUnit} spot`
      : `${formatCompact(contractSize)} ${nativeUnit} per contract`;

  return (
    <ChartCard>
      <CardHeader>
        <CardHeader.Main>
          <CardHeader.Eyebrow>
            {metalName(config.symbol)} open interest
          </CardHeader.Eyebrow>
          {/* Its own row, not `CardHeader.Value`: the figure carries a unit word
              beside it, and the shared value is one sized block — nesting the
              suffix inside it would set it in the hero's size. */}
          <div className="flex items-baseline gap-1.5">
            <span className="metric-lg text-strong leading-none tabular-nums">
              {headline}
            </span>
            {suffix && <span className="body-sm text-soft">{suffix}</span>}
          </div>
          {contractSize > 0 && (
            // `caption`: the metals family's third line is quieter than the main
            // column's default `body-sm` sub.
            <CardHeader.Sub size="caption" className="mt-0.5">
              {sub}
            </CardHeader.Sub>
          )}
        </CardHeader.Main>
        <CardHeader.Aside>
          <CardHeader.Sub>week over week</CardHeader.Sub>
          {wow === null ? (
            <CardHeader.Value absent>—</CardHeader.Value>
          ) : (
            <CardHeader.Value tint={changeColor(wow)}>
              {formatChangePct(wow)}
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
          formatValue={unit === "notional" ? money.compact : formatCompact}
        />
      </ChartCard.Body>

      {fellBack && (
        // Name the input that's actually missing: a "notional" request can fall
        // back for either reason, and blaming the spot quote when it's the
        // contract size that's absent sends the reader looking in the wrong place.
        <ChartCard.Caption>
          no {contractSize > 0 ? "spot quote" : "contract size"} yet — showing
          contracts
        </ChartCard.Caption>
      )}
    </ChartCard>
  );
}

export const metalOpenInterestFrame = defineFrame({
  ...metalOpenInterestMeta,
  component: MetalOpenInterest,
});
