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
  // listByOwner already projects exactly this shape (frameCount in SQL, no spec).
  return NextResponse.json(await listByOwner(user.id));
}
