# @zframes/editor

The authoring UI. May import `@zframes/core` + `@zframes/spec`; never Node infra
(serve/zai/account/store/vite) and never itself by package name, only relatively.
GridStack lives here and nowhere else.

## The editable dashboard

- **Editable dashboard** (`@zframes/editor/editor` → `DashboardEditor`, GridStack, mirrors Zentry's "customise mode"): the agent generates `dashboard.json` AND a human edits the *same* file — drag/resize/add/delete + a per-frame config rail, then Save. Edits round-trip the human-readable `dashboard.json` (the host's `onSave`), never a localStorage blob — the spec read/write contract lives in `@zframes/serve` (`handleSpecRead`/`handleSpecWrite`) and is used by BOTH `@zframes/vite`'s `dashboardWriteback()` (dev) and the CLI's `serve` (prod), so the round-trip is identical in both. GridStack owns each item's DOM, so frames render into per-item React roots wrapped in `FramesProvider` (shared provider instances — no duplicate WS). New-frame default config = `buildDefaultConfig(def)` (in `editor.tsx`): all-optional frames resolve from `schema.safeParse({})`, and required-field frames are seeded with schema-valid placeholders (symbol fields → a stocks-first default, required strings → readable placeholders, `.positive()` numbers → 1, min-length arrays → distinct items) so a freshly-added frame renders immediately instead of as an error card. **Footgun:** `@zframes/vite` is loaded by Vite's Node config-loader, so it imports the shared module by package subpath (`@zframes/serve`), NOT a relative `./serve` — a relative extensionless import fails under Node there.

## Nested groups

A container frame's content box IS a nested GridStack. See the group mechanics in
`packages/spec/AGENTS.md`: the `grid-stack` class has to be added *before*
`makeSubGrid` or GridStack inserts its own wrapper, and `collectSpec` reads
children back off the live nested grid.
