import { z } from "zod";
import type { FrameCategory, FrameMeta, FrameRegistry } from "./frame";

/**
 * Serializes frame metadata into an AI-readable catalogue: name, description,
 * capabilities, and the config schema as JSON Schema. A generating agent
 * (e.g. the /zframes skill) reads this before emitting a dashboard spec — a
 * catalogue-driven generation pattern.
 *
 * Accepts a runtime registry or a plain list of metas (the CLI path, which
 * never loads components).
 */
export function catalogueForAI(input: FrameRegistry | Iterable<FrameMeta>) {
  const metas: FrameMeta[] =
    input instanceof Map ? [...input.values()] : [...input];
  return metas.map((meta) => ({
    name: meta.name,
    // The frame's default card title. An instance that omits `title` renders
    // this, so the agent should leave `title` unset unless it wants a custom
    // label — never re-state the default or hand-author an abbreviation.
    label: meta.label,
    category: meta.category,
    description: meta.description,
    iconUrl: meta.iconUrl,
    capabilities: meta.capabilities,
    // io: "input" — the agent writes the *input* shape, where .default()
    // fields are optional. The output shape would wrongly mark them required.
    configSchema: z.toJSONSchema(meta.schema, { io: "input" }),
  }));
}

/**
 * A compact, prose catalogue of every frame — one `name — description` per
 * frame, grouped by family (the meta's `category`) in first-appearance order.
 * Unlike {@link catalogueForAI} (full JSON Schemas, for a generating agent),
 * this is a small plain-text overview cheap enough to drop into a prompt every
 * turn — it tells the embedded zAI assistant what frames exist and what each
 * does, so it can answer "what can this dashboard show / what does frame X do"
 * without a network call. React-free; built from the same metas.
 *
 * Note: groups by each meta's own `category` string rather than importing the
 * `FRAME_CATEGORIES` value — this module is reached by Vite's Node config loader
 * (via the host's vite.config), where a relative *value* import of "./frame"
 * fails to resolve (same footgun as @zframes/core/vite). Type-only is fine.
 */
export function catalogueSummary(
  input: FrameRegistry | Iterable<FrameMeta>,
): string {
  const metas: FrameMeta[] =
    input instanceof Map ? [...input.values()] : [...input];
  const order: FrameCategory[] = [];
  const byCategory = new Map<FrameCategory, FrameMeta[]>();
  for (const meta of metas) {
    let group = byCategory.get(meta.category);
    if (!group) {
      group = [];
      byCategory.set(meta.category, group);
      order.push(meta.category);
    }
    group.push(meta);
  }
  const lines: string[] = [];
  for (const category of order) {
    const items = (byCategory.get(category) ?? [])
      .map((meta) => {
        const desc = meta.description.replace(/\s+/g, " ").trim();
        const short = desc.length > 110 ? `${desc.slice(0, 109)}…` : desc;
        return `${meta.name} — ${short}`;
      })
      .join("; ");
    lines.push(`${category}: ${items}`);
  }
  return lines.join("\n");
}
