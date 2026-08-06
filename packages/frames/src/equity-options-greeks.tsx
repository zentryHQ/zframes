import { defineFrame, useMoney, useOptionsChain } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import { tickerOf } from "./asset-logo";
import {
  CALL,
  PUT,
  delayLabel,
  emptyChainLabel,
  expiryLabel,
  greekOf,
  nearestStrikes,
  resolveSpot,
  selectExpiry,
  spotBandIndex,
  strikeRows,
} from "./equity-options-shared";
import { equityOptionsGreeksMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = equityOptionsGreeksMeta.schema;

/** Greeks live on wildly different scales — delta runs to 1, gamma to a few
 *  thousandths — so precision follows the ladder's own magnitude rather than a
 *  fixed dp that would print gamma as "0.00" on every strike. */
function formatGreek(value: number, scale: number): string {
  const dp = scale >= 10 ? 1 : scale >= 1 ? 2 : scale >= 0.1 ? 3 : 4;
  return value.toFixed(dp);
}

function EquityOptionsGreeks({ config }: { config: z.output<typeof schema> }) {
  const { data: chain, isLoading } = useOptionsChain(config.symbol);
  const money = useMoney();

  const view = useMemo(() => {
    if (!chain) return null;
    const expiry = selectExpiry(chain, config.expiry);
    if (!expiry) return null;
    const spot = resolveSpot(chain, expiry.contracts);
    if (!spot) return null;

    const ladder = nearestStrikes(
      strikeRows(expiry.contracts),
      spot.spot,
      config.strikes,
    )
      .map((row) => ({
        strike: row.strike,
        // Undefined means the feed published no greek for that leg. A value of
        // ~0 is NOT missing — that is what a deep-OTM contract really carries.
        call: greekOf(row.call, config.greek),
        put: greekOf(row.put, config.greek),
      }))
      .filter((r) => r.call !== undefined || r.put !== undefined);
    if (ladder.length === 0) return null;

    const values = ladder.flatMap((r) =>
      [r.call, r.put].filter((v): v is number => v !== undefined),
    );
    // Domain spans zero on purpose: delta is signed (puts negative) and theta
    // is normally all-negative, so the baseline has to sit wherever zero falls
    // rather than at the bottom of the plot.
    const dMin = Math.min(0, ...values);
    const dMax = Math.max(0, ...values);
    const scale = Math.max(...values.map(Math.abs));

    let peak = ladder[0];
    let peakSize = -1;
    for (const row of ladder) {
      const size = Math.abs(row.call ?? 0) + Math.abs(row.put ?? 0);
      if (size > peakSize) {
        peakSize = size;
        peak = row;
      }
    }

    return {
      ladder,
      dMin,
      dMax,
      scale,
      peakStrike: peak.strike,
      spot,
      expiry,
      delay: delayLabel(chain.delayMinutes),
    };
  }, [chain, config.expiry, config.greek, config.strikes]);

  const ticker = chain?.symbol ?? tickerOf(config.symbol).toUpperCase();
  if (isLoading)
    return <FrameStatus loading>loading {config.greek}…</FrameStatus>;
  if (!view)
    return <FrameStatus>{emptyChainLabel(ticker, config.expiry)}</FrameStatus>;

  const { ladder, dMin, dMax, scale, peakStrike, spot, expiry, delay } = view;
  const W = 600;
  const H = 200;
  const padT = 6;
  const padB = 4;
  const plotH = H - padT - padB;
  const n = ladder.length;
  const bandW = W / n;
  const barW = Math.max(2, bandW * 0.34);
  const bandCenter = (i: number) => i * bandW + bandW / 2;
  // Floor the span so an all-zero ladder collapses onto the baseline instead of
  // producing NaN coordinates.
  const span = Math.max(dMax - dMin, 1e-9);
  const yAt = (value: number) => padT + plotH - ((value - dMin) / span) * plotH;
  const zeroY = yAt(0);

  const spotBand = spotBandIndex(
    ladder.map((r) => r.strike),
    spot.spot,
  );
  const atmX = spotBand === null ? null : bandCenter(spotBand);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="caption text-soft mb-1 flex justify-between gap-2">
        <span className="truncate">
          {ticker} {config.greek} · {expiryLabel(expiry.expiry, expiry.dte)}
        </span>
        <span className="shrink-0">
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
          y1={zeroY}
          x2={W}
          y2={zeroY}
          style={{ stroke: "var(--color-disabled)" }}
          strokeWidth={1}
        />
        {ladder.map((row, i) => {
          const cx = bandCenter(i);
          return (
            <g key={row.strike}>
              <title>
                {`${money.magnitude(row.strike)} · call ${
                  row.call === undefined ? "—" : formatGreek(row.call, scale)
                } · put ${
                  row.put === undefined ? "—" : formatGreek(row.put, scale)
                }`}
              </title>
              {row.call !== undefined && (
                <rect
                  x={cx - barW - 1}
                  y={Math.min(zeroY, yAt(row.call))}
                  width={barW}
                  height={Math.abs(yAt(row.call) - zeroY)}
                  fill={CALL}
                />
              )}
              {row.put !== undefined && (
                <rect
                  x={cx + 1}
                  y={Math.min(zeroY, yAt(row.put))}
                  width={barW}
                  height={Math.abs(yAt(row.put) - zeroY)}
                  fill={PUT}
                />
              )}
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
      </svg>

      <div className="caption text-soft mt-1 flex justify-between gap-2 tabular-nums">
        <span>{money.magnitude(ladder[0].strike)}</span>
        <span className="text-normal truncate">
          spot {money.price(spot.spot)}
          {spot.estimated && <span className="text-soft"> est.</span>}
        </span>
        <span>{money.magnitude(ladder[n - 1].strike)}</span>
      </div>
      <div className="caption text-soft flex justify-between gap-2 tabular-nums">
        <span className="truncate">
          peak {config.greek} at{" "}
          <span className="text-normal">{money.magnitude(peakStrike)}</span> ·
          range {formatGreek(dMin, scale)} to {formatGreek(dMax, scale)}
        </span>
        <span className="shrink-0 truncate">{delay}</span>
      </div>
    </div>
  );
}

export const equityOptionsGreeksFrame = defineFrame({
  ...equityOptionsGreeksMeta,
  component: EquityOptionsGreeks,
});
