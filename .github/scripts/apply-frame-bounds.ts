/**
 * Writes settled size bounds back into `packages/frames/src/schemas.ts`.
 *
 * Textual, not a codemod: every frame's `layout` is one line inside a
 * `defineFrameMeta({ ... })` call, and the file is the hand-maintained source of
 * truth for 284 frames' metadata — rewriting it through an AST printer would
 * reflow comments and describe() strings that have nothing to do with sizing.
 * So each `layout:` line is replaced in place and everything else is left byte
 * for byte.
 *
 *   pnpm tsx .github/scripts/apply-frame-bounds.ts            # from frame-size-bounds.json
 *   BOUNDS_IN=settled.json pnpm tsx .github/scripts/apply-frame-bounds.ts
 *   APPLY_DRY=1 …                                            # report, write nothing
 *
 * The input is `{ rows: [{ frame, derived: {w,h,minW,minH,maxW,maxH} }] }` — the
 * derivation's output, or the reviewed version of it. A frame absent from the
 * input keeps whatever it declares today.
 */
import { readFileSync, writeFileSync } from "node:fs";

const SCHEMAS = "packages/frames/src/schemas.ts";
const IN = process.env.BOUNDS_IN ?? "frame-size-bounds.json";
const DRY = !!process.env.APPLY_DRY;

interface Derived {
  w: number;
  h: number;
  minW: number;
  minH: number;
  maxW: number | null;
  maxH: number | null;
}

const bounds = new Map<string, Derived>();
const input = JSON.parse(readFileSync(IN, "utf8")) as {
  rows: { frame: string; derived: Derived }[];
};
for (const row of input.rows) bounds.set(row.frame, row.derived);

function render(d: Derived): string {
  const parts = [
    `w: ${d.w}`,
    `h: ${d.h}`,
    `minW: ${d.minW}`,
    `minH: ${d.minH}`,
  ];
  // `null` means "no ceiling" — the field is omitted rather than written as 12,
  // because a frame that scales is not the same as a frame capped at the width
  // of today's default board.
  if (d.maxW != null) parts.push(`maxW: ${d.maxW}`);
  if (d.maxH != null) parts.push(`maxH: ${d.maxH}`);
  return `layout: { ${parts.join(", ")} },`;
}

const src = readFileSync(SCHEMAS, "utf8");
const lines = src.split("\n");
let currentName: string | null = null;
let applied = 0;
const changes: string[] = [];
const missed: string[] = [];

for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  const nameMatch = /^\s*name:\s*"([^"]+)",/.exec(line);
  if (nameMatch) currentName = nameMatch[1];
  const layoutMatch = /^(\s*)layout:\s*\{[^}]*\},\s*$/.exec(line);
  if (!layoutMatch) continue;
  if (!currentName) {
    missed.push(`line ${i + 1}: layout with no preceding name`);
    continue;
  }
  const d = bounds.get(currentName);
  if (!d) {
    missed.push(`${currentName}: no bound in ${IN}`);
    continue;
  }
  const next = `${layoutMatch[1]}${render(d)}`;
  if (next !== line) {
    changes.push(`${currentName}\n    - ${line.trim()}\n    + ${next.trim()}`);
    lines[i] = next;
  }
  applied++;
}

if (missed.length) {
  console.error(`REFUSING: ${missed.length} layout line(s) unresolved`);
  for (const m of missed) console.error(`  ! ${m}`);
  process.exit(1);
}

console.log(`${applied} layout lines matched, ${changes.length} changed`);
for (const c of changes) console.log(`  ${c}`);
if (DRY) {
  console.log("\n(dry run — nothing written)");
} else {
  writeFileSync(SCHEMAS, lines.join("\n"));
  console.log(`\nwrote ${SCHEMAS}`);
}
