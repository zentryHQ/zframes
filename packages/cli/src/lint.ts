import type { DashboardSpec } from "@zframes/spec/spec";
import { allFrameMetas } from "@zframes/frames/schemas";

// Extracted from index.ts so it's importable without running the CLI: index.ts
// invokes main() + process.exit() at module load, so a test (or any consumer)
// that imported lintSpec from there would execute the whole CLI on import.

export interface LintIssue {
  frameId: string | null;
  message: string;
}

/** Validate a parsed spec beyond the Zod pass: frame names, configs, geometry. */
export function lintSpec(spec: DashboardSpec): LintIssue[] {
  const issues: LintIssue[] = [];
  // Resolved against EVERYTHING renderable, not the curated agent-pickable
  // `frameMetas` subset: the runtime renders `allFrames`, and a board a human
  // extended in the editor holds frames the agent can't pick. Resolving
  // against the subset mis-reported 18 such frames on a real board as
  // "unknown" — and skipped their config/geometry checks via the `continue`.
  const metaByName = new Map(allFrameMetas.map((meta) => [meta.name, meta]));

  const seenIds = new Set<string>();
  for (const instance of spec.frames) {
    if (seenIds.has(instance.id))
      issues.push({
        frameId: instance.id,
        message: `duplicate frame id "${instance.id}"`,
      });
    seenIds.add(instance.id);

    const meta = metaByName.get(instance.frame);
    if (!meta) {
      issues.push({
        frameId: instance.id,
        message: `unknown frame "${instance.frame}". available: ${[
          ...metaByName.keys(),
        ].join(", ")}`,
      });
      continue;
    }

    const parsed = meta.schema.safeParse(instance.config);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        issues.push({
          frameId: instance.id,
          message: `config.${issue.path.join(".") || "(root)"}: ${
            issue.message
          }`,
        });
      }
    }

    if (instance.position.x + instance.position.w > spec.grid.columns)
      issues.push({
        frameId: instance.id,
        message: `overflows the grid: x(${instance.position.x}) + w(${instance.position.w}) > ${spec.grid.columns} columns`,
      });

    // Below the frame's own floor / above its ceiling. Unlike every other check
    // here this one has no runtime symptom at all — the CSS-grid renderer
    // ignores `layout`, so an undersized card renders happily with its chart
    // squeezed under its axis or its labels cut off mid-word, and an oversized
    // one renders a single number in an acre of empty card. Both look like a
    // design mistake rather than a spec mistake, which is exactly why the
    // generating agent needs to be told here.
    //
    // Only board-level frames are checked. A container's children are placed in
    // the GROUP's own column/row units, so a child's `w` is not a number of
    // board columns and comparing it to one would be meaningless.
    const { layout } = meta;
    if (layout) {
      const { w, h } = instance.position;
      const minW = layout.minW ?? 1;
      const minH = layout.minH ?? 1;
      if (w < minW || h < minH)
        issues.push({
          frameId: instance.id,
          message: `too small for "${instance.frame}": ${w}×${h} is below its ${minW}×${minH} minimum`,
        });
      if (
        (layout.maxW != null && w > layout.maxW) ||
        (layout.maxH != null && h > layout.maxH)
      )
        issues.push({
          frameId: instance.id,
          message: `too large for "${instance.frame}": ${w}×${h} is above its ${layout.maxW ?? "any"}×${layout.maxH ?? "any"} maximum`,
        });
    }

    if (instance.children && instance.children.length > 0) {
      if (meta.container !== true) {
        issues.push({
          frameId: instance.id,
          message: `"${instance.frame}" is not a container — its "children" will not render. Put children on a container frame (e.g. "group")`,
        });
      } else {
        // The children's grid units come from the group's own validated
        // config (columns/rows default 2×2), never the board's 12 columns.
        const groupConfig = parsed.success
          ? (parsed.data as { columns?: number; rows?: number })
          : undefined;
        const columns = groupConfig?.columns ?? 2;
        const rows = groupConfig?.rows ?? 2;
        for (const child of instance.children) {
          if (seenIds.has(child.id))
            issues.push({
              frameId: child.id,
              message: `duplicate frame id "${child.id}"`,
            });
          seenIds.add(child.id);

          const childMeta = metaByName.get(child.frame);
          if (!childMeta) {
            issues.push({
              frameId: child.id,
              message: `unknown frame "${child.frame}". available: ${[
                ...metaByName.keys(),
              ].join(", ")}`,
            });
            continue;
          }
          if (childMeta.container === true) {
            issues.push({
              frameId: child.id,
              message: `groups do not nest — "${child.frame}" cannot be a child of "${instance.id}"`,
            });
            continue;
          }
          const childParsed = childMeta.schema.safeParse(child.config);
          if (!childParsed.success) {
            for (const issue of childParsed.error.issues)
              issues.push({
                frameId: child.id,
                message: `config.${issue.path.join(".") || "(root)"}: ${
                  issue.message
                }`,
              });
          }
          if (child.position.x + child.position.w > columns)
            issues.push({
              frameId: child.id,
              message: `overflows its group: x(${child.position.x}) + w(${child.position.w}) > the group's ${columns} columns`,
            });
          if (child.position.y + child.position.h > rows)
            issues.push({
              frameId: child.id,
              message: `overflows its group: y(${child.position.y}) + h(${child.position.h}) > the group's ${rows} rows`,
            });
        }
        for (let i = 0; i < instance.children.length; i++) {
          for (let j = i + 1; j < instance.children.length; j++) {
            const a = instance.children[i].position;
            const b = instance.children[j].position;
            const overlap =
              a.x < b.x + b.w &&
              b.x < a.x + a.w &&
              a.y < b.y + b.h &&
              b.y < a.y + a.h;
            if (overlap)
              issues.push({
                frameId: instance.children[i].id,
                message: `overlaps frame "${instance.children[j].id}" inside group "${instance.id}"`,
              });
          }
        }
      }
    }

    // The horizontal layout (when present) is height-bounded to grid.rows bands;
    // x grows freely (the board scrolls sideways), so only y+h is constrained.
    const horizontal = instance.layouts?.["flow-horizontal"];
    if (horizontal && horizontal.y + horizontal.h > spec.grid.rows)
      issues.push({
        frameId: instance.id,
        message: `horizontal layout overflows: y(${horizontal.y}) + h(${horizontal.h}) > ${spec.grid.rows} rows`,
      });
  }

  // Pairwise overlap check — overlapping frames render on top of each other.
  for (let i = 0; i < spec.frames.length; i++) {
    for (let j = i + 1; j < spec.frames.length; j++) {
      const a = spec.frames[i].position;
      const b = spec.frames[j].position;
      const overlap =
        a.x < b.x + b.w &&
        b.x < a.x + a.w &&
        a.y < b.y + b.h &&
        b.y < a.y + a.h;
      if (overlap)
        issues.push({
          frameId: spec.frames[i].id,
          message: `overlaps frame "${spec.frames[j].id}"`,
        });
    }
  }

  return issues;
}
