/**
 * Merges reviewed corrections into the derived size bounds.
 *
 * The derivation (`derive-frame-bounds.ts`) answers what can be measured; a
 * review of the contact sheets answers what cannot. This folds the second over
 * the first and re-imposes the invariants, so a reviewed value that would make
 * an envelope incoherent (a floor above the default, a ceiling below it) is
 * repaired here rather than shipped.
 *
 *   REVIEW_IN=reviewed.json pnpm tsx .github/scripts/merge-frame-bounds.ts
 *
 * reviewed.json: { adjustments: [{ frame, minW, minH, maxW, maxH, reason }] }
 * Writes frame-size-bounds.merged.json in the same shape the applier reads.
 */
import { readFileSync, writeFileSync } from "node:fs";

const BOUNDS_IN = process.env.BOUNDS_IN ?? "frame-size-bounds.json";
const REVIEW_IN = process.env.REVIEW_IN ?? "frame-bounds-review.json";
const OUT = process.env.MERGED_OUT ?? "frame-size-bounds.merged.json";

interface Derived {
  w: number;
  h: number;
  minW: number;
  minH: number;
  maxW: number | null;
  maxH: number | null;
}
interface Row {
  frame: string;
  current: { w: number; h: number };
  derived: Derived;
  flags: string[];
}

const bounds = JSON.parse(readFileSync(BOUNDS_IN, "utf8")) as { rows: Row[] };
const review = JSON.parse(readFileSync(REVIEW_IN, "utf8")) as {
  adjustments: (Partial<Derived> & { frame: string; reason?: string })[];
};

const byFrame = new Map(bounds.rows.map((r) => [r.frame, r]));
const applied: string[] = [];
const unknown: string[] = [];

for (const adj of review.adjustments ?? []) {
  const row = byFrame.get(adj.frame);
  if (!row) {
    unknown.push(adj.frame);
    continue;
  }
  const before = { ...row.derived };
  const d = row.derived;
  if (adj.minW != null) d.minW = adj.minW;
  if (adj.minH != null) d.minH = adj.minH;
  if (adj.maxW !== undefined) d.maxW = adj.maxW;
  if (adj.maxH !== undefined) d.maxH = adj.maxH;

  // The default span is not the reviewer's to set — it stays whatever the frame
  // declared, pulled into the new envelope only if it now falls outside it. A
  // reviewer raising a floor should not silently re-size every board that adds
  // the frame fresh.
  d.w = Math.max(row.current.w, d.minW);
  d.h = Math.max(row.current.h, d.minH);
  if (d.maxW != null) {
    d.maxW = Math.max(d.maxW, d.minW);
    d.w = Math.min(d.w, d.maxW);
  }
  if (d.maxH != null) {
    d.maxH = Math.max(d.maxH, d.minH);
    d.h = Math.min(d.h, d.maxH);
  }
  row.flags.push(`reviewed:${adj.reason ?? "no reason given"}`);
  applied.push(
    `${adj.frame}  ${JSON.stringify(before)} -> ${JSON.stringify(d)}`,
  );
}

writeFileSync(OUT, JSON.stringify(bounds, null, 0));
console.log(`${applied.length} reviewed adjustments merged`);
for (const line of applied) console.log(`  ${line}`);
if (unknown.length)
  console.log(`\nUNKNOWN frames ignored: ${unknown.join(", ")}`);
console.log(`\nmerged → ${OUT}`);
