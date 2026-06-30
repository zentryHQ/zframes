import { useMemo } from "react";
import { useDayStats, useMids } from "@zframes/core";
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
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
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

  const mids = useMids(symbols);

  if (symbols.length === 0) return null;

  // Keep a steady glide regardless of how many symbols are on the wire.
  const duration = Math.max(40, symbols.length * 2.2);

  const renderItems = (prefix: string) =>
    symbols.map((sym) => {
      const stat = stats[sym];
      if (!stat) return null;
      const price = mids[sym] ?? stat.markPx;
      const color = stat.changePct >= 0 ? UP : DOWN;
      const sign = stat.changePct >= 0 ? "+" : "";
      return (
        <span key={`${prefix}-${sym}`} className="zf-tape-item">
          <AssetLogo symbol={sym} size={15} />
          <span className="zf-tape-sym">{tickerOf(sym)}</span>
          <span className="zf-tape-px">{formatPrice(price)}</span>
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
