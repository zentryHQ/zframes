import { NextResponse } from "next/server";
import { getSessionUser } from "@/app/lib/auth-session";
import { deleteDashboard } from "@/app/lib/dashboards";

export const runtime = "nodejs";

// DELETE /api/dashboards/[id] — owner-only. The delete's WHERE ownerId IS the
// authz: a non-owner's delete matches no row and silently no-ops.
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "sign in" }, { status: 401 });
  }
  const { id } = await params;
  await deleteDashboard(id, user.id);
  return NextResponse.json({ ok: true });
}
