import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { getSessionUser } from "@/app/lib/auth-session";
import {
  type BoardSort,
  listBoards,
  publishDashboard,
  type Visibility,
} from "@/app/lib/dashboards";
import { sameOrigin } from "@/app/lib/same-origin";
import { formatProblems, validateDashboardSpec } from "@/app/lib/validate-spec";

export const runtime = "nodejs";

// GET /api/dashboards[?sort=newest] — the gallery's one list, ordered.
//
// `{ boards }`, replacing the `{ curated, community }` pair the two-section
// gallery read (2026-08-28). The response shape has changed twice now, so: a
// client from before this release reads `d.curated` off the new body, gets
// undefined and throws. That path is narrow enough to accept — the old view only
// refetched when its server seed came up empty — and the alternative is shipping
// both shapes forever.
//
// `sort` is a whole different QUERY, not a re-order of one: it is `ORDER BY` in
// SQL so that "most liked" ranks every board rather than the newest page of them.
// Unknown values fall back to the default rather than 400ing — it is a display
// preference arriving from a URL people edit and share.
//
// Lightweight by design: `layout` is the bare {id, frame, position} per card that
// the thumbnail draws, never the spec. A curated spec is tens of KB.
export async function GET(request: Request) {
  const sort: BoardSort =
    new URL(request.url).searchParams.get("sort") === "newest"
      ? "newest"
      : "liked";
  const boards = await listBoards(sort);
  return NextResponse.json(
    { boards },
    {
      // The list changes on publish, not on visit — a minute of shared cache
      // absorbs the gallery's on-mount refetch across visitors. Cached per URL,
      // so the two orderings do not share an entry.
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

  // /boards is ISR (`revalidate = 300`) and seeds its rows on the server, so a
  // board published a second ago was invisible there for up to five minutes —
  // long enough to read as "publishing didn't list it". Publishing is exactly
  // the event that invalidates that page, so say so.
  if (visibility === "listed") revalidatePath("/boards");

  return NextResponse.json({ id }, { status: 201 });
}
