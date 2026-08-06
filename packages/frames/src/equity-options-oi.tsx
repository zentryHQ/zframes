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
  nearestStrikes,
  oiOf,
  putCallOiRatio,
  resolveSpot,
  selectExpiry,
  spotBandIndex,
  strikeRows,
} from "./equity-options-shared";
import { formatCompact } from "./format";
import { equityOptionsOiMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = equityOptionsOiMeta.schema;

function EquityOptionsOi({ config }: { config: z.output<typeof schema> }) {
  const { data: chain, isLoading } = useOptionsChain(config.symbol);
  const money = useMoney();

  // A chain is thousands of contracts; everything below is derived once per
  // poll, never per render.
  const view = useMemo(() => {
    if (!chain) return null;
    const expiry = selectExpiry(chain, config.expiry);
    if (!expiry) return null;
    const spot = resolveSpot(chain, expiry.contracts);
    if (!spot) return null;
    const rows = nearestStrikes(
      strikeRows(expiry.contracts),
      spot.spot,
      config.strikes,
    );
    if (rows.length === 0) return null;
    const maxOi = Math.max(
      1,
      ...rows.map((r) => Math.max(oiOf(r.call), oiOf(r.put))),
    );
    return {
      rows,
      maxOi,
      spot,
      expiry,
      delay: delayLabel(chain.delayMinutes),
      // Chain-wide, not just this expiry — the ratio is a read on the whole
      // book's positioning, which is how it's quoted everywhere.
      ratio: putCallOiRatio(chain.contracts),
    };
  }, [chain, config.expiry, config.strikes]);

  const ticker = chain?.symbol ?? tickerOf(config.symbol).toUpperCase();
  if (isLoading)
    return <FrameStatus loading>loading option chain…</FrameStatus>;
  if (!view)
    return <FrameStatus>{emptyChainLabel(ticker, config.expiry)}</FrameStatus>;

  const { rows, maxOi, spot, expiry, ratio, delay } = view;
  const W = 600;
  const H = 200;
  const padT = 6;
  const padB = 4;
  const plotH = H - padT - padB;
  const n = rows.length;
  const bandW = W / n;
  const barW = Math.max(2, bandW * 0.34);
  const bandCenter = (i: number) => i * bandW + bandW / 2;
  const barH = (oi: number) => (oi / maxOi) * plotH;

  const spotBand = spotBandIndex(
    rows.map((r) => r.strike),
    spot.spot,
  );
  const atmX = spotBand === null ? null : bandCenter(spotBand);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="caption text-soft mb-1 flex justify-between gap-2">
        <span className="truncate">
          {ticker} OI · {expiryLabel(expiry.expiry, expiry.dte)}
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
          y1={padT + plotH}
          x2={W}
          y2={padT + plotH}
          style={{ stroke: "var(--color-disabled)" }}
          strokeWidth={1}
        />
        {rows.map((row, i) => {
          const cx = bandCenter(i);
          const callOi = oiOf(row.call);
          const putOi = oiOf(row.put);
          const cH = barH(callOi);
          const pH = barH(putOi);
          return (
            <g key={row.strike}>
              <title>
                {`${money.magnitude(row.strike)} · calls ${formatCompact(callOi)} · puts ${formatCompact(putOi)}`}
              </title>
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
      </svg>

      <div className="caption text-soft mt-1 flex justify-between gap-2 tabular-nums">
        <span>{money.magnitude(rows[0].strike)}</span>
        <span className="text-normal truncate">
          spot {money.price(spot.spot)}
          {spot.estimated && <span className="text-soft"> est.</span>}
        </span>
        <span>{money.magnitude(rows[n - 1].strike)}</span>
      </div>
      <div className="caption text-soft flex justify-between gap-2 tabular-nums">
        <span>
          {ratio !== null ? (
            <>
              put/call OI{" "}
              <span className="text-normal">{ratio.toFixed(2)}</span>
            </>
          ) : (
            `${formatCompact(expiry.totalOi)} contracts`
          )}
        </span>
        <span className="truncate">{delay}</span>
      </div>
    </div>
  );
}

export const equityOptionsOiFrame = defineFrame({
  ...equityOptionsOiMeta,
  component: EquityOptionsOi,
});
