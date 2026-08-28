-- The house author, and the two indexes the merged gallery reads.
--
-- 1. `/boards` is ONE list now (2026-08-28) — no curated section, every board is
--    a board with a byline. The boards we build ourselves had `owner_id = null`
--    (there was no user behind the showcase), so in a merged grid they would be
--    the only cards with no author. This inserts the account they are published
--    under and back-fills them onto it.
--
--    Data, not DDL, so `check:schema` neither sees nor cares about it — but it
--    belongs in a migration rather than in `seed-curated.ts` alone, because the
--    deploy workflow only re-seeds when `curated-seed.json` changes. Without this
--    file, production keeps the null owners until the next unrelated seed edit.
--
--    The row cannot be signed into: Better Auth needs an `account` row to
--    authenticate and this has none, and `.invalid` is permanently unresolvable
--    (RFC 2606) so the unique `email` can never collide with a real sign-in.
--    See app/lib/house-account.ts — keep the two in sync.
--
-- 2. The merged list is served by one query with two orderings (likes, or
--    newest), both over listed+approved. `dashboards_gallery_idx` matched the old
--    community-only query (`curated=false`) and no longer serves anything; it is
--    left in place to be dropped in a separate release, per the deploy rule that
--    a migration runs while the PREVIOUS release is still serving.
--
-- Idempotent + additive per the migration rules.

insert into "user" (id, name, email, image)
values ('zframes-house', 'zframes', 'house@zframes.invalid', '/zframes-icon-512.png')
on conflict do nothing;

update dashboards set owner_id = 'zframes-house'
where curated = true and owner_id is null;

create index if not exists dashboards_listed_recent_idx on dashboards (created_at desc) where visibility='listed' and status='approved';
create index if not exists dashboards_listed_liked_idx on dashboards (likes desc, created_at desc) where visibility='listed' and status='approved';
