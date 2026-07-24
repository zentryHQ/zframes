import {
  CHART_COLORS_MULTI_SERIES,
  MultiSeriesLineChart,
  type MultiSeriesData,
} from "@zframes/charts";
import {
  defineFrame,
  useDailyCloseHistory,
  useMetalHistory,
} from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct } from "./format";
import {
  downsample,
  pctChange,
  ratioSeries,
  sliceYears,
  timeframeFor,
  toChartData,
} from "./metals-shared";
import { btcInGoldMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = btcInGoldMeta.schema;

/** The unit here is troy ounces of gold, not dollars — precision scales with
 *  magnitude because the ratio has run from under 0.01 oz to past 30 oz. */
function formatOunces(value: number): string {
  if (value >= 100) return `${value.toFixed(0)} oz`;
  if (value >= 10) return `${value.toFixed(1)} oz`;
  if (value >= 1) return `${value.toFixed(2)} oz`;
  // 2011 BTC bought ~0.005 oz and 2010 far less; a fixed decimal count would
  // print every early tick as "0.000 oz", so sub-ounce values keep three
  // significant digits instead.
  return `${value.toPrecision(3)} oz`;
}

/** Log ticks are stored as log10(oz); undo that so the axis reads in ounces. */
const formatLogOunces = (value: number) => formatOunces(10 ** value);

function BtcInGold({ config }: { config: z.output<typeof schema> }) {
  const { histories, isLoading: goldLoading } = useMetalHistory(["XAU"]);
  const { history: btc, isLoading: btcLoading } = useDailyCloseHistory("btc");

  const gold = useMemo(
    () => histories.find((h) => h.symbol === "XAU")?.points ?? [],
    [histories],
  );

  const view = useMemo(() => {
    if (gold.length === 0 || btc.length === 0) return null;
    // ratioSeries day-aligns the two legs — BTC trades weekends, the London fix
    // doesn't, so an index-wise zip would compare mismatched days. Each leg is
    // windowed BEFORE the divide (metals-shared's "windowing before maths"): a
    // ratio needs no warm-up, and the gold file runs back to 1968.
    const windowed = ratioSeries(
      sliceYears(btc, config.years),
      sliceYears(gold, config.years),
    ).filter((p) => p.value > 0);
    // One shared day is a dot, not a line — don't draw an empty chart shell.
    if (windowed.length < 2) return null;

    const thinned = downsample(windowed);
    const current = windowed[windowed.length - 1].value;
    const series: MultiSeriesData[] = [
      {
        id: "btc-in-gold",
        name: "BTC in gold",
        color: CHART_COLORS_MULTI_SERIES[0],
        data: toChartData(
          config.logScale
            ? thinned.map((p) => ({ time: p.time, value: Math.log10(p.value) }))
            : thinned,
        ),
      },
    ];
    return {
      series,
      current,
      changePct: pctChange(windowed[0].value, current),
    };
  }, [gold, btc, config.years, config.logScale]);

  const formatValue = config.logScale ? formatLogOunces : formatOunces;

  if (goldLoading || btcLoading)
    return <FrameStatus loading>loading BTC in gold…</FrameStatus>;
  if (gold.length === 0)
    return <FrameStatus>no gold fix history yet</FrameStatus>;
  if (btc.length === 0)
    return <FrameStatus>no BTC daily-close history available</FrameStatus>;
  if (!view)
    return <FrameStatus>no overlapping days in this window</FrameStatus>;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="metric-lg text-strong leading-none">
            {formatOunces(view.current)}
          </div>
          <div className="caption text-soft mt-1 truncate">
            oz of gold per BTC{config.logScale ? " · log scale" : ""}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className="body-md font-bold tabular-nums"
            style={{ color: changeColor(view.changePct) }}
          >
            {formatChangePct(view.changePct)}
          </div>
          <div className="caption text-soft">{config.years}y change</div>
        </div>
      </div>

      <MultiSeriesLineChart
        series={view.series}
        timeframe={timeframeFor(config.years)}
        height={190}
        formatValue={formatValue}
      />
    </div>
  );
}

export const btcInGoldFrame = defineFrame({
  ...btcInGoldMeta,
  component: BtcInGold,
});
