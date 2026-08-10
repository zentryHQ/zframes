import type {
  Capability,
  CoinMarketEntry,
  CryptoAssetProfile,
  CryptoDeveloperActivity,
  GlobalMarket,
  MarketDataProvider,
  MarketSector,
  NftCollection,
  TrendingCoin,
} from "@zframes/spec";
import { TtlCache } from "@zframes/data-primitives/cache";
import { fetchJson } from "@zframes/data-primitives/fetch";

const GLOBAL_URL = "https://api.coingecko.com/api/v3/global";
const MARKETS_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=50&page=1&sparkline=false&price_change_percentage=24h";
const TRENDING_URL = "https://api.coingecko.com/api/v3/search/trending";
const CATEGORIES_URL = "https://api.coingecko.com/api/v3/coins/categories";
const NFT_URL = "https://api.coingecko.com/api/v3/nfts";
const COIN_URL = "https://api.coingecko.com/api/v3/coins";
// Everything a profile needs arrives in this one response (~30 KB), so the query
// asks for market and developer data up front and drops what a card never shows:
// `localization=false` alone strips ~50 translations of every category name, and
// `tickers=false` a few hundred per-exchange pair entries.
const COIN_PARAMS =
  "localization=false&tickers=false&market_data=true&community_data=true&developer_data=true&sparkline=false";
// `symbols` is the keyless-tier filter that answers with CoinGecko's own
// canonical coin for a ticker (verified live on the free tier).
const MARKETS_BY_SYMBOL_URL =
  "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=25&page=1&sparkline=false&symbols=";
const SEARCH_URL = "https://api.coingecko.com/api/v3/search?query=";

// A curated set of blue-chip NFT collections. CoinGecko's keyless tier has no
// bulk "top NFTs" endpoint (that one is Pro-only), so market data is fetched one
// collection at a time — hence a small, hand-picked list rather than a live
// top-N. Fetched sequentially (naturally paced by network RTT) and cached for a
// long TTL so the burst is infrequent and never starves the other CoinGecko
// frames sharing this rate limit; a collection whose fetch fails is simply
// skipped, so a throttled call or a renamed slug degrades the list instead of
// emptying it.
const NFT_IDS = [
  "bored-ape-yacht-club",
  "pudgy-penguins",
  "mutant-ape-yacht-club",
  "cryptopunks",
  "azuki",
  "milady",
  "doodles-official",
  "moonbirds",
  "lil-pudgys",
  "degods",
] as const;

/**
 * Pause between the per-collection NFT calls. Sequential alone isn't enough: the
 * keyless tier answers 429 with `Retry-After: 60` after roughly six calls in
 * ~30 s (see {@link idCache}), and ten back-to-back requests clear that in a
 * couple of seconds — so the tail of the list would 429 and the card would render
 * six collections out of ten. 250 ms spreads the ten over ~2.5 s, which stays
 * inside the sub-window budget.
 */
const NFT_PACING_MS = 250;

// CoinGecko's keyless public tier is the most rate-limited of our providers — a
// burst of requests (the editor reloading on every Save, or several dashboards
// on one IP) earns an HTTP 429. Both endpoints barely move (CoinGecko refreshes
// the global snapshot ~every 10 min; dominance and the top-50 marketcap table
// drift over hours), so the shared cache serves a fresh value without a network
// call, dedups concurrent loads, persists across reloads, and on a 429 /
// transient error serves the last good value (even past its TTL) instead of an
// error card. Each TTL sits just under its hook's poll interval (global ~15 min,
// markets ~12 min) so background polls still refresh while rapid reloads reuse it.
const globalCache = new TtlCache<GlobalMarket>({
  namespace: "zframes:coingecko:global",
  ttlMs: 12 * 60_000,
  persist: true,
});
const marketsCache = new TtlCache<CoinMarketEntry[]>({
  namespace: "zframes:coingecko:markets",
  ttlMs: 10 * 60_000,
  persist: true,
});
const trendingCache = new TtlCache<TrendingCoin[]>({
  namespace: "zframes:coingecko:trending",
  ttlMs: 10 * 60_000,
  persist: true,
});
const categoriesCache = new TtlCache<MarketSector[]>({
  namespace: "zframes:coingecko:categories",
  ttlMs: 12 * 60_000,
  persist: true,
});
// NFT floors drift over hours and each refresh is ~10 sequential calls, so the
// TTL is long (45 min, under useNftMarket's hourly poll) to keep that burst rare.
const nftCache = new TtlCache<NftCollection[]>({
  namespace: "zframes:coingecko:nft",
  ttlMs: 45 * 60_000,
  persist: true,
});
// A profile is mostly a price snapshot, so its TTL sits just under
// useCryptoProfile's 5-minute poll: scheduled polls still refresh, while a reload
// or a second card on the same asset reuses the value and spends no token.
const profileCache = new TtlCache<CryptoAssetProfile>({
  namespace: "zframes:coingecko:profile",
  ttlMs: 4 * 60_000,
  persist: true,
});
// Ticker → id resolution is cached separately, and for a day, because it is a
// different *kind* of fact: a listed coin's id effectively never changes, while
// resolving one costs one or two extra requests on a tier that starts answering
// 429 after a handful in a minute (measured: `Retry-After: 60` on the sixth call
// in ~30 s). Splitting the two caches means a profile going stale re-fetches the
// profile only — a board of crypto-profile cards resolves each ticker once a day.
const idCache = new TtlCache<ResolvedCoin>({
  namespace: "zframes:coingecko:coin-id",
  ttlMs: 24 * 60 * 60_000,
  persist: true,
});

/**
 * The top handful of tickers, pinned to their ids. Two jobs: it skips the
 * resolution round-trip for the assets nearly every board asks for, and — the
 * real reason it exists — it makes those tickers immune to a change in
 * CoinGecko's ranking or search ordering. Symbol squatting is not hypothetical
 * here: 11 listed coins publish the symbol "BTC", 14 publish "ETH" and 19
 * publish "PEPE", so a resolver that trusted upstream ordering alone could one
 * day silently repoint "BTC" at a scam token.
 *
 * Deliberately short. A long table rots — "TON" already did, since
 * `the-open-network` now publishes the symbol "GRAM" — so everything outside the
 * majors resolves dynamically in {@link resolveCoinId} instead.
 */
const MAJOR_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  BNB: "binancecoin",
  DOGE: "dogecoin",
  ADA: "cardano",
  TRX: "tron",
  AVAX: "avalanche-2",
  LINK: "chainlink",
  DOT: "polkadot",
  LTC: "litecoin",
  BCH: "bitcoin-cash",
  XLM: "stellar",
  SUI: "sui",
  HYPE: "hyperliquid",
  USDT: "tether",
  USDC: "usd-coin",
};
/**
 * The same pins read the other way, so passing a major's *id* ("ethereum")
 * short-circuits before symbol resolution can see it. That matters more than it
 * looks: three listed coins publish the literal symbol "ethereum", and asking
 * the API to resolve that symbol really does answer with
 * `voldemorttrumprobotnik-10neko` (rank 6247).
 */
const MAJOR_ID_SET = new Set(Object.values(MAJOR_IDS));

/** Rank past which a lone symbol match is treated as a possible squatter. */
const SUSPICIOUS_RANK = 500;
/**
 * Length past which a hyphen-less token reads as an id rather than a ticker.
 * CoinGecko ids that carry no hyphen are usually whole words ("ethereum",
 * "arbitrum", "chainlink"); tickers this long are rare.
 */
const ID_SHAPED_MIN_LENGTH = 7;

/** A resolved asset reference: the id to fetch, plus the reading to try if it 404s. */
interface ResolvedCoin {
  id: string;
  /** Set only by the id-vs-ticker guard in {@link resolveCoinId}. */
  fallbackId?: string;
}

/** Coerce a maybe-undefined/NaN numeric to a finite fallback. */
function numberOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * A finite number, or `undefined` when the field wasn't published — for the
 * profile fields whose absence has to stay absent.
 *
 * The explicit null/empty-string check is the whole point: `Number(null)` and
 * `Number("")` are both **0**, which is finite, so the obvious one-liner turns a
 * missing value into a real zero. On `max_supply` that inversion is severe —
 * upstream sends `null` for every uncapped asset (ETH included), and a 0 cap
 * renders as "fully diluted", the exact opposite of the truth.
 */
function finite(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/** A non-empty trimmed string, or undefined. Upstream publishes both `null` and `""` for an absent link. */
function text(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** First usable entry of a link array — `links.homepage` holds several, some blank. */
function firstLink(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined;
  for (const entry of value) {
    const link = text(entry);
    if (link) return link;
  }
  return undefined;
}

const HTML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
  "&#39;": "'",
  "&nbsp;": " ",
};

/**
 * Flatten a published description to the plain text the spec field promises.
 * CoinGecko writes these as light HTML — cross-references to other assets come
 * wrapped in `<a href>`, and longer entries carry `<br>` and CRLF — so the raw
 * string would render as visible markup inside a card.
 */
function plainText(value: unknown): string | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  const stripped = raw
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(
      /&[a-z]+;|&#\d+;/gi,
      (entity) => HTML_ENTITIES[entity.toLowerCase()] ?? " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  return stripped.length > 0 ? stripped : undefined;
}

interface CoinGeckoTrending {
  coins?: {
    item: {
      id: string;
      name: string;
      symbol: string;
      market_cap_rank: number | null;
      data?: {
        price?: number | string;
        price_change_percentage_24h?: { usd?: number };
      };
    };
  }[];
}

interface CoinGeckoCategory {
  name: string;
  market_cap: number | null;
  market_cap_change_24h: number | null;
}

interface CoinGeckoGlobal {
  data: {
    total_market_cap: Record<string, number>;
    market_cap_percentage: Record<string, number>;
    market_cap_change_percentage_24h_usd: number;
  };
}

interface CoinGeckoMarket {
  symbol: string;
  name: string;
  market_cap: number;
  price_change_percentage_24h: number | null;
}

/** A `/coins/markets?symbols=` row, used only to resolve a ticker to an id. */
interface CoinGeckoSymbolMatch {
  id?: string;
  symbol?: string;
  market_cap?: number | null;
  market_cap_rank?: number | null;
}

interface CoinGeckoSearch {
  coins?: {
    id?: string;
    symbol?: string;
    market_cap_rank?: number | null;
  }[];
}

/**
 * The `/coins/{id}` payload, narrowed to the fields a profile maps. Every leaf is
 * optional and nullable: coverage thins fast below the majors, and upstream
 * signals "not published" with `null` (`max_supply`, `subreddit_url`) or `""`
 * (`whitepaper`) interchangeably.
 */
interface CoinGeckoCoinDetail {
  id?: string;
  symbol?: string;
  name?: string;
  market_cap_rank?: number | null;
  categories?: (string | null)[];
  description?: { en?: string | null };
  links?: {
    homepage?: (string | null)[];
    repos_url?: { github?: (string | null)[] };
    twitter_screen_name?: string | null;
    subreddit_url?: string | null;
    whitepaper?: string | null;
  };
  market_data?: {
    current_price?: Record<string, number | null>;
    market_cap?: Record<string, number | null>;
    fully_diluted_valuation?: Record<string, number | null>;
    total_volume?: Record<string, number | null>;
    circulating_supply?: number | null;
    total_supply?: number | null;
    max_supply?: number | null;
    ath?: Record<string, number | null>;
    ath_date?: Record<string, string | null>;
    ath_change_percentage?: Record<string, number | null>;
    atl?: Record<string, number | null>;
    atl_date?: Record<string, string | null>;
    atl_change_percentage?: Record<string, number | null>;
    price_change_percentage_24h?: number | null;
    price_change_percentage_7d?: number | null;
    price_change_percentage_30d?: number | null;
    price_change_percentage_1y?: number | null;
  };
  developer_data?: {
    stars?: number | null;
    forks?: number | null;
    subscribers?: number | null;
    total_issues?: number | null;
    closed_issues?: number | null;
    pull_requests_merged?: number | null;
    pull_request_contributors?: number | null;
    commit_count_4_weeks?: number | null;
  };
}

/** Best exact-symbol match by market cap — the `/coins/markets?symbols=` rule. */
function bestByMarketCap(
  entries: unknown,
  ticker: string,
): { id: string; rank?: number } | null {
  if (!Array.isArray(entries)) return null;
  const exact = (entries as CoinGeckoSymbolMatch[]).filter(
    (entry) => (entry.symbol ?? "").toLowerCase() === ticker && text(entry.id),
  );
  if (exact.length === 0) return null;
  // Explicitly re-sorted rather than trusting position: the rule is "largest
  // exact-symbol match", and a first-hit resolver is how "BTC" ends up pointing
  // at a meme coin.
  exact.sort(
    (a, b) => (finite(b.market_cap) ?? -1) - (finite(a.market_cap) ?? -1),
  );
  return {
    id: exact[0].id as string,
    rank: finite(exact[0].market_cap_rank),
  };
}

/** Best exact-symbol match by market-cap rank — the `/search` rule. */
function bestByRank(
  coins: unknown,
  ticker: string,
): { id: string; rank?: number } | null {
  if (!Array.isArray(coins)) return null;
  const exact = (coins as NonNullable<CoinGeckoSearch["coins"]>).filter(
    (coin) => (coin.symbol ?? "").toLowerCase() === ticker && text(coin.id),
  );
  if (exact.length === 0) return null;
  // An absent rank sorts LAST, not first: null means "too small to rank", the
  // opposite end of the scale from rank 1.
  exact.sort(
    (a, b) =>
      (finite(a.market_cap_rank) ?? Number.POSITIVE_INFINITY) -
      (finite(b.market_cap_rank) ?? Number.POSITIVE_INFINITY),
  );
  return {
    id: exact[0].id as string,
    rank: finite(exact[0].market_cap_rank),
  };
}

/**
 * Find the coin that publishes `ticker`, preferring the largest claimant.
 *
 * Two endpoints, in cost order. `/coins/markets?symbols=` is ~1 KB, returns
 * CoinGecko's own canonical coin for a symbol, and — unlike `/search` — finds
 * single-letter tickers (verified live: `W` → `wormhole`, `S` → `sonic-3`, whose
 * exact matches `/search` buries beneath 25 substring hits, so it returns none).
 * `/search` is the wider net for anything the symbols filter doesn't list.
 *
 * `/coins/list` is deliberately not used: it is 1.1 MB for 18k entries and
 * carries no rank at all, so it cannot disambiguate — its 11 `btc` rows sort
 * alphabetically, putting `batcat` ahead of `bitcoin`.
 */
async function resolveByTicker(
  ticker: string,
): Promise<{ id: string; rank?: number } | null> {
  const markets = await fetchJson<CoinGeckoSymbolMatch[]>(
    `${MARKETS_BY_SYMBOL_URL}${encodeURIComponent(ticker)}`,
  );
  const byMarketCap = bestByMarketCap(markets, ticker);
  if (byMarketCap) return byMarketCap;
  const search = await fetchJson<CoinGeckoSearch>(
    `${SEARCH_URL}${encodeURIComponent(ticker)}`,
  );
  return bestByRank(search?.coins, ticker);
}

/**
 * Resolve a frame's `asset` — a ticker ("BTC") or an id ("bitcoin") — to a
 * CoinGecko id, since `/coins/{id}` is keyed by id while a frame's symbol field
 * holds tickers.
 *
 * Order matters, cheapest and safest first: pinned majors (both directions), then
 * a hyphenated token, which is already an id because no ticker contains a hyphen,
 * and only then a network lookup — cached for a day, so a board of profile cards
 * resolves each ticker once.
 */
async function resolveCoinId(asset: string): Promise<ResolvedCoin> {
  const raw = asset.trim();
  if (!raw) throw new Error("coingecko crypto-profile: empty asset");
  const lower = raw.toLowerCase();
  const pinned = MAJOR_IDS[raw.toUpperCase()];
  if (pinned) return { id: pinned };
  if (MAJOR_ID_SET.has(lower)) return { id: lower };
  if (lower.includes("-")) return { id: lower };

  return idCache.get(lower, async () => {
    const match = await resolveByTicker(lower);
    // Nothing publishes this symbol, so the input was an id all along
    // ("arbitrum", "uniswap"). `/coins/{id}` 404s loudly if it wasn't.
    if (!match) return { id: lower };
    // The one case where a symbol match is worse than no match: an asset *name*
    // squatted as somebody's ticker. Asking upstream to resolve the symbol
    // "ethereum" really does answer with `voldemorttrumprobotnik-10neko` at rank
    // 6247. So when the input is shaped like an id and its only claimant sits far
    // down the rankings, read it as an id first — but keep the symbol match as a
    // fallback, so a genuinely deep-ranked long ticker still resolves on the
    // second try instead of becoming an error card.
    const idShaped = lower.length >= ID_SHAPED_MIN_LENGTH;
    const deeplyRanked =
      match.rank === undefined || match.rank > SUSPICIOUS_RANK;
    if (idShaped && deeplyRanked) return { id: lower, fallbackId: match.id };
    return { id: match.id };
  });
}

function mapDeveloperActivity(
  data: CoinGeckoCoinDetail["developer_data"],
): CryptoDeveloperActivity | undefined {
  if (!data) return undefined;
  const activity: CryptoDeveloperActivity = {
    stars: finite(data.stars),
    forks: finite(data.forks),
    subscribers: finite(data.subscribers),
    totalIssues: finite(data.total_issues),
    closedIssues: finite(data.closed_issues),
    pullRequestsMerged: finite(data.pull_requests_merged),
    pullRequestContributors: finite(data.pull_request_contributors),
    commits4Weeks: finite(data.commit_count_4_weeks),
  };
  // A token with no tracked repository sends the block with every field null;
  // omit it entirely rather than handing a frame an object of undefineds to test.
  return Object.values(activity).some((value) => value !== undefined)
    ? activity
    : undefined;
}

function mapProfile(body: CoinGeckoCoinDetail): CryptoAssetProfile {
  const md = body.market_data ?? {};
  const links = body.links ?? {};
  const handle = text(links.twitter_screen_name);
  const profile: CryptoAssetProfile = {
    id: body.id as string,
    symbol: (body.symbol ?? "").toUpperCase(),
    name: text(body.name) ?? (body.id as string),
    description: plainText(body.description?.en),
    // Filtered because upstream occasionally carries a null among the categories.
    categories: Array.isArray(body.categories)
      ? body.categories.flatMap((category) => text(category) ?? [])
      : [],
    marketCapRank: finite(body.market_cap_rank),
    price: finite(md.current_price?.usd),
    marketCap: finite(md.market_cap?.usd),
    // Frequently null even for a listed asset; passed through as absent so the
    // frame can derive it from supply × price rather than show a bogus 0.
    fullyDilutedValuation: finite(md.fully_diluted_valuation?.usd),
    volume24h: finite(md.total_volume?.usd),
    circulatingSupply: finite(md.circulating_supply),
    totalSupply: finite(md.total_supply),
    maxSupply: finite(md.max_supply),
    ath: finite(md.ath?.usd),
    athDate: text(md.ath_date?.usd),
    athChangePct: finite(md.ath_change_percentage?.usd),
    atl: finite(md.atl?.usd),
    atlDate: text(md.atl_date?.usd),
    atlChangePct: finite(md.atl_change_percentage?.usd),
    changePct24h: finite(md.price_change_percentage_24h),
    changePct7d: finite(md.price_change_percentage_7d),
    changePct30d: finite(md.price_change_percentage_30d),
    changePct1y: finite(md.price_change_percentage_1y),
    developer: mapDeveloperActivity(body.developer_data),
  };
  const resolvedLinks = {
    homepage: firstLink(links.homepage),
    sourceCode: firstLink(links.repos_url?.github),
    // Upstream publishes a bare handle here, but every sibling link field is a
    // URL, so it's expanded to one — a frame rendering these as anchors would
    // otherwise need a special case for this field alone.
    twitter: handle ? `https://x.com/${handle}` : undefined,
    subreddit: text(links.subreddit_url),
    whitepaper: text(links.whitepaper),
  };
  if (Object.values(resolvedLinks).some((link) => link !== undefined))
    profile.links = resolvedLinks;
  return profile;
}

/**
 * Fetch and map one asset's profile. Exactly one `/coins/{id}` call — every field
 * a profile needs is in that single response, and this provider's whole keyless
 * budget is shared across its endpoints, so there is no fan-out here.
 */
function loadProfile(id: string): Promise<CryptoAssetProfile> {
  return profileCache.get(id, async () => {
    const body = await fetchJson<CoinGeckoCoinDetail>(
      `${COIN_URL}/${encodeURIComponent(id)}?${COIN_PARAMS}`,
    );
    if (!text(body?.id) || !text(body?.symbol))
      throw new Error(`coingecko coin ${id}: unexpected response shape`);
    return mapProfile(body);
  });
}

interface CoinGeckoNft {
  id: string;
  name: string;
  floor_price?: { native_currency?: number; usd?: number };
  floor_price_24h_percentage_change?: { usd?: number };
  market_cap?: { usd?: number };
  volume_24h?: { usd?: number };
  one_day_sales?: number;
}

/**
 * Free-tier CoinGecko provider (no API key). Its keyless tier is aggressively
 * rate-limited, so both endpoints go through the shared cache — short TTL, in-
 * flight dedup, stale-on-error (see the cache notes above).
 * - global-market: total marketcap + per-asset dominance.
 * - coin-markets: top-50 coins by marketcap with 24h change.
 * - crypto-profile: identity, supply/dilution, ATH/ATL and dev activity for one asset.
 */
export class CoinGeckoProvider implements MarketDataProvider {
  readonly name = "coingecko";
  readonly capabilities: readonly Capability[] = [
    "global-market",
    "coin-markets",
    "trending-coins",
    "sector-performance",
    "nft-market",
    "crypto-profile",
  ];

  async getCryptoProfile(asset: string): Promise<CryptoAssetProfile> {
    const resolved = await resolveCoinId(asset);
    try {
      return await loadProfile(resolved.id);
    } catch (error) {
      // Only the id-vs-ticker guard sets a fallback, so this second attempt is
      // rare: it's the "long ticker that also looks like an id" case, where the
      // id reading was tried first and doesn't exist.
      if (!resolved.fallbackId) throw error;
      return loadProfile(resolved.fallbackId);
    }
  }

  async getTrendingCoins(): Promise<TrendingCoin[]> {
    return trendingCache.get("trending", async () => {
      const body = await fetchJson<CoinGeckoTrending>(TRENDING_URL);
      if (!Array.isArray(body?.coins))
        throw new Error("coingecko trending: unexpected response shape");
      return body.coins.map(({ item }) => {
        const price = Number(item.data?.price);
        const chg = Number(item.data?.price_change_percentage_24h?.usd);
        return {
          id: item.id,
          name: item.name,
          symbol: (item.symbol ?? "").toUpperCase(),
          rank: Number.isFinite(item.market_cap_rank)
            ? item.market_cap_rank
            : null,
          price: Number.isFinite(price) ? price : null,
          changePct24h: Number.isFinite(chg) ? chg : null,
        };
      });
    });
  }

  async getSectorPerformance(): Promise<MarketSector[]> {
    return categoriesCache.get("categories", async () => {
      const body = await fetchJson<CoinGeckoCategory[]>(CATEGORIES_URL);
      if (!Array.isArray(body))
        throw new Error("coingecko categories: unexpected response shape");
      return body
        .filter((c) => Number.isFinite(c.market_cap) && (c.market_cap ?? 0) > 0)
        .map((c) => ({
          name: c.name,
          marketCap: c.market_cap as number,
          changePct24h: Number.isFinite(c.market_cap_change_24h)
            ? (c.market_cap_change_24h as number)
            : 0,
        }))
        .sort((a, b) => b.marketCap - a.marketCap)
        .slice(0, 30);
    });
  }

  async getNftMarket(): Promise<NftCollection[]> {
    return nftCache.get("nft", async () => {
      const collections: NftCollection[] = [];
      // Sequential, not Promise.all: the keyless tier throttles a burst, and a
      // slow-but-complete list beats a fast-but-half-429'd one. A single failed
      // collection is skipped rather than failing the whole set.
      for (let index = 0; index < NFT_IDS.length; index++) {
        const id = NFT_IDS[index];
        // Paced, not merely serialised — the first call goes out immediately so
        // first paint isn't delayed, each later one waits out NFT_PACING_MS.
        if (index > 0)
          await new Promise((resolve) => setTimeout(resolve, NFT_PACING_MS));
        try {
          const body = await fetchJson<CoinGeckoNft>(`${NFT_URL}/${id}`);
          const floorUsd = Number(body?.floor_price?.usd);
          if (!body?.id || !Number.isFinite(floorUsd)) continue;
          collections.push({
            id: body.id,
            name: body.name ?? body.id,
            floorNative: numberOr(body.floor_price?.native_currency, 0),
            floorUsd,
            floorChangePct24h: numberOr(
              body.floor_price_24h_percentage_change?.usd,
              0,
            ),
            marketCapUsd: numberOr(body.market_cap?.usd, 0),
            volume24hUsd: numberOr(body.volume_24h?.usd, 0),
            sales24h: numberOr(body.one_day_sales, 0),
          });
        } catch {
          // Skip a throttled / renamed collection; keep the rest.
        }
      }
      if (collections.length === 0)
        throw new Error("coingecko nfts: no collections resolved");
      return collections.sort((a, b) => b.volume24hUsd - a.volume24hUsd);
    });
  }

  async getGlobalMarket(): Promise<GlobalMarket> {
    return globalCache.get("global", async () => {
      const body = await fetchJson<CoinGeckoGlobal>(GLOBAL_URL);
      // The free tier can answer a throttle/error with an unexpected body; guard
      // the shape so it throws a clear error instead of a deep `undefined` access.
      if (!body?.data?.total_market_cap || !body.data.market_cap_percentage)
        throw new Error("coingecko global: unexpected response shape");
      const change = Number(body.data.market_cap_change_percentage_24h_usd);
      return {
        totalMarketCapUsd: body.data.total_market_cap.usd ?? 0,
        marketCapChangePct24h: Number.isFinite(change) ? change : 0,
        dominance: body.data.market_cap_percentage,
      };
    });
  }

  async getCoinMarkets(): Promise<CoinMarketEntry[]> {
    return marketsCache.get("markets", async () => {
      const body = await fetchJson<CoinGeckoMarket[]>(MARKETS_URL);
      if (!Array.isArray(body))
        throw new Error("coingecko markets: unexpected response shape");
      return body
        .filter((c) => Number.isFinite(c.market_cap) && c.market_cap > 0)
        .map((c) => ({
          symbol: (c.symbol ?? "").toUpperCase(),
          name: c.name,
          marketCapUsd: c.market_cap,
          changePct24h: Number.isFinite(c.price_change_percentage_24h)
            ? (c.price_change_percentage_24h as number)
            : undefined,
        }));
    });
  }
}
