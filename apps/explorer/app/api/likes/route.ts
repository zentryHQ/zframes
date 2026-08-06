import { NextResponse } from "next/server";
import { allFrameLikes, claimLike } from "@/app/lib/likes";
import {
  type LikeKind,
  PER_ITEM_DAILY_CAP,
  visitorKeys,
} from "@/app/lib/likes-cap";
import { sameOrigin } from "@/app/lib/same-origin";

export const runtime = "nodejs";

// POST /api/likes — the public like button.
//
// ONE route for both kinds rather than /api/dashboards/[id]/like plus an
// /api/frames/[name]/like: the cap, the visitor keying, and the guard are identical
// for both, and frames are not a REST resource here (they have no row until someone
// likes them — see ticket 006). A `kind` discriminator keeps that logic in one place.
//
// THIS IS THE APP'S FIRST UNAUTHENTICATED WRITE PATH. Everything else that mutates
// is auth-gated, so the guards below are the whole story:
//   • same-origin — CSRF defence-in-depth, same as publish/delete
//   • the per-visitor and per-IP day caps inside claimLike()
// There is deliberately no coarse rate-limit in front: the per-IP ceiling already
// bounds one address, and Vercel's automatic DDoS mitigation covers the distributed
// case (ticket 008).

const KINDS = new Set<LikeKind>(["dashboard", "frame"]);

// GET /api/likes — every frame's count, as one {name: likes} map.
//
// Frames only. Board counts ride the gallery's existing /api/dashboards fetch, so
// there is nothing to serve here for them; /catalogue fetches nothing at all today,
// which is why this route exists. One call for 255 cards, not one per card.
//
// Cached briefly at the edge: the charter chose no polling and freshness barely
// matters for a popularity badge, but the window has to stay short enough that your
// own like shows up on reload rather than looking lost.
export async function GET() {
  const likes = await allFrameLikes();
  return NextResponse.json(
    { frames: likes },
    {
      headers: {
        "cache-control": "public, s-maxage=30, stale-while-revalidate=120",
      },
    },
  );
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "bad origin" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "expected JSON" }, { status: 400 });
  }

  const { kind, id, browserId } = (body ?? {}) as Record<string, unknown>;
  if (typeof kind !== "string" || !KINDS.has(kind as LikeKind)) {
    return NextResponse.json({ error: "unknown kind" }, { status: 400 });
  }
  if (typeof id !== "string" || !id || id.length > 128) {
    return NextResponse.json({ error: "bad id" }, { status: 400 });
  }
  // Client-supplied and never trusted for enforcement — it only subdivides an IP's
  // per-item allowance. Length-capped so it cannot be used to bloat the key input.
  const browser =
    typeof browserId === "string" && browserId.length <= 64 ? browserId : null;

  const { itemKey, ipKey } = visitorKeys(request.headers, browser);
  const result = await claimLike({
    kind: kind as LikeKind,
    id,
    itemKey,
    ipKey,
    now: new Date(),
  });

  if (result.ok) {
    return NextResponse.json({
      total: result.total,
      remaining: result.remaining,
    });
  }

  // The two denials are distinguishable ON PURPOSE — 002's button says different
  // things for "you're out today" and "someone else on your network is out",
  // and the second is a real case on office or carrier NAT.
  if (result.reason === "missing") {
    return NextResponse.json({ error: "no such item" }, { status: 404 });
  }
  return NextResponse.json(
    {
      error: result.reason === "item-cap" ? "daily limit" : "network limit",
      reason: result.reason,
      cap: PER_ITEM_DAILY_CAP,
    },
    { status: 429 },
  );
}
