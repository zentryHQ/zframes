import { count, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/app/lib/db";
import { dashboards, reports } from "@/app/lib/db/schema";

export type DashboardStatus = "pending" | "approved" | "removed";

export async function createReport(
  dashboardId: string,
  reporterId: string | null,
  reason: string,
): Promise<void> {
  await db.insert(reports).values({
    id: nanoid(12),
    dashboardId,
    reporterId,
    reason: reason.slice(0, 500),
  });
}

// Admin queue: every dashboard with ≥1 report, most-reported first.
export async function listReported() {
  return db
    .select({
      id: dashboards.id,
      title: dashboards.title,
      status: dashboards.status,
      visibility: dashboards.visibility,
      reportCount: count(reports.id),
    })
    .from(reports)
    .innerJoin(dashboards, eq(reports.dashboardId, dashboards.id))
    .groupBy(dashboards.id)
    .orderBy(desc(count(reports.id)));
}

// The takedown lever: flip status. `removed` drops the dashboard from the
// community list AND makes getDashboard()/the preview/raw-spec 404.
export async function setStatus(
  id: string,
  status: DashboardStatus,
): Promise<void> {
  await db
    .update(dashboards)
    .set({ status, updatedAt: new Date() })
    .where(eq(dashboards.id, id));
}
