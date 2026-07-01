import { and, desc, eq, ne, sql } from "drizzle-orm";
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

// The public community gallery: listed + approved, newest first.
export async function listCommunity(limit = 48): Promise<DashboardRow[]> {
  return db
    .select()
    .from(dashboards)
    .where(
      and(
        eq(dashboards.visibility, "listed"),
        eq(dashboards.status, "approved"),
      ),
    )
    .orderBy(desc(dashboards.createdAt))
    .limit(limit);
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
