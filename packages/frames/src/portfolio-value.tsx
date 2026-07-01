import { defineFrame, type Portfolio } from "@zframes/core";
import { Liveline, type LivelinePoint, type LivelineSeries } from "liveline";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { z } from "zod";
import { changeColor, formatChangePct, formatCompactUsd } from "./format";
import { onHeartbeat, useVisibilityRef } from "./live-tick";
import {
  PortfolioGate,
  PortfolioLabel,
  usePricedHoldings,
} from "./portfolio-common";
import { portfolioValueMeta } from "./schemas";

// The equity line accumulates live from when the dashboard opens (like
// price-liveline), recomputing total value each heartbeat from streamed mids.
// (Seeding history from per-asset candles is a noted follow-up.)
const MAX_POINTS = 720;
const MIN_WINDOW_SECS = 3;
const PADDING = { top: 12, right: 66, bottom: 28, left: 8 };

const schema = portfolioValueMeta.schema;

// Liveline strokes the series on a canvas, which can't resolve CSS variables —
// resolve the themed accent hue to a concrete color so the line is visible.
function accentColor(): string {
  if (typeof document === "undefined") return "hsl(242 90% 66%)";
  const hue =
    getComputedStyle(document.documentElement)
      .getPropertyValue("--zf-accent-hue")
      .trim() || "242";
  return `hsl(${hue} 90% 66%)`;
}

function EquityLine({
  portfolio,
  config,
  windowSec,
}: {
  portfolio: Portfolio;
  config: z.output<typeof schema>;
  windowSec: number;
}) {
  const { total } = usePricedHoldings(portfolio.holdings);
  const accent = useMemo(() => accentColor(), []);
  const { ref: rootRef, visibleRef } = useVisibilityRef<HTMLDivElement>();
  const wasHiddenRef = useRef(false);
  const [buffer, setBuffer] = useState<LivelinePoint[]>([]);
  const totalRef = useRef(total);
  useEffect(() => {
    totalRef.current = total;
  }, [total]);

  const append = useCallback(() => {
    // Off-screen: skip the per-tick append + re-render (the canvas is frozen
    // too). Reseed on return so the line doesn't bridge the hidden span.
    if (!visibleRef.current) {
      wasHiddenRef.current = true;
      return;
    }
    const value = totalRef.current;
    if (!Number.isFinite(value) || value <= 0) return;
    const nowSecs = Date.now() / 1000;
    const reseed = wasHiddenRef.current;
    wasHiddenRef.current = false;
    setBuffer((prev) => {
      const base = reseed ? [] : prev;
      const last = base[base.length - 1];
      if (last && Math.abs(nowSecs - last.time) < 0.5 && last.value === value)
        return base;
      const seeded =
        base.length === 0
          ? [
              { time: nowSecs - MIN_WINDOW_SECS, value },
              { time: nowSecs, value },
            ]
          : [...base, { time: nowSecs, value }];
      return seeded.length > MAX_POINTS ? seeded.slice(-MAX_POINTS) : seeded;
    });
  }, [visibleRef]);

  useEffect(() => {
    append();
  }, [append, total]);
  // One shared 1 Hz ticker for every live frame, not one setInterval each.
  useEffect(() => onHeartbeat(append), [append]);

  const anchor = buffer[0]?.value;
  const changePct = anchor && total ? (total / anchor - 1) * 100 : 0;

  const series = useMemo<LivelineSeries[]>(
    () =>
      buffer.length === 0
        ? []
        : [
            {
              id: "equity",
              label: "Portfolio",
              color: accent,
              data: buffer,
              value: total,
            },
          ],
    [buffer, total, accent],
  );

  const activeWindowSecs = useMemo(() => {
    if (buffer.length === 0) return MIN_WINDOW_SECS;
    const span = buffer[buffer.length - 1].time - buffer[0].time;
    return Math.min(windowSec, Math.max(MIN_WINDOW_SECS, Math.ceil(span)));
  }, [buffer, windowSec]);

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col">
      <div className="flex flex-none items-baseline justify-between border-b border-white/[0.06] pb-2">
        <div className="flex flex-col">
          <PortfolioLabel
            portfolio={portfolio}
            config={config}
            className="caption text-soft"
          />
          <span className="metric-md text-strong">
            {formatCompactUsd(total)}
          </span>
        </div>
        <span
          className="body-sm font-semibold tabular-nums"
          style={{ color: changeColor(changePct) }}
        >
          {formatChangePct(changePct)}{" "}
          <span className="caption text-soft">session</span>
        </span>
      </div>
      <div className="min-h-0 flex-1 [&>div[style*='align-items']]:!hidden">
        <Liveline
          data={[]}
          value={total}
          series={series}
          theme="dark"
          window={activeWindowSecs}
          grid
          loading={buffer.length <= 1}
          scrub={false}
          badge={false}
          formatValue={formatCompactUsd}
          padding={PADDING}
          style={{ width: "100%", height: "100%" }}
        />
      </div>
    </div>
  );
}

function PortfolioValue({ config }: { config: z.output<typeof schema> }) {
  return (
    <PortfolioGate config={config} loadingLabel="loading portfolio…">
      {(portfolio) => (
        <EquityLine
          portfolio={portfolio}
          config={config}
          windowSec={config.windowSec}
        />
      )}
    </PortfolioGate>
  );
}

export const portfolioValueFrame = defineFrame({
  ...portfolioValueMeta,
  component: PortfolioValue,
});
