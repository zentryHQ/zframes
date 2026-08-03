import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guards the display-currency contract.
 *
 * A dashboard can be denominated in any of the currencies `CurrencySchema`
 * offers, and market money must follow it: frames render USD values through
 * `useMoney()` (`money.price` / `money.compact`), never through the hard-coded
 * `$` helpers `formatPrice` / `formatCompactUsd`. Migrating the frame layer was
 * a 59-file sweep, so without a guard the next new frame quietly reintroduces a
 * dollar sign that no currency setting can move.
 *
 * The escape hatch is `usdOnly: true` on a frame's meta — the ONE declaration of
 * the carve-out, and deliberately not a list in this file. It used to be exactly
 * that: a `USD_ONLY` map only a test could read, which meant the shipped code
 * had no idea which frames ignore the display currency, and the editor offered
 * every card a "Display currency" control that a dozen frames silently ignore.
 * The flag is now shipped metadata (the editor disables the control and says
 * why, the AI catalogue surfaces it), and this file *derives* its exemptions
 * from it — so the two can't drift, in either direction.
 *
 * Setting the flag is a decision, not a formality: only figures that are not
 * convertible market money qualify (US-macro series, SEC figures as filed,
 * numbers the user typed). Each flag in `schemas.ts` carries its reason.
 */

/**
 * Non-frame files allowed to hold the USD helpers, with the reason each is
 * exempt. Frames are exempted by their meta's `usdOnly`, never here.
 */
const NON_FRAME_USD_OK: Record<string, string> = {
  // format.ts IS the USD helpers, and metals-shared keeps them for a GBP/EUR
  // LBMA fix — a published non-USD number the display layer must not convert.
  // (Its USD path goes through `money`.)
  "format.ts": "defines the USD helpers",
  "metals-shared.ts": "GBP/EUR LBMA fixes are shown as published",
};

const USD_HELPER_REF = /\b(formatPrice|formatCompactUsd)\b/;

/**
 * Comments are stripped before the search: several frames legitimately *name*
 * these helpers in a doc comment to explain why they don't use them, and a bare
 * word-search would flag that as an offence (it flagged `gold-silver-ratio`,
 * whose only mention is a comment saying its ratio is neither a price nor a
 * rate). Crude but sufficient — no frame stores code in a string literal that
 * would be mistaken for a call.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const srcDir = fileURLToPath(
  new URL("../packages/frames/src", import.meta.url),
);

/**
 * Frame sources AND their plain-TS helpers. Scanning only .tsx once let a
 * hard-coded USD formatter hide in metals-shared.ts, where it string-replaced
 * the "$" of `formatPrice` — invisible to a .tsx-only sweep.
 */
function frameFiles(): string[] {
  return readdirSync(srcDir)
    .filter(
      (f: string) =>
        (f.endsWith(".tsx") || f.endsWith(".ts")) && !f.includes(".test."),
    )
    .sort();
}

function sourceOf(file: string): string {
  return readFileSync(join(srcDir, file), "utf8");
}

/** Does this file render money through the hard-coded USD helpers? */
function rendersHardCodedUsd(file: string): boolean {
  return USD_HELPER_REF.test(stripComments(sourceOf(file)));
}

/** The frames whose meta declares them USD-only, as `<name>.tsx` file names. */
async function usdOnlyFiles(): Promise<Set<string>> {
  const { allFrameMetas } = await import("../packages/frames/src/schemas");
  return new Set(
    allFrameMetas.filter((m) => m.usdOnly).map((m) => `${m.name}.tsx`),
  );
}

describe("display-currency coverage", () => {
  it("a frame that renders hard-coded USD declares `usdOnly` on its meta", async () => {
    const exempt = await usdOnlyFiles();
    const offenders: string[] = [];
    for (const file of frameFiles()) {
      if (file in NON_FRAME_USD_OK || exempt.has(file)) continue;
      if (rendersHardCodedUsd(file)) offenders.push(file);
    }
    expect(
      offenders,
      `These frames hard-code USD without declaring it. Route market money ` +
        `through useMoney() (money.price / money.compact), or — if the figures ` +
        `genuinely aren't convertible market money — set \`usdOnly: true\` on ` +
        `the frame's meta in schemas.ts with a reason:\n` +
        offenders.map((f) => `  - ${f}`).join("\n"),
    ).toEqual([]);
  });

  it("every `usdOnly` frame really does render hard-coded USD", async () => {
    // The other direction: a flag on a frame that converts would disable the
    // editor's currency control on a card the control would have worked on.
    const files = new Set(frameFiles());
    const stale: string[] = [];
    for (const file of await usdOnlyFiles()) {
      if (!files.has(file)) {
        stale.push(`${file} (no such frame source)`);
        continue;
      }
      if (!rendersHardCodedUsd(file)) stale.push(`${file} (converts already)`);
    }
    expect(
      stale,
      `these metas claim \`usdOnly\` but the frame renders no hard-coded USD, ` +
        `so the editor greys out a control that would have worked:\n${stale.join("\n")}`,
    ).toEqual([]);
  });

  it("covers the three documented carve-out families", async () => {
    // A floor on the flag itself: if a refactor drops most of these, the
    // carve-out has silently stopped being declared anywhere.
    const exempt = await usdOnlyFiles();
    for (const name of [
      "national-debt.tsx", // US-macro
      "fundamentals.tsx", // SEC as filed
      "breakeven.tsx", // user-typed
    ])
      expect(exempt.has(name), `${name} should be usdOnly`).toBe(true);
    expect(exempt.size).toBeGreaterThanOrEqual(10);
    // The journal frames were once listed here as "user-typed" and then as a
    // pending leak; both were wrong. Their figures are provider quotes (the
    // picker's live mid; `entry`/`target` derived from the mid at log time), so
    // they convert and must NOT be flagged — a flag would grey out a control
    // that works.
    for (const name of ["journal-log.tsx", "journal-ui.tsx"])
      expect(exempt.has(name), `${name} converts, so it is not usdOnly`).toBe(
        false,
      );
  });

  it("every NON_FRAME_USD_OK entry is a real file that still uses a USD helper", () => {
    // Keeps the exemption list honest: a helper that was migrated, renamed, or
    // deleted must not linger here implying a carve-out that no longer exists.
    const present = new Set(frameFiles());
    const stale: string[] = [];
    for (const [file, reason] of Object.entries(NON_FRAME_USD_OK)) {
      expect(reason.length, `${file} needs a reason`).toBeGreaterThan(0);
      if (!present.has(file)) {
        stale.push(`${file} (no such file)`);
        continue;
      }
      if (!USD_HELPER_REF.test(sourceOf(file)))
        stale.push(`${file} (no longer uses one)`);
    }
    expect(
      stale,
      `stale NON_FRAME_USD_OK entries:\n${stale.join("\n")}`,
    ).toEqual([]);
  });

  it("no shared primitive renders money through an omittable USD default", () => {
    // The bug this rule exists for: `MoverRow` took an optional `formatValue`
    // defaulting to `formatPrice`, and two of its three consumers never passed
    // one — so two cards quoted dollars on a baht board and NO grep could see
    // it, because the `$` was in the primitive's default rather than in the
    // frame. A primitive that renders money must resolve the currency itself
    // (`useMoney()`), leaving nothing to omit. Pinned on the primitive that
    // taught us, so a "harmless" reintroduction of the prop fails here.
    const source = sourceOf("mover-row.tsx");
    expect(source).toMatch(/useMoney\(\)/);
    expect(stripComments(source)).not.toMatch(USD_HELPER_REF);
    expect(stripComments(source)).not.toMatch(/formatValue\?:/);
  });

  it("the USD helpers themselves still exist and stay USD", async () => {
    // The guard above is a text search, so it would silently pass if these were
    // renamed away. Pin the contract they encode.
    const { formatPrice, formatCompactUsd } =
      await import("../packages/frames/src/format");
    expect(formatPrice(20.66)).toBe("$20.66");
    expect(formatCompactUsd(21_914_574)).toBe("$21.91M");
    expect(USD_HELPER_REF.test("formatPrice(1)")).toBe(true);
  });
});
