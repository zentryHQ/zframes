import type {
  Capability,
  MarketDataProvider,
  NewsItem,
  NewsQuery,
} from "@zframes/core";
import { fetchText } from "@zframes/core/fetch";

/**
 * Named outlet feeds. The key is exactly what the `news-feed` frame's `source`
 * enum passes; keep the two lists in sync. Every feed is a free, keyless RSS
 * endpoint — none send a CORS header, so each is fetched through the runtime
 * proxy (`{ proxied: true }`); on a static deploy with no runtime they 404 and
 * the frame shows its empty state.
 */
const FEEDS: Record<string, { url: string; source: string }> = {
  coindesk: {
    url: "https://www.coindesk.com/arc/outboundfeeds/rss/",
    source: "CoinDesk",
  },
  cointelegraph: {
    url: "https://cointelegraph.com/rss",
    source: "Cointelegraph",
  },
  decrypt: { url: "https://decrypt.co/feed", source: "Decrypt" },
  cnbc: {
    url: "https://www.cnbc.com/id/20910258/device/rss/rss.html",
    source: "CNBC Markets",
  },
  nasdaq: {
    url: "https://www.nasdaq.com/feed/rssoutbound?category=Markets",
    source: "Nasdaq",
  },
};

/**
 * Per-symbol stock headlines via Google News' keyless RSS search — news scoped
 * to specific tickers. (Yahoo Finance's per-symbol feed is now heavily
 * rate-limited / 429s for automated access, so Google News is the reliable
 * keyless alternative for the same job.) Tickers are OR'd and qualified with
 * "stock" so "TSLA" matches Tesla coverage, not unrelated noise.
 */
const googleNewsUrl = (tickers: string[]) => {
  const query = `(${tickers.join(" OR ")}) stock`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** Decode the handful of HTML/XML entities that show up in feed titles. */
function decodeEntities(s: string): string {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, code: string) => {
    const lower = code.toLowerCase();
    if (NAMED_ENTITIES[lower]) return NAMED_ENTITIES[lower];
    if (code[0] === "#") {
      const n =
        code[1] === "x" || code[1] === "X"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole;
    }
    return whole;
  });
}

const stripCdata = (s: string) =>
  s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

/** CDATA → raw, strip any HTML tags, decode entities, collapse whitespace. */
function plainText(s: string): string {
  return decodeEntities(stripCdata(s).replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/** Inner content of the first <name …>…</name> element in `block`. */
function tag(block: string, name: string): string | undefined {
  const m = block.match(
    new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"),
  );
  return m ? m[1] : undefined;
}

/** The article link — RSS `<link>url</link>` or Atom `<link href="url"/>`. */
function linkOf(block: string): string | undefined {
  const atom = [...block.matchAll(/<link\b[^>]*\bhref="([^"]+)"[^>]*>/gi)];
  if (atom.length > 0) {
    const alternate =
      atom.find((l) => /rel="alternate"/i.test(l[0])) ??
      atom.find((l) => !/\brel=/i.test(l[0])) ??
      atom[0];
    return decodeEntities(alternate[1]).trim();
  }
  const rss = tag(block, "link");
  return rss ? decodeEntities(stripCdata(rss)).trim() : undefined;
}

/** Publication time as epoch ms, from whichever date element the feed uses. */
function dateOf(block: string): number | undefined {
  const raw =
    tag(block, "pubDate") ??
    tag(block, "published") ??
    tag(block, "updated") ??
    tag(block, "dc:date");
  if (!raw) return undefined;
  const t = Date.parse(stripCdata(raw).trim());
  return Number.isFinite(t) ? t : undefined;
}

/** Parse an RSS 2.0 or Atom feed body into normalised NewsItems, newest first. */
function parseFeed(xml: string, source: string, limit: number): NewsItem[] {
  const blocks = [...xml.matchAll(/<(item|entry)\b[\s\S]*?<\/\1>/gi)].map(
    (m) => m[0],
  );
  const items: NewsItem[] = [];
  for (const block of blocks) {
    const rawTitle = tag(block, "title");
    const url = linkOf(block);
    if (!rawTitle || !url) continue;
    const title = plainText(rawTitle);
    if (!title) continue;
    const rawDesc =
      tag(block, "description") ??
      tag(block, "summary") ??
      tag(block, "content");
    const summary = rawDesc ? plainText(rawDesc).slice(0, 280) : undefined;
    const publishedAt = dateOf(block);
    items.push({
      title,
      url,
      source,
      ...(summary ? { summary } : {}),
      ...(publishedAt ? { publishedAt } : {}),
    });
  }
  // Sort newest-first only when the feed actually carries dates; otherwise the
  // feed's own order (already newest-first for every source here) is kept.
  if (items.some((i) => i.publishedAt !== undefined)) {
    items.sort((a, b) => (b.publishedAt ?? 0) - (a.publishedAt ?? 0));
  }
  return items.slice(0, limit);
}

/**
 * Free, no-API-key news provider backed by public RSS feeds.
 * - `news`: latest headlines from a named outlet feed (CoinDesk, Cointelegraph,
 *   Decrypt, CNBC, Nasdaq), or — feed `"stocks"` — Google News headlines scoped
 *   to specific tickers. RSS isn't CORS-safe, so feeds are read through the
 *   runtime's same-origin proxy; with no runtime running the frame degrades to
 *   empty.
 */
export class NewsProvider implements MarketDataProvider {
  readonly name = "news";
  readonly capabilities: readonly Capability[] = ["news"];

  async getNews({ feed, symbols, limit = 12 }: NewsQuery): Promise<NewsItem[]> {
    if (feed === "stocks") {
      // Strip any HIP-3 dex prefix ("xyz:TSLA" → "TSLA"); use bare tickers.
      const tickers = (symbols ?? [])
        .map((s) => (s.split(":").pop() ?? "").toUpperCase())
        .filter(Boolean);
      if (tickers.length === 0) return [];
      const xml = await fetchText(googleNewsUrl(tickers), {
        proxied: true,
        timeoutMs: 12_000,
      });
      return parseFeed(xml, "Google News", limit);
    }
    const def = FEEDS[feed];
    if (!def) throw new Error(`news: unknown feed "${feed}"`);
    const xml = await fetchText(def.url, { proxied: true, timeoutMs: 12_000 });
    return parseFeed(xml, def.source, limit);
  }
}
