import { getDashboard } from "@/app/lib/dashboards";

/**
 * Server-only: resolve a dashboard id to its spec.
 *
 * ONE source now. Until 2026-08-05 this checked a static curated set first and
 * the database second; the showcase moved into the `dashboards` table (rows with
 * `curated: true`), so a curated slug and a community nanoid are looked up
 * identically. Callers did not change — the dual lookup was always an
 * implementation detail of this function, which is what made the move cheap.
 */
export type ResolvedDashboard = {
  id: string;
  title: string;
  tags: string[];
  spec: unknown;
  /** True for the editorial showcase. Surfaced because a curated board has no
   *  owner, so anything owner-scoped has to be able to tell the two apart. */
  curated: boolean;
  /**
   * `listed` | `unlisted`. Surfaced for ONE reason: an unlisted board is a
   * private link — publishable, shareable with a colleague, and never meant to
   * be discoverable. The page uses this to emit `robots: noindex` for those
   * boards, which together with `listIndexableBoards` keeping them out of
   * `sitemap.xml` is what stops a link someone shared once from turning up in
   * search results.
   */
  visibility: string;
  /** The curated editorial one-liner, or null for a community publish. Used as
   *  the page's meta description when present — a real sentence about the board
   *  beats the generated "a live N-frame dashboard" fallback in every snippet. */
  description: string | null;
  /** Last write. Feeds `article:modified_time` / schema `dateModified`. */
  updatedAt: Date;
  createdAt: Date;
  /** The like count as of this render. NOTE the page is ISR (`revalidate = 300`),
   *  so this is up to 5 minutes stale and identical for every visitor — it seeds
   *  the button's optimistic state, and the POST response is what reconciles it.
   *  Fetching a fresh count client-side on mount was the alternative; it costs a
   *  request on every board view to correct a number nobody is watching. */
  likes: number;
};

export async function resolveDashboard(
  id: string,
): Promise<ResolvedDashboard | null> {
  const row = await getDashboard(id);
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    tags: row.tags,
    spec: row.spec,
    curated: row.curated,
    visibility: row.visibility,
    description: row.description,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
    likes: row.likes,
  };
}
