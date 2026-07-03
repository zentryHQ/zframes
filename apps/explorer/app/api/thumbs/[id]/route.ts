import { eq } from "drizzle-orm";
import { db } from "@/app/lib/db";
import { dashboards, dashboardThumbs } from "@/app/lib/db/schema";

// GET /api/thumbs/[id] — the nightly-captured screenshot of a dashboard.
// 404 when no capture exists yet (the card's SVG mini-map stays as the
// fallback) AND when the dashboard was taken down (status "removed") — the
// left join keeps curated ids working, since those have no `dashboards` row.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
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

  if (!row || row.status === "removed") {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(row.image), {
    headers: {
      "Content-Type": row.contentType,
      // Refreshed nightly — an hour of CDN/browser cache with a day of
      // stale-while-revalidate keeps the gallery cheap without pinning stale
      // captures past the next cron.
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Last-Modified": row.capturedAt.toUTCString(),
    },
  });
}
