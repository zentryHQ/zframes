import { AssetLogo, tickerOf } from "./asset-logo";
import { interactiveSurface } from "./content-shared";
import { DOWN_COLOR, UP_COLOR, formatChangePct, formatPrice } from "./format";
import {
  CLASS_LABEL,
  type Dir,
  type OpenCall,
  type ResolvedCall,
  attribution,
  callReturn,
  dirColor,
  targetFrac,
  timeUntil,
} from "./journal-store";

// Presentational atoms shared across the journal frame family. Pure display —
// all state lives in journal-store.

export function DirChip({ dir }: { dir: Dir }) {
  return (
    <span
      className="caption rounded px-1.5 py-0.5 font-bold uppercase tracking-wide"
      style={{ color: dirColor(dir), background: "var(--color-surface)" }}
    >
      {dir}
    </span>
  );
}

export function SymbolBadge({ symbol }: { symbol: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <AssetLogo symbol={symbol} size={16} />
      <span className="body-sm text-strong font-semibold">
        {tickerOf(symbol)}
      </span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className={`flex flex-col gap-0.5 px-2.5 py-2 ${interactiveSurface}`}>
      <span className="caption text-soft uppercase tracking-wide">{label}</span>
      <span
        className="metric-sm font-bold leading-none tabular-nums"
        style={{ color: color ?? "var(--color-strong)" }}
      >
        {value}
      </span>
      {sub && <span className="caption text-disabled">{sub}</span>}
    </div>
  );
}

export function OpenCard({
  call,
  now,
  mid,
  onClose,
}: {
  call: OpenCall;
  now: number;
  /** Live mid price; undefined while the quote is still loading. */
  mid?: number;
  /** Close the call now (grade at the current price) — optional. */
  onClose?: () => void;
}) {
  const color = dirColor(call.dir);
  const ret = mid != null ? callReturn(call, mid) : null;
  const frac = mid != null ? targetFrac(call, mid) : 0;
  const retColor =
    ret == null ? "var(--color-soft)" : ret >= 0 ? UP_COLOR : DOWN_COLOR;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
      <div className="flex items-center gap-2">
        <DirChip dir={call.dir} />
        <SymbolBadge symbol={call.symbol} />
        <span className="caption text-disabled">·</span>
        <span className="caption text-soft tabular-nums">
          {call.confidence}%
        </span>
        {/* live unrealized return — the grade, in progress */}
        <span
          className="body-sm ml-auto font-bold tabular-nums"
          style={{ color: retColor }}
        >
          {ret == null ? "…" : formatChangePct(ret)}
        </span>
      </div>
      <p className="body-sm text-normal leading-snug">{call.claim}</p>
      {/* entry → target track, marker at the live price */}
      <div className="flex flex-col gap-1">
        <div className="relative h-1.5 rounded-full bg-white/[0.06]">
          <div
            className="absolute inset-y-0 left-0 rounded-full opacity-40"
            style={{ width: `${frac * 100}%`, background: color }}
          />
          <span
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-black/30"
            style={{ left: `${frac * 100}%`, background: color }}
          />
        </div>
        <div className="caption text-disabled flex items-center justify-between tabular-nums">
          <span>entry {formatPrice(call.entry)}</span>
          <span className="text-soft">
            now {mid != null ? formatPrice(mid) : "…"}
          </span>
          <span>target {formatPrice(call.target)}</span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="caption text-disabled uppercase tracking-wide">
          {CLASS_LABEL[call.cls]}
        </span>
        <span className="caption text-soft flex items-center gap-2 tabular-nums">
          {timeUntil(call.resolveAt - now)}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              disabled={mid == null}
              className="caption rounded px-1.5 py-0.5 uppercase tracking-wide transition-opacity hover:text-strong disabled:opacity-40"
              style={{ background: "var(--color-surface)" }}
            >
              close
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

export function ResolvedCard({ call }: { call: ResolvedCall }) {
  const verdictColor = call.verdict === "hit" ? UP_COLOR : DOWN_COLOR;
  // Mechanism axis only when we have it (seeded examples). Return-graded calls
  // show the hard number; the softer "did the thesis play out" comes later.
  const attr = call.signalsFired === undefined ? null : attribution(call);
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-white/[0.04] px-3 py-2">
      <div className="flex items-center gap-2">
        <DirChip dir={call.dir} />
        <SymbolBadge symbol={call.symbol} />
        <span className="caption text-soft tabular-nums">
          {call.confidence}%
        </span>
        <span
          className="body-sm ml-auto font-bold tabular-nums"
          style={{ color: verdictColor }}
        >
          {formatChangePct(call.returnPct)}
        </span>
      </div>
      <p className="body-sm text-soft leading-snug">{call.claim}</p>
      {attr ? (
        <span className="caption font-medium" style={{ color: attr.color }}>
          {attr.glyph} {attr.label}
        </span>
      ) : (
        <span className="caption text-disabled uppercase tracking-wide">
          {call.verdict} · graded by return
        </span>
      )}
    </div>
  );
}

export function JournalEmpty({ children }: { children: React.ReactNode }) {
  return (
    <div className="body-sm text-soft flex h-full min-h-0 items-center justify-center text-center">
      {children}
    </div>
  );
}
