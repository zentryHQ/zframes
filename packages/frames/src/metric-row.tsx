import type { ReactNode } from "react";

/**
 * One labelled metric row — title + optional meta on the left, a right-aligned
 * numeric readout — shared by the analyst frames (rates board, treasury
 * auctions, and any future list of "name → value" rows). One border/padding
 * rhythm and one value treatment so the macro family reads as one system.
 *
 * Both text lines ellipsise, so both carry a native `title` with the full
 * string. Without it the clipped text was unreachable by ANY means — no hover,
 * no expansion, no click — across the 25 frames that use this row, and a
 * prediction market whose label IS the question loses the question. `MoverRow`
 * one file away already did this.
 */
export function MetricRow({
  label,
  meta,
  value,
  absent,
}: {
  label: ReactNode;
  meta?: ReactNode;
  value: ReactNode;
  /**
   * The row has no figure this period — an em dash, not a number. Greys it, so
   * an absent reading does not sit in the same confident ink as a real one
   * (`CardHeader.Value` and `Stat.Value` take the same flag).
   */
  absent?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 border-b border-white/[0.06] py-1.5 last:border-b-0">
      <div className="min-w-0">
        <div
          className="body-sm text-normal truncate font-semibold"
          title={tooltipOf(label)}
        >
          {label}
        </div>
        {meta !== undefined && meta !== null && (
          <div className="caption text-soft truncate" title={tooltipOf(meta)}>
            {meta}
          </div>
        )}
      </div>
      <div
        className={`metric-sm shrink-0 ${
          absent ? "text-disabled" : "text-strong"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

/** `title` takes a string, so only a text node can be recovered from a clipped
 *  line; a caller passing JSX gets no tooltip rather than "[object Object]". */
function tooltipOf(node: ReactNode): string | undefined {
  return typeof node === "string" || typeof node === "number"
    ? String(node)
    : undefined;
}
