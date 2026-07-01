import { getDashboard } from "@/app/lib/dashboards";

export const runtime = "nodejs";

// GET /d/<id>/dashboard.json — the raw DashboardSpec. This is the ONE fetchable
// primitive every fork path pulls from: the AI agent (`npx skills add
// zentryhq/zframes` → fetch this), and the in-browser preview/tinker. Public for
// any non-removed dashboard (unlisted = anyone-with-link). Immutable-per-publish,
// so it caches hard at the edge.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const row = await getDashboard(id);
  if (!row) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json(row.spec, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `inline; filename="dashboard.json"`,
      // Immutable snapshot → cache hard at the edge; browser revalidates.
      "CDN-Cache-Control":
        "public, s-maxage=86400, stale-while-revalidate=604800",
      "Cache-Control": "public, max-age=0, must-revalidate",
    },
  });
}
