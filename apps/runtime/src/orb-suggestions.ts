import { tickerOf } from "@zframes/frames";
import type { Capability, DashboardSpec, FrameRegistry } from "@zframes/core";

// Builds the orb's placeholder suggestions from the frames actually on the
// dashboard, so the hints reflect what the user is looking at rather than a
// fixed list. Pure + synchronous (reads the spec + registry only — no providers,
// no network); the orb memoizes it per spec. It keys on capabilities, not frame
// types, so any frame advertising e.g. `funding-history` triggers the funding
// hint. Empty/unknown board → a generic set, so the placeholder is never blank.

// Shown when the board is empty, and appended for variety on any board.
const GENERIC = [
  "what's going on?",
  "what's moving today?",
  "summarize the market for me",
  "what should I be watching?",
  "explain my dashboard",
];

// Ordered so surfaced hints are stable + prioritized. Each row fires once if ANY
// of its capabilities is present on the board. `symbol` is supplied only to the
// price row (the one whose caps include a price capability).
const PRICE_CAPS: Capability[] = ["day-stats", "ohlcv", "quote-stream"];
const HINTS: { caps: Capability[]; text: (symbol?: string) => string }[] = [
  {
    caps: PRICE_CAPS,
    text: (s) => (s ? `what's moving in ${s}?` : "what's moving today?"),
  },
  { caps: ["funding-history"], text: () => "how's funding looking?" },
  { caps: ["open-interest"], text: () => "where's open interest building?" },
  { caps: ["sentiment"], text: () => "is it fear or greed right now?" },
  {
    caps: ["coin-movers", "coin-markets"],
    text: () => "what are today's biggest movers?",
  },
  { caps: ["global-market"], text: () => "how's the total market cap?" },
  {
    caps: ["tvl", "protocol-tvl", "dex-volume", "protocol-fees"],
    text: () => "which chains are gaining TVL?",
  },
  { caps: ["news"], text: () => "any headlines I should see?" },
  {
    caps: [
      "btc-fees",
      "btc-mempool",
      "btc-blocks",
      "btc-difficulty",
      "mining-pools",
      "lightning-stats",
    ],
    text: () => "how busy is the Bitcoin network?",
  },
  {
    caps: ["yield-curve", "reference-rates"],
    text: () => "what's the yield curve saying?",
  },
  { caps: ["financial-stress"], text: () => "any signs of financial stress?" },
  { caps: ["options-summary"], text: () => "what's the put/call ratio?" },
  { caps: ["portfolio"], text: () => "how's my portfolio doing?" },
];

const MAX_SUGGESTIONS = 8;

/** First concrete (non-wildcard) symbol on a price-capable frame, tickerified. */
function firstPriceSymbol(
  spec: DashboardSpec,
  registry: FrameRegistry,
): string | undefined {
  for (const f of spec.frames) {
    const caps = registry.get(f.frame)?.capabilities ?? [];
    if (!caps.some((c) => PRICE_CAPS.includes(c))) continue;
    const cfg = (f.config ?? {}) as Record<string, unknown>;
    const syms: string[] = [];
    if (typeof cfg.symbol === "string") syms.push(cfg.symbol);
    if (Array.isArray(cfg.symbols))
      for (const s of cfg.symbols) if (typeof s === "string") syms.push(s);
    // Drop the "<dex>:*" / "*" universe wildcards — they're not a symbol to name.
    const concrete = syms.find((s) => s && s !== "*" && !s.endsWith(":*"));
    if (concrete) return tickerOf(concrete);
  }
  return undefined;
}

/** Placeholder hints tailored to the frames on this dashboard (never empty). */
export function suggestionsFor(
  spec: DashboardSpec,
  registry: FrameRegistry,
): string[] {
  const present = new Set<Capability>();
  for (const f of spec.frames)
    for (const c of registry.get(f.frame)?.capabilities ?? []) present.add(c);
  if (present.size === 0) return GENERIC;

  const symbol = firstPriceSymbol(spec, registry);
  const tailored: string[] = [];
  for (const row of HINTS)
    if (row.caps.some((c) => present.has(c)))
      tailored.push(row.text(row.caps === PRICE_CAPS ? symbol : undefined));

  // Dedupe, then top up with generics for variety, and cap the cycle length.
  const deduped = [...new Set([...tailored, ...GENERIC])].slice(
    0,
    MAX_SUGGESTIONS,
  );
  return deduped.length ? deduped : GENERIC;
}
