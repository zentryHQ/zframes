import type { ReactNode } from "react";

/**
 * One labelled metric row — title + optional meta on the left, a right-aligned
 * numeric readout — shared by the analyst frames (rates board, treasury
 * auctions, and any future list of "name → value" rows). One border/padding
 * rhythm and one value treatment so the macro family reads as one system.
 */
export function MetricRow({
  label,
  meta,
  value,
}: {
  label: ReactNode;
  meta?: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-white/[0.06] py-1.5 last:border-b-0">
      <div className="min-w-0">
        <div className="body-sm text-normal truncate font-semibold">{label}</div>
        {meta !== undefined && meta !== null && (
          <div className="caption text-soft truncate">{meta}</div>
        )}
      </div>
      <div className="metric-sm text-strong shrink-0">{value}</div>
    </div>
  );
}
