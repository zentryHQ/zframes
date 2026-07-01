import { NextResponse } from "next/server";
import { getSessionUser } from "@/app/lib/auth-session";
import { isAdmin } from "@/app/lib/admin";
import { listReported, setStatus } from "@/app/lib/moderation";
import { sameOrigin } from "@/app/lib/same-origin";

export const runtime = "nodejs";

// GET /api/moderate — admin-only report queue.
export async function GET() {
  const user = await getSessionUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json(await listReported());
}

// POST /api/moderate — admin-only takedown/restore { id, status }.
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "bad origin" }, { status: 403 });
  }
  const user = await getSessionUser();
  if (!isAdmin(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const body = (await request.json().catch(() => ({}))) as {
    id?: unknown;
    status?: unknown;
  };
  if (
    typeof body.id !== "string" ||
    (body.status !== "approved" && body.status !== "removed")
  ) {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  await setStatus(body.id, body.status);
  return NextResponse.json({ ok: true });
}
