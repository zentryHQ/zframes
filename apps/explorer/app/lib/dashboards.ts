import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/app/lib/db";
import { dashboards, type DashboardRow } from "@/app/lib/db/schema";

export type Visibility = "listed" | "unlisted";

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

export async function listByOwner(ownerId: string): Promise<DashboardRow[]> {
  return db
    .select()
    .from(dashboards)
    .where(eq(dashboards.ownerId, ownerId))
    .orderBy(desc(dashboards.createdAt));
}

// The public community gallery: listed + approved, newest first. `curated: false`
// is load-bearing — curated rows are also listed+approved, so without it every
// showcase board would appear in BOTH gallery sections.
export async function listCommunity(limit = 48): Promise<DashboardRow[]> {
  return db
    .select()
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

// ── the curated showcase ─────────────────────────────────────────────────────
// These rows were TypeScript literals until 2026-08-05 (`curated-dashboards.ts`).
// They are now ordinary rows distinguished by `curated: true`, seeded/updated by
// `scripts/seed-curated.ts` and validated on the way in by `validateDashboardSpec`.

// The gallery's curated section. Ordered by `landingOrder` first so the boards the
// front door leads with also lead the gallery, then by title for a stable rest —
// NOT by createdAt, which for a seeded set is an accident of insertion order.
export async function listCurated(): Promise<DashboardRow[]> {
  return db
    .select()
    .from(dashboards)
    .where(and(eq(dashboards.curated, true), eq(dashboards.status, "approved")))
    .orderBy(sql`${dashboards.landingOrder} nulls last`, dashboards.title);
}

// The landing page's sticky card stack, in `landingOrder`. Replaces the old
// hand-written `LANDING_IDS` tuple: which boards front the site — and in what
// order — is now editable without a deploy, which was the point of the move.
export async function listLandingBoards(): Promise<DashboardRow[]> {
  return db
    .select()
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
      // Deliberately does NOT touch views/forks/createdAt: a re-seed is an edit to
      // the board, not a reset of what the board has accumulated.
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

export async function bumpViews(id: string): Promise<void> {
  await db
    .update(dashboards)
    .set({ views: sql`${dashboards.views} + 1` })
    .where(eq(dashboards.id, id));
}
