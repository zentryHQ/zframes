import { loadDashboardThumb } from "@/app/lib/dashboard-thumb";

// GET /api/thumbs/[id] — the nightly-captured screenshot of a dashboard.
// 404 when no capture exists yet (the card's SVG mini-map stays as the
// fallback) AND when the dashboard was taken down — both rules live in
// loadDashboardThumb, shared with the /d/[id] og:image.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const thumb = await loadDashboardThumb(id);
  if (!thumb) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(thumb.image), {
    headers: {
      "Content-Type": thumb.contentType,
      // Refreshed nightly — an hour of CDN/browser cache with a day of
      // stale-while-revalidate keeps the gallery cheap without pinning stale
      // captures past the next cron.
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Last-Modified": thumb.capturedAt.toUTCString(),
    },
  });
}
