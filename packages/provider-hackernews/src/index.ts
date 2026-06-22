import type {
  Capability,
  MarketDataProvider,
  NewsItem,
  SocialQuery,
} from "@zframes/core";
import { fetchJson } from "@zframes/core/fetch";

const SEARCH_URL = "https://hn.algolia.com/api/v1/search";
const itemUrl = (id: string) => `https://news.ycombinator.com/item?id=${id}`;

/** The slice of an Algolia HN hit we read. */
interface HnHit {
  objectID: string;
  title?: string | null;
  story_title?: string | null;
  url?: string | null;
  story_url?: string | null;
  points?: number | null;
  num_comments?: number | null;
  created_at_i?: number | null;
}
interface HnResponse {
  hits?: HnHit[];
}

/**
 * Free, no-API-key social provider backed by the Hacker News Algolia search API.
 * - `social`: top stories + discussion. An empty query returns the HN front
 *   page; a query (e.g. "bitcoin") returns matching stories ranked by relevance.
 *
 * The Algolia endpoint sends `Access-Control-Allow-Origin: *`, so unlike the
 * RSS news outlets this works directly in the browser with no proxy — and so it
 * keeps working on a fully static deploy with no runtime.
 */
export class HackerNewsProvider implements MarketDataProvider {
  readonly name = "hackernews";
  readonly capabilities: readonly Capability[] = ["social"];

  async getSocial({ query, limit = 15 }: SocialQuery): Promise<NewsItem[]> {
    const q = (query ?? "").trim();
    const params = new URLSearchParams();
    if (q) {
      params.set("query", q);
      params.set("tags", "story");
    } else {
      params.set("tags", "front_page");
    }
    params.set("hitsPerPage", String(Math.min(Math.max(limit, 1), 50)));

    const body = await fetchJson<HnResponse>(`${SEARCH_URL}?${params}`);
    const hits = body.hits;
    if (!Array.isArray(hits)) {
      throw new Error("hackernews: unexpected response shape");
    }

    const items: NewsItem[] = [];
    for (const h of hits) {
      const title = h.title ?? h.story_title;
      if (!title) continue;
      items.push({
        title,
        url: h.url ?? h.story_url ?? itemUrl(h.objectID),
        source: "Hacker News",
        commentsUrl: itemUrl(h.objectID),
        ...(typeof h.points === "number" ? { points: h.points } : {}),
        ...(typeof h.num_comments === "number"
          ? { commentCount: h.num_comments }
          : {}),
        ...(typeof h.created_at_i === "number"
          ? { publishedAt: h.created_at_i * 1000 }
          : {}),
      });
    }
    return items.slice(0, limit);
  }
}
