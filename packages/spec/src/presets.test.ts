import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  BACKGROUND_SCENES,
  SCENE_DEFAULT_HUE,
  SCENE_DEFAULT_PROJECT_ID,
  THEME_PRESETS,
  sceneBaseHue,
  type ThemePreset,
} from "./presets";
import { AppearanceSchema, ThemeSchema, TypographySchema } from "./spec";

/**
 * What this file pins, and why it matters
 * ---------------------------------------
 * `THEME_PRESETS` / `BACKGROUND_SCENES` are pure data the editor applies
 * *straight* to live cosmetic state — `applyPreset` (editor.tsx) feeds
 * `p.theme.*` / `p.typography.*` / `p.appearance.*` to the setters verbatim and
 * the write path never re-validates them. So an out-of-range or missing preset
 * value is not a cosmetic wobble: it lands in `dashboard.json`, and the next load
 * fails the runtime's `DashboardSpecSchema.safeParse`, replacing the whole board
 * with the spec-error screen. One click on a chip bricks the dashboard.
 *
 * A typo'd `scene` key fails soft in two places at once — `applyPreset` finds no
 * scene and silently leaves the backdrop as-is, and `activePresetKey` (which
 * compares the scene's projectId too) can never match, so that chip never reads
 * as selected. Two presets sharing one owned-value tuple fail that second way as
 * well, since `find` only ever returns the first match.
 *
 * `packages/core`'s barrel snapshot pins only that these export NAMES exist, so
 * this file is the only guard on the values themselves:
 *  - every preset group parses through its real schema (the bounds are tight:
 *    sat 0–100, hues int 0–360, surfaceOpacity 0.3–1, density 0.6–1.4,
 *    elevation 0–2), and those bounds are shown to have teeth;
 *  - every group carries the full key set, so no `undefined` reaches a setter
 *    (a present-but-`undefined` field passes zod's `.default()`, so key-set +
 *    definedness is a separate check from validity);
 *  - every field the cosmetic schemas declare is *classified* — owned by every
 *    preset (`OWNED_KEYS`) or deliberately left alone (`NOT_OWNED`) — so a new
 *    cosmetic field cannot land silently unset by the chips;
 *  - every `scene` resolves to a real scene, and scene keys + projectIds are
 *    unique (`sceneBaseHue` silently takes the first projectId match);
 *  - the first preset ("zframes") resets every field a preset owns — those fields
 *    deep-equal the schema defaults and it names the default scene at hue 242
 *    (the `NOT_OWNED` four are out of scope for a chip, on purpose);
 *  - `sceneBaseHue` returns authored hues and falls back to 242.
 */

/**
 * The fields a preset owns, group by group — the exact keys `applyPreset` reads.
 * Pinned as literals so a preset (or the reference preset the completeness check
 * compares against) cannot quietly shed a field.
 */
const OWNED_KEYS = {
  theme: ["accentHue", "accentSat", "baseHue", "baseSat"],
  typography: ["fontFamily", "numericStyle"],
  appearance: [
    "radius",
    "borderStrength",
    "surfaceOpacity",
    "density",
    "elevation",
  ],
} as const;

/**
 * The other half of the partition: cosmetic-schema fields a preset deliberately
 * does NOT set. `ThemePreset` narrows each group with a hand-written `Pick<>` and
 * `applyPreset` calls one setter per picked field, so anything listed here is
 * left exactly as the user had it when a chip is clicked.
 *
 * These are choices, not oversights — but they do have teeth, so they are named
 * rather than merely absent:
 *  - `theme.surface` (dark|light) — a chip does not flip the mode, so clicking
 *    "zframes" on a light board leaves it light, and every preset's copy ("on
 *    near-black navy", "Phosphor green on black") then describes a look the board
 *    is not in. The rail exposes Mode as its own control. Changing that means
 *    widening `ThemePreset` + `applyPreset` and authoring a surface per preset —
 *    a source decision, deliberately not smuggled in through a test.
 *  - `theme.upColor` / `theme.downColor` — semantic gain/loss, and the one knob a
 *    colourblind user retunes. A look must not stomp an accessibility choice.
 *  - `typography.scale` — a legibility/display-size setting (large monitor, packed
 *    board), independent of which look is on.
 *
 * Together with OWNED_KEYS this covers the schemas exactly, so a NEW cosmetic
 * field can't land unclassified: the partition test below fails until it is
 * either given to every preset or listed here with a reason.
 */
const NOT_OWNED: Record<keyof typeof OWNED_KEYS, readonly string[]> = {
  theme: ["upColor", "downColor", "surface"],
  typography: ["scale"],
  appearance: [],
};

/**
 * Every field each cosmetic schema declares, read off the real Zod shapes rather
 * than `parse({})` — so a field added as optional-without-default (which would
 * never show up in a parsed default object) still has to be classified.
 */
const DECLARED_FIELDS: Record<keyof typeof OWNED_KEYS, string[]> = {
  theme: Object.keys(ThemeSchema.shape),
  typography: Object.keys(TypographySchema.shape),
  appearance: Object.keys(AppearanceSchema.shape),
};

const GROUPS: Array<{
  name: keyof typeof OWNED_KEYS;
  schema: z.ZodType;
}> = [
  { name: "theme", schema: ThemeSchema },
  { name: "typography", schema: TypographySchema },
  { name: "appearance", schema: AppearanceSchema },
];

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function pickOwned(source: object, keys: readonly string[]) {
  const src = source as Record<string, unknown>;
  return Object.fromEntries(keys.map((k) => [k, src[k]]));
}

/** The exact tuple `activePresetKey` compares against the live editor state. */
function ownedSignature(p: ThemePreset): string {
  return JSON.stringify([
    p.theme.accentHue,
    p.theme.accentSat,
    p.theme.baseHue,
    p.theme.baseSat,
    p.typography.fontFamily,
    p.typography.numericStyle,
    p.appearance.radius,
    p.appearance.borderStrength,
    p.appearance.surfaceOpacity,
    p.appearance.density,
    p.appearance.elevation,
    BACKGROUND_SCENES.find((s) => s.key === p.scene)?.projectId,
  ]);
}

function duplicates(entries: Array<[string, string]>): string[][] {
  const byValue = new Map<string, string[]>();
  for (const [owner, value] of entries) {
    byValue.set(value, [...(byValue.get(value) ?? []), owner]);
  }
  return [...byValue.values()].filter((owners) => owners.length > 1);
}

describe("THEME_PRESETS: the chip list itself", () => {
  it("ships the reset preset first, so chip 1 is always the full default look", () => {
    expect(THEME_PRESETS.length).toBeGreaterThan(1);
    expect(THEME_PRESETS[0].key).toBe("zframes");
  });

  it("gives every preset a unique kebab-case key and non-empty chip copy", () => {
    expect(
      duplicates(THEME_PRESETS.map((p) => [p.key, p.key] as [string, string])),
    ).toStrictEqual([]);
    for (const p of THEME_PRESETS) {
      expect(p.key, `${p.key} must be a kebab-case id`).toMatch(KEBAB);
      expect(p.label.length, `${p.key} needs a chip label`).toBeGreaterThan(0);
      expect(
        p.description.length,
        `${p.key} needs a description (tooltip + agent reasoning)`,
      ).toBeGreaterThan(0);
    }
  });

  it("keeps every preset's owned-value tuple distinct, so no chip is unreachable", () => {
    // `activePresetKey` is a `find` over exactly this tuple: a preset that
    // duplicated an earlier one could be applied but would light up the *other*
    // chip, never its own.
    expect(
      duplicates(THEME_PRESETS.map((p) => [p.key, ownedSignature(p)])),
    ).toStrictEqual([]);
  });

  it("owns colour + type + surface + scene, but never grid geometry", () => {
    // Grid (columns/rowHeight/gap) is the user's layout, deliberately untouched
    // by a look — a preset that carried it would silently re-flow the board.
    for (const p of THEME_PRESETS) {
      expect(Object.keys(p).sort()).toStrictEqual([
        "appearance",
        "description",
        "key",
        "label",
        "scene",
        "theme",
        "typography",
      ]);
    }
  });
});

describe("every preset is schema-valid (the brick-the-board case)", () => {
  for (const p of THEME_PRESETS) {
    it(`"${p.key}" parses through Theme/Typography/AppearanceSchema`, () => {
      for (const g of GROUPS) {
        const r = g.schema.safeParse(p[g.name]);
        const detail = r.success
          ? ""
          : r.error.issues
              .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
              .join("; ");
        expect(
          r.success,
          `preset "${p.key}".${g.name} is not schema-valid — ${detail}`,
        ).toBe(true);
      }
    });
  }

  it("would catch an out-of-range value — the bounds have teeth", () => {
    // Without this, the loop above would keep passing if a `.max()` were dropped
    // from a schema, and the real gate (App.tsx's safeParse on load) would be the
    // first thing to notice.
    const outOfRange: Array<[string, z.ZodType, Record<string, unknown>]> = [
      ["theme.accentHue > 360", ThemeSchema, { accentHue: 361 }],
      ["theme.accentHue non-integer", ThemeSchema, { accentHue: 242.5 }],
      ["theme.accentSat > 100", ThemeSchema, { accentSat: 101 }],
      ["theme.accentSat < 0", ThemeSchema, { accentSat: -1 }],
      ["theme.baseHue > 360", ThemeSchema, { baseHue: 400 }],
      ["theme.baseSat > 100", ThemeSchema, { baseSat: 120 }],
      ["typography.fontFamily unknown", TypographySchema, { fontFamily: "ui" }],
      [
        "typography.numericStyle unknown",
        TypographySchema,
        { numericStyle: "oldstyle" },
      ],
      ["appearance.radius < 0", AppearanceSchema, { radius: -1 }],
      [
        "appearance.borderStrength > 1",
        AppearanceSchema,
        {
          borderStrength: 1.2,
        },
      ],
      [
        "appearance.surfaceOpacity < 0.3",
        AppearanceSchema,
        {
          surfaceOpacity: 0.29,
        },
      ],
      ["appearance.density < 0.6", AppearanceSchema, { density: 0.59 }],
      ["appearance.density > 1.4", AppearanceSchema, { density: 1.41 }],
      ["appearance.elevation > 2", AppearanceSchema, { elevation: 2.01 }],
      ["appearance.elevation < 0", AppearanceSchema, { elevation: -0.1 }],
    ];
    for (const [label, schema, bad] of outOfRange) {
      expect(schema.safeParse(bad).success, `${label} must be rejected`).toBe(
        false,
      );
    }
  });
});

describe("ownership: every cosmetic-schema field is classified", () => {
  it("splits each schema exactly into owned + deliberately-excluded fields", () => {
    // The guard that makes the rest of this file honest. Every other assertion
    // here is written against OWNED_KEYS, a hand-typed literal — so without this,
    // a field added to a cosmetic schema is invisible to the whole suite: no
    // preset sets it, the "true reset" check filters it out, and the reset chip
    // quietly stops resetting part of the look with everything still green.
    // (That is not hypothetical — theme.upColor/downColor/surface and
    // typography.scale all landed that way; see NOT_OWNED.)
    for (const g of GROUPS) {
      const declared = DECLARED_FIELDS[g.name];
      expect(
        declared.length,
        `${g.name}: no fields read off the schema shape`,
      ).toBeGreaterThan(0);
      for (const key of NOT_OWNED[g.name]) {
        expect(
          declared,
          `${g.name}.${key} is no longer a schema field — drop the stale exclusion`,
        ).toContain(key);
      }
      expect(
        declared.filter((k) => !NOT_OWNED[g.name].includes(k)).sort(),
        `${g.name} has an unclassified field: give it to every preset (OWNED_KEYS) or exclude it on purpose (NOT_OWNED)`,
      ).toStrictEqual([...OWNED_KEYS[g.name]].sort());
    }
  });
});

describe("completeness: no `undefined` can reach an editor setter", () => {
  it("pins the reference preset's owned key set per group", () => {
    for (const g of GROUPS) {
      expect(Object.keys(THEME_PRESETS[0][g.name]).sort()).toStrictEqual(
        [...OWNED_KEYS[g.name]].sort(),
      );
    }
  });

  for (const p of THEME_PRESETS) {
    it(`"${p.key}" fills every owned field with a defined value`, () => {
      for (const g of GROUPS) {
        const group = p[g.name] as Record<string, unknown>;
        expect(
          Object.keys(group).sort(),
          `preset "${p.key}".${g.name} key set drifted`,
        ).toStrictEqual([...OWNED_KEYS[g.name]].sort());
        // zod's `.default()` treats a present-but-`undefined` field as absent, so
        // schema validity alone would not catch this — but `applyPreset` would
        // push the `undefined` into live state and out to `dashboard.json`.
        for (const key of OWNED_KEYS[g.name]) {
          expect(
            group[key],
            `preset "${p.key}".${g.name}.${key} is undefined`,
          ).toBeDefined();
        }
      }
    });
  }
});

describe("scene cross-reference", () => {
  const sceneKeys = BACKGROUND_SCENES.map((s) => s.key);

  it("resolves every preset's paired scene to a real BACKGROUND_SCENES entry", () => {
    // An unresolvable key fails soft twice: applyPreset leaves the backdrop
    // untouched, and activePresetKey can never mark the chip selected.
    const unresolved = THEME_PRESETS.filter(
      (p) => !BACKGROUND_SCENES.some((s) => s.key === p.scene),
    ).map((p) => `${p.key} -> ${p.scene}`);
    expect(unresolved).toStrictEqual([]);
  });

  it("keeps scene keys and projectIds unique", () => {
    // `sceneBaseHue` finds by projectId and takes the first match, so a duplicate
    // id would silently shadow the later scene's authored hue.
    expect(
      duplicates(BACKGROUND_SCENES.map((s) => [s.key, s.key])),
    ).toStrictEqual([]);
    expect(
      duplicates(BACKGROUND_SCENES.map((s) => [s.key, s.projectId])),
    ).toStrictEqual([]);
    expect(sceneKeys.length).toBeGreaterThan(1);
  });

  it("gives every scene a kebab key, a projectId, a hue-rotate anchor, and a swatch", () => {
    for (const s of BACKGROUND_SCENES) {
      expect(s.key, `${s.key} must be a kebab-case id`).toMatch(KEBAB);
      expect(s.projectId.length, `${s.key} needs a projectId`).toBeGreaterThan(
        0,
      );
      expect(s.label.length, `${s.key} needs a label`).toBeGreaterThan(0);
      expect(
        s.description.length,
        `${s.key} needs a description`,
      ).toBeGreaterThan(0);
      // The runtime hue-rotates by (accentHue - baseHue), so a non-integer or
      // out-of-wheel anchor would spin every paired backdrop off its authored look.
      expect(
        Number.isInteger(s.baseHue),
        `${s.key}.baseHue must be an int`,
      ).toBe(true);
      expect(s.baseHue).toBeGreaterThanOrEqual(0);
      expect(s.baseHue).toBeLessThanOrEqual(360);
      expect(s.swatch.length, `${s.key} needs a rail swatch`).toBeGreaterThan(
        0,
      );
    }
  });
});

describe('the "zframes" preset resets every field a preset owns', () => {
  const zframes = THEME_PRESETS[0];

  it("deep-equals the schema defaults for every field it owns", () => {
    // Derived from the schemas rather than re-typed, so a *changed* default (the
    // accent moving off 242, a radius retune) fails here instead of shipping a
    // chip that resets the look to a value the schema no longer calls default.
    // It does NOT catch a *new* schema field — `pickOwned` narrows to the
    // OWNED_KEYS literal — that job belongs to the partition test above, which
    // fails until the new field is owned or listed in NOT_OWNED. "Full reset"
    // means full over the owned set only: NOT_OWNED fields (light mode, up/down
    // colours, text scale) survive a chip click by design.
    expect(zframes.theme).toStrictEqual(
      pickOwned(ThemeSchema.parse({}), OWNED_KEYS.theme),
    );
    expect(zframes.typography).toStrictEqual(
      pickOwned(TypographySchema.parse({}), OWNED_KEYS.typography),
    );
    expect(zframes.appearance).toStrictEqual(
      pickOwned(AppearanceSchema.parse({}), OWNED_KEYS.appearance),
    );
  });

  it("names the default backdrop, so applying it restores the signature scene", () => {
    const scene = BACKGROUND_SCENES.find((s) => s.key === zframes.scene);
    expect(scene?.key).toBe("aurora");
    expect(scene?.projectId).toBe(SCENE_DEFAULT_PROJECT_ID);
    expect(scene?.baseHue).toBe(SCENE_DEFAULT_HUE);
  });

  it("hue-rotates the default backdrop by 0° — accent, scene anchor, and fallback all agree", () => {
    expect(SCENE_DEFAULT_HUE).toBe(242);
    expect(SCENE_DEFAULT_PROJECT_ID).toBe("YrTzGatwjK7EoFpCSfgZ");
    expect(ThemeSchema.parse({}).accentHue).toBe(SCENE_DEFAULT_HUE);
    expect(zframes.theme.accentHue).toBe(SCENE_DEFAULT_HUE);
    expect(sceneBaseHue(SCENE_DEFAULT_PROJECT_ID)).toBe(SCENE_DEFAULT_HUE);
  });
});

describe("sceneBaseHue", () => {
  for (const s of BACKGROUND_SCENES) {
    it(`returns ${s.key}'s authored baseHue for its projectId`, () => {
      expect(sceneBaseHue(s.projectId)).toBe(s.baseHue);
    });
  }

  it("falls back to 242 for a custom projectId the registry does not know", () => {
    expect(sceneBaseHue("ZZnotAcuratedSceneId")).toBe(242);
    expect(sceneBaseHue("ZZnotAcuratedSceneId")).toBe(SCENE_DEFAULT_HUE);
  });

  it("falls back to 242 when there is no scene at all", () => {
    expect(sceneBaseHue(undefined)).toBe(242);
    expect(sceneBaseHue("")).toBe(242);
  });

  it("does not match a projectId by prefix or case", () => {
    // A `find` on strict equality: pinned because a looser lookup (startsWith /
    // lowercased) would hand the wrong anchor to the backdrop.
    expect(sceneBaseHue(SCENE_DEFAULT_PROJECT_ID.slice(0, 8))).toBe(
      SCENE_DEFAULT_HUE,
    );
    const other = BACKGROUND_SCENES.find(
      (s) => s.baseHue !== SCENE_DEFAULT_HUE,
    );
    expect(other).toBeDefined();
    expect(sceneBaseHue(other!.projectId.toLowerCase())).toBe(
      SCENE_DEFAULT_HUE,
    );
  });
});
