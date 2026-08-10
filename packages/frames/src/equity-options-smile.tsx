import { defineFrame, useMoney, useOptionsChain } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import {
  type ChartTooltipContent,
  chartTooltipLabel,
  hoverTip,
  useHideTipOnUnmount,
} from "./chart-hover";
import {
  CALL,
  PUT,
  delayLabel,
  emptyChainLabel,
  expiryLabel,
  ivOf,
  resolveSpot,
  selectExpiry,
  strikeRows,
} from "./equity-options-shared";
import { formatPct } from "./format";
import { equityOptionsSmileMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = equityOptionsSmileMeta.schema;

interface IvPoint {
  strike: number;
  /** Implied vol as a decimal — 0.42 is 42%. */
  iv: number;
}

function EquityOptionsSmile({ config }: { config: z.output<typeof schema> }) {
  const { data: chain, isLoading } = useOptionsChain(config.symbol);
  const money = useMoney();
  useHideTipOnUnmount();

  const view = useMemo(() => {
    if (!chain) return null;
    const expiry = selectExpiry(chain, config.expiry);
    if (!expiry) return null;
    const spot = resolveSpot(chain, expiry.contracts);
    if (!spot) return null;

    // Far-out strikes quote noise, so the smile is cut to a moneyness window
    // around spot rather than plotting the whole ladder.
    const halfWidth = spot.spot * config.moneyness;
    const rows = strikeRows(expiry.contracts).filter(
      (r) => Math.abs(r.strike - spot.spot) <= halfWidth,
    );

    const calls: IvPoint[] = [];
    const puts: IvPoint[] = [];
    for (const row of rows) {
      // A contract with no market carries no IV; it is DROPPED, never plotted
      // at zero — one zero point flattens the curve onto the floor and makes
      // the whole card lie.
      const callIv = ivOf(row.call);
      if (callIv !== undefined) calls.push({ strike: row.strike, iv: callIv });
      const putIv = ivOf(row.put);
      if (putIv !== undefined) puts.push({ strike: row.strike, iv: putIv });
    }
    const points = [...calls, ...puts];
    if (points.length < 2) return null;

    const strikes = points.map((p) => p.strike);
    const ivs = points.map((p) => p.iv);
    return {
      calls,
      puts,
      quoted: points.length,
      minStrike: Math.min(...strikes),
      maxStrike: Math.max(...strikes),
      minIv: Math.min(...ivs),
      maxIv: Math.max(...ivs),
      iv30:
        typeof chain.iv30 === "number" && chain.iv30 > 0 ? chain.iv30 : null,
      spot,
      expiry,
      delay: delayLabel(chain.delayMinutes),
    };
  }, [chain, config.expiry, config.moneyness]);

  const ticker = chain?.symbol ?? tickerOf(config.symbol).toUpperCase();
  if (isLoading) return <FrameStatus loading>loading vol smile…</FrameStatus>;
  if (!view)
    return <FrameStatus>{emptyChainLabel(ticker, config.expiry)}</FrameStatus>;

  const { calls, puts, minStrike, maxStrike, minIv, maxIv, spot, expiry } =
    view;
  const W = 600;
  const H = 200;
  const padT = 6;
  const padB = 4;
  const plotH = H - padT - padB;
  const strikeSpan = maxStrike - minStrike || 1;
  const xAt = (strike: number) => ((strike - minStrike) / strikeSpan) * W;
  // A flat smile (every quote at one IV) would divide by zero; the floor keeps
  // it a straight line through the middle instead of NaN coordinates.
  const ivSpan = Math.max(maxIv - minIv, 1e-6);
  const yAt = (iv: number) => padT + plotH - ((iv - minIv) / ivSpan) * plotH;
  const linePoints = (points: IvPoint[]) =>
    points.map((p) => `${xAt(p.strike)},${yAt(p.iv)}`).join(" ");

  // Spot is usually inside the window by construction, but a wide gap between
  // the quoted strikes and spot can push it out — clamp so the rule stays on
  // the plot rather than drawing off-canvas.
  const spotX = Math.min(Math.max(xAt(spot.spot), 0), W);

  const series: Array<{ points: IvPoint[]; color: string; label: string }> = [
    { points: calls, color: CALL, label: "call" },
    { points: puts, color: PUT, label: "put" },
  ];

  // The hover target is an invisible column per strike, not the marks: the
  // points are 2px circles and the smile itself a 1.5px stroke, so neither is
  // reachable with a cursor. A strike is ONE place on the curve, so its column
  // carries both sides' IV rather than fighting itself for the pointer — and it
  // is laid out with `xAt`, the same mapping the marks use, so the readout can
  // never point at a strike the curve draws elsewhere.
  const ivByStrike = new Map<number, { call?: number; put?: number }>();
  for (const p of calls)
    ivByStrike.set(p.strike, { ...ivByStrike.get(p.strike), call: p.iv });
  for (const p of puts)
    ivByStrike.set(p.strike, { ...ivByStrike.get(p.strike), put: p.iv });
  const hitStrikes = [...ivByStrike.keys()].sort((a, b) => a - b);
  const hitColumns = hitStrikes.map((strike, i) => {
    const x = xAt(strike);
    const prev = hitStrikes[i - 1];
    const next = hitStrikes[i + 1];
    // Columns meet at the midpoint between neighbouring strikes, and the outer
    // two run to the edge, so every pixel of the plot belongs to exactly one.
    const left = prev === undefined ? 0 : (xAt(prev) + x) / 2;
    const right = next === undefined ? W : (x + xAt(next)) / 2;
    const sides = ivByStrike.get(strike);
    const rows: NonNullable<ChartTooltipContent["rows"]> = [];
    if (sides?.call !== undefined)
      rows.push({
        label: "call IV",
        value: formatPct(sides.call * 100, 1),
        color: CALL,
      });
    if (sides?.put !== undefined)
      rows.push({
        label: "put IV",
        value: formatPct(sides.put * 100, 1),
        color: PUT,
      });
    const content: ChartTooltipContent = {
      title: money.magnitude(strike),
      rows,
    };
    return { strike, x: left, width: Math.max(right - left, 0), content };
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="caption text-soft mb-1 flex justify-between gap-2">
        <span className="truncate">
          {ticker} vol smile · {expiryLabel(expiry.expiry, expiry.dte)}
        </span>
        <span className="shrink-0">
          <span style={{ color: CALL }}>call IV</span> ·{" "}
          <span style={{ color: PUT }}>put IV</span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="min-h-0 w-full flex-1"
      >
        <line
          x1={0}
          y1={padT + plotH}
          x2={W}
          y2={padT + plotH}
          style={{ stroke: "var(--color-disabled)" }}
          strokeWidth={1}
        />
        <line
          x1={spotX}
          y1={padT}
          x2={spotX}
          y2={padT + plotH}
          style={{ stroke: "var(--color-soft)" }}
          strokeWidth={1}
          strokeDasharray="4 3"
        />
        {series.map(({ points, color, label }) => (
          <g key={label}>
            <polyline
              points={linePoints(points)}
              fill="none"
              stroke={color}
              strokeWidth={1.5}
            />
            {points.map((p) => (
              <circle
                key={p.strike}
                cx={xAt(p.strike)}
                cy={yAt(p.iv)}
                r={2}
                fill={color}
              >
                <title>
                  {`${label} ${money.magnitude(p.strike)} · IV ${formatPct(p.iv * 100, 1)}`}
                </title>
              </circle>
            ))}
          </g>
        ))}
        {/* Last inside the svg so the columns sit above the marks they read. */}
        {hitColumns.map((col) => (
          <rect
            key={col.strike}
            x={col.x}
            y={0}
            width={col.width}
            height={H}
            fill="transparent"
            aria-label={chartTooltipLabel(col.content)}
            {...hoverTip(col.content)}
          />
        ))}
      </svg>

      <div className="caption text-soft mt-1 flex justify-between gap-2 tabular-nums">
        <span>{money.magnitude(minStrike)}</span>
        <span className="text-normal truncate">
          spot {money.price(spot.spot)}
          {spot.estimated && <span className="text-soft"> est.</span>} · IV{" "}
          {formatPct(minIv * 100, 0)}–{formatPct(maxIv * 100, 0)}
        </span>
        <span>{money.magnitude(maxStrike)}</span>
      </div>
      <div className="caption text-soft flex justify-between gap-2 tabular-nums">
        <span>
          ±{Math.round(config.moneyness * 100)}% of spot · {view.quoted} quoted
          {view.iv30 !== null && <> · IV30 {formatPct(view.iv30 * 100, 0)}</>}
        </span>
        <span className="truncate">{view.delay}</span>
      </div>
    </div>
  );
}

export const equityOptionsSmileFrame = defineFrame({
  ...equityOptionsSmileMeta,
  component: EquityOptionsSmile,
});
