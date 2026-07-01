import { CHART_COLORS_MULTI_SERIES } from "@zframes/charts";
import { defineFrame, useDayStats, useMids } from "@zframes/core";
import { Liveline, type LivelinePoint, type LivelineSeries } from "liveline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import { AssetLogo, tickerOf } from "./asset-logo";
import { changeColor, formatChangePct, formatPrice } from "./format";
import { onHeartbeat, useVisibilityRef } from "./live-tick";
import { priceLivelineMeta } from "./schemas";

const MAX_POINTS = 720;
const MIN_WINDOW_SECS = 3;
const PADDING = { top: 12, right: 58, bottom: 28, left: 8 };

const schema = priceLivelineMeta.schema;

type PriceBuffers = Record<string, LivelinePoint[]>;

function isFinitePrice(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value);
}

function appendSnapshot(
  previous: PriceBuffers,
  symbols: readonly string[],
  prices: Record<string, number>,
  nowSecs: number,
): PriceBuffers {
  let changed = false;
  const next: PriceBuffers = { ...previous };

  for (const symbol of symbols) {
    const price = prices[symbol];
    if (!isFinitePrice(price)) continue;

    const current = next[symbol] ?? [];
    const last = current[current.length - 1];
    if (last && Math.abs(nowSecs - last.time) < 0.5 && last.value === price)
      continue;

    const seeded =
      current.length === 0
        ? [
            { time: nowSecs - MIN_WINDOW_SECS, value: price },
            { time: nowSecs, value: price },
          ]
        : [...current, { time: nowSecs, value: price }];

    next[symbol] =
      seeded.length > MAX_POINTS ? seeded.slice(-MAX_POINTS) : seeded;
    changed = true;
  }

  return changed ? next : previous;
}

function normalizedValue(value: number, anchor: number) {
  return anchor === 0 ? 0 : (value / anchor - 1) * 100;
}

function PriceLiveline({ config }: { config: z.output<typeof schema> }) {
  const symbols = config.symbols;
  const symbolKey = symbols.join("|");
  const mids = useMids(symbols);
  const stats = useDayStats(symbols);
  const { ref: rootRef, visibleRef } = useVisibilityRef<HTMLDivElement>();
  const wasHiddenRef = useRef(false);
  const [buffers, setBuffers] = useState<PriceBuffers>({});
  const [hiddenSymbols, setHiddenSymbols] = useState<Set<string>>(
    () => new Set(),
  );

  const currentPrices = useMemo(() => {
    const next: Record<string, number> = {};
    for (const symbol of symbols) {
      const price = mids[symbol] ?? stats[symbol]?.markPx;
      if (isFinitePrice(price)) next[symbol] = price;
    }
    return next;
  }, [mids, stats, symbols]);

  const currentPricesRef = useRef(currentPrices);
  useEffect(() => {
    currentPricesRef.current = currentPrices;
  }, [currentPrices]);

  useEffect(() => {
    const allowed = new Set(symbols);
    setBuffers((previous) => {
      let changed = false;
      const next: PriceBuffers = {};
      for (const [symbol, data] of Object.entries(previous)) {
        if (!allowed.has(symbol)) {
          changed = true;
          continue;
        }
        next[symbol] = data;
      }
      return changed ? next : previous;
    });
    setHiddenSymbols((previous) => {
      const next = new Set(
        [...previous].filter((symbol) => allowed.has(symbol)),
      );
      return next.size === previous.size ? previous : next;
    });
  }, [symbolKey, symbols]);

  const toggleSymbol = useCallback(
    (symbol: string) => {
      setHiddenSymbols((previous) => {
        const next = new Set(previous);
        if (next.has(symbol)) {
          next.delete(symbol);
          return next;
        }

        const visibleCount = symbols.length - next.size;
        if (visibleCount <= 1) return previous;
        next.add(symbol);
        return next;
      });
    },
    [symbols],
  );

  const appendCurrentPrices = useCallback(() => {
    // Off-screen: stop growing the buffer (and the per-tick re-render it would
    // trigger); liveline has already frozen its canvas. Mark stale so the first
    // on-screen append reseeds a fresh segment instead of bridging the gap.
    if (!visibleRef.current) {
      wasHiddenRef.current = true;
      return;
    }
    const snapshot = currentPricesRef.current;
    if (Object.keys(snapshot).length === 0) return;
    const nowSecs = Date.now() / 1000;
    const reseed = wasHiddenRef.current;
    wasHiddenRef.current = false;
    setBuffers((previous) =>
      appendSnapshot(reseed ? {} : previous, symbols, snapshot, nowSecs),
    );
  }, [symbolKey, symbols, visibleRef]);

  useEffect(() => {
    appendCurrentPrices();
  }, [appendCurrentPrices, currentPrices]);

  // One shared 1 Hz ticker for every live frame, not one setInterval each.
  useEffect(() => onHeartbeat(appendCurrentPrices), [appendCurrentPrices]);

  const series = useMemo<LivelineSeries[]>(
    () =>
      symbols.flatMap((symbol, index) => {
        if (hiddenSymbols.has(symbol)) return [];

        const data = buffers[symbol] ?? [];
        const anchor = data[0]?.value;
        if (!anchor || data.length === 0) return [];

        const chartData = config.normalize
          ? data.map((point) => ({
              time: point.time,
              value: normalizedValue(point.value, anchor),
            }))
          : data;

        return [
          {
            id: symbol,
            label: tickerOf(symbol),
            color:
              CHART_COLORS_MULTI_SERIES[
                index % CHART_COLORS_MULTI_SERIES.length
              ],
            data: chartData,
            value: chartData[chartData.length - 1]?.value ?? 0,
          },
        ];
      }),
    [buffers, hiddenSymbols, symbols, config.normalize],
  );

  const activeWindowSecs = useMemo(() => {
    let first = Infinity;
    let last = -Infinity;
    for (const symbol of symbols) {
      const data = buffers[symbol] ?? [];
      if (data.length === 0) continue;
      first = Math.min(first, data[0]?.time ?? Infinity);
      last = Math.max(last, data[data.length - 1]?.time ?? -Infinity);
    }
    const span =
      Number.isFinite(first) && Number.isFinite(last) ? last - first : 0;
    return Math.min(
      config.windowSec,
      Math.max(MIN_WINDOW_SECS, Math.ceil(span)),
    );
  }, [buffers, symbols, config.windowSec]);

  const hasSeries = series.some((item) => item.data.length > 1);

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col">
      <div className="grid flex-none grid-cols-1 gap-x-3 gap-y-1.5 border-b border-white/[0.06] pb-2 sm:grid-cols-2">
        {symbols.map((symbol, index) => {
          const price = currentPrices[symbol];
          const anchor = buffers[symbol]?.[0]?.value;
          const changePct =
            price !== undefined && anchor
              ? normalizedValue(price, anchor)
              : undefined;
          const color =
            CHART_COLORS_MULTI_SERIES[index % CHART_COLORS_MULTI_SERIES.length];
          const isHidden = hiddenSymbols.has(symbol);
          return (
            <button
              key={symbol}
              type="button"
              aria-pressed={!isHidden}
              title={`${isHidden ? "Show" : "Hide"} ${tickerOf(symbol)}`}
              className={`caption grid min-w-0 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-1.5 rounded-md px-1.5 py-0.5 text-left transition ${
                isHidden
                  ? "opacity-40 hover:opacity-70"
                  : "bg-white/[0.035] opacity-100 hover:bg-white/[0.06]"
              }`}
              onClick={(event) => {
                event.stopPropagation();
                toggleSymbol(symbol);
              }}
              onPointerDown={(event) => event.stopPropagation()}
            >
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: color }}
              />
              <AssetLogo symbol={symbol} size={14} />
              <span className="truncate font-bold text-strong">
                {tickerOf(symbol)}
              </span>
              <span className="text-normal tabular-nums">
                {price !== undefined ? formatPrice(price) : "…"}
                {changePct !== undefined ? (
                  <span
                    className="ml-1 tabular-nums"
                    style={{ color: changeColor(changePct) }}
                  >
                    {formatChangePct(changePct)}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="min-h-0 flex-1 [&>div[style*='align-items']]:!hidden">
        <Liveline
          data={[]}
          value={0}
          series={series}
          theme="dark"
          window={activeWindowSecs}
          grid
          loading={!hasSeries}
          scrub={false}
          badge={false}
          formatValue={config.normalize ? formatChangePct : formatPrice}
          padding={PADDING}
          seriesToggleCompact={symbols.length > 4}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

export const priceLivelineFrame = defineFrame({
  ...priceLivelineMeta,
  component: PriceLiveline,
});
