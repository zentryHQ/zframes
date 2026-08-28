import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { BoardListing, BoardSummary } from "@/app/lib/board-summary";
import { db } from "@/app/lib/db";
import { dashboards, type DashboardRow } from "@/app/lib/db/schema";

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

const listingColumns = { ...summaryColumns, layout };

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

// The public community gallery: listed + approved, newest first. `curated: false`
// is load-bearing — curated rows are also listed+approved, so without it every
// showcase board would appear in BOTH gallery sections.
export type CommunityListing = BoardListing & {
  createdAt: Date;
};

export async function listCommunity(limit = 48): Promise<CommunityListing[]> {
  return db
    .select({
      ...listingColumns,
      createdAt: dashboards.createdAt,
    })
    .from(dashboards)
    .where(
      and(
        eq(dashboards.visibility, "listed"),
        eq(dashboards.status, "approved"),
        eq(dashboards.curated, false),
      ),
    )
    .orderBy(desc(dashboards.createdAt))
    .limit(limit);
}

/**
 * Every board that may appear in `sitemap.xml` — curated AND community, in one
 * query, projected down to the four columns a sitemap entry needs.
 *
 * Separate from `listCurated`/`listCommunity` rather than a union of them for one
 * reason: **`visibility` is filtered here explicitly**. `listCurated` never
 * mentions it, relying on the fact that `upsertCurated` always writes `"listed"`
 * — true today, and an implicit invariant that a sitemap must not inherit. An
 * unlisted board is a private link, and submitting one to Google is how a link
 * that was only ever handed to a colleague ends up in search results.
 *
 * No `limit`. A sitemap that silently stops at the newest 48 boards is worse than
 * no sitemap, because it reads as a complete inventory. The 50,000-URL / 50 MB
 * sitemap ceiling is far above any plausible board count here; `sitemap.ts` logs
 * if it is ever approached.
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

// The gallery's curated section. Ordered by `landingOrder` first so the boards the
// front door leads with also lead the gallery, then by title for a stable rest —
// NOT by createdAt, which for a seeded set is an accident of insertion order.
export async function listCurated(): Promise<BoardListing[]> {
  return db
    .select(listingColumns)
    .from(dashboards)
    .where(and(eq(dashboards.curated, true), eq(dashboards.status, "approved")))
    .orderBy(sql`${dashboards.landingOrder} nulls last`, dashboards.title);
}

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
    ownerId: null,
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
