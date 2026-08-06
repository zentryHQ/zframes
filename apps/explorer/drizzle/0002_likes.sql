-- 0002 · public likes
--
-- Companion to app/lib/likes.ts + app/api/likes/route.ts. See
-- docs/wayfinder/likes/ (tickets 003 and 008) for why the cap is shaped this way.
--
-- SAFE AGAINST LIVE OLD CODE — both statements are purely additive, so the previous
-- release keeps serving while this is applied. That is what lets db-deploy.yml
-- migrate before waiting on the Vercel deployment.
--
-- Idempotent, so it is a no-op on a database that already has these.

-- The public counter. `views`/`forks` next to it were declared and never wired;
-- this one is live — /api/likes increments it and the gallery sorts on it. A column
-- rather than a side table because gallery queries already select full rows, so
-- ordering by popularity costs no join.
ALTER TABLE "dashboards" ADD COLUMN IF NOT EXISTS "likes" integer DEFAULT 0 NOT NULL;

-- The cap: one row per (visitor, item, UTC day). Rows spread across visitors and
-- items rather than contending on a single global counter row — a hot single row
-- serialises every request under exactly the flood the cap exists to absorb.
--
-- Two kinds of row share the table, told apart by `scope`:
--   • "item" — key = hash(ip:browserId), 5/day, the product rule
--   • "ip"   — key = hash(ip), item_kind/item_id = '', 500/day across all items;
--              the anti-rotation backstop, since browserId comes from localStorage
--              and clearing it would otherwise mint an unlimited supply of caps
--
-- `visitor_key` is a salted hash, never a raw address. Rows older than 2 days are
-- swept by the nightly cron — a short-lived counter, not a visitor log.
CREATE TABLE IF NOT EXISTS "like_grants" (
	"visitor_key" text NOT NULL,
	"scope" text NOT NULL,
	"item_kind" text NOT NULL,
	"item_id" text NOT NULL,
	"day" text NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "like_grants_visitor_key_scope_item_kind_item_id_day_pk" PRIMARY KEY("visitor_key","scope","item_kind","item_id","day")
);
