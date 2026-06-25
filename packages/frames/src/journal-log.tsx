import { defineFrame, useDayStats, useMids } from "@zframes/core";
import { useMemo, useState } from "react";
import type { z } from "zod";
import { AssetLogo, tickerOf } from "./asset-logo";
import { interactiveSurface } from "./content-shared";
import {
  DOWN_COLOR,
  UP_COLOR,
  changeColor,
  formatChangePct,
  formatPrice,
} from "./format";
import {
  CLASS_LABEL,
  CLASS_RECORD,
  type Dir,
  type ThesisClass,
  dirColor,
  logCall,
} from "./journal-store";
import { journalLogMeta } from "./schemas";
import { scrollAreaClass } from "./ui";

// "xyz:*" asks Hyperliquid for that builder dex's whole equity universe; the
// bare call returns the crypto default dex. Same source as the ticker tape.
const EQUITY_DEX_WILDCARDS = ["xyz:*"];
const liveSymbols = (
  s: Record<string, { markPx: number; prevDayPx: number }>,
): string[] =>
  Object.entries(s)
    .filter(([, v]) => v.markPx > 0)
    .map(([sym]) => sym)
    .sort((a, b) => tickerOf(a).localeCompare(tickerOf(b)));

const schema = journalLogMeta.schema;

// The calm front door. A read = ticker (picked, at its live price) + direction
// + a reason (quick-pick, optional note) + how sure (a slider). The reason maps
// to a thesis class for you, so nothing about mechanism/kill-conditions is asked
// here — logging stays a few seconds, not a form.

// Quick-pick reasons → thesis class. Picking a reason is what tags the call.
const REASONS: { label: string; cls: ThesisClass }[] = [
  { label: "funding reset", cls: "mean-reversion" },
  { label: "oversold bounce", cls: "mean-reversion" },
  { label: "range reclaim", cls: "mean-reversion" },
  { label: "breakout", cls: "breakout" },
  { label: "momentum / trend", cls: "breakout" },
  { label: "positioning flush", cls: "positioning" },
  { label: "catalyst / earnings", cls: "macro" },
];

function JournalLog(_props: { config: z.output<typeof schema> }) {
  // Stocks-first: default to a HIP-3 equity, not crypto (matches the project's
  // stocks-first stance + the editor's FALLBACK_SYMBOLS order).
  const [sym, setSym] = useState<string>("xyz:TSLA");
  const [dir, setDir] = useState<Dir>("long");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [reasonIdx, setReasonIdx] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [conf, setConf] = useState(65);
  const [flash, setFlash] = useState(false);

  // The picker universe = the live, gradeable Hyperliquid markets (every HIP-3
  // equity + crypto), so any tradeable ticker is findable and anything not a
  // Hyperliquid market correctly isn't. Day-stats give the list + a 24h change;
  // the selected symbol also streams a live mid.
  const equityStats = useDayStats(EQUITY_DEX_WILDCARDS, 60_000);
  const cryptoStats = useDayStats(undefined, 60_000);
  const stats = useMemo(
    () => ({ ...cryptoStats, ...equityStats }),
    [cryptoStats, equityStats],
  );
  const universe = useMemo(
    () => [...liveSymbols(equityStats), ...liveSymbols(cryptoStats)],
    [equityStats, cryptoStats],
  );
  const liveMid = useMids([sym]);
  const priceOf = (s: string) => liveMid[s] ?? stats[s]?.markPx;
  const price = priceOf(sym);
  const change = stats[sym]?.changePct;

  const reason = reasonIdx != null ? REASONS[reasonIdx] : null;
  const mirror = reason ? CLASS_RECORD[reason.cls] : null;
  const mirrorGood = mirror ? mirror.hits / mirror.n >= 0.55 : true;

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? universe.filter((s) => tickerOf(s).toLowerCase().includes(q))
      : universe;
    return list.slice(0, 80);
  }, [query, universe]);

  function submit() {
    if (!reason) return;
    const claim = note.trim()
      ? `${reason.label} — ${note.trim()}`
      : reason.label;
    logCall({
      sym,
      dir,
      confidence: conf,
      claim,
      cls: reason.cls,
      entry: price,
    });
    setReasonIdx(null);
    setNote("");
    setFlash(true);
    window.setTimeout(() => setFlash(false), 1100);
  }

  return (
    <div className="flex h-full flex-col gap-2.5">
      {/* 1 · ticker picker with live price */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          className={`flex w-full items-center gap-2 px-2.5 py-2 ${interactiveSurface}`}
        >
          <AssetLogo symbol={sym} size={20} />
          <span className="body-md text-strong font-semibold">
            {tickerOf(sym)}
          </span>
          <span className="ml-auto flex items-baseline gap-2 tabular-nums">
            <span className="body-sm text-strong">
              {price != null ? formatPrice(price) : "…"}
            </span>
            {change != null && (
              <span className="caption" style={{ color: changeColor(change) }}>
                {formatChangePct(change)}
              </span>
            )}
          </span>
          <span className="caption text-disabled ml-1">
            {pickerOpen ? "▲" : "▼"}
          </span>
        </button>

        {pickerOpen && (
          <div
            className="absolute left-0 right-0 top-full z-50 mt-1 flex flex-col gap-1 rounded-md p-1.5 shadow-xl"
            style={{
              background: "hsl(248 32% 9%)",
              border: "1px solid var(--color-accent-line)",
            }}
          >
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search ticker…"
              className="body-sm w-full rounded bg-white/[0.05] px-2 py-1.5 text-strong outline-none placeholder:text-disabled"
            />
            <div className={`flex max-h-44 flex-col ${scrollAreaClass}`}>
              {matches.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setSym(s);
                    setPickerOpen(false);
                    setQuery("");
                  }}
                  className="flex items-center gap-2 rounded px-2 py-1.5 transition-colors hover:bg-white/[0.06]"
                >
                  <AssetLogo symbol={s} size={16} />
                  <span className="body-sm text-normal">{tickerOf(s)}</span>
                  <span className="caption text-soft ml-auto tabular-nums">
                    {priceOf(s) != null ? formatPrice(priceOf(s)!) : "—"}
                  </span>
                </button>
              ))}
              {matches.length === 0 && (
                <span className="caption text-disabled px-2 py-2">
                  {universe.length === 0
                    ? "loading universe…"
                    : "no Hyperliquid market for that"}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2 · direction */}
      <div className="flex items-center gap-2">
        {(["long", "short"] as const).map((d) => {
          const sel = dir === d;
          return (
            <button
              key={d}
              type="button"
              onClick={() => setDir(d)}
              className="body-sm flex-1 rounded-md py-1.5 font-bold uppercase tracking-wide transition-colors"
              style={{
                color: sel ? dirColor(d) : "var(--color-soft)",
                background: sel
                  ? "var(--color-surface)"
                  : "rgba(255,255,255,0.03)",
                border: `1px solid ${sel ? dirColor(d) + "55" : "transparent"}`,
              }}
            >
              {d}
            </button>
          );
        })}
      </div>

      {/* 3 · reason (quick-pick) + optional note */}
      <div className="flex flex-wrap gap-1.5">
        {REASONS.map((r, i) => {
          const sel = reasonIdx === i;
          return (
            <button
              key={r.label}
              type="button"
              onClick={() => setReasonIdx(sel ? null : i)}
              className="caption rounded-full px-2.5 py-1 transition-colors"
              style={{
                color: sel ? "var(--color-strong)" : "var(--color-soft)",
                background: sel
                  ? "hsl(var(--zf-accent-hue, 242) 80% 60% / 0.3)"
                  : "rgba(255,255,255,0.04)",
                border: `1px solid ${sel ? "var(--color-accent-line)" : "transparent"}`,
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder="add a note (optional)"
        className={`body-sm w-full rounded-md px-2.5 py-1.5 text-strong outline-none placeholder:text-disabled ${interactiveSurface}`}
      />

      {/* pre-decision mirror */}
      {mirror && (
        <span
          className="caption"
          style={{ color: mirrorGood ? UP_COLOR : DOWN_COLOR }}
        >
          your last {mirror.n} {CLASS_LABEL[reason!.cls]} calls: {mirror.hits}/
          {mirror.n}
          {mirrorGood ? " · your edge" : " · a leak — size down"}
        </span>
      )}

      {/* 4 · likelihood slider + log */}
      <div className="mt-auto flex items-center gap-2.5">
        <span className="caption text-disabled">how sure</span>
        <input
          type="range"
          min={50}
          max={95}
          step={1}
          value={conf}
          onChange={(e) => setConf(Number(e.target.value))}
          className="h-1 flex-1 cursor-pointer"
          style={{ accentColor: "hsl(var(--zf-accent-hue, 242) 85% 68%)" }}
        />
        <span className="body-sm text-strong w-9 tabular-nums">{conf}%</span>
        <button
          type="button"
          onClick={submit}
          disabled={!reason}
          className="caption rounded px-3 py-1.5 font-bold uppercase tracking-wide transition-opacity disabled:opacity-40"
          style={{
            color: "var(--color-strong)",
            background: flash
              ? UP_COLOR + "55"
              : "hsl(var(--zf-accent-hue, 242) 80% 60% / 0.35)",
          }}
        >
          {flash ? "logged ✓" : "log"}
        </button>
      </div>
    </div>
  );
}

export const journalLogFrame = defineFrame({
  ...journalLogMeta,
  component: JournalLog,
});
