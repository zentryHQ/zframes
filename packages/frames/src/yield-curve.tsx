import { defineFrame, useYieldCurve } from "@zframes/core";
import type { z } from "zod";
import { changeColor, formatPct } from "./format";
import { yieldCurveMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = yieldCurveMeta.schema;
const accent = (a = 1) => `hsl(var(--zf-accent-hue, 242) 85% 72% / ${a})`;

/** The curve shape — stretched to fill width; non-scaling stroke keeps it crisp. */
function CurveSvg({ rates }: { rates: number[] }) {
  const min = Math.min(...rates);
  const max = Math.max(...rates);
  const range = Math.max(0.01, max - min);
  const n = rates.length;
  const x = (i: number) => (100 * i) / (n - 1);
  const y = (r: number) => 4 + 32 * (1 - (r - min) / range);
  const line = rates
    .map((r, i) => `${i ? "L" : "M"}${x(i).toFixed(2)},${y(r).toFixed(2)}`)
    .join(" ");
  return (
    <svg
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="h-20 w-full"
      aria-hidden
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
    </svg>
  );
}

function YieldCurve({ config }: { config: z.output<typeof schema> }) {
  const { curve, isLoading } = useYieldCurve();

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
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="caption text-soft uppercase">
            Treasury yield curve
          </div>
          <div className="body-sm text-normal">
            U.S. Treasury · {curve.date}
          </div>
        </div>
        <div className="caption text-soft text-right">daily</div>
      </div>

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

      <CurveSvg rates={curve.points.map((p) => p.rate)} />

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
              <div className="body-sm text-strong font-bold tabular-nums">
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
