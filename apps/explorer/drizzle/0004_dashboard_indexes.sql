-- Indexes for the dashboards list queries — each matches one query's filter +
-- order so it can be served without a full-table scan. Partial where the query
-- filters on constants (gallery/curated/sitemap); plain composite for the
-- owner-scoped list. Idempotent + additive per the migration rules.
create index if not exists dashboards_gallery_idx on dashboards (created_at desc) where visibility='listed' and status='approved' and curated=false;
create index if not exists dashboards_curated_idx on dashboards (landing_order nulls last, title) where curated=true and status='approved';
create index if not exists dashboards_owner_idx on dashboards (owner_id, created_at desc);
create index if not exists dashboards_indexable_idx on dashboards (updated_at desc) where visibility='listed' and status='approved';
