import { NextResponse } from "next/server";
import { getSessionUser } from "@/app/lib/auth-session";
import {
  listCommunity,
  listCurated,
  publishDashboard,
  type Visibility,
} from "@/app/lib/dashboards";
import { sameOrigin } from "@/app/lib/same-origin";
import { formatProblems, validateDashboardSpec } from "@/app/lib/validate-spec";

export const runtime = "nodejs";

// GET /api/dashboards — everything the gallery lists, in its two sections.
//
// Was community-only: the curated boards were a module the client imported
// directly. They are rows now (2026-08-05), so both sections come from here, and
// the response gained a `curated` array rather than changing the existing shape —
// an older client reading the top-level array still works.
//
// Lightweight by design: `layout` is the bare {id, frame, position} per card that
// the thumbnail draws, never the spec. A curated spec is tens of KB and the
// gallery shows eighteen of them.
export async function GET() {
  const [curated, community] = await Promise.all([
    listCurated(),
    listCommunity(),
  ]);
  return NextResponse.json(
    { curated, community },
    {
      // The list changes on publish, not on visit — a minute of shared cache
      // absorbs the gallery's on-mount refetch across visitors.
      headers: {
        "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
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
  //
  // This now runs the FULL gate (`validateDashboardSpec`), not just the schema
  // plus a URL-scheme scan: frame names resolve in the registry, every frame has
  // a lazy loader, configs pass their own schemas and carry no dead keys,
  // geometry fits and nothing overlaps, grouped children fit their group, ids are
  // unique, and no unsafe URL appears anywhere.
  //
  // Those checks used to exist only as a CI test over the curated module. Moving
  // the showcase into the table meant re-homing them here — which incidentally
  // closed a real gap: a community board naming a dead frame, or a config field
  // that had since been renamed, was publishable before and rendered as an error
  // card (or a silently wrong number) for everyone who opened it.
  const validation = validateDashboardSpec(b.spec);
  if (!validation.ok) {
    return NextResponse.json(
      {
        error: "invalid dashboard spec",
        issues: validation.problems.slice(0, 8),
        detail: formatProblems(validation.problems.slice(0, 8)),
      },
      { status: 400 },
    );
  }
  const parsed = { data: validation.spec };

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
