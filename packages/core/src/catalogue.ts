import { z } from "zod";
import type { FrameMeta, FrameRegistry } from "./frame";

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
    description: meta.description,
    iconUrl: meta.iconUrl,
    capabilities: meta.capabilities,
    // io: "input" — the agent writes the *input* shape, where .default()
    // fields are optional. The output shape would wrongly mark them required.
    configSchema: z.toJSONSchema(meta.schema, { io: "input" }),
  }));
}
