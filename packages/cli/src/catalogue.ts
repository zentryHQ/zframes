import { catalogueForAI, catalogueSummary } from "@zframes/spec/catalogue";
import { FRAME_CATEGORIES } from "@zframes/spec/frame";
import { BACKGROUND_SCENES, THEME_PRESETS } from "@zframes/spec/presets";
import { frameMetas } from "@zframes/frames/schemas";

// Extracted from index.ts so it's importable without running the CLI (index.ts
// invokes main() + process.exit() at module load — same reason lint.ts exists).

export interface CatalogueResult {
  code: number;
  stdout?: string;
  stderr?: string;
}

/**
 * The design vocabulary that rides along with the frames, whatever the mode:
 * the category taxonomy the agent composes zones from, the named cosmetic
 * looks (each preset's values are exactly what the agent writes into
 * `theme`/`typography`/`appearance`, plus the scene to pair), and the backdrop
 * scenes (key → projectId for `background.projectId`). Scene rendering
 * internals (baseHue, swatch) stay host-side.
 */
function designVocabulary() {
  return {
    categories: FRAME_CATEGORIES,
    themePresets: THEME_PRESETS,
    backgroundScenes: BACKGROUND_SCENES.map(
      ({ key, label, description, projectId }) => ({
        key,
        label,
        description,
        projectId,
      }),
    ),
  };
}

/**
 * `zframes catalogue [--summary | frame...]`.
 *
 * The full catalogue outgrew a single read (~270 frames of JSON Schema, ~400
 * KB), so the agent flow is two-phase: `--summary` is the cheap browse pass —
 * every frame as one `name — description` line grouped by category, plus the
 * full design vocabulary (preset values are small enough to inline, so
 * cosmetics never need a second call) — and `catalogue <frame...>` returns the
 * full entries (config schema, sizing envelope, flags) for just the frames the
 * agent actually picked. A bare `catalogue` still prints everything, wrapped as
 * `{frames, categories, themePresets, backgroundScenes}`.
 */
export function catalogue(args: string[]): CatalogueResult {
  const names = args.filter((a) => !a.startsWith("-"));
  const flags = args.filter((a) => a.startsWith("-"));
  const unknownFlags = flags.filter((f) => f !== "--summary");
  if (unknownFlags.length > 0) {
    return {
      code: 1,
      stderr: `✗ unknown option ${unknownFlags[0]}\nusage: zframes catalogue [--summary | frame...]`,
    };
  }

  if (flags.includes("--summary")) {
    const lines: string[] = [];
    lines.push(
      `zframes frame catalogue — ${frameMetas.length} frames. This is the browse view; ` +
        `get full config schemas with \`zframes catalogue <frame> [frame...]\`.`,
    );
    lines.push("");
    lines.push("## Categories (key — label: what the family covers)");
    for (const c of FRAME_CATEGORIES)
      lines.push(`${c.key} — ${c.label}: ${c.description}`);
    lines.push("");
    lines.push("## Frames by category (name — what it shows)");
    lines.push(catalogueSummary(frameMetas));
    lines.push("");
    lines.push(
      "## Theme presets — coherent one-choice looks. Apply one by writing its",
    );
    lines.push(
      "## `theme`/`typography`/`appearance` values into the spec verbatim and",
    );
    lines.push(
      "## setting `background.projectId` to its scene's projectId (below).",
    );
    for (const p of THEME_PRESETS) {
      lines.push(`${p.key} — ${p.description}`);
      lines.push(
        `  ${JSON.stringify({ theme: p.theme, typography: p.typography, appearance: p.appearance, scene: p.scene })}`,
      );
    }
    lines.push("");
    lines.push(
      "## Background scenes (key — projectId — the animated backdrop's feel)",
    );
    for (const s of BACKGROUND_SCENES)
      lines.push(`${s.key} — ${s.projectId} — ${s.description}`);
    return { code: 0, stdout: lines.join("\n") };
  }

  if (names.length > 0) {
    const byName = new Map(frameMetas.map((meta) => [meta.name, meta]));
    const unknown = names.filter((n) => !byName.has(n));
    if (unknown.length > 0) {
      return {
        code: 1,
        stderr:
          `✗ unknown frame${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}\n` +
          `  available: ${[...byName.keys()].join(", ")}`,
      };
    }
    const metas = names.map((n) => byName.get(n)!);
    return {
      code: 0,
      stdout: JSON.stringify({ frames: catalogueForAI(metas) }, null, 2),
    };
  }

  return {
    code: 0,
    stdout: JSON.stringify(
      { frames: catalogueForAI(frameMetas), ...designVocabulary() },
      null,
      2,
    ),
  };
}
