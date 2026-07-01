import { curatedById } from "@/app/lib/curated-dashboards";
import { getDashboard } from "@/app/lib/dashboards";

// Server-only: resolves a dashboard id from EITHER source — the static curated
// set (Phase 2) or the DB (Phase 3 published/community). Used by the preview page
// and the raw-spec endpoint so both work for curated and community ids alike.
export type ResolvedDashboard = {
  id: string;
  title: string;
  tags: string[];
  spec: unknown;
};

export async function resolveDashboard(
  id: string,
): Promise<ResolvedDashboard | null> {
  const curated = curatedById(id);
  if (curated)
    return {
      id: curated.id,
      title: curated.title,
      tags: curated.tags,
      spec: curated.spec,
    };

  const row = await getDashboard(id);
  if (row)
    return { id: row.id, title: row.title, tags: row.tags, spec: row.spec };

  return null;
}
