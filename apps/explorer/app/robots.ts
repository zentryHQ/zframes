import type { MetadataRoute } from "next";
import {
  absoluteUrl,
  isProductionDeployment,
  PRIVATE_PATHS,
  SITE_URL,
} from "@/app/lib/site";

/**
 * `/robots.txt`.
 *
 * Rendered per request rather than baked at build time, because the answer
 * depends on WHICH deployment is serving it — a preview build and production
 * build from the same commit must not say the same thing.
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  // A preview deployment is a byte-identical copy of the site on a different
  // hostname. Every page on it already canonicalises to production, but a
  // canonical is a hint; this is the directive. Without it, `*.vercel.app` copies
  // of the whole site compete with production for the same queries.
  if (!isProductionDeployment()) {
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // `/api/` returns JSON, `/embed/` is a chrome-less duplicate of
        // `/dashboard/<id>`, and the two account pages are per-user. None has a
        // reason to be fetched by a crawler; `/embed/` additionally sends a
        // `X-Robots-Tag: noindex` header (next.config.ts) so it stays out of the
        // index even when a crawler reaches it by following a link.
        disallow: [...PRIVATE_PATHS],
      },
      // AI/answer-engine crawlers, named explicitly. They inherit the `*` rules
      // anyway — this block exists so that allowing them is a recorded decision
      // with a place to revoke it, rather than an accident of omission. zframes
      // is MIT and its whole pitch is "ask your agent for it", so being
      // legible to the agents is the point.
      {
        userAgent: [
          "GPTBot",
          "OAI-SearchBot",
          "ChatGPT-User",
          "ClaudeBot",
          "Claude-User",
          "Claude-SearchBot",
          "PerplexityBot",
          "Perplexity-User",
          "Google-Extended",
          "Applebot-Extended",
          "CCBot",
          "meta-externalagent",
        ],
        allow: "/",
        disallow: [...PRIVATE_PATHS],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
    host: SITE_URL,
  };
}
