import { defineFrame, useYieldCurve } from "@zframes/core";
import type { z } from "zod";
import {
  type ChartTooltipContent,
  chartTooltipLabel,
  hoverTip,
  useHideTipOnUnmount,
} from "./chart-hover";
import { CardHeader } from "./card-header";
import { changeColor, formatPct } from "./format";
import { yieldCurveMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = yieldCurveMeta.schema;
const accent = (a = 1) => `hsl(var(--zf-accent-hue, 242) 85% 72% / ${a})`;

/** The curve shape — stretched to fill width; non-scaling stroke keeps it crisp. */
function CurveSvg({ points }: { points: { label: string; rate: number }[] }) {
  const rates = points.map((p) => p.rate);
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const range = Math.max(0.01, max - min);
  const n = rates.length;
  const x = (i: number) => (100 * i) / (n - 1);
  const y = (r: number) => 4 + 32 * (1 - (r - min) / range);
  const line = rates
    .map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(r).toFixed(2)}`)
    .join(" ");
  // Half the gap between neighbouring tenors — each hit column is centred on its
  // own point, so the end points get a half-width column.
  const halfGap = 50 / (n - 1);
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="h-20 w-full"
    >
      <path d={`${line} L100,40 L0,40 Z`} fill={accent(0.14)} />
      <path
        d={line}
        fill="none"
        stroke={accent(0.9)}
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
      />
      {/* The curve draws EVERY tenor the Treasury publishes, while the pill row
          below shows only the maturities the config asks for — so most plotted
          points have their yield printed nowhere on the card. These invisible
          full-height columns (last, so they sit above the marks, and sharing the
          curve's own x()/y() mapping) are the only readout those tenors get, in
          the tooltip and in the aria-label. */}
      {points.map((p, i) => {
        const left = Math.max(0, x(i) - halfGap);
        const right = Math.min(100, x(i) + halfGap);
        const content: ChartTooltipContent = {
          title: p.label,
          rows: [{ value: formatPct(p.rate) }],
        };
        return (
          <rect
            key={p.label}
            x={left}
            y={0}
            width={right - left}
            height={40}
            fill="transparent"
            aria-label={chartTooltipLabel(content)}
            {...hoverTip(content)}
          />
        );
      })}
    </svg>
  );
}

function YieldCurve({ config }: { config: z.output<typeof schema> }) {
  const { curve, isLoading } = useYieldCurve();
  useHideTipOnUnmount();

  if (isLoading) return <FrameStatus loading>loading yield curve…</FrameStatus>;
  if (!curve || curve.points.length < 2)
    return <FrameStatus>no yield-curve data yet</FrameStatus>;

  const rate = (label: string) =>
    curve.points.find((p) => p.label === label)?.rate;
  const y2 = rate("2Y");
  const y10 = rate("10Y");
  const spreadBps =
    y2 != null && y10 != null ? Math.round((y10 - y2) * 100) : null;
  const inverted = spreadBps != null && spreadBps < 0;

  const keys = config.maturities;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <CardHeader align="start">
        <CardHeader.Main>
          <CardHeader.Eyebrow>Treasury yield curve</CardHeader.Eyebrow>
          {/* `ink="normal"`, not the sub-line's default `soft`: the
              publisher's own print date reads as data here. */}
          <CardHeader.Sub ink="normal">
            U.S. Treasury · {curve.date}
          </CardHeader.Sub>
        </CardHeader.Main>
        <CardHeader.Aside>
          <CardHeader.Sub>daily</CardHeader.Sub>
        </CardHeader.Aside>
      </CardHeader>

      {spreadBps != null && (
        <div className="flex items-baseline gap-2">
          <span
            className="metric-md leading-none"
            style={{
              color: changeColor(spreadBps),
              textShadow: `0 0 24px ${changeColor(spreadBps)}44`,
            }}
          >
            {spreadBps >= 0 ? "+" : ""}
            {spreadBps} bps
          </span>
          <span className="caption text-soft">
            2s10s · {inverted ? "inverted" : "normal"}
          </span>
        </div>
      )}

      <CurveSvg points={curve.points} />

      <div
        className="grid gap-1"
        style={{
          gridTemplateColumns: `repeat(${keys.length}, minmax(0, 1fr))`,
        }}
      >
        {keys.map((label) => {
          const r = rate(label);
          return (
            <div
              key={label}
              className="rounded bg-white/[0.04] px-1.5 py-1 text-center"
            >
              <div className="caption text-soft">{label}</div>
              <div
                className={`body-sm font-bold tabular-nums ${
                  r != null ? "text-strong" : "text-disabled"
                }`}
              >
                {r != null ? formatPct(r) : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export const yieldCurveFrame = defineFrame({
  ...yieldCurveMeta,
  component: YieldCurve,
});
