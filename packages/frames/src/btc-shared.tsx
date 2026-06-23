import type { ReactNode } from "react";
import { DOWN_COLOR, UP_COLOR } from "./format";

/**
 * The fee-rate ramp shared by btc-fees and btc-mempool: warm = urgent / high
 * sat/vB, cool = patient / cheap. The endpoints are the shared up/down semantic
 * pair so the bitcoin frames stay in step with the rest of the dashboard; the
 * three mid-tones bridge them. One ramp, one source — defined once here.
 */
export const FEE_RAMP = [
  DOWN_COLOR, // ≥100 sat/vB — urgent
  "#ffa057",
  "#ffd166",
  "#9bd45f",
  UP_COLOR, //  <5 sat/vB — cheap
] as const;

/** Tint a fee rate (sat/vB) by magnitude using {@link FEE_RAMP}. */
export function feeRateColor(satVb: number): string {
  if (satVb >= 100) return FEE_RAMP[0];
  if (satVb >= 50) return FEE_RAMP[1];
  if (satVb >= 20) return FEE_RAMP[2];
  if (satVb >= 5) return FEE_RAMP[3];
  return FEE_RAMP[4];
}

/**
 * A fee tile — colored value over a `sat/vB` unit over a caption — shared by
 * btc-fees (priority tiers) and btc-mempool (projected blocks) so the two read
 * as one component: one radius, one number size, one fee-tinted surface. The
 * caller supplies outer sizing via `className`.
 */
export function FeePill({
  color,
  value,
  caption,
  className = "",
}: {
  color: string;
  value: ReactNode;
  caption: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-lg px-2 py-2 ${className}`}
      style={{ background: `${color}14`, border: `1px solid ${color}33` }}
    >
      <span className="metric-md leading-none" style={{ color }}>
        {value}
      </span>
      <span className="caption text-soft mt-0.5">sat/vB</span>
      <span className="caption text-soft mt-1 text-center">{caption}</span>
    </div>
  );
}
