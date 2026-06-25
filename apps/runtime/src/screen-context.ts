import { useCallback } from "react";
import { useProviders } from "@zframes/core";
import type {
  Capability,
  DashboardSpec,
  FrameRegistry,
  MarketDataProvider,
  PortfolioSource,
} from "@zframes/core";

// Builds the "what the user is looking at right now" snapshot that the zAI orb
// attaches to every question, so answers are grounded in the live dashboard
// instead of guessing. It reads the SAME shared providers the frames render
// from (capability-routed, TTL-cached), so a snapshot reuses warm caches and
// adds no new subscriptions — it's a point-in-time read, not a feed.
//
// The result is a compact plain-text digest (not JSON): it goes straight into
// the agent prompt, so terse + legible beats structured. Two sections:
//   • the frames on the dashboard (structure — every frame, even unvalued ones)
//   • live readings (the current numbers behind them, deduped across frames)
//
// Scope decision (with the user): capture the WHOLE dashboard, not just the
// viewport — every frame is mounted and live anyway, and answers should stay
// stable as you scroll. See docs/decisions for the full rationale.

/** Keep the digest cheap to send + cheap for the agent to read. */
const MAX_FRAME_LINES = 80; // a dashboard can hold 100s; name the first N
const MAX_SYMBOLS_PER_GROUP = 40;
const MAX_LIST_ITEMS = 6; // top-N for treemaps / movers / news
const MAX_DIGEST_CHARS = 10_000; // hard ceiling; the body cap is 64 KB
const CALL_TIMEOUT_MS = 5_000; // a slow/cold provider can't stall the ask

type Providers = readonly MarketDataProvider[];

/** First provider advertising a capability — the imperative twin of useProviderFor. */
function providerFor(
  providers: Providers,
  capability: Capability,
): MarketDataProvider | null {
  return providers.find((p) => p.capabilities.includes(capability)) ?? null;
}

/** Resolve a call to null on error OR timeout, so one provider can't stall the snapshot. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.then((v) => v).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

function fmtUsd(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${Math.round(n).toLocaleString("en-US")}`;
  return `$${n.toFixed(2)}`;
}

function fmtPct(n: number, dp = 1): string {
  if (!Number.isFinite(n)) return "—";
  return `${n >= 0 ? "+" : ""}${n.toFixed(dp)}%`;
}

function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const dp = abs >= 1000 ? 0 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })}`;
}

function symbolsOf(config: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (typeof config.symbol === "string") out.push(config.symbol);
  if (Array.isArray(config.symbols))
    for (const s of config.symbols) if (typeof s === "string") out.push(s);
  return out;
}

/**
 * Drop the "<dex>:*" / "*" universe wildcards before a price/funding/OI request:
 * they're a "show the whole dex" hint (hundreds of equities), not a symbol to
 * value — keeping them would force a giant fetch and add nothing to the digest.
 */
function concreteSymbols(symbols: readonly string[]): string[] {
  return symbols.filter((s) => s && s !== "*" && !s.endsWith(":*"));
}

/** First present readable string field — surfaces on-screen text from no-data frames. */
function firstString(
  config: Record<string, unknown>,
  keys: readonly string[],
): string | null {
  for (const k of keys) {
    const v = config[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

interface FrameView {
  type: string;
  title?: string;
  capabilities: readonly Capability[];
  config: Record<string, unknown>;
  symbols: string[];
}

/** Flatten the spec into a per-frame view, resolving each frame's capabilities. */
function readFrames(spec: DashboardSpec, registry: FrameRegistry): FrameView[] {
  return spec.frames.map((f) => {
    const def = registry.get(f.frame);
    // Resolve through the frame's own schema so .default() fields (a news feed,
    // an options currency, a default symbol set) are present — the raw spec only
    // carries what the author typed, not the schema defaults the frame renders with.
    let config = (f.config ?? {}) as Record<string, unknown>;
    if (def) {
      const parsed = def.schema.safeParse(config);
      if (parsed.success) config = parsed.data as Record<string, unknown>;
    }
    return {
      type: f.frame,
      title: f.title,
      capabilities: def?.capabilities ?? [],
      config,
      symbols: symbolsOf(config),
    };
  });
}

/** Section A: every frame, named (structure) — with symbols / a bit of text where useful. */
function describeFrames(frames: FrameView[]): string[] {
  const lines: string[] = [];
  for (const f of frames.slice(0, MAX_FRAME_LINES)) {
    let line = `- ${f.type}`;
    if (f.title) line += ` "${f.title}"`;
    if (f.symbols.length)
      line += ` [${f.symbols.slice(0, MAX_SYMBOLS_PER_GROUP).join(", ")}]`;
    // Surface the literal on-screen text of text/utility frames (note, heading,
    // clock, news feed) — that IS data the user sees.
    if (f.symbols.length === 0) {
      const text = firstString(f.config, [
        "text",
        "content",
        "body",
        "label",
        "timezone",
        "feed",
      ]);
      if (text) line += `: ${truncate(text, 80)}`;
    }
    lines.push(line);
  }
  if (frames.length > MAX_FRAME_LINES)
    lines.push(`- …and ${frames.length - MAX_FRAME_LINES} more frames`);
  return lines;
}

/** Union of symbols across frames whose capabilities intersect `caps`. */
function symbolsForCaps(frames: FrameView[], caps: Capability[]): string[] {
  const set = new Set<string>();
  for (const f of frames)
    if (f.capabilities.some((c) => caps.includes(c)))
      for (const s of f.symbols) set.add(s);
  return [...set];
}

/**
 * Section B: live readings. One labelled block per capability that's actually on
 * the dashboard AND has a provider — each a single cached call, all in parallel,
 * each self-bounded so a cold provider degrades to "omitted" rather than stalling.
 * Returns blocks in a stable, readable order.
 */
async function liveReadings(
  providers: Providers,
  frames: FrameView[],
): Promise<string[]> {
  const present = new Set<Capability>();
  for (const f of frames) for (const c of f.capabilities) present.add(c);
  const has = (c: Capability) => present.has(c) && providerFor(providers, c);

  // Each task resolves to [order, text] | null; assembled in `order` afterwards.
  const tasks: Promise<[number, string] | null>[] = [];
  const task = (
    order: number,
    cap: Capability,
    run: (p: MarketDataProvider) => Promise<string | null>,
  ) => {
    const p = has(cap);
    if (!p) return;
    tasks.push(
      withTimeout(run(p), CALL_TIMEOUT_MS).then((text) =>
        text ? ([order, text] as [number, string]) : null,
      ),
    );
  };

  // 1 — live prices (covers price-chart, ticker, compare, top-movers, …)
  const priceSymbols = concreteSymbols(
    symbolsForCaps(frames, ["day-stats", "quote-stream", "ohlcv"]),
  ).slice(0, MAX_SYMBOLS_PER_GROUP);
  if (priceSymbols.length)
    task(1, "day-stats", async (p) => {
      const stats = await p.getDayStats!(priceSymbols);
      const parts = priceSymbols
        .map((s) => {
          const st = stats[s];
          return st
            ? `${s} ${fmtPrice(st.markPx)} (${fmtPct(st.changePct)})`
            : null;
        })
        .filter(Boolean);
      return parts.length ? `Prices: ${parts.join(" · ")}` : null;
    });

  // 2 — fear & greed. Request the limit the fear-greed frame uses (its sparkline
  // length) so we hit its already-warm cache — the sentiment cache keys on limit,
  // so a smaller request would bypass it and force a second fetch. We only read
  // the latest point regardless. Default 30 = useFearGreed's default.
  const fgFrame = frames.find((f) => f.capabilities.includes("sentiment"));
  const fgLimit =
    typeof fgFrame?.config.sparklineDays === "number"
      ? fgFrame.config.sparklineDays
      : 30;
  task(2, "sentiment", async (p) => {
    const fg = await p.getFearGreed!(fgLimit);
    const v = fg[0];
    return v ? `Fear & Greed: ${v.value} (${v.classification})` : null;
  });

  // 3 — global crypto market + dominance
  task(3, "global-market", async (p) => {
    const g = await p.getGlobalMarket!();
    const dom = Object.entries(g.dominance)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([k, v]) => `${k.toUpperCase()} ${v.toFixed(1)}%`)
      .join(", ");
    return `Global crypto: total mcap ${fmtUsd(g.totalMarketCapUsd)} (${fmtPct(
      g.marketCapChangePct24h,
    )} 24h); dominance ${dom}`;
  });

  // 4 — latest funding (per symbol)
  const fundingSymbols = concreteSymbols(
    symbolsForCaps(frames, ["funding-history"]),
  ).slice(0, MAX_SYMBOLS_PER_GROUP);
  if (fundingSymbols.length)
    task(4, "funding-history", async (p) => {
      const hist = await p.getFundingHistory!(
        fundingSymbols,
        Date.now() - 24 * 3600 * 1000,
      );
      const parts = fundingSymbols
        .map((s) => {
          const pts = hist[s];
          const last = pts && pts[pts.length - 1];
          return last ? `${s} ${fmtPct(last.fundingRate * 100, 4)}` : null;
        })
        .filter(Boolean);
      return parts.length ? `Funding (latest): ${parts.join(" · ")}` : null;
    });

  // 5 — open interest
  const oiSymbols = concreteSymbols(symbolsForCaps(frames, ["open-interest"]));
  task(5, "open-interest", async (p) => {
    const oi = await p.getOpenInterest!(
      oiSymbols.length ? oiSymbols : undefined,
    );
    const parts = oi
      .slice(0, MAX_LIST_ITEMS)
      .map((e) => `${e.symbol} ${fmtUsd(e.openInterestUsd)}`);
    return parts.length ? `Open interest: ${parts.join(" · ")}` : null;
  });

  // 6 — TVL by chain
  task(6, "tvl", async (p) => {
    const tvl = await p.getTvlByChain!();
    const parts = tvl
      .slice(0, MAX_LIST_ITEMS)
      .map((e) => `${e.name} ${fmtUsd(e.tvl)}`);
    return parts.length ? `TVL by chain: ${parts.join(" · ")}` : null;
  });

  // 7 — protocol TVL
  task(7, "protocol-tvl", async (p) => {
    const rows = await p.getProtocolTvl!();
    const parts = rows
      .slice(0, MAX_LIST_ITEMS)
      .map((e) => `${e.name} ${fmtUsd(e.tvl)}`);
    return parts.length ? `Protocol TVL: ${parts.join(" · ")}` : null;
  });

  // 8 — DEX volume
  task(8, "dex-volume", async (p) => {
    const rows = await p.getDexVolume!();
    const parts = rows
      .slice(0, MAX_LIST_ITEMS)
      .map((e) => `${e.name} ${fmtUsd(e.volume24h)}`);
    return parts.length ? `DEX volume (24h): ${parts.join(" · ")}` : null;
  });

  // 9 — protocol fees
  task(9, "protocol-fees", async (p) => {
    const rows = await p.getProtocolFees!();
    const parts = rows
      .slice(0, MAX_LIST_ITEMS)
      .map((e) => `${e.name} ${fmtUsd(e.fees24h)}`);
    return parts.length ? `Protocol fees (24h): ${parts.join(" · ")}` : null;
  });

  // 10 — coins by market cap
  task(10, "coin-markets", async (p) => {
    const rows = await p.getCoinMarkets!();
    const parts = rows
      .slice(0, MAX_LIST_ITEMS)
      .map(
        (e) =>
          `${e.symbol} ${fmtUsd(e.marketCapUsd)}${
            e.changePct24h != null ? ` (${fmtPct(e.changePct24h)})` : ""
          }`,
      );
    return parts.length ? `Top coins by mcap: ${parts.join(" · ")}` : null;
  });

  // 11 — broad movers. Request 300 to match useCoinMovers' default so we reuse
  // the movers frame's warm cache (keyed on limit) instead of forcing a fresh
  // fetch of 50; we still surface only the top/bottom 3.
  task(11, "coin-movers", async (p) => {
    const rows = await p.getCoinMovers!(300);
    const sorted = [...rows].sort(
      (a, b) => (b.changePct["24h"] ?? 0) - (a.changePct["24h"] ?? 0),
    );
    const top = sorted
      .slice(0, 3)
      .map((e) => `${e.symbol} ${fmtPct(e.changePct["24h"] ?? 0)}`);
    const bottom = sorted
      .slice(-3)
      .reverse()
      .map((e) => `${e.symbol} ${fmtPct(e.changePct["24h"] ?? 0)}`);
    return sorted.length
      ? `Movers (24h): up ${top.join(", ")} · down ${bottom.join(", ")}`
      : null;
  });

  // 12 — news (per distinct feed on the dashboard; skip frames with no feed)
  if (has("news")) {
    const provider = providerFor(providers, "news")!;
    const seen = new Set<string>();
    for (const f of frames) {
      if (!f.capabilities.includes("news")) continue;
      const feed = typeof f.config.feed === "string" ? f.config.feed : null;
      if (!feed || seen.has(feed)) continue;
      seen.add(feed);
      const symbols = f.symbols.length ? [...f.symbols] : undefined;
      task(12, "news", async () => {
        const items = await provider.getNews!({ feed, symbols, limit: 4 });
        const titles = items
          .slice(0, 4)
          .map((n) => `“${truncate(n.title, 90)}”`);
        return titles.length ? `News (${feed}): ${titles.join("; ")}` : null;
      });
    }
  }

  // 13 — BTC chain health (singletons)
  task(13, "btc-fees", async (p) => {
    const fees = await p.getBtcFees!();
    return `BTC fees: fastest ${fees.fastest}, 1h ${fees.hour}, economy ${fees.economy} sat/vB`;
  });
  task(14, "btc-mempool", async (p) => {
    const m = await p.getMempoolState!();
    return `Mempool: ${m.count.toLocaleString("en-US")} txs, ${m.projected.length} blocks pending`;
  });
  task(15, "btc-blocks", async (p) => {
    const blocks = await p.getBtcBlocks!(1);
    const b = blocks[0];
    return b
      ? `Latest block: #${b.height} (${b.poolName}, ${b.txCount} txs)`
      : null;
  });
  task(16, "btc-difficulty", async (p) => {
    const d = await p.getDifficultyAdjustment!();
    return `Difficulty: ${fmtPct(d.difficultyChange)} expected in ${d.remainingBlocks} blocks`;
  });
  task(17, "mining-pools", async (p) => {
    const mp = await p.getMiningPools!("1w");
    const top = mp.pools[0];
    return top
      ? `Mining pools (1w): ${top.name} ${top.sharePct.toFixed(1)}%`
      : null;
  });
  task(18, "lightning-stats", async (p) => {
    const ln = await p.getLightningStats!();
    return `Lightning: ${ln.nodeCount.toLocaleString("en-US")} nodes, ${ln.channelCount.toLocaleString(
      "en-US",
    )} channels`;
  });

  // 19 — macro (singletons)
  task(19, "yield-curve", async (p) => {
    const yc = await p.getYieldCurve!();
    const pick = (label: string) => yc.points.find((pt) => pt.label === label);
    const parts = ["3M", "2Y", "10Y", "30Y"]
      .map((l) => {
        const pt = pick(l);
        return pt ? `${l} ${pt.rate.toFixed(2)}%` : null;
      })
      .filter(Boolean);
    return parts.length
      ? `Yield curve (${yc.date}): ${parts.join(", ")}`
      : null;
  });
  task(20, "reference-rates", async (p) => {
    const rates = await p.getReferenceRates!();
    const parts = rates
      .slice(0, 3)
      .map((r) => `${r.code} ${r.rate.toFixed(2)}%`);
    return parts.length ? `Reference rates: ${parts.join(", ")}` : null;
  });
  task(21, "financial-stress", async (p) => {
    const fs = await p.getFinancialStress!();
    return `Financial stress (OFR): ${fs.value.toFixed(2)} (${fs.date})`;
  });
  task(22, "national-debt", async (p) => {
    const nd = await p.getNationalDebt!();
    return `US national debt: ${fmtUsd(nd.total)} (${nd.date})`;
  });

  // 23 — options positioning (per currency on the dashboard)
  if (has("options-summary")) {
    const currencies = new Set<string>();
    for (const f of frames)
      if (f.capabilities.includes("options-summary"))
        currencies.add(
          typeof f.config.currency === "string" ? f.config.currency : "BTC",
        );
    const provider = providerFor(providers, "options-summary")!;
    for (const currency of currencies) {
      task(23, "options-summary", async () => {
        const o = await provider.getOptionsSummary!(currency);
        return `Options ${o.currency}: put/call ${o.putCallRatioOi.toFixed(
          2,
        )} (OI), avg IV ${o.avgIv.toFixed(1)}%`;
      });
    }
  }

  // 24 — connected portfolio(s)
  if (has("portfolio")) {
    for (const f of frames) {
      if (!f.capabilities.includes("portfolio")) continue;
      const src = f.config.source as PortfolioSource | undefined;
      if (!src || typeof src.kind !== "string") continue;
      const provider = providers.find(
        (p) => p.getPortfolio && (p.portfolioKinds ?? []).includes(src.kind),
      );
      if (!provider) continue;
      task(24, "portfolio", async () => {
        const pf = await provider.getPortfolio!(src);
        const total =
          pf.totalUsd ??
          pf.holdings.reduce((sum, h) => sum + (h.valueUsd ?? 0), 0);
        const top = [...pf.holdings]
          .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
          .slice(0, MAX_LIST_ITEMS)
          .map((h) => h.symbol)
          .join(", ");
        return `Portfolio (${pf.label ?? pf.source}): ${fmtUsd(total)}${
          top ? `, top: ${top}` : ""
        }`;
      });
    }
  }

  const settled = await Promise.all(tasks);
  return settled
    .filter((r): r is [number, string] => r !== null)
    .sort((a, b) => a[0] - b[0])
    .map((r) => r[1]);
}

/**
 * Returns a `capture()` the orb calls right before sending a question. Lives in
 * a hook so it can read the shared providers; the work happens lazily on call,
 * never on render. Resolves to a plain-text digest, or null when there's
 * nothing to say (no frames / capture failed) — the orb then asks without it.
 */
export function useScreenSnapshot(
  spec: DashboardSpec,
  registry: FrameRegistry,
): () => Promise<string | null> {
  const providers = useProviders();
  return useCallback(async () => {
    try {
      const frames = readFrames(spec, registry);
      if (frames.length === 0) return null;
      const structure = describeFrames(frames);
      const readings = await liveReadings(providers, frames);
      const sections: string[] = [];
      if (structure.length)
        sections.push(`Frames on the dashboard:\n${structure.join("\n")}`);
      if (readings.length)
        sections.push(`Live readings right now:\n${readings.join("\n")}`);
      const digest = sections.join("\n\n");
      return digest ? truncate(digest, MAX_DIGEST_CHARS) : null;
    } catch {
      return null; // grounding is best-effort; never block the question
    }
  }, [providers, spec, registry]);
}
