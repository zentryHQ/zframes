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
node scripts/pglite-server.mjs                # the dev database (from apps/explorer)
npx drizzle-kit push                          # apply app/lib/db/schema.ts to DATABASE_URL
```

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

### Deploying a schema or showcase change

`next build` no longer bakes boards in, so shipping code is not enough:

1. `DATABASE_URL=<neon> npx drizzle-kit push` — if `schema.ts` changed.
2. `DATABASE_URL=<neon> pnpm --dir apps/explorer seed:curated` — if the showcase
   changed. Safe to re-run: it upserts by id and never touches `views`/`forks`.

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
