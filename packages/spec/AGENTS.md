# @zframes/spec

The domain kernel: `types`, `DashboardSpecSchema` (`spec`), `routes`,
`frame`/registry, `presets`, `catalogue`, `provider-plugin`. Zero `@zframes` dependencies,
React-runtime-free (a type-only React import for component types is fine,
`react-dom` is not) and Node-free. It must not import any higher layer;
ESLint enforces that per-directory and `tests/dep-dag.test.ts` pins it at the
manifest level.

Because everything imports this package, a change here is the widest-blast-radius
change in the repo. The two spec shapes below span the renderer AND the editor, so
both halves have to move together or the feature half-lands.

## The provider-plugin subpath is types-only in the barrel

`provider-plugin.ts` holds the contract an installed data adapter declares
itself with (`ProviderPluginManifest` + `createProviders`), its validator, and
the three derivations that read a manifest (`proxyHostsOf`, `sourceCreditsOf`,
`capabilitiesOf`). It is reached at `@zframes/spec/provider-plugin`, and the
**root barrel re-exports its TYPES ONLY** — never the functions.

That is not tidiness. `@zframes/core` re-exports this barrel wholesale, so a
value exported here lands on the presentation package's public API, which
`packages/core/src/barrel-surface.test.ts` snapshot-pins. Plugin validation and
relay-host derivation have no business there: their consumers are all Node-side
(serve, cli, store, the provider fleet), and those already import siblings by
package subpath. Add a helper here and import it by subpath; if it appears in
the core barrel snapshot, that is the mistake, not the snapshot.

## Event markers

- **Event markers belong to the card, not the board.** `FrameInstance.events` (sibling of `config`, like `title`/`currency`/`style`) is a card's own list of dated annotations; there is deliberately **no** `spec.events`, because an event explains a series, not a dashboard — a board-wide list was the first cut and it put the same flag on every chart. Frames render **`TimeSeriesChart`** (`@zframes/frames`' `series-chart.tsx`), never the raw `MultiSeriesLineChart`: the wrapper injects the card's markers via `useEvents()`, and the frame's meta must set **`annotatable: true`** (what tells the editor to offer its Events panel and the AI catalogue that the frame accepts markers). `tests/chart-events-coverage.test.ts` fails the build if either half drifts — a chart that quietly opted out just looks like a card nobody annotated. Dates are parsed as **local** midnight (a bare `YYYY-MM-DD` read as UTC would draw the flag a day early west of Greenwich). Markers are authored, never fetched — no feed knows which events a chart cares about.

## Nested frame groups

- **Frames nest one level, inside a container frame.** `FrameInstance.children` (sibling of `config`, like `events`/`title`/`currency`/`style`) holds the frames a **container** frame renders as its own little grid — so a cluster (a 2x2 of sparklines, a chart over its own stat strip, a split pane) occupies ONE board slot and drags/resizes as a unit instead of coming apart on every rearrange. The renderer and editor branch on `FrameMeta.container`, never on a frame name; `group` (`packages/frames`) is the only container today. A container's config supplies its inner grid's units (`columns`, `rows`, `gap`, plus `panel` for an optional surrounding surface), emitted as `--zf-sub-cols/rows/gap` — a child's placement resolves against THOSE, never the board's `--zf-cols`/`--zf-gap`, and its rows are **fractions** of the group's height (not `grid.rowHeight` px) so the cluster always fills its slot. Child spans are clamped to the group: the board grows downward, a group cannot, so an unclamped child spills out of the card. **Groups do not nest** — `ChildFrameInstanceSchema` declares `children: z.never().optional()` rather than omitting the field, because a plain `z.object` would *strip* it and a group-in-a-group would parse cleanly then render empty (the worst feedback a generating agent can get); `MAX_GROUP_CHILDREN` (24) bounds one group. Two footguns: FRAME_CSS's phone/tablet reflow rules must stay scoped to `.zf-grid > .zf-frame` (as descendant selectors they also matched a group's children and stacked them inside a slot that didn't grow), and a container renders `.zf-group` — not `.zf-frame` — so any test or host that selects cards needs that class too. In the editor the group's content box IS a nested GridStack (`grid.makeSubGrid(el, opts, undefined, false)`, with the `grid-stack` class added *first* so GridStack reuses that box instead of inserting its own wrapper); children are draggable in place and between group and board, and `collectSpec` reads them back off the live nested grid.

## HTTP route contract

`routes.ts` declares every `/__zframes/*` path as a constant so the vite dev
plugin and the CLI's `serve` implement one identical surface and dev cannot drift
from prod: dashboard read/write, the store list/switch pair, the official-data
proxy, the keyed-account portfolio/credentials pair, and the agent list/ask pair.
Add a route here first, never in a host.

## Display currency, event markers, size envelopes

The *schemas* live here; the conventions that govern them are documented where
they are consumed: currency in `packages/core/AGENTS.md`, frame size envelopes and
`.describe()` coverage in `packages/frames/AGENTS.md`.
