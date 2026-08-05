import { DashboardSpecSchema, type DashboardSpec } from "@zframes/spec/spec";
import { allFrameMetas } from "@zframes/frames/schemas";
// Relative, not the `@/` alias: this module is unit-tested by vitest at the repo
// root, which resolves tsconfig paths for the workspace packages but not the
// explorer's own alias. Its neighbours (sanitize-spec, same-origin) are imported
// the same way by the same test runner.
import { findUnsafeUrls } from "./sanitize-spec";

/**
 * The write-time gate on every dashboard spec that enters the database.
 *
 * WHY THIS EXISTS. Dashboards used to live in two places: community rows in
 * Postgres, and the curated showcase as TypeScript literals in
 * `app/lib/curated-dashboards.ts`. That file was statically validated at CI time
 * by `tests/curated-specs.test.tsx` — a frame rename, a dropped `lazy.ts` loader,
 * a renamed config field or a tightened enum failed the build. Moving the
 * showcase into the table (2026-08-05) removes that build-time net: a jsonb
 * column cannot fail a typecheck.
 *
 * So the checks moved rather than disappearing. Everything that test asserted
 * statically, this asserts before a row is written (bar the loader check, which
 * belongs in packages/frames — see below) — which is strictly *more* coverage than
 * before, because the publish route previously checked only the spec schema and
 * unsafe URLs. A community board with a dead frame name or a
 * config its frame no longer accepts used to be publishable; now it is not.
 *
 * REACT-FREE on purpose: this runs in a Next route handler (a Server Component
 * graph), in the seed script, and in the CI validator. `allFrameMetas` is pure
 * metadata, so importing it pulls no components.
 *
 * DO NOT import `@zframes/frames/lazy` here to check loader coverage. Its values
 * are `() => import("./frame")` thunks, which are lazy at runtime but NOT to a
 * bundler: Next follows every one of them into the Server Component graph and the
 * build dies on the first frame using `useState` without `"use client"`. The check
 * would be redundant anyway — `packages/frames/src/registry-parity.test.ts` pins
 * `Object.keys(frameLoaders) === allFrameMetas.map(m => m.name)`, so a name found
 * in the registry provably has a loader.
 *
 * What it does NOT do: prove a frame renders. Only a browser can do that, which
 * is what the frame-render monitor is for.
 */

export type SpecProblem = { path: string; message: string };

export type SpecValidation =
  { ok: true; spec: DashboardSpec } | { ok: false; problems: SpecProblem[] };

const metaByName = new Map(allFrameMetas.map((m) => [m.name, m]));

/**
 * The top-level config field names a frame schema accepts, unwrapping the
 * wrappers frame schemas actually use (`.default()`, `.optional()`,
 * `preprocess`/pipe, discriminated unions). `null` means "not introspectable" —
 * the caller then SKIPS the orphaned-key check for that frame rather than
 * inventing a failure, because a new schema style is a reason to improve this
 * walk, not a reason to reject a user's board.
 */
function configFieldsOf(schema: unknown, depth = 0): Set<string> | null {
  if (!schema || typeof schema !== "object" || depth > 8) return null;
  const node = schema as {
    shape?: Record<string, unknown>;
    def?: Record<string, unknown>;
    _def?: Record<string, unknown>;
  };
  if (node.shape) return new Set(Object.keys(node.shape));
  const def = node.def ?? node._def;
  if (!def) return null;
  for (const key of ["innerType", "schema", "in", "out"] as const)
    if (def[key]) return configFieldsOf(def[key], depth + 1);
  if (Array.isArray(def.options)) {
    const union = new Set<string>();
    for (const option of def.options) {
      const fields = configFieldsOf(option, depth + 1);
      if (!fields) return null;
      for (const field of fields) union.add(field);
    }
    return union;
  }
  return null;
}

type Box = { x: number; y: number; w: number; h: number };

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

/**
 * Validate a spec for storage. Returns the PARSED spec on success — callers
 * should store that rather than the raw input, so defaults are materialised once
 * and the stored jsonb is the canonical shape.
 */
export function validateDashboardSpec(input: unknown): SpecValidation {
  const parsed = DashboardSpecSchema.safeParse(input);
  if (!parsed.success)
    return {
      ok: false,
      problems: parsed.error.issues.map((i) => ({
        path: i.path.join(".") || "(root)",
        message: i.message,
      })),
    };

  const spec = parsed.data;
  const problems: SpecProblem[] = [];

  // Every frame AND every grouped child: the name must resolve in the registry
  // and have a lazy loader. A missing loader is the silent half — the frame
  // renders as "Unknown frame" with nothing else wrong.
  const instances: { inst: (typeof spec.frames)[number]; path: string }[] = [];
  spec.frames.forEach((f, i) => {
    instances.push({ inst: f, path: `frames[${i}]` });
    (f.children ?? []).forEach((c, j) =>
      instances.push({
        inst: c as (typeof spec.frames)[number],
        path: `frames[${i}].children[${j}]`,
      }),
    );
  });

  for (const { inst, path } of instances) {
    const meta = metaByName.get(inst.frame);
    if (!meta) {
      problems.push({ path, message: `unknown frame "${inst.frame}"` });
      continue;
    }
    // A registered name provably has a lazy loader — see the note in the header
    // on why that is asserted in packages/frames rather than re-checked here.
    const result = meta.schema.safeParse(inst.config ?? {});
    if (!result.success)
      for (const issue of result.error.issues)
        problems.push({
          path: `${path}.config${issue.path.length ? `.${issue.path.join(".")}` : ""}`,
          message: issue.message,
        });

    // A key the frame's schema no longer has is INERT, not invalid: the card
    // keeps rendering with the frame's default instead of the authored value. It
    // shows a wrong number with no error anywhere, which is why it's reported.
    const fields = configFieldsOf(meta.schema);
    if (fields)
      for (const key of Object.keys(inst.config ?? {}))
        if (!fields.has(key))
          problems.push({
            path: `${path}.config.${key}`,
            message: `"${inst.frame}" has no such config field — the value is ignored`,
          });
  }

  // Board geometry: inside the grid, and no two cards sharing cells. The CSS grid
  // renders an overlap as one card silently sitting on another.
  spec.frames.forEach((f, i) => {
    if (f.position.x + f.position.w > spec.grid.columns)
      problems.push({
        path: `frames[${i}].position`,
        message: `x(${f.position.x}) + w(${f.position.w}) exceeds the board's ${spec.grid.columns} columns`,
      });
  });
  for (let i = 0; i < spec.frames.length; i++)
    for (let j = i + 1; j < spec.frames.length; j++)
      if (overlaps(spec.frames[i].position, spec.frames[j].position))
        problems.push({
          path: `frames[${i}].position`,
          message: `overlaps frames[${j}] ("${spec.frames[i].id}" ∩ "${spec.frames[j].id}")`,
        });

  // Group children live in their GROUP's columns/rows, which the board check
  // above says nothing about — and the renderer CLAMPS an oversized child rather
  // than letting it spill, so a mis-authored cluster renders plausibly-but-wrong.
  spec.frames.forEach((f, i) => {
    const children = f.children ?? [];
    if (children.length === 0) return;
    const cfg = f.config as { columns?: number; rows?: number };
    const columns = cfg.columns ?? 2;
    const rows = cfg.rows ?? 2;
    children.forEach((c, j) => {
      const p = c.position;
      if (p.x + p.w > columns || p.y + p.h > rows)
        problems.push({
          path: `frames[${i}].children[${j}].position`,
          message: `does not fit its group's ${columns}x${rows} inner grid`,
        });
    });
    for (let a = 0; a < children.length; a++)
      for (let b = a + 1; b < children.length; b++)
        if (overlaps(children[a].position, children[b].position))
          problems.push({
            path: `frames[${i}].children[${a}].position`,
            message: `overlaps a sibling inside "${f.id}"`,
          });
  });

  // Ids must be unique board-wide, children included: the editor keys its
  // per-item React roots by id, so a collision has two cards fighting over one.
  const seen = new Set<string>();
  for (const { inst, path } of instances) {
    if (seen.has(inst.id))
      problems.push({ path, message: `duplicate instance id "${inst.id}"` });
    seen.add(inst.id);
  }

  // This spec will render for other people: no dangerous URL scheme anywhere.
  for (const url of findUnsafeUrls(spec))
    problems.push({
      path: "(spec)",
      message: `unsafe URL scheme: ${url}`,
    });

  return problems.length ? { ok: false, problems } : { ok: true, spec };
}

/** One-line-per-problem rendering, for a CLI or a thrown error. */
export function formatProblems(problems: SpecProblem[]): string {
  return problems.map((p) => `  ${p.path}: ${p.message}`).join("\n");
}
