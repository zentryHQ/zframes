import { defineFrame, useOptionsSummary } from "@zframes/core";
import { useMemo } from "react";
import type { z } from "zod";
import {
  DOWN_COLOR,
  UP_COLOR,
  formatCompact,
  formatPct,
  formatPrice,
} from "./format";
import { optionsVolSmileMeta } from "./schemas";
import { FrameStatus } from "./ui";

const schema = optionsVolSmileMeta.schema;

const CALL = UP_COLOR;
const PUT = DOWN_COLOR;

function OptionsVolSmile({ config }: { config: z.output<typeof schema> }) {
  const { summary, isLoading } = useOptionsSummary(config.currency);

  const view = useMemo(() => {
    if (!summary) return null;
    const strikes = [...summary.nearestExpiry.strikes]
      .filter((s) => s.callIv !== undefined || s.putIv !== undefined)
      .sort((a, b) => a.strike - b.strike);
    if (strikes.length < 2) return null;
    const ivs = strikes
      .flatMap((s) => [s.callIv, s.putIv])
      .filter((v): v is number => v !== undefined);
    if (ivs.length === 0) return null;
    return {
      strikes,
      minIv: Math.min(...ivs),
      maxIv: Math.max(...ivs),
      spot: summary.underlyingPrice,
      expiry: summary.nearestExpiry.expiry,
    };
  }, [summary]);

  if (isLoading) return <FrameStatus loading>loading vol smile…</FrameStatus>;
  if (!view) return <FrameStatus>no options data yet</FrameStatus>;

  const { strikes, minIv, maxIv, spot, expiry } = view;
  const W = 600;
  const H = 200;
  const padT = 6;
  const padB = 4;
  const plotH = H - padT - padB;
  const first = strikes[0].strike;
  const last = strikes[strikes.length - 1].strike;
  const span = last - first || 1;
  const xAt = (strike: number) => ((strike - first) / span) * W;
  const ivSpan = Math.max(maxIv - minIv, 1e-6);
  const yAt = (iv: number) => padT + plotH - ((iv - minIv) / ivSpan) * plotH;

  const linePoints = (key: "callIv" | "putIv") =>
    strikes
      .filter((s) => s[key] !== undefined)
      .map((s) => `${xAt(s.strike)},${yAt(s[key]!)}`)
      .join(" ");
  const ivRange = `${formatPct(minIv, 0)}–${formatPct(maxIv, 0)}`;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="caption text-soft mb-1 flex justify-between">
        <span>vol smile · {expiry}</span>
        <span>
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
        <polyline
          points={linePoints("callIv")}
          fill="none"
          stroke={CALL}
          strokeWidth={1.5}
        />
        <polyline
          points={linePoints("putIv")}
          fill="none"
          stroke={PUT}
          strokeWidth={1.5}
        />
      </svg>

      <div className="caption text-soft mt-1 flex justify-between tabular-nums">
        <span>{formatCompact(first)}</span>
        <span className="text-normal">
          spot {formatPrice(spot)} · {ivRange} IV
        </span>
        <span>{formatCompact(last)}</span>
      </div>
    </div>
  );
}

export const optionsVolSmileFrame = defineFrame({
  ...optionsVolSmileMeta,
  component: OptionsVolSmile,
});
