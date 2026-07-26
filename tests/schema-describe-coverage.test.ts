// `tests/` is not a package, so a bare `zod` specifier has nowhere to resolve
// from — the repo root installs only its own devDependencies. Reach the one zod
// the workspace installed through the link in the package under test, so the
// synthetic schemas below are built by the same module instance that
// `catalogueForAI` calls `toJSONSchema` from.
import { z } from "../packages/frames/node_modules/zod";
import { describe, expect, it } from "vitest";
import { catalogueForAI } from "../packages/spec/src/catalogue";
import { FRAME_CATEGORIES, type FrameMeta } from "../packages/spec/src/frame";
import { allFrameMetas } from "../packages/frames/src/schemas";

/**
 * Guards the `.describe()` rule the whole agent workflow rests on.
 *
 * AGENTS.md states it as a hard rule — "Every frame schema field needs
 * `.describe()` — schemas are read by generating agents via `catalogueForAI`" —
 * and nothing enforced it. The failure mode is silent and permanent: an
 * undescribed field converts to a JSON-Schema property with no `description`,
 * so the generating agent has nothing to reason from. It omits the field (the
 * frame renders its default forever) or guesses a value, on every dashboard
 * every user generates, with no error anywhere — not in `zframes lint`, not in
 * the renderer, not in CI. The only symptom is a card that quietly never does
 * what the user asked for.
 *
 * So this walks the *real* catalogue the agent reads (`catalogueForAI` over
 * `allFrameMetas`, the React-free entry) and fails naming `<frame>.<field path>`
 * for every hole. It recurses into nested objects and array item schemas — a
 * described `links` array whose item object has an undescribed `url` is still a
 * hole the agent can't fill — and it looks through the wrappers that would
 * otherwise hide one (`.optional()`, `.default()`, `.nullable()`, unions,
 * enums).
 *
 * Two verdicts, reported separately and worded differently, because the fix
 * differs and a failure message that misdiagnoses gets the guard deleted: a
 * field can have **no** `.describe()` (add one) or have one whose text is too
 * terse / placeholder-shaped for an agent to reason from (expand the call that
 * is already there — never "add a .describe()", which would read as a lie to
 * the author who just wrote it).
 *
 * There is deliberately NO allowlist: the catalogue is 100% described today
 * (391 top-level fields + 9 nested), so a new hole is a new mistake and the fix
 * is one `.describe()` call, not an exemption entry.
 *
 * Two anti-blindness guards ride along, because a coverage walk that sees
 * nothing passes just as green as one that sees everything: the walked field set
 * is cross-checked against each Zod object's own `shape` keys (so a conversion
 * that dropped fields can't shrink the corpus unnoticed), and the walker itself
 * is exercised against synthetic schemas that put a missing description behind
 * every wrapper shape — plus the mirror set, which pins that a *properly*
 * described field passes wherever the converter chose to park its description.
 */

type JsonSchemaNode = Record<string, unknown>;

const isNode = (value: unknown): value is JsonSchemaNode =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Composite branches, so a union/intersection can't hide its members. */
function branchesOf(node: JsonSchemaNode): JsonSchemaNode[] {
  const out: JsonSchemaNode[] = [];
  for (const key of ["allOf", "anyOf", "oneOf"]) {
    const value = node[key];
    if (Array.isArray(value)) {
      for (const branch of value) if (isNode(branch)) out.push(branch);
    }
  }
  return out;
}

/**
 * Is this branch just the "or null" half of a `.nullable()`? It carries no
 * field semantics — the payload branch beside it is the field — so it must not
 * count towards the branch tally that decides whether a description has to sit
 * at field level. Zod emits `{type:"null"}` for `.nullable()`/`.nullish()` and
 * `{type:"null",const:null}` for a `z.literal(null)` union member; other
 * converters express the same thing as `{enum:[null]}`.
 */
function isNullBranch(node: JsonSchemaNode): boolean {
  if (node.type === "null") return true;
  if ("const" in node && node.const === null) return true;
  const values = node.enum;
  return (
    Array.isArray(values) &&
    values.length > 0 &&
    values.every((value) => value === null)
  );
}

/** Composite branches that actually carry a payload shape. */
const payloadBranches = (node: JsonSchemaNode): JsonSchemaNode[] =>
  branchesOf(node).filter((branch) => !isNullBranch(branch));

const REF_PREFIX = "#/$defs/";

/**
 * Inline a `$ref` against the document's `$defs`, local keys winning. Zod 4.4
 * inlines reused object schemas, so today's catalogue contains no `$ref` at all
 * — but a recursive schema (or `toJSONSchema`'s `reused: "ref"` mode) emits one,
 * and a walker that treats `{$ref}` as a leaf would silently skip every field
 * inside it. Returns null when the pointer can't be followed, which the walk
 * reports rather than swallows.
 */
function resolveRef(
  node: JsonSchemaNode,
  root: JsonSchemaNode,
  seen: Set<unknown> = new Set(),
): JsonSchemaNode | null {
  const ref = node.$ref;
  if (typeof ref !== "string") return node;
  if (!ref.startsWith(REF_PREFIX)) return null;
  const defs = root.$defs;
  const target = isNode(defs) ? defs[ref.slice(REF_PREFIX.length)] : undefined;
  if (!isNode(target) || seen.has(target)) return null;
  seen.add(target);
  const inner = resolveRef(target, root, seen);
  if (!inner) return null;
  const local: JsonSchemaNode = { ...node };
  delete local.$ref;
  return { ...inner, ...local };
}

/** Placeholder text an agent can't reason from. */
const PLACEHOLDER = /^(todo|tbd|fixme|wip|xxx|n\/?a|\?+|-+|\.+)$/i;

/**
 * The shortest real description in the catalogue is 11 characters ("Line
 * style."), so this floor sits under the house style with headroom while still
 * catching a one-word restatement of the field name (`hue: "Hue."`), which
 * tells a generating agent nothing the property key didn't. Falling under it is
 * a *weak* verdict, never a missing one — the distinction is the whole point of
 * {@link judgeDescription}.
 */
const MIN_DESCRIPTION_CHARS = 6;

type DescriptionFault = "too-short" | "placeholder";
type DescriptionVerdict = "ok" | "absent" | DescriptionFault;

/** How each fault is worded in a failure message. */
const FAULT_TEXT: Record<Exclude<DescriptionVerdict, "ok">, string> = {
  absent: "missing or blank",
  "too-short": `under ${MIN_DESCRIPTION_CHARS} characters — too terse to reason from`,
  placeholder: "placeholder text",
};

function judgeDescription(value: unknown): DescriptionVerdict {
  if (typeof value !== "string") return "absent";
  const text = value.trim();
  if (text === "") return "absent";
  if (PLACEHOLDER.test(text.replace(/[.!]+$/, ""))) return "placeholder";
  if (text.length < MIN_DESCRIPTION_CHARS) return "too-short";
  return "ok";
}

type FieldDescription =
  | { kind: "ok" }
  | { kind: "absent" }
  | { kind: "weak"; fault: DescriptionFault; text: string }
  | { kind: "unresolvable" };

/**
 * Where does this field's description stand? It must be readable from the
 * field's own entry — that is what the agent reads — so: the field's
 * `description`, or its `$ref` target's (the field IS that schema), or the sole
 * payload branch of a composite, which is how converters express a described
 * wrapper. `.describe()` applied *before* `.nullable()` lands exactly there:
 * zod emits `anyOf: [{…, description}, {type:"null"}]`, and the description is
 * present and readable, so the field passes. A composite with two real payload
 * branches still needs the description at field level — one described member
 * does not explain the field.
 *
 * A weak text anywhere loses to an `ok` text elsewhere; only when no location
 * is `ok` is the weak text reported, so the message can quote the string the
 * author actually wrote.
 */
function describedness(
  node: JsonSchemaNode,
  root: JsonSchemaNode,
): FieldDescription {
  const weak: { fault: DescriptionFault; text: string }[] = [];
  const own = judgeDescription(node.description);
  if (own === "ok") return { kind: "ok" };
  if (own !== "absent")
    weak.push({ fault: own, text: String(node.description).trim() });

  const resolved = resolveRef(node, root);
  if (!resolved) return { kind: "unresolvable" };
  if (resolved !== node) {
    const viaRef = judgeDescription(resolved.description);
    if (viaRef === "ok") return { kind: "ok" };
    if (viaRef !== "absent")
      weak.push({ fault: viaRef, text: String(resolved.description).trim() });
  }

  const branches = payloadBranches(resolved);
  if (branches.length === 1) {
    const inner = describedness(branches[0], root);
    if (inner.kind === "ok") return { kind: "ok" };
    if (inner.kind === "unresolvable") return inner;
    if (inner.kind === "weak")
      weak.push({ fault: inner.fault, text: inner.text });
  }

  const [first] = weak;
  return first ? { kind: "weak", ...first } : { kind: "absent" };
}

/** A description that exists but can't be reasoned from. */
interface WeakDescription {
  path: string;
  text: string;
  fault: DescriptionFault;
}

interface WalkResult {
  /** Every field path the walk inspected, e.g. `links[].url`. */
  paths: string[];
  /** Fields with no description at all — the `.describe()` call is missing. */
  missing: string[];
  /** Fields whose `.describe()` exists but is unusable. */
  weak: WeakDescription[];
  /** `$ref`s the walk could not follow, so their fields went uninspected. */
  broken: string[];
}

/**
 * Walk one frame's converted config schema, collecting every field an agent is
 * expected to fill. Only structural keywords are followed (`properties`,
 * `items`, `prefixItems`, `additionalProperties`, composites) — never `default`
 * or `enum`, whose contents are values, not schemas.
 */
function walkSchema(root: JsonSchemaNode): WalkResult {
  const result: WalkResult = { paths: [], missing: [], weak: [], broken: [] };
  const visited = new Set<JsonSchemaNode>();

  const walk = (raw: JsonSchemaNode, path: string): void => {
    if (visited.has(raw)) return;
    visited.add(raw);
    const node = resolveRef(raw, root);
    if (!node) {
      result.broken.push(
        `${path || "<root>"} (unresolvable $ref ${String(raw.$ref)})`,
      );
      return;
    }
    const properties = node.properties;
    if (isNode(properties)) {
      for (const [key, child] of Object.entries(properties)) {
        if (!isNode(child)) continue;
        const childPath = path ? `${path}.${key}` : key;
        result.paths.push(childPath);
        const verdict = describedness(child, root);
        if (verdict.kind === "absent") result.missing.push(childPath);
        else if (verdict.kind === "weak")
          result.weak.push({
            path: childPath,
            text: verdict.text,
            fault: verdict.fault,
          });
        // `unresolvable` needs no entry here: the walk below visits this very
        // node next and reports the dangling pointer once, with its path.
        walk(child, childPath);
      }
    }
    const items = node.items;
    if (isNode(items)) walk(items, `${path}[]`);
    const prefixItems = node.prefixItems;
    if (Array.isArray(prefixItems)) {
      prefixItems.forEach((item, index) => {
        if (isNode(item)) walk(item, `${path}[${index}]`);
      });
    }
    const additional = node.additionalProperties;
    if (isNode(additional)) walk(additional, `${path}{}`);
    for (const branch of branchesOf(node)) walk(branch, path);
  };

  walk(root, "");
  return result;
}

/** The catalogue exactly as the generating agent receives it. */
const catalogue = catalogueForAI(allFrameMetas);

function walkCatalogue(): WalkResult {
  const all: WalkResult = { paths: [], missing: [], weak: [], broken: [] };
  for (const entry of catalogue) {
    const result = walkSchema(entry.configSchema as JsonSchemaNode);
    for (const path of result.paths) all.paths.push(`${entry.name}.${path}`);
    for (const miss of result.missing)
      all.missing.push(`${entry.name}.${miss}`);
    for (const broken of result.broken)
      all.broken.push(`${entry.name}.${broken}`);
    for (const weak of result.weak)
      all.weak.push({ ...weak, path: `${entry.name}.${weak.path}` });
  }
  return all;
}

const weakLines = (weak: WeakDescription[]): string =>
  weak
    .map(
      (entry) =>
        `  - ${entry.path}: ${JSON.stringify(entry.text)} (${FAULT_TEXT[entry.fault]})`,
    )
    .join("\n");

/** Build a throwaway catalogue entry so the walker can be aimed at a shape. */
function fakeMeta(name: string, schema: z.ZodType): FrameMeta {
  return {
    name,
    label: name,
    category: "tools",
    description: `Synthetic ${name} frame used to test the coverage walk.`,
    capabilities: [],
    schema,
  };
}

function auditOf(schema: z.ZodType): WalkResult {
  const [entry] = catalogueForAI([fakeMeta("synthetic", schema)]);
  return walkSchema(entry.configSchema as JsonSchemaNode);
}

const missingFor = (schema: z.ZodType): string[] => auditOf(schema).missing;
const weakFor = (schema: z.ZodType): WeakDescription[] => auditOf(schema).weak;

describe("frame schema .describe() coverage", () => {
  it("every config field in the AI catalogue carries a description", () => {
    const { missing, weak, broken } = walkCatalogue();
    expect(
      missing,
      `${missing.length} frame config field(s) have no .describe() at all.\n` +
        `A generating agent reads ONLY this catalogue, so an undescribed field ` +
        `is a field it cannot fill — it will omit or guess it on every ` +
        `dashboard, silently, forever. Add a .describe() saying what the field ` +
        `does and what a good value looks like (nested objects and array items ` +
        `count too):\n` +
        missing.map((miss) => `  - ${miss}`).join("\n"),
    ).toEqual([]);
    expect(
      weak,
      `${weak.length} frame config field(s) DO have a .describe() — the call ` +
        `is already there, do not add a second one — but an agent cannot ` +
        `reason from the text it holds (too terse, or a placeholder stub). ` +
        `Expand the existing description to say what the field does and what ` +
        `a good value looks like; the catalogue's own house style runs 11+ ` +
        `characters ("Line style.", "Candle interval."):\n` +
        weakLines(weak),
    ).toEqual([]);
    expect(
      broken,
      `${broken.length} $ref(s) could not be followed, so every field inside ` +
        `them went uninspected and the pass above proves nothing about them. ` +
        `Point the $ref at a real #/$defs entry, or teach resolveRef the new ` +
        `pointer form:\n` +
        broken.map((entry) => `  - ${entry}`).join("\n"),
    ).toEqual([]);
  });

  it("walks the array-item and nested-object fields, not just the top level", () => {
    // Anti-blindness: the pass above is only worth its green if the walk
    // actually descends. `link-grid` is a shipped frame whose `links` array
    // holds an object — if it is renamed or removed, re-point this sentinel at
    // another nested field rather than dropping the assertion.
    const { paths } = walkCatalogue();
    expect(paths).toContain("link-grid.links[].url");
    const nested = paths.filter((path) => path.includes("[]"));
    expect(
      nested.length,
      "the walk found no array-item fields at all — it has gone blind",
    ).toBeGreaterThan(0);
    expect(
      paths.length,
      `only ${paths.length} config fields were walked; the catalogue has ~400. ` +
        `A collapsed corpus means the coverage pass proves nothing.`,
    ).toBeGreaterThan(250);
  });

  it("sees every field each frame's Zod schema declares", () => {
    // The walk can only inspect what `toJSONSchema` emits. If a conversion
    // change (a zod major, a different `io` mode, a schema wrapped in a
    // transform) stopped emitting some properties, the coverage pass would go
    // green while those fields sat undescribed. Cross-check against the Zod
    // object's own shape.
    const drift: string[] = [];
    allFrameMetas.forEach((meta, index) => {
      const shape = (meta.schema as z.ZodObject).shape as
        Record<string, unknown> | undefined;
      if (!shape) {
        drift.push(
          `${meta.name}: schema is not a Zod object, so the coverage walk ` +
            `cannot enumerate its fields — extend walkSchema`,
        );
        return;
      }
      const declared = Object.keys(shape).sort();
      const emitted = Object.keys(
        ((catalogue[index].configSchema as JsonSchemaNode)
          .properties as JsonSchemaNode) ?? {},
      ).sort();
      if (declared.join() !== emitted.join()) {
        drift.push(
          `${meta.name}: zod=[${declared.join(", ")}] json=[${emitted.join(", ")}]`,
        );
      }
    });
    expect(drift, drift.join("\n")).toEqual([]);
  });

  it("flags a missing description no matter which wrapper hides it", () => {
    // Proves the walk is load-bearing: each of these shapes converts to a
    // different JSON-Schema layout, and every one of them has been a plausible
    // way to smuggle an undescribed field past a naive check.
    expect(missingFor(z.object({ bare: z.string() }))).toEqual(["bare"]);
    expect(missingFor(z.object({ opt: z.string().optional() }))).toEqual([
      "opt",
    ]);
    expect(missingFor(z.object({ def: z.string().default("x") }))).toEqual([
      "def",
    ]);
    expect(missingFor(z.object({ pick: z.enum(["a", "b"]) }))).toEqual([
      "pick",
    ]);
    expect(missingFor(z.object({ n: z.number().min(1).max(9) }))).toEqual([
      "n",
    ]);
    expect(
      missingFor(z.object({ u: z.union([z.string(), z.number()]) })),
    ).toEqual(["u"]);
    // Dropping the null branch (so `.describe().nullable()` passes below) must
    // not blind the walk to a nullable field nobody described at all.
    expect(missingFor(z.object({ maybe: z.string().nullable() }))).toEqual([
      "maybe",
    ]);
    expect(
      missingFor(
        z.object({ maybe: z.object({ q: z.string() }).nullable() }),
      ).sort(),
    ).toEqual(["maybe", "maybe.q"]);
    // A described array whose item object has an undescribed field.
    expect(
      missingFor(
        z.object({
          rows: z
            .array(z.object({ url: z.string().describe("Where it points.") }))
            .describe("The rows."),
          links: z
            .array(z.object({ url: z.string() }))
            .describe("The links to show."),
        }),
      ),
    ).toEqual(["links[].url"]);
    // A described object whose child is not.
    expect(
      missingFor(
        z.object({
          axis: z.object({ max: z.number() }).describe("Axis bounds."),
        }),
      ),
    ).toEqual(["axis.max"]);
    // A described union of objects still needs its members described — and a
    // null branch alongside them does not buy the union an exemption.
    expect(
      missingFor(
        z.object({
          mode: z
            .union([
              z.object({ pct: z.number() }),
              z.object({ abs: z.number() }),
            ])
            .describe("Threshold, relative or absolute."),
          span: z
            .union([
              z.object({ days: z.number() }),
              z.object({ bars: z.number() }),
            ])
            .nullable(),
        }),
      ).sort(),
    ).toEqual(["mode.abs", "mode.pct", "span", "span.bars", "span.days"]);
    // The null-branch exemption stops at null: a *described* second payload
    // branch does not explain the field, so the field itself still needs one.
    expect(
      missingFor(
        z.object({
          either: z.union([
            z.string().describe("A ticker symbol like BTC."),
            z.number().describe("A raw index into the list."),
          ]),
        }),
      ),
    ).toEqual(["either"]);
    // Whitespace-only is not a description at all.
    expect(missingFor(z.object({ blank: z.string().describe("   ") }))).toEqual(
      ["blank"],
    );
  });

  it("reports a present-but-unusable description as weak, not as missing", () => {
    // The two verdicts are what the author reads. Telling someone who just
    // wrote `.describe("Hue.")` to "add a .describe()" denies the call exists,
    // which is the fastest route to the floor being ripped out wholesale — so
    // a terse or stubbed description must land in `weak`, quoting its own text,
    // and must NOT appear in `missing`.
    const terse = z.object({
      axis: z
        .object({ max: z.number().describe("Highest value on the axis.") })
        .describe("Axis.")
        .optional(),
      rows: z.array(z.string()).describe("Arr."),
      stub: z.string().describe("TODO"),
      na: z.string().describe("n/a"),
    });
    expect(weakFor(terse)).toEqual([
      { path: "axis", text: "Axis.", fault: "too-short" },
      { path: "rows", text: "Arr.", fault: "too-short" },
      { path: "stub", text: "TODO", fault: "placeholder" },
      { path: "na", text: "n/a", fault: "placeholder" },
    ]);
    expect(missingFor(terse)).toEqual([]);
    // The weak text is quoted verbatim in the message, so the author can see
    // which string was judged rather than guessing.
    const lines = weakLines(weakFor(terse));
    expect(lines).toContain(`  - axis: "Axis." (`);
    expect(lines).toContain("too terse to reason from");
    expect(lines).toContain(`  - stub: "TODO" (placeholder text)`);
    // A weak description behind a wrapper is still weak, not missing, and it
    // is reported under the field's path with the wrapper's text.
    expect(
      weakFor(z.object({ hue: z.string().describe("Hue.").nullable() })),
    ).toEqual([{ path: "hue", text: "Hue.", fault: "too-short" }]);
    expect(
      missingFor(z.object({ hue: z.string().describe("Hue.").nullable() })),
    ).toEqual([]);
    // A real description at field level wins over a weak one on the branch.
    expect(
      auditOf(
        z.object({
          hue: z
            .string()
            .describe("Hue.")
            .nullable()
            .describe("Accent hue in degrees, 0-360."),
        }),
      ),
    ).toMatchObject({ missing: [], weak: [] });
  });

  it("accepts a description wherever the converter puts it", () => {
    // The mirror of the tests above: the rule must not be so strict that a
    // properly described field fails, or the guard gets deleted the first time
    // it cries wolf.
    expect(
      missingFor(
        z.object({
          before: z
            .string()
            .describe("Described, then made optional.")
            .optional(),
          after: z
            .string()
            .optional()
            .describe("Made optional, then described."),
          defaulted: z.string().default("x").describe("Has a default too."),
          picked: z.enum(["a", "b"]).describe("One of two modes."),
          symbols: z.array(z.string()).describe("Plain string list."),
          nested: z
            .array(z.object({ url: z.string().describe("Item URL here.") }))
            .describe("Items with described fields."),
        }),
      ),
    ).toEqual([]);
    // `.nullable()` converts the field to a two-branch `anyOf`, and which
    // branch holds the description depends purely on call order:
    // `.describe().nullable()` parks it on the payload branch,
    // `.nullable().describe()` on the field. Both are present and readable, so
    // both must pass — no live frame uses `.nullable()` today, so nothing but
    // this test stands between the first author who does and a failure telling
    // them to add a `.describe()` they already wrote.
    const nullable = z.object({
      describedThenNullable: z
        .string()
        .describe("Described first, then made nullable.")
        .nullable(),
      nullableThenDescribed: z
        .string()
        .nullable()
        .describe("Made nullable first, then described."),
      objectDescribedThenNullable: z
        .object({ q: z.string().describe("Inner field, described.") })
        .describe("Object described, then made nullable.")
        .nullable(),
      objectNullableThenDescribed: z
        .object({ q: z.string().describe("Inner field, described.") })
        .nullable()
        .describe("Object made nullable, then described."),
      nullish: z.string().describe("Described, then made nullish.").nullish(),
      literalNullUnion: z
        .union([z.string().describe("The string form of the field."), z.null()])
        .nullable(),
    });
    expect(auditOf(nullable)).toMatchObject({
      missing: [],
      weak: [],
      broken: [],
    });
    // …and the walk still descends through the nullable wrapper, so its inner
    // fields are inspected rather than skipped.
    expect(auditOf(nullable).paths).toContain("objectDescribedThenNullable.q");
  });

  it("follows a $ref into $defs and reports one it cannot follow", () => {
    // Zod 4.4 inlines reused schemas, so no live schema exercises this — but a
    // recursive schema or `reused: "ref"` would, and a `$ref` treated as a leaf
    // hides every field inside it. Aimed at the walker directly, since no zod
    // input produces the shape today.
    const withDefs: JsonSchemaNode = {
      type: "object",
      properties: { item: { $ref: "#/$defs/Row" } },
      $defs: {
        Row: {
          description: "One row.",
          type: "object",
          properties: {
            label: { type: "string", description: "Row caption text." },
            size: { type: "number" },
          },
        },
      },
    };
    expect(walkSchema(withDefs)).toMatchObject({
      missing: ["item.size"],
      weak: [],
      broken: [],
    });

    const dangling: JsonSchemaNode = {
      type: "object",
      properties: { item: { $ref: "#/$defs/Missing" } },
      $defs: {},
    };
    // A pointer that goes nowhere is reported as broken — the walk never saw
    // the field's schema, so calling it "undescribed" would be a guess.
    expect(walkSchema(dangling)).toMatchObject({
      missing: [],
      weak: [],
      broken: ["item (unresolvable $ref #/$defs/Missing)"],
    });
  });

  it("hands the agent a usable description and a real category per frame", () => {
    // The other two fields `catalogueForAI` emits for reasoning: the frame-level
    // blurb (how the agent decides to pick the frame at all) and the category
    // (how it groups families). `registry-parity.test.ts` guards meta/loader
    // parity only, so nothing checked either. A category outside
    // FRAME_CATEGORIES also drops the frame out of the editor palette's
    // labelled sections.
    const validCategories = new Set<string>(
      FRAME_CATEGORIES.map((category) => category.key),
    );
    const broken: string[] = [];
    for (const entry of catalogue) {
      const verdict = judgeDescription(entry.description);
      if (verdict !== "ok")
        broken.push(
          `${entry.name}: description is ${FAULT_TEXT[verdict]} ` +
            `(${JSON.stringify(entry.description)})`,
        );
      if (!validCategories.has(entry.category))
        broken.push(
          `${entry.name}: category "${entry.category}" is not in FRAME_CATEGORIES`,
        );
      if (!entry.label?.trim())
        broken.push(
          `${entry.name}: label is empty, so the card title is blank`,
        );
    }
    expect(broken, broken.join("\n")).toEqual([]);
    expect(catalogue.length).toBeGreaterThan(150);
  });
});
