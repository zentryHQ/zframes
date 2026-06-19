import { useEffect, useState } from "react";

/**
 * Strip the HIP-3 dex prefix to the bare ticker: "xyz:TSLA" → "TSLA",
 * "BTC" → "BTC". Hyperliquid namespaces HIP-3 market perps as `dex:SYMBOL`.
 */
export function tickerOf(symbol: string): string {
  const i = symbol.indexOf(":");
  return i === -1 ? symbol : symbol.slice(i + 1);
}

/** A namespaced symbol ("xyz:TSLA", "km:GOLD") is HIP-3; a bare one is crypto. */
function isHip3Market(symbol: string): boolean {
  return symbol.includes(":");
}

/**
 * Resolve a logo URL for a zframes symbol — keyless, no mapping table.
 * - HIP-3 market assets (xyz:TSLA, km:GOLD) → Parqet symbol logos.
 * - Bare crypto symbols (BTC) → CoinCap icon CDN (btc, eth, hype, sol…).
 *
 * Both 404 cleanly for unknown tickers (indices like US500, pre-IPO names,
 * long-tail coins); `<AssetLogo>` swaps in a monogram chip on error.
 *
 * Footgun: these are external runtime dependencies (like the unicorn
 * background and the Google Fonts import) — keyless but third-party. If a CDN
 * goes away the logos simply fall back to monograms; nothing breaks.
 */
export function assetLogoUrl(symbol: string): string {
  const ticker = tickerOf(symbol);
  return isHip3Market(symbol)
    ? `https://assets.parqet.com/logos/symbol/${encodeURIComponent(ticker)}?format=png`
    : `https://assets.coincap.io/assets/icons/${ticker.toLowerCase()}@2x.png`;
}

// Muted, evenly-spaced hues for the monogram fallback chip. Picked from a
// stable hash of the ticker so a given asset always gets the same colour.
const MONO_COLORS = [
  "#5b6cff",
  "#9b59ff",
  "#e0608f",
  "#e08a3c",
  "#3fb6a8",
  "#4f93e8",
  "#7a8c52",
  "#c0556b",
];

function monoColor(ticker: string): string {
  let hash = 0;
  for (let i = 0; i < ticker.length; i++)
    hash = (hash * 31 + ticker.charCodeAt(i)) | 0;
  return MONO_COLORS[Math.abs(hash) % MONO_COLORS.length];
}

/**
 * An asset's logo, fetched keyless from a public CDN with a coloured-monogram
 * fallback. HIP-3 logos sit on a white chip (many brand marks are dark and
 * would vanish on the dashboard's dark cards); crypto coin icons are already
 * full-colour circles and render bare.
 */
export function AssetLogo({
  symbol,
  size = 18,
  className = "",
}: {
  symbol: string;
  size?: number;
  className?: string;
}) {
  const ticker = tickerOf(symbol);
  const hip3Market = isHip3Market(symbol);
  const [failed, setFailed] = useState(false);

  // A new symbol gets a fresh shot at its logo (instances are reused as
  // watchlists change in the editor).
  useEffect(() => setFailed(false), [symbol]);

  const radius = hip3Market ? "rounded-[5px]" : "rounded-full";
  const box = { width: size, height: size } as const;

  if (failed) {
    return (
      <span
        aria-hidden
        className={`inline-flex shrink-0 items-center justify-center font-bold leading-none text-white ${radius} ${className}`}
        style={{
          ...box,
          background: monoColor(ticker),
          fontSize: Math.round(size * 0.42),
        }}
      >
        {ticker.slice(0, 2).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={assetLogoUrl(symbol)}
      width={size}
      height={size}
      alt=""
      aria-hidden
      draggable={false}
      loading="lazy"
      onError={() => setFailed(true)}
      className={`shrink-0 object-contain ${radius} ${hip3Market ? "bg-white p-px" : ""} ${className}`}
      style={box}
    />
  );
}
