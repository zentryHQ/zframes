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
  };
}
