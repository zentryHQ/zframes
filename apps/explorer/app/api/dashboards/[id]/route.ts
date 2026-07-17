import { NextResponse } from "next/server";
import { getSessionUser } from "@/app/lib/auth-session";
import { deleteDashboard, setVisibility } from "@/app/lib/dashboards";
import { sameOrigin } from "@/app/lib/same-origin";

export const runtime = "nodejs";

// DELETE /api/dashboards/[id] — owner-only. The delete's WHERE ownerId IS the
// authz: a non-owner's delete matches no row and silently no-ops.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "bad origin" }, { status: 403 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "sign in" }, { status: 401 });
  }
  const { id } = await params;
  await deleteDashboard(id, user.id);
  return NextResponse.json({ ok: true });
}

// PATCH /api/dashboards/[id] — owner-only visibility flip (listed <-> unlisted).
// Same authz shape as DELETE: the update's WHERE ownerId matches nothing for a
// non-owner.
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "bad origin" }, { status: 403 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "sign in" }, { status: 401 });
  }
  const body = await request.json().catch(() => null);
  if (body?.visibility !== "listed" && body?.visibility !== "unlisted") {
    return NextResponse.json({ error: "invalid visibility" }, { status: 400 });
  }
  const { id } = await params;
  await setVisibility(id, user.id, body.visibility);
  return NextResponse.json({ ok: true });
}
