import { CalendarHeatmap, type CalendarDatum } from "@zframes/charts";
import { defineFrame, useCandles } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import {
  DOWN_COLOR,
  UP_COLOR,
  formatChangePct,
  formatCompact,
  formatPct,
} from "./format";
import { simpleReturns } from "./metals-shared";
import { returnCalendarMeta } from "./schemas";
import { TimeframeToggle, useFrameChoice } from "./timeframe-toggle";
import { FrameStatus } from "./ui";

const schema = returnCalendarMeta.schema;

const LOOKBACK_DAYS = { "3M": 92, "6M": 183, "1Y": 366 } as const;
const LOOKBACK_OPTIONS = ["3M", "6M", "1Y"] as const;

function formatRangePct(v: number) {
  return formatPct(v);
}

const METRIC_LABEL = {
  return: "daily return",
  volume: "daily volume",
  range: "daily range",
} as const;

function ReturnCalendar({ config }: { config: z.output<typeof schema> }) {
  const [lookback, setLookback] = useFrameChoice("lookback", config.lookback);
  // Memoised on the window, not recomputed per render: `startTimeMs` is a fetch
  // dependency, so a fresh `Date.now()` each pass would refetch continuously.
  const startTimeMs = useMemo(
    () => Date.now() - LOOKBACK_DAYS[lookback] * 86_400_000,
    [lookback],
  );
  const { candles, isLoading } = useCandles(
    config.symbol,
    "1d",
    startTimeMs,
    undefined,
    config.source,
  );

  const { data, up, down } = useMemo(() => {
    if (candles.length === 0) return { data: [], up: 0, down: 0 };

    let series: CalendarDatum[];
    if (config.metric === "return") {
      // Reuse the shared close-to-close definition rather than restating it —
      // returns are aligned to closes[1…n], so the dates shift by one too.
      const closes = candles.map((c) => ({ time: c.time, value: c.close }));
      series = simpleReturns(closes).map((pct, i) => ({
        date: closes[i + 1].time,
        value: pct,
      }));
    } else if (config.metric === "volume") {
      series = candles.map((c) => ({ date: c.time, value: c.volume ?? 0 }));
    } else {
      series = candles
        // A zero close would make the range percentage infinite.
        .filter((c) => c.close > 0)
        .map((c) => ({
          date: c.time,
          value: ((c.high - c.low) / c.close) * 100,
        }));
    }

    return {
      data: series,
      up: series.filter((d) => d.value > 0).length,
      down: series.filter((d) => d.value < 0).length,
    };
  }, [candles, config.metric]);

  // Only blank the card before the first candles land — a background refresh
  // keeps the grid on screen instead of flashing to a skeleton.
  if (isLoading && data.length === 0)
    return <FrameStatus loading>loading daily history…</FrameStatus>;
  if (data.length === 0) return <FrameStatus>no daily history yet</FrameStatus>;

  const diverging = config.metric === "return";
  const formatValue =
    config.metric === "return"
      ? formatChangePct
      : config.metric === "volume"
        ? formatCompact
        : formatRangePct;

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <div className="min-h-0 flex-1">
        <CalendarHeatmap
          data={data}
          color={diverging ? UP_COLOR : undefined}
          negativeColor={diverging ? DOWN_COLOR : undefined}
          weekStart={config.weekStart}
          formatValue={formatValue}
          legendLowLabel={diverging ? "loss" : "less"}
          legendHighLabel={diverging ? "gain" : "more"}
        />
      </div>

      {/* The toggle rides the caption row rather than overlaying the grid: the
          month labels already occupy the top-right corner. */}
      <div className="flex items-center justify-between gap-2 border-t border-white/[0.08] pt-1">
        <span className="caption text-soft min-w-0 truncate">
          {tickerOf(config.symbol)} · {METRIC_LABEL[config.metric]}
          {diverging && (
            <>
              {" · "}
              <span style={{ color: UP_COLOR }}>{up} up</span>
              {" / "}
              <span style={{ color: DOWN_COLOR }}>{down} down</span>
            </>
          )}
          {!diverging && ` · ${data.length} days`}
        </span>
        <TimeframeToggle
          options={LOOKBACK_OPTIONS}
          value={lookback}
          onChange={setLookback}
          label="return calendar lookback"
        />
      </div>
    </div>
  );
}

export const returnCalendarFrame = defineFrame({
  ...returnCalendarMeta,
  component: ReturnCalendar,
});
