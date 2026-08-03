import { eq } from "drizzle-orm";
import { db } from "@/app/lib/db";
import { dashboards, dashboardThumbs } from "@/app/lib/db/schema";

// Server-only access to the nightly `/dashboard/[id]` screenshots (scripts/capture-thumbs.ts).
// One loader for BOTH consumers — the gallery card image route and the social
// og:image — so a takedown hides the capture everywhere at once, and a shared
// link can never unfurl a screenshot the gallery already stopped serving.
// The pure geometry the og:image needs alongside this lives in ./thumb-image.

export type DashboardThumb = {
  image: Buffer;
  contentType: string;
  capturedAt: Date;
};

// null = no capture yet (the caller falls back), or the dashboard was removed.
// The left join keeps curated ids working — those have no `dashboards` row.
export async function loadDashboardThumb(
  id: string,
): Promise<DashboardThumb | null> {
  const [row] = await db
    .select({
      image: dashboardThumbs.image,
      contentType: dashboardThumbs.contentType,
      capturedAt: dashboardThumbs.capturedAt,
      status: dashboards.status,
    })
    .from(dashboardThumbs)
    .leftJoin(dashboards, eq(dashboards.id, dashboardThumbs.id))
    .where(eq(dashboardThumbs.id, id))
    .limit(1);

  if (!row || row.status === "removed") return null;
  return {
    image: row.image,
    contentType: row.contentType,
    capturedAt: row.capturedAt,
  };
}
