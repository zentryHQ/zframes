# @zframes/explorer

The public front door — landing page, dashboard gallery, frame catalogue, live
board previews, browser editor (`/tinker`), and the moderation surfaces. Next 16
(App Router) + Postgres (Neon in prod, Postgres 18 in Docker in dev) + Better
Auth. `CLAUDE.md` is a symlink to this file.

## Commands

```bash
pnpm --dir apps/explorer db:up                # the dev database — START THIS FIRST
pnpm --dir apps/explorer dev                  # :37264 (needs db:up)
pnpm --dir apps/explorer build                # next build — NOT run in CI, run it before landing
pnpm --dir apps/explorer typecheck
pnpm --dir apps/explorer seed:curated         # upsert the curated showcase into the DB
pnpm --dir apps/explorer seed:curated --dry-run   # validate the seed, write nothing (no DB needed)
pnpm --dir apps/explorer validate:dashboards  # re-validate every STORED board
pnpm --dir apps/explorer thumbs:capture       # nightly screenshot job, run by cron
pnpm --dir apps/explorer sweep:likes          # drop expired like allowances (nightly cron)
pnpm --dir apps/explorer migrate              # apply pending drizzle/*.sql (fresh DB or existing)
pnpm --dir apps/explorer migrate --dry-run    # list pending migrations, apply nothing
pnpm --dir apps/explorer check:schema         # do the migrations match schema.ts? (CI gate)
pnpm --dir apps/explorer db:down              # stop the dev database, KEEP its data
pnpm --dir apps/explorer db:reset             # DESTROY the volume and start clean
pnpm --dir apps/explorer db:psql              # a psql shell in the container
pnpm test:e2e:explorer                        # (repo root) Playwright e2e — own throwaway DB on :5434, next dev on :43264
```

The e2e suite (`e2e/`) is self-contained: it boots its own Postgres from
`e2e/docker-compose.e2e.yml` (port **5434**, no volume — never your `:5433` dev
data), runs migrate + seed against it, starts `next dev -p 43264`, and tears the
container down after. `E2E_KEEP_DB=1` keeps the database up to debug a failure.

**First run on a machine:** `db:up` → `migrate` → `seed:curated`. That is also the
recovery path after `db:reset`, and the only way to get boards into a fresh
database — an empty gallery on a new checkout means one of the three was skipped.

**Do not run `drizzle-kit push`.** It was retired on 2026-08-05 in favour of
versioned migrations — see below. `drizzle-kit generate` is still useful for
*authoring* the SQL for a new migration file.

## Mock data only — there is no live mode

Since **2026-08-14** every frame-rendering surface (landing, `/dashboard/[id]`,
`/embed/[id]`, `/catalogue`, `/tinker`) renders **simulated data, always** —
the full-capability `MockMarketDataProvider` from `@zframes/frames/testing`, the
same deterministic offline provider the frame smoke tests run on. `app/lib/frames.ts`
composes providers unconditionally (no branching, no `localStorage` flag); the
former per-browser live opt-in (`zframes-data-mode`, `DataModeToggle`) was removed.
This is a ToS-compliance posture, not a performance one: page loads must touch
**no** upstream market API — live data is the CLI's job, not the hosted
explorer's (see `docs/decisions/web-explorer/`, local-only).

Two labelling rules keep it honest, and both are load-bearing:

- The header carries the static `DemoDataBadge` pill ("Demo data") — the
  site-wide label, in `AppShell`, with a popover explaining the posture.
- `/embed/*` renders bare (no header), so `EmbedBoard` draws its own fixed
  corner "Demo data" badge — that is what a third-party iframe shows.
- (Related: the root layout sets `data-zf-demo` on `<html>` statically, which
  is what hides per-card provider attributions in `globals.css`.)

**Footgun:** a mock data gap renders as a *quiet empty card*, not an error — the
frame smoke test only forbids error cards, so nothing fails when a frame's mock
method returns a shape the frame filters out. If a card is empty here but fine in
the CLI runtime, fix the method in `packages/frames/src/testing/mock-provider.ts`
(e.g. `getNationalDebt` needed per-point `heldByPublic`/`intragovernmental` for
the composition frame).

## Dashboards live in the database, not in code

Since **2026-08-05** there is exactly one place a dashboard can be: a row in
`dashboards`. The curated showcase used to be 3150 lines of TypeScript in
`app/lib/curated-dashboards.ts`; that file is gone. See
`docs/decisions/web-explorer/` for why.

- **Curated** rows: `curated: true`, `ownerId: null`, a readable slug for an id
  (`gold-desk`), a `description`, and `landingOrder` — non-null puts the board in
  the landing page's sticky card stack, in that order. Upserted **by id** so a
  shared `/dashboard/<slug>` link survives an edit.
- **Community** rows: a nanoid id, a real `ownerId`, immutable-per-publish (an
  "update" mints a new id, so a shared link is a stable snapshot).
- Editing a curated board is a `update dashboards set spec = …`. **No deploy.**
  That was the point.

### The write gate replaces a build-time test

`app/lib/validate-spec.ts` (`validateDashboardSpec`) is the only thing between a
bad spec and the table. It runs on **every** write — the publish route and the
seeder — and checks: the spec schema, every frame *and grouped child* resolving in
the registry, configs passing their own schemas, dead config keys (inert, so they
show a wrong number with no error), board geometry + overlap, grouped children
fitting their group's inner grid, unique ids, and unsafe URL schemes.

Those checks used to live in `tests/curated-specs.test.tsx`, which validated the
TypeScript at CI time. Moving to jsonb removed that build-time net, so they moved
here — which incidentally **closed a real gap**: a community board naming a dead
frame was publishable before.

Two guards remain around it:

- `app/lib/validate-spec.test.ts` — pins the gate itself, and re-validates
  `scripts/curated-seed.json` so a frame rename still fails CI for the boards we
  ship.
- `.github/workflows/dashboard-validity.yml` — nightly, re-validates what is
  **actually in the table**. This is the one that matters: the gate can't catch a
  board that was valid when written and went stale when the registry moved under
  it.

### `scripts/curated-seed.json` is a seed, not a source of truth

It is the one-time export of the old module, kept so a fresh database (new dev
machine, CI, a rebuilt Neon branch) reaches a known-good state. **Editing it does
nothing until someone runs `seed:curated`; editing the table takes effect
immediately.** A board edited in SQL and never exported back will pass the CI test
and be caught by the nightly monitor — that split is deliberate.

## Schema changes: versioned migrations, not `push`

`apps/explorer/drizzle/NNNN_name.sql`, applied in filename order by
`scripts/migrate.ts`, tracked in a `schema_migrations` table. `drizzle-kit push`
was retired on 2026-08-05: it diffs against the live database at run time, so what
runs is never what was reviewed, and it reads a column rename as drop-then-add
(data loss). In CI you would silence its confirmation prompt with `--force`, which
removes the only thing that made it safe.

**Writing one:**

1. Edit `app/lib/db/schema.ts`.
2. `npx drizzle-kit generate --dialect postgresql --schema ./app/lib/db/schema.ts
   --out /tmp/gen` to get correct DDL, then hand the statements you need into a new
   `drizzle/NNNN_name.sql`.
3. Make it **idempotent** (`IF NOT EXISTS`, guarded `DO $$ … EXCEPTION WHEN
   duplicate_object`) and **additive or constraint-relaxing**. Both are load-bearing:
   `0000_baseline.sql` runs against databases that already have every table, and the
   deploy workflow applies migrations *while the previous release is still serving*.
4. `pnpm --dir apps/explorer migrate --dry-run`, then `migrate`.
5. `pnpm --dir apps/explorer check:schema` — proves the migration actually produces
   what `schema.ts` declares. **This is a CI gate**, so a forgotten migration fails
   the PR rather than production.

A migration and its bookkeeping row commit in one transaction, so a failure records
nothing and a re-run retries it rather than skipping a half-applied file.

### How the drift check works

`scripts/check-schema-drift.ts` builds the schema **twice** on throwaway PGlite
databases — once by running the migrations, once by `drizzle-kit push`-ing
`schema.ts` — then diffs `information_schema` (columns, types, nullability,
defaults, constraint names). Identical ⇒ the migrations and the app agree.

It deliberately does **not** parse `drizzle-kit push` output against the real
database: push prints "Changes applied" whether or not it changed anything, so the
output is not a verdict, and pointing a tool that mutates at a live database to ask
a read-only question is how you lose a table. Here push only ever touches a
database that exists for a few seconds.

`schema_migrations` is declared in `schema.ts` **for this check's sake** even though
the runner creates it. A table absent from `schema.ts` reads as "drop it" to any
diff — `drizzle-kit push` offered to delete it, and with it the whole record of
which migrations had run.

## Deploys are automated — with one gate

`.github/workflows/db-deploy.yml` runs on pushes to `main` that touch the schema,
migrations, or the seed:

1. **Migrate** immediately — safe against the old release, per the rule above, so it
   needs no coordination with Vercel (which builds in parallel).
2. **Seed** — only if `curated-seed.json` changed, and only after
   `.github/scripts/wait-for-deployment.mjs` confirms the Vercel Production
   deployment *for that SHA* is live. A seeded board may use a frame the release
   introduced; seeding early puts "Unknown frame" cards on the front page.
3. **Validate** everything stored.

⚠️ **Re-seeding OVERWRITES database edits** to the boards in `curated-seed.json`
(it upserts by id). Editing a board without a deploy is why the showcase moved into
Postgres, so a seed on every push would silently undo that — hence the gate. If you
edit a board in SQL and want it to survive, export it back into the seed file.

Secret: `DATABASE_URL_UNPOOLED` — Neon's **direct** endpoint. The read-only crons
(thumbnails, dashboard-validity) share the pooled `DATABASE_URL`; this job runs DDL,
and a migration's advisory lock inside a multi-statement transaction belongs off
the pgbouncer pool. The workflow skips cleanly when it is unset.

## Discoverability (SEO + answer engines)

`app/lib/site.ts` is the single source of truth: the canonical origin, the shared
copy, `PRIVATE_PATHS` and `STATIC_ROUTES`. Everything else derives from it.

- **The canonical origin is hard-coded to production** (`https://frames.zentry.com`,
  override with `NEXT_PUBLIC_SITE_URL`) — deliberately *not* `BETTER_AUTH_URL`,
  which is the auth callback origin and is localhost in dev. A preview deployment
  therefore canonicalises to production and `robots.txt` disallows it wholesale
  (`isProductionDeployment()`).
- **`metadataBase` lives in the root layout.** It used to be on `/dashboard/[id]`
  alone, so every other page shipped no usable OG image. The root layout also owns
  the `%s · zframes` title template — **pages set a BARE title** (`"Gallery"`), never
  one ending in the brand.
- **Adding a public page means adding it to `STATIC_ROUTES`.** `app/lib/seo.test.ts`
  enumerates `app/`'s route directories and fails if one is neither listed nor in
  the test's `NON_INDEXABLE` set — otherwise a working page never reaches
  `sitemap.xml` and nothing anywhere errors.
- **Unlisted boards are noindex in two places, both required.**
  `listIndexableBoards()` filters `visibility` explicitly so `sitemap.xml` can't
  submit them, and `/dashboard/[id]` emits `robots: noindex` for them. `robots.txt`
  alone is a *crawl* directive — a linked URL can still be listed unfetched.
- **`/catalogue` is a Server Component.** It was a `"use client"` page whose whole
  body was a `ssr: false` import, so the most content-dense page on the site served
  the words "Loading catalogue…" and had no `<h1>` and no metadata. The heading,
  metadata and `FrameIndex` (all 285 frames as text) now render on the server;
  only the live grid stays client-only, behind `CatalogueClient`. `CatalogueView`
  must therefore **not** render `<main>` or an `<h1>` — the page owns both.
- **`/gallery` fetches its rows server-side** and passes them as `initial`. The
  client refetches on mount only when that seed is empty (DB blip recovery).
- **`/llms.txt`** (`app/llms.txt/route.ts`) is fully derived — frames from the
  registry, boards from the table, Q&A from `app/lib/faq.ts`. It cannot go stale
  on its own.
- **`app/lib/faq.ts` is rendered three ways** — the visible landing FAQ, `FAQPage`
  JSON-LD, and `/llms.txt`. Google requires FAQ markup to mirror visible content,
  so never hand-write a second list; a test pins that the three agree.
- JSON-LD helpers live in `app/lib/structured-data.tsx` and are emitted
  **server-side** — answer-engine crawlers largely do not run JS, so anything
  injected after hydration is invisible to the audience it is for.

## Footguns

- **The dev database volume mounts at `/var/lib/postgresql`, not `.../data`.**
  Every pre-18 tutorial says `data`; the 18+ images keep their files in a
  major-version subdirectory and **refuse to boot** if they find data at the old
  path. The container exits, the healthcheck never goes green, and `db:up` fails
  with a bare `container for service "db" is unhealthy` that never mentions mounts.
- **`.env` changes need a dev-server restart.** `next dev` reads `.env.local` once
  at boot, and `app/lib/db` caches its pool on `globalThis` across hot reloads — so
  after changing `DATABASE_URL` the app keeps dialling the old one and every board
  query fails (`password authentication failed`) while the page still renders 200
  with an empty gallery.
- **`/dashboard/[id]` and `/embed/[id]` are not prerendered, on purpose.**
  Prerendering mutable rows is wrong here — an edited board wouldn't appear until
  the next deploy. Both routes and `/` use `revalidate`. (This *also* used to be
  forced by the single-connection PGlite dev socket, retired 2026-08-10; the
  reason above is the one that still stands.)
- **Never import `@zframes/frames/lazy` into a Server Component or route
  handler.** Its values are `() => import("./frame")` thunks — lazy at runtime, but
  Next's bundler follows every one into the server graph and the build dies on the
  first frame using `useState`. `validate-spec.ts` uses `allFrameMetas` alone;
  loader parity is pinned in `packages/frames/src/registry-parity.test.ts`.
- **`next build` is not in CI.** It is the only thing that catches the trap above,
  Server/Client boundary errors, and `transpilePackages` drift. Run it before
  landing anything that touches this app.
- **`next dev` rewrites `tsconfig.json`** and `next build` then `next dev` 404s
  dynamic `[id]` routes — `rm -rf .next` between them.
- **Use `localhost`, not `127.0.0.1`.** Next 16 blocks dev chunks from the raw IP;
  boards render blank with only a server-log warning.
- **`globals.css` is unlayered, so every `.zf-*` rule beats a Tailwind utility.**
  Tailwind v4 puts utilities in `@layer utilities`; unlayered wins regardless of
  specificity. So `.zf-surface { position: relative }` silently overrides a
  `fixed`/`absolute`/`sticky` class on the *same* element — which is how the
  Publish/Fork dialog ended up laid out in normal flow at the end of `<body>`
  (y≈46,500px on `/tinker`): overlay dimmed, panel nowhere, no error anywhere.
  Keep positioning classes and `.zf-*` surface classes on **separate nodes**.
- **`/embed/*` is the only framable path.** `next.config.ts` sets
  `X-Frame-Options: DENY` everywhere else, which is why the chrome-less embed route
  exists separately from `/dashboard/[id]` rather than being a query param.

## Reference

- `PRODUCT.md` — brand, audience, design principles.
- `docs/decisions/web-explorer/` — the decision backbone for this app (local-only).
- Repo root `AGENTS.md` — packages, frames, providers, project-wide conventions.
