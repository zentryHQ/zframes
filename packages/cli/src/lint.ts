import type { DashboardSpec } from "@zframes/spec/spec";
import { frameMetas } from "@zframes/frames/schemas";

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
  const metaByName = new Map(frameMetas.map((meta) => [meta.name, meta]));

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
