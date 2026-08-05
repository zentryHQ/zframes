-- 0001 · the curated showcase moves into `dashboards`
--
-- Companion to the code change that deleted app/lib/curated-dashboards.ts
-- (2026-08-05). See docs/decisions/web-explorer/log-2026-08-05.md.
--
-- SAFE AGAINST LIVE OLD CODE — deliberately. Every statement is additive or
-- constraint-relaxing, so a deployment still running the previous release keeps
-- working after this is applied. That is what lets the deploy workflow migrate
-- BEFORE waiting for the app deploy, rather than trying to coordinate a cutover.
--
-- Idempotent, so it is also a no-op on a fresh database that got these columns
-- from the 0000 baseline.

-- The gallery's editorial one-liner. Community boards have no field for one.
ALTER TABLE "dashboards" ADD COLUMN IF NOT EXISTS "description" text;

-- Marks the editorial showcase: drives the gallery's two sections, and tells the
-- seeder which rows are its own to upsert.
ALTER TABLE "dashboards" ADD COLUMN IF NOT EXISTS "curated" boolean DEFAULT false NOT NULL;

-- Position in the landing page's sticky card stack; null = gallery only. Replaces
-- the hand-written LANDING_IDS tuple, so the running order is data.
ALTER TABLE "dashboards" ADD COLUMN IF NOT EXISTS "landing_order" integer;

-- A curated board has no user behind it. Rather than invent a synthetic "zframes"
-- row in Better Auth's `user` table to satisfy the FK — a fake account modelling
-- authorship that doesn't exist — the column becomes nullable. The FK itself stays:
-- Postgres does not enforce it for NULL.
--
-- Already-nullable is a no-op, not an error, so this needs no guard.
ALTER TABLE "dashboards" ALTER COLUMN "owner_id" DROP NOT NULL;
