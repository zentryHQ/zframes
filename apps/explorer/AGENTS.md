# @zframes/explorer

The public front door — landing page, dashboard gallery, frame catalogue, live
board previews, browser editor (`/tinker`), and the moderation surfaces. Next 16
(App Router) + Postgres (Neon in prod, PGlite over a local socket in dev) +
Better Auth. `CLAUDE.md` is a symlink to this file.

## Commands

```bash
pnpm --dir apps/explorer dev                  # :37264 (needs the PGlite socket, below)
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
node scripts/pglite-server.mjs                # the dev database (from apps/explorer)
```

**Do not run `drizzle-kit push`.** It was retired on 2026-08-05 in favour of
versioned migrations — see below. `drizzle-kit generate` is still useful for
*authoring* the SQL for a new migration file.

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

Secret: `PRODUCTION_DATABASE_URL`, falling back to `THUMBS_DATABASE_URL` (same Neon
string, already set). The workflow skips cleanly when neither exists.

## Footguns

- **The dev PGlite socket takes ONE connection.** `app/lib/db` pins `max: 1`
  against it for exactly this reason. It is also why `/dashboard/[id]` and
  `/embed/[id]` are **not** prerendered — `next build` prerenders with 11 workers,
  which raced the socket and died on `ECONNRESET`. (Prerendering mutable rows was
  wrong anyway: an edited board wouldn't appear until the next deploy.) Both routes
  and `/` use `revalidate` instead.
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
- **`/embed/*` is the only framable path.** `next.config.ts` sets
  `X-Frame-Options: DENY` everywhere else, which is why the chrome-less embed route
  exists separately from `/dashboard/[id]` rather than being a query param.

## Reference

- `PRODUCT.md` — brand, audience, design principles.
- `docs/decisions/web-explorer/` — the decision backbone for this app (local-only).
- Repo root `AGENTS.md` — packages, frames, providers, project-wide conventions.
