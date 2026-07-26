import { describe, expect, it } from "vitest";
import {
  AppearanceSchema,
  BackgroundSchema,
  CurrencySchema,
  DashboardSpecSchema,
  ThemeSchema,
  TypographySchema,
} from "./spec";

/**
 * What this file pins, and why it matters
 * ---------------------------------------
 * `DashboardSpecSchema` gives every cosmetic group a *group-level* `.default({…})`
 * literal that restates ~32 field-level defaults a second time. zod 4
 * short-circuits `$ZodDefault`: when the key is absent it assigns the literal and
 * returns immediately, WITHOUT running the inner object schema ("There's no
 * reason to pass the default value through validation … the validity of the
 * default is enforced by TypeScript statically" — zod/v4/core/schemas). But the
 * literal is typed as the schema's *input*, where every defaulted field is
 * optional, so a field-level default added to `ThemeSchema` / `AppearanceSchema` /
 * … and forgotten in the group literal typechecks fine and then arrives
 * `undefined` at runtime for every dashboard that omits the group — TypeScript
 * still calls it `number`, and the renderer emits `--zf-accent-sat: undefined`.
 * (`theme.surface` was exactly this shape of addition, for light mode.)
 *
 * The invariant of the whole cosmetic layer is "every default is a visual no-op",
 * i.e. `theme: {}` must render identically to an omitted `theme`. These tests
 * compare the two parse paths group by group, and pin the literal values
 * themselves, so that drift fails the build instead of a card.
 *
 * It also covers the second `z.preprocess` branch (legacy `background.type:
 * "gradient"` with no colours → `"none"`), which exists purely to keep
 * pre-`gradientFrom` dashboards pixel-identical and had no test at all.
 */

// `title` + `frames` are the only required fields; everything else defaults.
const base = { title: "t", frames: [] };

const COSMETIC_GROUPS = [
  "grid",
  "background",
  "theme",
  "currency",
  "typography",
  "appearance",
] as const;

describe("cosmetic-group defaults: `{}` must resolve like an omitted group", () => {
  // The drift guard. `grid` has no exported sub-schema (it is inline in the
  // spec object), so this two-parse comparison is the only way to express it
  // uniformly — and it is the assertion the group-literal duplication breaks.
  for (const group of COSMETIC_GROUPS) {
    it(`\`${group}: {}\` deep-equals an omitted \`${group}\``, () => {
      const omitted = DashboardSpecSchema.parse(base);
      const empty = DashboardSpecSchema.parse({ ...base, [group]: {} });
      expect(empty[group]).toStrictEqual(omitted[group]);
    });
  }

  it("hands out a fresh group object per parse, so a mutating caller (the editor edits the spec in place) cannot poison later parses", () => {
    const first = DashboardSpecSchema.parse(base);
    const second = DashboardSpecSchema.parse(base);
    expect(first.theme).not.toBe(second.theme);
    first.theme.accentHue = 7;
    expect(DashboardSpecSchema.parse(base).theme.accentHue).toBe(242);
  });
});

describe("cosmetic-group defaults match their exported sub-schema", () => {
  it("theme", () => {
    expect(DashboardSpecSchema.parse(base).theme).toStrictEqual(
      ThemeSchema.parse({}),
    );
  });

  it("currency", () => {
    expect(DashboardSpecSchema.parse(base).currency).toStrictEqual(
      CurrencySchema.parse({}),
    );
  });

  it("typography", () => {
    expect(DashboardSpecSchema.parse(base).typography).toStrictEqual(
      TypographySchema.parse({}),
    );
  });

  it("appearance", () => {
    expect(DashboardSpecSchema.parse(base).appearance).toStrictEqual(
      AppearanceSchema.parse({}),
    );
  });

  it("background", () => {
    expect(DashboardSpecSchema.parse(base).background).toStrictEqual(
      BackgroundSchema.parse({}),
    );
  });
});

describe("the resolved default values themselves", () => {
  it("resolves `grid` to the documented geometry", () => {
    expect(DashboardSpecSchema.parse(base).grid).toStrictEqual({
      mode: "flow-vertical",
      columns: 12,
      rowHeight: 96,
      rows: 6,
      gap: 12,
      paddingX: 0,
    });
  });

  it("resolves `theme` to the zframes indigo + semantic green/red on a dark surface", () => {
    expect(DashboardSpecSchema.parse(base).theme).toStrictEqual({
      accentHue: 242,
      accentSat: 90,
      baseHue: 233,
      baseSat: 20,
      upColor: "#3fd08f",
      downColor: "#ff6b81",
      surface: "dark",
    });
  });

  it("resolves `appearance` to the original card look", () => {
    expect(DashboardSpecSchema.parse(base).appearance).toStrictEqual({
      radius: 18,
      borderStrength: 0.22,
      surfaceOpacity: 1,
      density: 1,
      elevation: 1,
    });
  });

  it("resolves `typography` to unscaled proportional DM Sans", () => {
    expect(DashboardSpecSchema.parse(base).typography).toStrictEqual({
      fontFamily: "sans",
      numericStyle: "proportional",
      scale: 1,
    });
  });

  it("resolves `currency` to USD", () => {
    expect(DashboardSpecSchema.parse(base).currency).toStrictEqual({
      code: "USD",
    });
  });

  it("resolves `background` to the signature glow with every knob defaulted", () => {
    expect(DashboardSpecSchema.parse(base).background).toStrictEqual({
      type: "none",
      color: "#0a0a12",
      gradientFrom: "#1b1e4d",
      gradientTo: "#07070c",
      gradientAngle: 160,
      scale: 1,
      dpi: 1.5,
      opacity: 0.16,
      imageFit: "cover",
      imageBlur: 0,
      overlayOpacity: 0.55,
    });
  });

  it("gives every defaulted numeric knob a finite number, never undefined", () => {
    // `toStrictEqual` above already compares values, but a missing group-literal
    // field is specifically an `undefined` that TypeScript still types `number`
    // and the renderer interpolates straight into a `--zf-*` var, so assert the
    // numeric-ness of each one explicitly.
    const r = DashboardSpecSchema.parse(base);
    const numbers: Array<[string, unknown]> = [
      ["grid.columns", r.grid.columns],
      ["grid.rowHeight", r.grid.rowHeight],
      ["grid.rows", r.grid.rows],
      ["grid.gap", r.grid.gap],
      ["grid.paddingX", r.grid.paddingX],
      ["theme.accentHue", r.theme.accentHue],
      ["theme.accentSat", r.theme.accentSat],
      ["theme.baseHue", r.theme.baseHue],
      ["theme.baseSat", r.theme.baseSat],
      ["appearance.radius", r.appearance.radius],
      ["appearance.borderStrength", r.appearance.borderStrength],
      ["appearance.surfaceOpacity", r.appearance.surfaceOpacity],
      ["appearance.density", r.appearance.density],
      ["appearance.elevation", r.appearance.elevation],
      ["typography.scale", r.typography.scale],
      ["background.gradientAngle", r.background.gradientAngle],
      ["background.scale", r.background.scale],
      ["background.dpi", r.background.dpi],
      ["background.opacity", r.background.opacity],
      ["background.imageBlur", r.background.imageBlur],
      ["background.overlayOpacity", r.background.overlayOpacity],
    ];
    for (const [path, value] of numbers) {
      expect(Number.isFinite(value), `${path} must be a finite number`).toBe(
        true,
      );
    }
  });
});

describe("legacy-background migration (the second z.preprocess branch)", () => {
  it("maps a colourless legacy `gradient` to `none` — the signature glow", () => {
    const r = DashboardSpecSchema.parse({
      ...base,
      background: { type: "gradient" },
    });
    expect(r.background.type).toBe("none");
    // The rewrite only touches `type`; the gradient colours fall back to their
    // own defaults, so re-saving such a spec cannot invent a custom gradient.
    expect(r.background.gradientFrom).toBe("#1b1e4d");
    expect(r.background.gradientTo).toBe("#07070c");
  });

  it("keeps the other keys of a migrated legacy gradient", () => {
    const r = DashboardSpecSchema.parse({
      ...base,
      background: { type: "gradient", opacity: 0.42, dpi: 2 },
    });
    expect(r.background).toMatchObject({
      type: "none",
      opacity: 0.42,
      dpi: 2,
    });
  });

  it("leaves a modern custom gradient (one that carries gradientFrom) alone", () => {
    const r = DashboardSpecSchema.parse({
      ...base,
      background: {
        type: "gradient",
        gradientFrom: "#ff0000",
        gradientTo: "#0000ff",
        gradientAngle: 45,
      },
    });
    expect(r.background).toMatchObject({
      type: "gradient",
      gradientFrom: "#ff0000",
      gradientTo: "#0000ff",
      gradientAngle: 45,
    });
  });

  it("treats a present-but-undefined gradientFrom as modern (the branch tests key presence, not value — JSON can never express this)", () => {
    const r = DashboardSpecSchema.parse({
      ...base,
      background: { type: "gradient", gradientFrom: undefined },
    });
    expect(r.background.type).toBe("gradient");
    expect(r.background.gradientFrom).toBe("#1b1e4d");
  });

  it.each([
    ["unicorn", { type: "unicorn", projectId: "abc123" }],
    ["image", { type: "image", imageUrl: "/hero.png", imageBlur: 8 }],
    ["color", { type: "color", color: "#123456" }],
    ["none", { type: "none" }],
  ] as const)("passes a `%s` background through untouched", (_name, bg) => {
    const r = DashboardSpecSchema.parse({ ...base, background: bg });
    expect(r.background).toMatchObject(bg);
  });

  it("applies both preprocess branches to one legacy spec", () => {
    const r = DashboardSpecSchema.parse({
      ...base,
      grid: { columns: 8, radius: 4 },
      background: { type: "gradient" },
    });
    expect(r.appearance.radius).toBe(4);
    expect(r.grid.columns).toBe(8);
    expect("radius" in r.grid).toBe(false);
    expect(r.background.type).toBe("none");
  });

  it("does not mutate the caller's raw object while migrating it", () => {
    const raw = {
      ...base,
      grid: { radius: 4 },
      background: { type: "gradient" },
    };
    DashboardSpecSchema.parse(raw);
    expect(raw.grid).toStrictEqual({ radius: 4 });
    expect(raw.background).toStrictEqual({ type: "gradient" });
    expect("appearance" in raw).toBe(false);
  });

  it("rejects a non-object spec instead of throwing inside the migration", () => {
    expect(DashboardSpecSchema.safeParse(null).success).toBe(false);
    expect(DashboardSpecSchema.safeParse("nope").success).toBe(false);
    expect(DashboardSpecSchema.safeParse([]).success).toBe(false);
  });
});
