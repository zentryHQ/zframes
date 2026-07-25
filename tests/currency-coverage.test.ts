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
 * The escape hatch is the list below, and it is deliberately explicit: a frame
 * may keep the `$` helpers only if its figures are *not* convertible market
 * money. Adding a name here is a decision, not a formality — say why.
 */

/** Frames allowed to render hard-coded USD, with the reason each is exempt. */
const USD_ONLY: Record<string, string> = {
  // US-macro series: nobody quotes the US national debt or a Treasury yield in
  // baht, so converting them would produce a figure with no referent.
  "national-debt.tsx": "US-macro — Treasury debt is quoted in USD",
  "nyfed-reference-rate-bars.tsx": "US-macro — NY Fed official rates",
  "rates-board.tsx": "US-macro — official US rate board",
  "treasury-auction-size-bars.tsx": "US-macro — Treasury auction sizes",
  "treasury-debt-composition-area.tsx": "US-macro — Treasury debt split",
  // SEC filings report in USD as filed; restating a 10-K figure in another
  // currency would misrepresent the filing.
  "fundamentals.tsx": "SEC filing figures, as reported",
  "capital-structure-bars.tsx": "SEC filing figures, as reported",
  // The user types these numbers themselves. A value must read back exactly as
  // entered, so it is not converted.
  "breakeven.tsx": "user-entered position maths",
  "returns-projector.tsx": "user-entered projection inputs",
  "risk-reward.tsx": "user-entered trade levels",
  "journal-log.tsx": "user-entered journal amounts",
  "journal-ui.tsx": "user-entered journal amounts",
  // Shared primitives, not frames: MoverRow takes an injectable `formatValue`
  // (callers pass `money.price`), and its USD default is the fallback for a
  // caller that has no currency context. TreemapLeaf only mentions the helper
  // in a doc comment.
  "mover-row.tsx": "primitive — USD default for an injectable formatter",
  "treemap-leaf.tsx": "primitive — doc-comment mention only",
};

const USD_HELPERS = /\b(formatPrice|formatCompactUsd)\s*\(/;
const USD_HELPER_REF = /\b(formatPrice|formatCompactUsd)\b/;

const srcDir = fileURLToPath(
  new URL("../packages/frames/src", import.meta.url),
);

function frameFiles(): string[] {
  return readdirSync(srcDir)
    .filter((f: string) => f.endsWith(".tsx") && !f.includes(".test."))
    .sort();
}

describe("display-currency coverage", () => {
  it("no frame outside the USD_ONLY list renders hard-coded USD", () => {
    const offenders: string[] = [];
    for (const file of frameFiles()) {
      if (file in USD_ONLY) continue;
      const source = readFileSync(join(srcDir, file), "utf8");
      if (USD_HELPER_REF.test(source)) offenders.push(file);
    }
    expect(
      offenders,
      `These frames still hard-code USD. Route market money through useMoney() ` +
        `(money.price / money.compact), or add the file to USD_ONLY with a reason:\n` +
        offenders.map((f) => `  - ${f}`).join("\n"),
    ).toEqual([]);
  });

  it("every USD_ONLY entry is a real file that still uses a USD helper", () => {
    // Keeps the exemption list honest: a frame that was migrated, renamed, or
    // deleted must not linger here implying a carve-out that no longer exists.
    const present = new Set(frameFiles());
    const stale: string[] = [];
    for (const [file, reason] of Object.entries(USD_ONLY)) {
      expect(reason.length, `${file} needs a reason`).toBeGreaterThan(0);
      if (!present.has(file)) {
        stale.push(`${file} (no such frame)`);
        continue;
      }
      const source = readFileSync(join(srcDir, file), "utf8");
      if (!USD_HELPER_REF.test(source))
        stale.push(`${file} (no longer uses one)`);
    }
    expect(stale, `stale USD_ONLY entries:\n${stale.join("\n")}`).toEqual([]);
  });

  it("the USD helpers themselves still exist and stay USD", async () => {
    // The guard above is a text search, so it would silently pass if these were
    // renamed away. Pin the contract they encode.
    const { formatPrice, formatCompactUsd } =
      await import("../packages/frames/src/format");
    expect(formatPrice(20.66)).toBe("$20.66");
    expect(formatCompactUsd(21_914_574)).toBe("$21.91M");
    expect(USD_HELPERS.test("formatPrice(1)")).toBe(true);
  });
});
