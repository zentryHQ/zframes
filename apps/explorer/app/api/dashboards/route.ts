import { DashboardSpecSchema } from "@zframes/spec/spec";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/app/lib/auth-session";
import {
  listCommunity,
  publishDashboard,
  type Visibility,
} from "@/app/lib/dashboards";
import { findUnsafeUrls } from "@/app/lib/sanitize-spec";
import { sameOrigin } from "@/app/lib/same-origin";

export const runtime = "nodejs";

// GET /api/dashboards — the public community gallery (listed + approved).
// Returns lightweight summaries (no full spec — that's fetched per-id).
export async function GET() {
  const rows = await listCommunity();
  return NextResponse.json(
    rows.map((d) => ({
      id: d.id,
      title: d.title,
      tags: d.tags,
      views: d.views,
      forks: d.forks,
      createdAt: d.createdAt,
      frameCount: Array.isArray((d.spec as { frames?: unknown[] })?.frames)
        ? (d.spec as { frames: unknown[] }).frames.length
        : 0,
    })),
  );
}

// POST /api/dashboards — publish (auth-gated). Immutable: mints a new id.
export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "bad origin" }, { status: 403 });
  }
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "sign in to publish" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const b = body as {
    title?: unknown;
    spec?: unknown;
    visibility?: unknown;
    tags?: unknown;
  };

  // The spec is the contract — validate it, never trust the client.
  const parsed = DashboardSpecSchema.safeParse(b.spec);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "invalid dashboard spec",
        issues: parsed.error.issues.slice(0, 8),
      },
      { status: 400 },
    );
  }

  // Untrusted-render guard: this spec will render for other people. Reject any
  // dangerous URL scheme (javascript:/data:/vbscript:/file:) in frame configs.
  const unsafe = findUnsafeUrls(parsed.data);
  if (unsafe.length) {
    return NextResponse.json(
      {
        error:
          "unsafe URL scheme in a frame config (javascript:/data:/vbscript:/file:)",
        offending: unsafe.slice(0, 5),
      },
      { status: 400 },
    );
  }

  const title =
    typeof b.title === "string" && b.title.trim()
      ? b.title.trim().slice(0, 120)
      : (parsed.data.title ?? "Untitled");
  const visibility: Visibility =
    b.visibility === "listed" ? "listed" : "unlisted";
  const tags = Array.isArray(b.tags)
    ? b.tags
        .filter((t): t is string => typeof t === "string")
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 6)
    : [];

  const id = await publishDashboard({
    ownerId: user.id,
    title,
    spec: parsed.data,
    visibility,
    tags,
  });

  return NextResponse.json({ id }, { status: 201 });
}
