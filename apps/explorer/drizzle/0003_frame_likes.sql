-- 0003 · per-frame like counts
--
-- The catalogue's counterpart to `dashboards.likes`. A table, not a column, because
-- frames have no row anywhere in this schema — they live in the code registry
-- (`@zframes/frames`) and the catalogue page reads them statically.
--
-- Keyed by the frame's registry name (`price-chart`), the same string every
-- dashboard.json uses. Rows are created lazily on first like: seeding all 255 would
-- be a wall of zeros, and an absent row already renders as 0.
--
-- SAFE AGAINST LIVE OLD CODE — a new table is additive, so the previous release
-- keeps serving while this applies.
--
-- Idempotent, so it is a no-op where the table already exists.
CREATE TABLE IF NOT EXISTS "frame_likes" (
	"name" text PRIMARY KEY NOT NULL,
	"likes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
