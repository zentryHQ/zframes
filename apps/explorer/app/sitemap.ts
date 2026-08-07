import type { MetadataRoute } from "next";
import { listIndexableBoards } from "@/app/lib/dashboards";
import { absoluteUrl, STATIC_ROUTES } from "@/app/lib/site";

/**
 * `/sitemap.xml` — the fixed pages plus every listed, approved board.
 *
 * ISR rather than static, for the same reason `/` and `/dashboard/[id]` are: the
 * board list is a mutable table, and a sitemap baked at build time would advertise
 * whatever existed at deploy and never mention anything published since. An hour
 * is well inside the window any crawler re-fetches in.
 *
 * It also must not make `next build` depend on a reachable database — in dev that
 * is the single-connection PGlite socket the build's 11 prerender workers already
 * race (see the app's AGENTS.md). Deferring the query to first request sidesteps
 * that entirely, and the catch below means an unreachable database costs us the
 * board URLs, not the sitemap.
 */
export const revalidate = 3600;

/** Sitemap protocol ceiling. Well above any plausible board count — a tripwire. */
const SITEMAP_URL_LIMIT = 50_000;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((route) => ({
    url: absoluteUrl(route.path),
    lastModified: new Date(),
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  let boards: Awaited<ReturnType<typeof listIndexableBoards>> = [];
  try {
    boards = await listIndexableBoards();
  } catch (err) {
    // A sitemap missing its board URLs still tells a crawler about the four
    // pages that matter most. A 500 tells it nothing and, repeated, gets the
    // sitemap dropped from Search Console.
    console.error("[sitemap] could not list boards:", err);
  }

  const boardEntries: MetadataRoute.Sitemap = boards.map((board) => ({
    url: absoluteUrl(`/dashboard/${board.id}`),
    lastModified: board.updatedAt ?? board.createdAt,
    changeFrequency: "weekly",
    // Curated boards are the editorial showcase — the boards the site is built
    // to show off — so they outrank a community publish. Both stay below the
    // static pages, which are the actual entry points.
    priority: board.curated ? 0.8 : 0.6,
  }));

  const entries = [...staticEntries, ...boardEntries];
  if (entries.length > SITEMAP_URL_LIMIT) {
    // Past this the protocol requires a sitemap index of several files. Nothing
    // silently truncates — this is the note that says it is time to build one.
    console.warn(
      `[sitemap] ${entries.length} URLs exceeds the ${SITEMAP_URL_LIMIT} per-file limit — split into a sitemap index.`,
    );
  }
  return entries;
}
