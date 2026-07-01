import { NextResponse } from "next/server";
import { getSessionUser } from "@/app/lib/auth-session";
import { listByOwner } from "@/app/lib/dashboards";

export const runtime = "nodejs";

// GET /api/dashboards/mine — the signed-in user's dashboards (any visibility).
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "sign in" }, { status: 401 });
  }
  const rows = await listByOwner(user.id);
  return NextResponse.json(
    rows.map((d) => ({
      id: d.id,
      title: d.title,
      visibility: d.visibility,
      tags: d.tags,
      views: d.views,
      createdAt: d.createdAt,
      frameCount: Array.isArray((d.spec as { frames?: unknown[] })?.frames)
        ? (d.spec as { frames: unknown[] }).frames.length
        : 0,
    })),
  );
}
