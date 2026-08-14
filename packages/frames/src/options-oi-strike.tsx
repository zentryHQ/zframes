import { defineFrame, useMoney, useOptionsSummary } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import {
  type ChartTooltipContent,
  chartTooltipLabel,
  hoverTip,
  useHideTipOnUnmount,
} from "./chart-hover";
import { DOWN_COLOR, UP_COLOR, formatCompact, formatPct } from "./format";
import { optionsOiStrikeMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = optionsOiStrikeMeta.schema;

const CALL = UP_COLOR;
const PUT = DOWN_COLOR;

function OptionsOiStrike({ config }: { config: z.output<typeof schema> }) {
  const { summary, isLoading } = useOptionsSummary(config.currency);
  const money = useMoney();
  useHideTipOnUnmount();

  const view = useMemo(() => {
    if (!summary) return null;
    const spot = summary.underlyingPrice;
    const all = summary.nearestExpiry.strikes;
    if (all.length === 0) return null;
    // The N strikes nearest spot, then back to ascending order for the axis.
    const near = [...all]
      .sort((a, b) => Math.abs(a.strike - spot) - Math.abs(b.strike - spot))
      .slice(0, config.strikes)
      .sort((a, b) => a.strike - b.strike);
    const maxOi = Math.max(1, ...near.map((s) => Math.max(s.callOi, s.putOi)));
    return { near, maxOi, spot, expiry: summary.nearestExpiry.expiry };
  }, [summary, config.strikes]);

  if (isLoading) return <FrameStatus loading>loading strikes…</FrameStatus>;
  if (!view) return <FrameStatus>no options data yet</FrameStatus>;

  const { near, maxOi, spot, expiry } = view;
  const W = 600;
  const H = 200;
  const padT = 6;
  const padB = 4;
  const plotH = H - padT - padB;
  const n = near.length;
  const bandW = W / n;
  const barW = Math.max(2, bandW * 0.34);
  const bandCenter = (i: number) => i * bandW + bandW / 2;
  const barH = (oi: number) => (oi / maxOi) * plotH;

  // ATM marker x, interpolated across the band whose strikes bracket spot.
  let atmX: number | null = null;
  if (spot <= near[0].strike) atmX = bandCenter(0);
  else if (spot >= near[n - 1].strike) atmX = bandCenter(n - 1);
  else {
    for (let i = 0; i < n - 1; i++) {
      if (spot >= near[i].strike && spot <= near[i + 1].strike) {
        const span = near[i + 1].strike - near[i].strike || 1;
        const frac = (spot - near[i].strike) / span;
        atmX = bandCenter(i) + frac * (bandCenter(i + 1) - bandCenter(i));
        break;
      }
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="caption text-soft mb-1 flex justify-between">
        <span>OI by strike · {expiry}</span>
        <span>
          <span style={{ color: CALL }}>calls</span> ·{" "}
          <span style={{ color: PUT }}>puts</span>
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
        {near.map((s, i) => {
          const cx = bandCenter(i);
          const cH = barH(s.callOi);
          const pH = barH(s.putOi);
          return (
            <g key={s.strike}>
              <rect
                x={cx - barW - 1}
                y={padT + plotH - cH}
                width={barW}
                height={cH}
                fill={CALL}
              />
              <rect
                x={cx + 1}
                y={padT + plotH - pH}
                width={barW}
                height={pH}
                fill={PUT}
              />
            </g>
          );
        })}
        {atmX !== null && (
          <line
            x1={atmX}
            y1={padT}
            x2={atmX}
            y2={padT + plotH}
            style={{ stroke: "var(--color-soft)" }}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}
        {/* Hover targets, last so they sit above the bars: one invisible
            full-height rect per STRIKE, spanning that strike's whole band. The
            hover is a strike column rather than a single bar, because a strike
            with almost no open interest draws a ~1px bar nobody can point at —
            and that near-empty strike is exactly the reading. */}
        {near.map((s, i) => {
          const awayPct = ((s.strike - spot) / spot) * 100;
          const content: ChartTooltipContent = {
            title: money.magnitude(s.strike),
            rows: [
              { label: "calls", value: formatCompact(s.callOi), color: CALL },
              { label: "puts", value: formatCompact(s.putOi), color: PUT },
            ],
            // Below the precision formatPct prints, "0.00% above spot" would be
            // a distinction without a difference.
            footer:
              Math.abs(awayPct) < 0.005
                ? "at spot"
                : `${formatPct(Math.abs(awayPct))} ${
                    awayPct > 0 ? "above" : "below"
                  } spot`,
          };
          return (
            <rect
              key={s.strike}
              x={i * bandW}
              y={0}
              width={bandW}
              height={H}
              fill="transparent"
              aria-label={chartTooltipLabel(content)}
              {...hoverTip(content)}
            />
          );
        })}
      </svg>

      <div className="caption text-soft mt-1 flex justify-between tabular-nums">
        <span>{money.magnitude(near[0].strike)}</span>
        <span className="text-normal">spot {money.price(spot)}</span>
        <span>{money.magnitude(near[n - 1].strike)}</span>
      </div>
    </div>
  );
}

export const optionsOiStrikeFrame = defineFrame({
  ...optionsOiStrikeMeta,
  component: OptionsOiStrike,
  // The card must say which book it reads — an anonymous "OI by Strike" could
  // be BTC or ETH.
  titleContent: ({ config }) => <>{config.currency} · OI by Strike</>,
});
