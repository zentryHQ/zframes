import { useEffect, useMemo, useRef } from "react";
import { useDayStats, useProviderFor } from "@zframes/core";
// Import from the leaf module, not the package index — the index statically
// pulls in all 76 frame components, which would defeat the per-frame code-split
// (the runtime registry loads components lazily via @zframes/frames/lazy).
import { AssetLogo, tickerOf } from "@zframes/frames/asset-logo";

// A pinned Bloomberg-style tape across the viewport bottom, surfacing the live
// Hyperliquid universe with logos. It's host chrome (not a frame): always
// visible, sits outside the editable grid, and lives inside <FramesProvider> so
// it shares the app's provider instances (no extra WebSocket). The spec never
// declares it.

// Stocks first: HIP-3 equity perps live on builder dexes; "xyz:*" asks the
// provider for that dex's whole universe (the default getDayStats() call only
// returns the crypto default dex).
const EQUITY_DEX_WILDCARDS = ["xyz:*"];

// Cap the DOM at a sane bound — equities + the ~190-symbol crypto universe,
// and the track is duplicated for the seamless loop (~2× nodes).
const MAX_SYMBOLS = 200;

// Resolve the semantic gain/loss colors (spec.theme.upColor/downColor) the host
// pushes to :root, with the original green/red as the fallback. Applied via
// inline style (where var() resolves), so the ticker follows a custom pair.
const UP = "var(--zf-up, #3fd08f)";
const DOWN = "var(--zf-down, #ff6b81)";

function formatPrice(value: number): string {
  if (value >= 1000)
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (value >= 1)
    return `$${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  return `$${value.toPrecision(4)}`;
}

const TAPE_CSS = `
.zf-tape {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 30;
  height: 36px;
  display: flex;
  align-items: center;
  overflow: hidden;
  background: rgba(10, 11, 17, 0.86);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-family: var(--font-dmsans, system-ui, sans-serif);
  -webkit-mask-image: linear-gradient(90deg, transparent, #000 2.5%, #000 97.5%, transparent);
  mask-image: linear-gradient(90deg, transparent, #000 2.5%, #000 97.5%, transparent);
}
.zf-tape-track {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  white-space: nowrap;
  will-change: transform;
  animation-name: zf-tape-scroll;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
.zf-tape:hover .zf-tape-track { animation-play-state: paused; }
.zf-tape-item {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 15px;
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 12px;
  line-height: 1;
}
.zf-tape-sym { font-weight: 700; color: rgba(255, 255, 255, 0.92); letter-spacing: 0.02em; }
.zf-tape-px { color: rgba(255, 255, 255, 0.58); font-variant-numeric: tabular-nums; }
.zf-tape-chg { font-weight: 600; font-variant-numeric: tabular-nums; }
@keyframes zf-tape-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .zf-tape { overflow-x: auto; -webkit-mask-image: none; mask-image: none; }
  .zf-tape-track { animation: none; }
}
`;

export function TickerTape() {
  const equityStats = useDayStats(EQUITY_DEX_WILDCARDS, 60_000);
  const cryptoStats = useDayStats(undefined, 60_000);

  const { symbols, stats } = useMemo(() => {
    const live = (s: Record<string, { markPx: number; prevDayPx: number }>) =>
      Object.entries(s)
        .filter(([, v]) => v.markPx > 0 && v.prevDayPx > 0)
        .map(([sym]) => sym)
        .sort();
    // Stocks first, then crypto fills the remaining budget. Each list is sorted
    // alphabetically so the tape doesn't reshuffle on every poll.
    const ordered = [...live(equityStats), ...live(cryptoStats)].slice(
      0,
      MAX_SYMBOLS,
    );
    return { symbols: ordered, stats: { ...cryptoStats, ...equityStats } };
  }, [equityStats, cryptoStats]);

  const provider = useProviderFor("quote-stream");
  const trackRef = useRef<HTMLDivElement>(null);

  // Live prices are streamed straight into the DOM, NOT through React state.
  // The Hyperliquid allMids socket fans out several times a second; routing that
  // through useMids() re-rendered this ~400-node marquee on every tick, which
  // repainted the animated track and stuttered the scroll (worse in active
  // markets — the "sometimes laggy"). Instead we keep the latest mids in a ref
  // and flush only the price text on a slow interval, so React reconciles the
  // track solely when the symbol set changes (the 60s day-stats poll). The
  // change %/color come from `stats`, not mids, so price text is all that moves.
  const symbolsKey = symbols.join(",");
  useEffect(() => {
    const root = trackRef.current;
    if (!root || !provider?.subscribeMids || symbols.length === 0) return;
    let latest: Record<string, number> = {};
    const flush = () => {
      for (const el of root.querySelectorAll<HTMLElement>("[data-zf-px]")) {
        const px = latest[el.dataset.zfPx ?? ""];
        if (px === undefined) continue;
        const next = formatPrice(px);
        // Skip the write when unchanged so an idle tape never reflows.
        if (el.textContent !== next) el.textContent = next;
      }
    };
    const unsubscribe = provider.subscribeMids((all) => {
      latest = all;
    }, symbols);
    // First flush replaces the day-stats fallback promptly; then a slow cadence,
    // decoupled from the WS push rate, keeps it live without ever competing with
    // the scroll animation.
    const first = window.setTimeout(flush, 400);
    const interval = window.setInterval(flush, 1500);
    return () => {
      unsubscribe();
      clearTimeout(first);
      clearInterval(interval);
    };
    // symbols is derived from symbolsKey; listing the key keeps the effect from
    // re-subscribing on every render (symbols is a fresh array each time).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, symbolsKey]);

  if (symbols.length === 0) return null;

  // Keep a steady glide regardless of how many symbols are on the wire.
  const duration = Math.max(40, symbols.length * 2.2);

  const renderItems = (prefix: string) =>
    symbols.map((sym) => {
      const stat = stats[sym];
      if (!stat) return null;
      const color = stat.changePct >= 0 ? UP : DOWN;
      const sign = stat.changePct >= 0 ? "+" : "";
      return (
        <span key={`${prefix}-${sym}`} className="zf-tape-item">
          <AssetLogo symbol={sym} size={15} />
          <span className="zf-tape-sym">{tickerOf(sym)}</span>
          {/* data-zf-px lets the mids effect write the live price straight to
              the DOM without re-rendering the track; seeds with the day-stats
              mark price. */}
          <span className="zf-tape-px" data-zf-px={sym}>
            {formatPrice(stat.markPx)}
          </span>
          <span className="zf-tape-chg" style={{ color }}>
            {sign}
            {stat.changePct.toFixed(2)}%
          </span>
        </span>
      );
    });

  return (
    <>
      <style>{TAPE_CSS}</style>
      <div className="zf-tape" aria-label="live ticker tape">
        {/* Two identical tracks; the loop translates by -50% so the second
            copy seamlessly takes over. The duplicate is decorative. */}
        <div
          ref={trackRef}
          className="zf-tape-track"
          style={{ animationDuration: `${duration}s` }}
        >
          {renderItems("a")}
          <span aria-hidden style={{ display: "contents" }}>
            {renderItems("b")}
          </span>
        </div>
      </div>
    </>
  );
}
