import type {
  Capability,
  DexVolumeEntry,
  FeesOverview,
  MarketDataProvider,
  ProtocolFeesEntry,
  ProtocolFundamentals,
  ProtocolTvlEntry,
  SeriesPoint,
  StablecoinSupply,
  TokenUnlockEvent,
  TokenUnlocks,
  TvlEntry,
  YieldPool,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";

const CHAINS_URL = "https://api.llama.fi/v2/chains";
const DEXS_URL = "https://api.llama.fi/overview/dexs";
const FEES_URL = "https://api.llama.fi/overview/fees";
const PROTOCOLS_URL = "https://api.llama.fi/protocols";
const FEES_SUMMARY_BASE = "https://api.llama.fi/summary/fees";
const PROTOCOL_TVL_BASE = "https://api.llama.fi/tvl";
// Emissions live on DefiLlama's FRONTEND dataset host, not the API: both
// api.llama.fi/emissions and /emission/{slug} answer HTTP 402 ("Upgrade to the
// paid API plan"). This host is keyless and CORS-open — see getTokenUnlocks for
// the way it advertises that.
const EMISSIONS_BASE = "https://defillama-datasets.llama.fi/emissions";
const STABLES_URL =
  "https://stablecoins.llama.fi/stablecoins?includePrices=true";
const STABLECHAINS_URL = "https://stablecoins.llama.fi/stablecoinchains";
const YIELDS_URL = "https://yields.llama.fi/pools";

// Every DeFiLlama endpoint is a slow-moving snapshot (TVL / volume / fees refresh
// on the order of hours), so each goes through the shared cache: a fresh value is
// served without a network call, concurrent loads (and extra frames on the same
// data) are deduped, and the last good value is served on a transient error.
// Overviews use an 8-min TTL (just under the ~10-min poll); per-slug history
// barely moves intra-day, so it uses 30 min. Not persisted — the protocol lists
// and history series can be large, and the data lands often enough that session-
// scoped caching is the win.
const SNAPSHOT_TTL_MS = 8 * 60_000;
const HISTORY_TTL_MS = 30 * 60_000;
// Fundamentals sit just under their hook's 30-min poll, so a background poll
// still refreshes while a reload (or a second card on the same protocol) reuses
// the entry. The underlying series is daily — it only closes once a day.
const FUNDAMENTALS_TTL_MS = 25 * 60_000;
// Unlock schedules move slower still — a vesting contract is fixed months ahead,
// and the upstream dataset is regenerated on the order of weeks (arbitrum's file
// was three weeks old when this was written). 5.5 h sits under the 6-h poll.
const UNLOCKS_TTL_MS = 330 * 60_000;

const tvlCache = new TtlCache<TvlEntry[]>({
  namespace: "zframes:defillama:tvl",
  ttlMs: SNAPSHOT_TTL_MS,
});
const dexVolumeCache = new TtlCache<DexVolumeEntry[]>({
  namespace: "zframes:defillama:dex-volume",
  ttlMs: SNAPSHOT_TTL_MS,
});
const protocolTvlCache = new TtlCache<ProtocolTvlEntry[]>({
  namespace: "zframes:defillama:protocol-tvl",
  ttlMs: SNAPSHOT_TTL_MS,
});
const protocolFeesCache = new TtlCache<ProtocolFeesEntry[]>({
  namespace: "zframes:defillama:protocol-fees",
  ttlMs: SNAPSHOT_TTL_MS,
});
const dexHistoryCache = new TtlCache<Record<string, SeriesPoint[]>>({
  namespace: "zframes:defillama:dex-history",
  ttlMs: HISTORY_TTL_MS,
});
const protocolHistoryCache = new TtlCache<Record<string, SeriesPoint[]>>({
  namespace: "zframes:defillama:protocol-history",
  ttlMs: HISTORY_TTL_MS,
});
// Stablecoin supply + yields move on a daily cadence; slightly longer TTLs, and
// persisted since the derived aggregates are small and useful across reloads.
const stablecoinsCache = new TtlCache<StablecoinSupply>({
  namespace: "zframes:defillama:stablecoins",
  ttlMs: 30 * 60_000,
  persist: true,
});
const yieldsCache = new TtlCache<YieldPool[]>({
  namespace: "zframes:defillama:yields",
  ttlMs: 12 * 60_000,
});
const feesOverviewCache = new TtlCache<FeesOverview>({
  namespace: "zframes:defillama:fees-overview",
  ttlMs: SNAPSHOT_TTL_MS,
});
// One entry per protocol slug, holding BOTH daily series (Ethereum's fees reach
// back to 2015 — ~4000 points each), so like the history caches it isn't
// persisted. The key is a slug, which doesn't drift the way a `startTimeMs` key
// does, so a small cap is plenty: a board would need 12 distinct protocols.
const fundamentalsCache = new TtlCache<ProtocolFundamentals>({
  namespace: "zframes:defillama:protocol-fundamentals",
  ttlMs: FUNDAMENTALS_TTL_MS,
  maxEntries: 12,
});
// Its own namespace because it's its own origin (the dataset host, not the API).
// Emphatically NOT persisted: the upstream payload is 0.8-1.3 MB and even the
// reduced value keeps a 1500-2100 point schedule, which is exactly the shape
// that walks localStorage into its ~5 MB quota — where `setItem` throws into the
// cache's swallowing write guard and persistence just silently stops.
const unlocksCache = new TtlCache<TokenUnlocks>({
  namespace: "zframes:defillama:token-unlocks",
  ttlMs: UNLOCKS_TTL_MS,
  maxEntries: 6,
});

/** Stable cache key for a set of slugs, order-independent. */
const slugKey = (slugs: string[]): string => [...slugs].sort().join(",");

interface LlamaChain {
  name: string;
  tvl: number;
}

/** Shared shape of the `/overview/{dexs,fees}` dimension endpoints. */
interface LlamaOverview {
  protocols?: LlamaOverviewProtocol[];
  /** Top-level aggregate fields (present on `/overview/fees`). */
  total24h?: number | null;
  total7d?: number | null;
  change_1d?: number | null;
  totalDataChart?: [number, number][];
}

interface LlamaPeggedSnapshot {
  peggedUSD?: number;
}
interface LlamaPeggedAsset {
  symbol: string;
  pegType?: string;
  circulating?: LlamaPeggedSnapshot;
  circulatingPrevDay?: LlamaPeggedSnapshot;
  circulatingPrevWeek?: LlamaPeggedSnapshot;
  circulatingPrevMonth?: LlamaPeggedSnapshot;
}
interface LlamaStablecoinsResp {
  peggedAssets?: LlamaPeggedAsset[];
}
interface LlamaStablecoinChain {
  name: string;
  totalCirculatingUSD?: { peggedUSD?: number };
}
interface LlamaYieldPool {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number | null;
  apy: number | null;
  apyBase: number | null;
  apyReward: number | null;
  apyPct7D: number | null;
  stablecoin?: boolean;
  ilRisk?: string;
}
interface LlamaYieldsResp {
  status?: string;
  data?: LlamaYieldPool[];
}
interface LlamaOverviewProtocol {
  name: string;
  total24h: number | null;
  change_1d?: number | null;
}

interface LlamaProtocol {
  name: string;
  tvl: number | null;
  category?: string;
  change_1d?: number | null;
}

interface LlamaSummary {
  /** [unixSeconds, value] pairs. */
  totalDataChart?: [number, number][];
}

interface LlamaProtocolDetail {
  tvl?: { date: number; totalLiquidityUSD: number }[];
}

/**
 * `/summary/fees/{slug}` — ONE protocol, ONE dimension (fees or revenue, picked
 * by `dataType`). Carries no TVL field, and no `annualized1y` here on purpose:
 * that value extrapolates a run-rate rather than totalling the trailing year
 * (see {@link DefiLlamaProvider.getProtocolFundamentals}).
 */
interface LlamaFeesSummary {
  name?: string;
  slug?: string;
  /** [unixSeconds, value] pairs, oldest → newest. */
  totalDataChart?: [number, number][];
  /** Trailing 30-day total, ending at the last CLOSED day. */
  total30d?: number | null;
  /** Trailing 365-day total, ending at the last CLOSED day. */
  total1y?: number | null;
}

/**
 * `emissions/{slug}` on the dataset host. Only the parts read here are typed;
 * the payload also carries `unlockUsdChart`, `categories`, `chainName`,
 * `metadata.unlockEvents[].cliffAllocations` and more.
 */
interface LlamaEmissions {
  supplyMetrics?: {
    maxSupply?: number | null;
    adjustedSupply?: number | null;
  } | null;
  documentedData?: {
    /** ONE entry per allocation section ("Investors", "Team", …). */
    data?: LlamaEmissionSection[];
    /** Each field is keyed by allocation bucket, e.g. `{ insiders: 36.5 }`. */
    tokenAllocation?: {
      current?: Record<string, number> | null;
      final?: Record<string, number> | null;
      progress?: Record<string, number> | null;
    } | null;
  } | null;
  metadata?: {
    events?: LlamaEmissionEvent[];
    /** Publisher's total supply; null on some tokens, unlike `supplyMetrics`. */
    total?: number | null;
  } | null;
}

interface LlamaEmissionSection {
  label?: string;
  data?: {
    /** Unix SECONDS. */
    timestamp?: number;
    /** CUMULATIVE tokens unlocked for this section by that date. */
    unlocked?: number | null;
    rawEmission?: number | null;
    burned?: number | null;
  }[];
}

interface LlamaEmissionEvent {
  /** An UNRENDERED template — see {@link renderUnlockDescription}. */
  description?: string;
  /** Unix SECONDS. */
  timestamp?: number;
  /** One entry per allocation released at this moment, hence an array. */
  noOfTokens?: number[];
  category?: string;
  unlockType?: string;
}

/** [unixSeconds, value] → SeriesPoint[] (epoch ms), dropping non-finite rows. */
function toSeries(chart: [number, number][] | undefined): SeriesPoint[] {
  if (!Array.isArray(chart)) return [];
  return chart
    .map(([ts, value]) => ({ time: ts * 1000, value: Number(value) }))
    .filter((p) => Number.isFinite(p.time) && Number.isFinite(p.value));
}

/** A publisher's optional numeric field, or undefined when absent/garbage. */
const finite = (v: number | null | undefined): number | undefined =>
  Number.isFinite(v) ? (v as number) : undefined;

const changeOf = finite;

const DAY_MS = 86_400_000;

/** Percentages the spec documents as 0-100; publisher totals can overshoot. */
const clampPct = (n: number): number => Math.min(100, Math.max(0, n));

/**
 * `metadata.events[].description` arrives as an UNRENDERED template — literally
 * `"On {timestamp} {tokens[0]} of Investors tokens will be unlocked"`. Passed
 * through untouched a card shows those braces, and a frame can't repair a number
 * embedded mid-sentence, so the slots are filled here: `{tokens[i]}` from
 * `noOfTokens[i]`, `{timestamp}` as an ISO date. This is the one place the
 * provider formats a number, because prose is the only place a frame can't.
 */
function renderUnlockDescription(
  template: string | undefined,
  tokens: number[],
  timeMs: number,
): string | undefined {
  if (!template) return undefined;
  return template
    .replace(/\{tokens\[(\d+)\]\}/g, (whole: string, index: string) => {
      const n = tokens[Number(index)];
      return Number.isFinite(n) ? n.toLocaleString("en-US") : whole;
    })
    .replace(/\{timestamp\}/g, new Date(timeMs).toISOString().slice(0, 10));
}

/**
 * One dimension of `/summary/fees/{slug}`. `excludeTotalDataChartBreakdown`
 * earns its keystrokes: Uniswap's fees response is 1.29 MB with the per-chain,
 * per-child-protocol breakdown attached and 78 KB without it, and nothing here
 * reads the breakdown.
 */
const fetchFeesSummary = (
  slug: string,
  dataType: "dailyFees" | "dailyRevenue",
): Promise<LlamaFeesSummary> =>
  fetchJson<LlamaFeesSummary>(
    `${FEES_SUMMARY_BASE}/${encodeURIComponent(slug)}` +
      `?dataType=${dataType}&excludeTotalDataChartBreakdown=true`,
  );

/**
 * A dimension summary's daily chart as a series, oldest → newest. The upstream
 * already sends unix **seconds** ascending (`toSeries` does the ×1000); the sort
 * just pins the contract rather than trusting the ordering.
 */
const seriesOf = (body: LlamaFeesSummary): SeriesPoint[] =>
  toSeries(body.totalDataChart).sort((a, b) => a.time - b.time);

/**
 * Fallback trailing total, summed from the daily series over CLOSED days only.
 * DeFiLlama's own `total30d`/`total1y` stop at the last closed UTC day — today's
 * partial print appears in `totalDataChart` but not in the aggregates (verified
 * to the dollar against uniswap) — so the fallback ends there too. Otherwise a
 * card's number would visibly jump the day the publisher's field showed up.
 */
function trailingSum(series: SeriesPoint[], days: number): number | undefined {
  if (series.length === 0) return undefined;
  const today = Math.floor(Date.now() / DAY_MS) * DAY_MS;
  const from = today - days * DAY_MS;
  let total = 0;
  for (const p of series) {
    if (p.time >= from && p.time < today) total += p.value;
  }
  return total;
}

/** The publisher's own aggregate when it published one, else summed locally. */
const aggregate = (
  published: number | null | undefined,
  series: SeriesPoint[],
  days: number,
): number | undefined =>
  Number.isFinite(published)
    ? (published as number)
    : trailingSum(series, days);

/**
 * Free, no-API-key provider backed by DeFiLlama's public API (CORS-open, so no
 * runtime proxy needed). All endpoints live under api.llama.fi.
 * - tvl: total value locked per chain, descending.
 * - dex-volume: trailing-24h DEX volume per protocol (+ per-protocol history).
 * - protocol-tvl: current TVL per DeFi protocol (+ per-protocol history).
 * - protocol-fees: trailing-24h fees per protocol.
 * - protocol-fundamentals: one protocol's fee AND revenue history, in depth.
 * - token-unlocks: one token's emission schedule, including FUTURE unlocks.
 *   Reads a different host from the rest — see getTokenUnlocks.
 */
export class DefiLlamaProvider implements MarketDataProvider {
  readonly name = "defillama";
  readonly capabilities: readonly Capability[] = [
    "tvl",
    "dex-volume",
    "protocol-tvl",
    "protocol-fees",
    "protocol-fundamentals",
    "token-unlocks",
    "stablecoins",
    "yields",
    "fees-overview",
  ];

  async getTvlByChain(): Promise<TvlEntry[]> {
    return tvlCache.get("chains", async () => {
      const chains = await fetchJson<LlamaChain[]>(CHAINS_URL);
      if (!Array.isArray(chains))
        throw new Error("defillama chains: unexpected response shape");
      return chains
        .filter((chain) => Number.isFinite(chain.tvl) && chain.tvl > 0)
        .sort((a, b) => b.tvl - a.tvl)
        .map((chain) => ({ name: chain.name, tvl: chain.tvl }));
    });
  }

  async getDexVolume(): Promise<DexVolumeEntry[]> {
    return dexVolumeCache.get("overview", async () => {
      const body = await fetchJson<LlamaOverview>(DEXS_URL);
      const protocols = body?.protocols;
      if (!Array.isArray(protocols))
        throw new Error("defillama dexs: unexpected response shape");
      return protocols
        .filter((p) => Number.isFinite(p.total24h) && (p.total24h ?? 0) > 0)
        .map((p) => ({
          name: p.name,
          volume24h: p.total24h as number,
          changePct: changeOf(p.change_1d),
        }))
        .sort((a, b) => b.volume24h - a.volume24h);
    });
  }

  async getDexVolumeHistory(
    slugs: string[],
  ): Promise<Record<string, SeriesPoint[]>> {
    return dexHistoryCache.get(slugKey(slugs), async () => {
      const pairs = await Promise.all(
        slugs.map((slug) =>
          fetchJson<LlamaSummary>(
            `https://api.llama.fi/summary/dexs/${encodeURIComponent(
              slug,
            )}?excludeTotalDataChartBreakdown=true`,
          )
            .then((body) => [slug, toSeries(body.totalDataChart)] as const)
            .catch(() => [slug, [] as SeriesPoint[]] as const),
        ),
      );
      return Object.fromEntries(pairs);
    });
  }

  async getProtocolTvl(): Promise<ProtocolTvlEntry[]> {
    return protocolTvlCache.get("overview", async () => {
      const protocols = await fetchJson<LlamaProtocol[]>(PROTOCOLS_URL);
      if (!Array.isArray(protocols))
        throw new Error("defillama protocols: unexpected response shape");
      return protocols
        .filter((p) => Number.isFinite(p.tvl) && (p.tvl ?? 0) > 0)
        .map((p) => ({
          name: p.name,
          tvl: p.tvl as number,
          category: p.category,
          changePct: changeOf(p.change_1d),
        }))
        .sort((a, b) => b.tvl - a.tvl);
    });
  }

  async getProtocolTvlHistory(
    slugs: string[],
  ): Promise<Record<string, SeriesPoint[]>> {
    return protocolHistoryCache.get(slugKey(slugs), async () => {
      const pairs = await Promise.all(
        slugs.map((slug) =>
          fetchJson<LlamaProtocolDetail>(
            `https://api.llama.fi/protocol/${encodeURIComponent(slug)}`,
          )
            .then(
              (body) =>
                [
                  slug,
                  (body.tvl ?? [])
                    .map((p) => ({
                      time: p.date * 1000,
                      value: Number(p.totalLiquidityUSD),
                    }))
                    .filter(
                      (p) =>
                        Number.isFinite(p.time) && Number.isFinite(p.value),
                    ),
                ] as const,
            )
            .catch(() => [slug, [] as SeriesPoint[]] as const),
        ),
      );
      return Object.fromEntries(pairs);
    });
  }

  async getProtocolFees(): Promise<ProtocolFeesEntry[]> {
    return protocolFeesCache.get("overview", async () => {
      const body = await fetchJson<LlamaOverview>(FEES_URL);
      const protocols = body?.protocols;
      if (!Array.isArray(protocols))
        throw new Error("defillama fees: unexpected response shape");
      return protocols
        .filter((p) => Number.isFinite(p.total24h) && (p.total24h ?? 0) > 0)
        .map((p) => ({
          name: p.name,
          fees24h: p.total24h as number,
          changePct: changeOf(p.change_1d),
        }))
        .sort((a, b) => b.fees24h - a.fees24h);
    });
  }

  /**
   * One protocol's fee and revenue history — the crypto income statement.
   *
   * **Keyed by DeFiLlama's protocol slug, never a token ticker** ("uniswap",
   * "aave", "hyperliquid"; `/summary/fees/UNI` answers 400). Resolving a ticker
   * here was considered and rejected: `/protocols` is ~8.5 MB — far too heavy for
   * a per-card path — and its symbol index wouldn't answer the question anyway,
   * since `UNI` maps to five *versioned children* (`uniswap-v2`, `uniswap-v3`, …)
   * and the parent slug this endpoint actually wants isn't in that list at all.
   * A frame should offer a slug field with a curated option set instead.
   *
   * Two traps for whoever curates that set. A CoinGecko id is *usually* the slug
   * but not reliably — `lido-dao` is a 400 where `lido` works. And `ARB` has TWO
   * valid slugs that both answer 200 with the same `gecko_id`: `arbitrum` (the
   * chain) reports roughly double the trailing revenue of `arbitrum-foundation`
   * (the protocol), so the wrong pick understates by half with no error to catch
   * it. The response's own `protocolType` ("protocol" | "chain") is what tells
   * them apart.
   *
   * **Fees and revenue take two calls, on two different date grids.** The
   * endpoint serves one dimension per request (`dataType=dailyFees`, the default,
   * vs `dailyRevenue`), and the two series do not line up: Uniswap's fees start
   * 2018-11 (2833 points) while its revenue starts 2021-03 (1055), because the
   * protocol fee switch came years later. They stay two independently-timestamped
   * series for exactly that reason — anything pairing them must join on `time`,
   * never by index.
   *
   * A protocol that keeps nothing (Uniswap V1 — every fee goes to LPs) answers
   * 200 with an all-*zero* revenue series rather than an empty one, so a flat zero
   * revenue line is a published fact here, not a data gap; a caller dividing by
   * `revenue365d` must still expect a genuine zero.
   */
  async getProtocolFundamentals(
    protocol: string,
  ): Promise<ProtocolFundamentals> {
    // The upstream lowercases the slug regardless (its 400 for "UNI" echoes back
    // "uni"), so canonicalise here — otherwise "Uniswap" and "uniswap" mint two
    // cache entries for one protocol.
    const slug = protocol.trim().toLowerCase();
    if (!slug)
      throw new Error("defillama protocol-fundamentals: empty protocol slug");
    return fundamentalsCache.get(slug, async () => {
      const [feesBody, revenueBody, tvl] = await Promise.all([
        fetchFeesSummary(slug, "dailyFees"),
        // Optional: a protocol whose adapter publishes no revenue line shouldn't
        // cost the fees half of the card.
        fetchFeesSummary(slug, "dailyRevenue").catch(() => null),
        // TVL is NOT on the fees summary. `/tvl/{slug}` is a bare JSON number
        // (17 bytes), but answers 200 with an EMPTY body for a chain-level slug
        // like "ethereum" — which is not a protocol — so the parse can throw.
        fetchJson<number>(
          `${PROTOCOL_TVL_BASE}/${encodeURIComponent(slug)}`,
        ).catch(() => null),
      ]);
      if (!Array.isArray(feesBody?.totalDataChart))
        throw new Error(
          "defillama protocol-fundamentals: unexpected response shape",
        );
      const fees = seriesOf(feesBody);
      const revenue = revenueBody ? seriesOf(revenueBody) : [];
      return {
        protocol: feesBody.slug ?? slug,
        name: feesBody.name ?? slug,
        fees,
        revenue,
        // Prefer the publisher's own trailing totals so a card agrees with
        // defillama.com; `trailingSum` only covers the case where a field is
        // absent. Note `total1y` and NOT `annualized1y`: the latter scales the
        // trailing sum by 365/days-published (Uniswap revenue: ×365/220), which
        // is a run-rate, and using it as a P/S denominator would overstate a
        // young protocol's sales by that same factor.
        fees30d: aggregate(feesBody.total30d, fees, 30),
        fees365d: aggregate(feesBody.total1y, fees, 365),
        revenue30d: revenueBody
          ? aggregate(revenueBody.total30d, revenue, 30)
          : undefined,
        revenue365d: revenueBody
          ? aggregate(revenueBody.total1y, revenue, 365)
          : undefined,
        tvl:
          Number.isFinite(tvl) && (tvl as number) > 0
            ? (tvl as number)
            : undefined,
      };
    });
  }

  /**
   * A token's emission and unlock schedule — the only forward-looking supply
   * data in the fleet, and the crypto analogue of a share-lockup expiry.
   *
   * Read from the **frontend dataset host**, `defillama-datasets.llama.fi`,
   * because the API's own emissions routes are paywalled (`api.llama.fi/emissions`
   * and `/emission/{slug}` both answer HTTP 402). Keyless and CORS-open, so it
   * fetches direct — but note the CDN emits `Access-Control-Allow-Origin` only
   * when the request carries an `Origin` header (`Vary: Origin`). A browser always
   * sends one; a bare `curl` does not, so checking CORS from a shell without
   * `-H Origin:` wrongly suggests the host is unreachable from the browser.
   *
   * **`schedule` is a SUM, not a series lift.** `documentedData.data` is one
   * entry per allocation *section* ("Airdrop", "Investors", "Team, Contributors
   * & Advisors", …), each carrying that section's own CUMULATIVE `unlocked`. The
   * token's unlocked supply is their sum at each timestamp; taking a single
   * section would silently plot a fraction of the supply.
   *
   * **There is no publisher-supplied membership check worth making.**
   * `emissionsProtocolsList` (4 KB, 366 slugs) looks like the obvious gate, but
   * it does NOT contain `arbitrum` — while `emissions/arbitrum` is a live 200
   * with the real ARB schedule. Gating on it would reject a working slug, so an
   * unsupported slug is instead left to 404 (a 27 KB error body, not the 0.8 MB
   * payload) and surface as a frame error. Same ARB duality as the fees endpoint,
   * with a twist: `arbitrum` and `arbitrum-foundation` BOTH answer 200 with
   * near-identical schedules, yet only the latter is in the list and only the
   * latter carries a `gecko_id` — which is why everything here keys on the slug.
   *
   * **An empty `upcoming` does NOT mean fully vested.** `metadata.events` lists
   * discrete dated unlocks, so a token vesting as a continuous linear stream has
   * none at all: Aethir returns zero upcoming events while its schedule still
   * projects 859 points out to 2028 at 62% progress. Read `progressPct` and
   * `observedThrough` for "is it done", never `upcoming.length`.
   */
  async getTokenUnlocks(protocol: string): Promise<TokenUnlocks> {
    const slug = protocol.trim().toLowerCase();
    if (!slug) throw new Error("defillama token-unlocks: empty protocol slug");
    return unlocksCache.get(slug, async () => {
      const body = await fetchJson<LlamaEmissions>(
        `${EMISSIONS_BASE}/${encodeURIComponent(slug)}`,
      );
      const sections = body?.documentedData?.data;
      if (!Array.isArray(sections))
        throw new Error("defillama token-unlocks: unexpected response shape");
      // Summed into a Map keyed by timestamp rather than zipped by index: the
      // sections' grids happen to be identical today, and nothing in the payload
      // promises they stay that way. Timestamps are unix SECONDS here, as they
      // are on the fees endpoint.
      const totals = new Map<number, number>();
      for (const section of sections) {
        for (const point of section?.data ?? []) {
          const seconds = point?.timestamp;
          const unlocked = Number(point?.unlocked);
          if (!Number.isFinite(seconds) || !Number.isFinite(unlocked)) continue;
          totals.set(seconds!, (totals.get(seconds!) ?? 0) + unlocked);
        }
      }
      const schedule: SeriesPoint[] = [...totals.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([seconds, value]) => ({ time: seconds * 1000, value }));

      // The schedule deliberately runs past today, so mark where observation
      // ends and projection begins. A fully-vested token has no future points at
      // all (Uniswap's schedule ends in the past), in which case this is simply
      // the final point and a frame draws no projection segment.
      const now = Date.now();
      const observed = schedule.filter((p) => p.time <= now);
      const unlockedNow = observed.at(-1)?.value ?? 0;
      const unlockedFinal = schedule.at(-1)?.value ?? 0;

      const alloc = body.documentedData?.tokenAllocation;
      const upcoming: TokenUnlockEvent[] = (body.metadata?.events ?? [])
        .map((e) => {
          const time = Number(e?.timestamp) * 1000;
          // `noOfTokens` is an ARRAY — one entry per allocation released at that
          // moment — so the event's size is their sum, not its first element.
          const amounts = Array.isArray(e?.noOfTokens) ? e.noOfTokens : [];
          return {
            time,
            // "Uncategorized" is the publisher's own placeholder, so an event
            // with no category reads the same as the ones that carry it.
            category: e?.category ?? "Uncategorized",
            description: renderUnlockDescription(e?.description, amounts, time),
            tokens: amounts.reduce(
              (sum, n) => sum + (Number.isFinite(n) ? Number(n) : 0),
              0,
            ),
            unlockType: e?.unlockType,
          };
        })
        // Past unlocks are already in `schedule`; `upcoming` is the forward look.
        .filter((e) => Number.isFinite(e.time) && e.time > now)
        .sort((a, b) => a.time - b.time);

      return {
        protocol: slug,
        schedule,
        observedThrough: observed.at(-1)?.time,
        // `supplyMetrics.maxSupply` is the reliable one; `metadata.total` is null
        // on some tokens (Uniswap) and set on others (Arbitrum).
        maxSupply:
          finite(body.supplyMetrics?.maxSupply) ?? finite(body.metadata?.total),
        // Already PERCENTS, not fractions — verified live (arbitrum insiders
        // 36.5 now → 39.4 final, section progress 81.3). Deliberately NOT run
        // through a "rescale if <= 1" guard: that would corrupt a genuinely tiny
        // insider share, which is a real thing to want to read.
        insiderPctNow: finite(alloc?.current?.insiders),
        insiderPctFinal: finite(alloc?.final?.insiders),
        // `tokenAllocation.progress` is a per-SECTION dict ({insiders: 81.3,
        // airdrop: 100, …}), so the publisher offers no scalar to map onto the
        // spec's single `progressPct` and picking one key would be arbitrary.
        // Derived instead from the same summed series the card plots, so the
        // headline and the chart can't disagree — 88.7% for arbitrum, against
        // 87.8% for the publisher's dict weighted by final allocation share.
        progressPct:
          unlockedFinal > 0
            ? clampPct((unlockedNow / unlockedFinal) * 100)
            : undefined,
        upcoming,
      };
    });
  }

  async getStablecoinSupply(): Promise<StablecoinSupply> {
    return stablecoinsCache.get("supply", async () => {
      const [assetsBody, chains] = await Promise.all([
        fetchJson<LlamaStablecoinsResp>(STABLES_URL),
        fetchJson<LlamaStablecoinChain[]>(STABLECHAINS_URL).catch(() => []),
      ]);
      const assets = assetsBody?.peggedAssets;
      if (!Array.isArray(assets))
        throw new Error("defillama stablecoins: unexpected response shape");
      // USD-pegged aggregate: DeFiLlama exposes no top-level total, so sum
      // peggedUSD across USD stablecoins for each snapshot and diff for deltas.
      let now = 0;
      let d1 = 0;
      let d7 = 0;
      let d30 = 0;
      for (const a of assets) {
        if (a.pegType && a.pegType !== "peggedUSD") continue;
        now += a.circulating?.peggedUSD ?? 0;
        d1 += a.circulatingPrevDay?.peggedUSD ?? 0;
        d7 += a.circulatingPrevWeek?.peggedUSD ?? 0;
        d30 += a.circulatingPrevMonth?.peggedUSD ?? 0;
      }
      if (now <= 0) throw new Error("defillama stablecoins: empty aggregate");
      const pct = (prev: number) =>
        prev > 0 ? ((now - prev) / prev) * 100 : 0;
      const nowMs = Date.now();
      const history: SeriesPoint[] = [
        { time: nowMs - 30 * 86_400_000, value: d30 },
        { time: nowMs - 7 * 86_400_000, value: d7 },
        { time: nowMs - 86_400_000, value: d1 },
        { time: nowMs, value: now },
      ].filter((p) => p.value > 0);
      const topChains = (Array.isArray(chains) ? chains : [])
        .map((c) => ({
          name: c.name,
          usd: c.totalCirculatingUSD?.peggedUSD ?? 0,
        }))
        .filter((c) => c.usd > 0)
        .sort((a, b) => b.usd - a.usd)
        .slice(0, 12);
      return {
        totalUsd: now,
        changePct1d: pct(d1),
        changePct7d: pct(d7),
        changePct30d: pct(d30),
        history,
        topChains,
      };
    });
  }

  async getYieldPools(): Promise<YieldPool[]> {
    return yieldsCache.get("pools", async () => {
      const body = await fetchJson<LlamaYieldsResp>(YIELDS_URL);
      const data = body?.data;
      if (!Array.isArray(data))
        throw new Error("defillama yields: unexpected response shape");
      return data
        .filter(
          (p) =>
            Number.isFinite(p.tvlUsd) &&
            (p.tvlUsd ?? 0) > 0 &&
            Number.isFinite(p.apy),
        )
        .map((p) => ({
          pool: p.pool,
          chain: p.chain,
          project: p.project,
          symbol: p.symbol,
          tvlUsd: p.tvlUsd as number,
          apy: p.apy as number,
          apyBase: Number.isFinite(p.apyBase) ? p.apyBase : null,
          apyReward: Number.isFinite(p.apyReward) ? p.apyReward : null,
          apyPct7D: Number.isFinite(p.apyPct7D) ? p.apyPct7D : null,
          stablecoin: !!p.stablecoin,
          ilRisk: p.ilRisk ?? "unknown",
        }))
        .sort((a, b) => b.tvlUsd - a.tvlUsd)
        .slice(0, 250);
    });
  }

  async getFeesOverview(): Promise<FeesOverview> {
    return feesOverviewCache.get("overview", async () => {
      const body = await fetchJson<LlamaOverview>(FEES_URL);
      if (!body || !Number.isFinite(body.total24h))
        throw new Error("defillama fees-overview: unexpected response shape");
      return {
        total24h: body.total24h as number,
        total7d: Number.isFinite(body.total7d)
          ? (body.total7d as number)
          : null,
        changePct: Number.isFinite(body.change_1d)
          ? (body.change_1d as number)
          : null,
        history: toSeries(body.totalDataChart),
      };
    });
  }
}
