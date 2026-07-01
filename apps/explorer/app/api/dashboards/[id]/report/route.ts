import { NextResponse } from "next/server";
import { getSessionUser } from "@/app/lib/auth-session";
import { getDashboard } from "@/app/lib/dashboards";
import { createReport } from "@/app/lib/moderation";
import { sameOrigin } from "@/app/lib/same-origin";

export const runtime = "nodejs";

// POST /api/dashboards/[id]/report — anyone (auth optional) flags a dashboard.
// Publish-then-report: this doesn't hide anything; it queues the dashboard for
// an admin to review + take down.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "bad origin" }, { status: 403 });
  }
  const { id } = await params;
  const dashboard = await getDashboard(id); // 404 if missing/already removed
  if (!dashboard) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  let body: { reason?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body ok */
  }
  const reason =
    typeof body.reason === "string" && body.reason.trim()
      ? body.reason.trim()
      : "unspecified";

  const user = await getSessionUser();
  await createReport(id, user?.id ?? null, reason);
  return NextResponse.json({ ok: true });
}
