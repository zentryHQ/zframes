import { curatedById } from "@/app/lib/curated-dashboards";
import { getDashboard } from "@/app/lib/dashboards";

// Server-only: resolves a dashboard id from EITHER source — the static curated
// set (Phase 2) or the DB (Phase 3 published/community). Used by the preview page
// and the raw-spec endpoint so both work for curated and community ids alike.
export async function resolveDashboard(
  id: string,
): Promise<{ id: string; title: string; spec: unknown } | null> {
  const curated = curatedById(id);
  if (curated)
    return { id: curated.id, title: curated.title, spec: curated.spec };

  const row = await getDashboard(id);
  if (row) return { id: row.id, title: row.title, spec: row.spec };

  return null;
}
