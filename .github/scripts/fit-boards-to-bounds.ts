/**
 * Resizes cards that sit outside their frame's size envelope, on every board we
 * ship, and repairs the layout around them.
 *
 * A card below its frame's floor is a card rendering clipped content today. The
 * renderer ignores `layout`, so nothing complains — which is exactly why these
 * survived: the only way to find them was to measure every frame at every span
 * (`frame-size-probe.ts`) and then check the boards against the result.
 *
 *   pnpm tsx .github/scripts/fit-boards-to-bounds.ts            # report only
 *   FIT_WRITE=1 pnpm tsx .github/scripts/fit-boards-to-bounds.ts
 *   FIT_BOARDS=/path/to/dashboard.json FIT_WRITE=1 …            # extra boards
 *
 * Growing a card would overlap its neighbours, so afterwards every card is
 * re-settled by pushing DOWN — never sideways, never reordering. A board grows
 * downward without limit but is fixed at 12 columns, so down is the only
 * direction that is always available, and preserving reading order matters more
 * than preserving exact row numbers.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

interface Pos {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Item {
  id: string;
  frame: string;
  position: Pos;
}
interface Board {
  grid?: { columns?: number };
  frames?: Item[];
}

const META_IN = process.env.META_IN ?? "frame-meta.json";
const WRITE = !!process.env.FIT_WRITE;
/** Also pull cards back under a frame's ceiling — see the asymmetry note below. */
const SHRINK = !!process.env.FIT_SHRINK;

const metas = JSON.parse(readFileSync(META_IN, "utf8")) as Record<
  string,
  {
    layout: {
      w: number;
      h: number;
      minW?: number;
      minH?: number;
      maxW?: number;
      maxH?: number;
    } | null;
  }
>;

const overlaps = (a: Pos, b: Pos) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Push every card down until nothing overlaps, in reading order. Deliberately
 * NOT a compactor: it only ever increases `y`, so a card never jumps above
 * something it used to sit below, and a board that was already clean is left
 * byte-identical.
 */
function settle(items: Item[]): number {
  const order = [...items].sort(
    (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
  );
  let moved = 0;
  const placed: Item[] = [];
  for (const item of order) {
    const before = item.position.y;
    for (;;) {
      const hit = placed.find((p) => overlaps(p.position, item.position));
      if (!hit) break;
      item.position.y = hit.position.y + hit.position.h;
    }
    if (item.position.y !== before) moved++;
    placed.push(item);
  }
  return moved;
}

interface Change {
  board: string;
  id: string;
  frame: string;
  from: string;
  to: string;
  why: string;
}

function fit(name: string, board: Board): Change[] {
  const columns = board.grid?.columns ?? 12;
  const changes: Change[] = [];
  for (const item of board.frames ?? []) {
    const l = metas[item.frame]?.layout;
    if (!l) continue;
    const p = item.position;
    const from = `${p.w}x${p.h}@${p.x},${p.y}`;
    const why: string[] = [];

    let w = p.w;
    let h = p.h;
    if (l.minW != null && w < l.minW) {
      w = l.minW;
      why.push(`w<${l.minW}`);
    }
    if (l.minH != null && h < l.minH) {
      h = l.minH;
      why.push(`h<${l.minH}`);
    }
    // Ceilings do NOT shrink a card by default, and the asymmetry is the point.
    // A card below its floor is broken — it is clipping content right now, and
    // growing it is a repair. A card above its ceiling merely looks sparse, and
    // a board that ships it that size is a better judgement about that card than
    // a threshold is. Shrinking here would impose taste on someone's board to
    // satisfy a number this same audit invented.
    if (SHRINK && l.maxW != null && w > l.maxW) {
      w = l.maxW;
      why.push(`w>${l.maxW}`);
    }
    if (SHRINK && l.maxH != null && h > l.maxH) {
      h = l.maxH;
      why.push(`h>${l.maxH}`);
    }
    if (!why.length) continue;

    // A widened card can run off the right edge. Slide it left rather than
    // shrink it back — the floor is the whole point, so the board yields.
    let x = p.x;
    if (x + w > columns) x = Math.max(0, columns - w);

    p.x = x;
    p.w = w;
    p.h = h;
    changes.push({
      board: name,
      id: item.id,
      frame: item.frame,
      from,
      to: `${w}x${h}@${x},${p.y}`,
      why: why.join(" "),
    });
  }
  if (changes.length) {
    const moved = settle(board.frames ?? []);
    if (moved)
      console.log(`  ${name}: ${moved} card(s) pushed down to make room`);
  }
  return changes;
}

/** Board files, each with the shape it stores its spec in. */
const TARGETS: { file: string; kind: "seed" | "spec" }[] = [
  { file: "apps/explorer/scripts/curated-seed.json", kind: "seed" },
  { file: "tests/fixtures/bitkub.dashboard.json", kind: "spec" },
  { file: "tests/fixtures/crypto-command.dashboard.json", kind: "spec" },
  { file: "tests/fixtures/macro-watch.dashboard.json", kind: "spec" },
  { file: "tests/fixtures/micky.dashboard.json", kind: "spec" },
  { file: "tests/fixtures/nvda-deepdive.dashboard.json", kind: "spec" },
  { file: "tests/fixtures/quant-terminal.dashboard.json", kind: "spec" },
  ...(process.env.FIT_BOARDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((file) => ({ file, kind: "spec" as const })),
];

const all: Change[] = [];
for (const { file, kind } of TARGETS) {
  if (!existsSync(file)) {
    console.log(`(skipped, not present: ${file})`);
    continue;
  }
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const before = all.length;
  if (kind === "seed") {
    for (const row of raw as { id?: string; spec?: Board }[])
      if (row.spec) all.push(...fit(`curated/${row.id}`, row.spec));
  } else {
    all.push(...fit(file.split("/").pop() ?? file, raw as Board));
  }
  // Only rewrite a file THIS board changed. Keyed on the run-wide total it
  // rewrote every later board too — same data, re-serialised — which turns a
  // two-card fix into a diff across every fixture in the repo.
  if (WRITE && all.length > before)
    writeFileSync(file, `${JSON.stringify(raw, null, 2)}\n`);
}

console.log(`\n${all.length} card(s) resized`);
for (const c of all)
  console.log(
    `  ${c.board.padEnd(26)} ${c.frame.padEnd(24)} ${c.from} -> ${c.to}   (${c.why})`,
  );
if (!WRITE) console.log("\n(dry run — set FIT_WRITE=1 to write)");
