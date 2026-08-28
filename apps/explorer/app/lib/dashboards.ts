import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type {
  BoardAuthor,
  BoardListing,
  BoardSummary,
} from "@/app/lib/board-summary";
import { db } from "@/app/lib/db";
import { dashboards, type DashboardRow, user } from "@/app/lib/db/schema";
import { HOUSE_USER } from "@/app/lib/house-account";

export type Visibility = "listed" | "unlisted";

// ── SQL projections for list queries ─────────────────────────────────────────
// A spec is tens of KB of jsonb and a list query returns dozens of rows, so the
// summary fields are projected in SQL rather than pulling full specs and mapping
// them through `toBoardSummary`/`toBoardListing` (which stay, for the
// single-board resolveDashboard path).

const frameCount = sql<number>`coalesce(jsonb_array_length(${dashboards.spec}->'frames'), 0)`;

// The SQL twin of `toBoardListing`'s layout projection — the bare
// {id, frame, position} per card that the gallery thumbnail draws, with the same
// filter on malformed entries, in spec order.
const layout = sql<BoardListing["layout"]>`coalesce((
  select jsonb_agg(jsonb_build_object(
    'id', f.value->>'id',
    'frame', f.value->>'frame',
    'position', jsonb_build_object(
      'x', f.value->'position'->'x',
      'y', f.value->'position'->'y',
      'w', f.value->'position'->'w',
      'h', f.value->'position'->'h'
    )
  ) order by f.ord)
  from jsonb_array_elements(${dashboards.spec}->'frames') with ordinality as f(value, ord)
  where jsonb_typeof(f.value->'id') = 'string'
    and jsonb_typeof(f.value->'frame') = 'string'
    and jsonb_typeof(f.value->'position'->'x') = 'number'
    and jsonb_typeof(f.value->'position'->'y') = 'number'
    and jsonb_typeof(f.value->'position'->'w') = 'number'
    and jsonb_typeof(f.value->'position'->'h') = 'number'
), '[]'::jsonb)`;

const summaryColumns = {
  id: dashboards.id,
  title: dashboards.title,
  // null → "" matches `toBoardSummary` (community boards have no description).
  description: sql<string>`coalesce(${dashboards.description}, '')`,
  tags: dashboards.tags,
  frameCount,
  likes: dashboards.likes,
};

// The board's byline, built in SQL off the `user` LEFT JOIN so a list query still
// costs one round trip. Two fields only: `user.email` is on a public page here,
// so it never leaves the server (see BoardAuthor).
//
// The `case` is what keeps a missing owner as `null` instead of
// `{name: null, image: null}` — jsonb_build_object over an unmatched join row
// happily builds an object full of nulls, which every consumer would then have to
// re-check field by field.
const author = sql<BoardAuthor | null>`case when ${user.id} is null then null else
  jsonb_build_object('name', ${user.name}, 'image', ${user.image}) end`;

// ⚠️ Any query selecting these MUST `.leftJoin(user, …)` — `author` names a column
// on a table this object does not itself bring into the FROM clause. That is why
// `summaryColumns` (used by the join-less `listLandingBoards`) does not carry it.
const listingColumns = { ...summaryColumns, layout, author };

// Immutable-per-publish: every publish mints a NEW id, so a shared link is a
// stable snapshot (an "update" is a new publish → new link). Spec is validated
// by the caller (route) before it reaches here.
export async function publishDashboard(input: {
  ownerId: string;
  title: string;
  spec: unknown;
  visibility: Visibility;
  tags: string[];
}): Promise<string> {
  const id = nanoid(10);
  await db.insert(dashboards).values({
    id,
    ownerId: input.ownerId,
    title: input.title,
    spec: input.spec,
    visibility: input.visibility,
    tags: input.tags,
  });
  return id;
}

// Public read by id — any non-removed dashboard (unlisted = anyone-with-link).
export async function getDashboard(id: string): Promise<DashboardRow | null> {
  const [row] = await db
    .select()
    .from(dashboards)
    .where(and(eq(dashboards.id, id), ne(dashboards.status, "removed")))
    .limit(1);
  return row ?? null;
}

// Projected: the "mine" list needs metadata + frameCount, never the spec.
export async function listByOwner(ownerId: string): Promise<
  {
    id: string;
    title: string;
    visibility: string;
    tags: string[];
    createdAt: Date;
    frameCount: number;
  }[]
> {
  return db
    .select({
      id: dashboards.id,
      title: dashboards.title,
      visibility: dashboards.visibility,
      tags: dashboards.tags,
      createdAt: dashboards.createdAt,
      frameCount,
    })
    .from(dashboards)
    .where(eq(dashboards.ownerId, ownerId))
    .orderBy(desc(dashboards.createdAt));
}

/**
 * THE gallery: every listed, approved board, in one list.
 *
 * There were two of these until 2026-08-28 — `listCurated` and `listCommunity`,
 * split on the `curated` flag, rendered as two sections. Likes are what retired
 * the split: the grid has a real, earned ranking now, and a hand-built board
 * pinned above a community one that out-scored it makes that ranking decorative.
 * A house board competes on the same axis as everyone else's.
 *
 * `curated` still exists — it orders the landing page's card stack and marks the
 * rows the seeder upserts by slug — it just no longer decides where a board
 * appears here or how high.
 *
 * ORDERING IS SQL'S JOB, deliberately. The old view fetched the newest 48 and
 * sorted them in the browser, which meant "most liked" ranked *the newest 48*:
 * past that many boards, an older well-liked one could not reach the top of the
 * page no matter how many likes it had. Harmless while it was one of two
 * sections and the non-default sort; not harmless as the front door's only
 * ranking. Ordering here makes the limit a page of the RANKED list rather than a
 * window the ranking is trapped inside.
 *
 * The `liked` tie-break is newest-first, and it carries the day-one grid: almost
 * every board sits at 0 likes, so likes alone would leave the order to the
 * planner and read as broken.
 */
export type BoardSort = "liked" | "newest";

export async function listBoards(
  sort: BoardSort = "liked",
  limit = 48,
): Promise<BoardListing[]> {
  return (
    db
      .select(listingColumns)
      .from(dashboards)
      // LEFT, not inner: `ownerId` is nullable, and an inner join would silently
      // drop any board whose owner row is missing rather than show it unattributed.
      .leftJoin(user, eq(user.id, dashboards.ownerId))
      .where(
        and(
          eq(dashboards.visibility, "listed"),
          eq(dashboards.status, "approved"),
        ),
      )
      .orderBy(
        ...(sort === "liked"
          ? [desc(dashboards.likes), desc(dashboards.createdAt)]
          : [desc(dashboards.createdAt)]),
      )
      .limit(limit)
  );
}

/**
 * Every board that may appear in `sitemap.xml`, projected down to the four
 * columns a sitemap entry needs.
 *
 * Shares `listBoards`' predicate but is NOT a page of it, for two reasons:
 *
 * - **No `limit`.** A sitemap that silently stops at the newest 48 boards is
 *   worse than no sitemap, because it reads as a complete inventory. The
 *   50,000-URL / 50 MB ceiling is far above any plausible board count here;
 *   `sitemap.ts` logs if it is ever approached.
 * - **`visibility` is spelled out rather than inherited.** An unlisted board is
 *   a private link, and submitting one to Google is how a link that was only
 *   ever handed to a colleague ends up in search results. That guarantee should
 *   not depend on another query keeping its WHERE clause.
 */
export async function listIndexableBoards(): Promise<
  { id: string; updatedAt: Date; createdAt: Date; curated: boolean }[]
> {
  return db
    .select({
      id: dashboards.id,
      updatedAt: dashboards.updatedAt,
      createdAt: dashboards.createdAt,
      curated: dashboards.curated,
    })
    .from(dashboards)
    .where(
      and(
        eq(dashboards.visibility, "listed"),
        eq(dashboards.status, "approved"),
      ),
    )
    .orderBy(desc(dashboards.updatedAt));
}

// ── the curated showcase ─────────────────────────────────────────────────────
// These rows were TypeScript literals until 2026-08-05 (`curated-dashboards.ts`).
// They are now ordinary rows distinguished by `curated: true`, seeded/updated by
// `scripts/seed-curated.ts` and validated on the way in by `validateDashboardSpec`.

// The curated set as bare link metadata (id/title/description) — for consumers
// like /llms.txt that render a link list and need neither spec nor geometry.
export async function listCuratedMeta(): Promise<
  { id: string; title: string; description: string | null }[]
> {
  return db
    .select({
      id: dashboards.id,
      title: dashboards.title,
      description: dashboards.description,
    })
    .from(dashboards)
    .where(and(eq(dashboards.curated, true), eq(dashboards.status, "approved")))
    .orderBy(sql`${dashboards.landingOrder} nulls last`, dashboards.title);
}

// The landing page's sticky card stack, in `landingOrder`. Replaces the old
// hand-written `LANDING_IDS` tuple: which boards front the site — and in what
// order — is now editable without a deploy, which was the point of the move.
// Projected to BoardSummary: the landing stack shows labels + frame counts and
// renders each board through an /embed/[id] iframe that fetches its own spec.
export async function listLandingBoards(): Promise<BoardSummary[]> {
  return db
    .select(summaryColumns)
    .from(dashboards)
    .where(
      and(
        eq(dashboards.curated, true),
        eq(dashboards.status, "approved"),
        isNotNull(dashboards.landingOrder),
      ),
    )
    .orderBy(dashboards.landingOrder);
}

/**
 * Make sure the house account exists. Called by the seeder before its first
 * upsert, because `ownerId` is a real FK now — a missing row fails the write
 * outright rather than degrading to an unattributed board.
 *
 * Idempotent, and deliberately duplicated by drizzle/0005_house_author.sql:
 * production gets the row from the migration (which also back-fills the existing
 * boards), a fresh database gets it from whichever of the two runs first.
 */
export async function ensureHouseUser(): Promise<void> {
  await db
    .insert(user)
    .values({ ...HOUSE_USER })
    .onConflictDoNothing();
}

// Upsert by id — the seeder's write. Curated boards are addressed by slug
// (`/d/gold-desk`), so unlike a community publish this MUST reuse the id rather
// than minting a new one, or every re-seed would break every shared link.
export async function upsertCurated(input: {
  id: string;
  title: string;
  description: string;
  spec: unknown;
  tags: string[];
  landingOrder: number | null;
}): Promise<void> {
  const values = {
    id: input.id,
    // The house account (app/lib/house-account.ts) — every board in the merged
    // gallery carries a byline, so these carry ours. Re-asserted on conflict
    // below, which is what brings a database seeded before 2026-08-28 forward
    // without waiting for drizzle/0005_house_author.sql to be the thing that ran.
    ownerId: HOUSE_USER.id,
    title: input.title,
    description: input.description,
    spec: input.spec,
    curated: true,
    landingOrder: input.landingOrder,
    visibility: "listed" as const,
    status: "approved" as const,
    tags: input.tags,
  };
  await db
    .insert(dashboards)
    .values(values)
    .onConflictDoUpdate({
      target: dashboards.id,
      // Deliberately does NOT touch likes/createdAt: a re-seed is an edit to the
      // board, not a reset of what the board has accumulated.
      set: {
        ownerId: values.ownerId,
        title: values.title,
        description: values.description,
        spec: values.spec,
        curated: true,
        landingOrder: values.landingOrder,
        visibility: values.visibility,
        status: values.status,
        tags: values.tags,
        updatedAt: new Date(),
      },
    });
}

// Owner-scoped visibility flip (the WHERE ownerId is the authz — a non-owner's
// update matches no row). Same row, no new id — unlike publish, this mutates.
export async function setVisibility(
  id: string,
  ownerId: string,
  visibility: Visibility,
): Promise<void> {
  await db
    .update(dashboards)
    .set({ visibility })
    .where(and(eq(dashboards.id, id), eq(dashboards.ownerId, ownerId)));
}

// Owner-scoped delete (the WHERE ownerId is the authz — a non-owner deletes nothing).
export async function deleteDashboard(
  id: string,
  ownerId: string,
): Promise<void> {
  await db
    .delete(dashboards)
    .where(and(eq(dashboards.id, id), eq(dashboards.ownerId, ownerId)));
}
