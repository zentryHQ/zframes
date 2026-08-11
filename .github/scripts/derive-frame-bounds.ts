/**
 * Turns the raw size-probe matrix into a recommended `layout` envelope per frame.
 *
 * Inputs
 *   frame-size-probe.json   — .github/scripts/frame-size-probe.ts
 *   frame-meta.json         — .github/scripts/dump-frame-meta.mts
 *   the curated seed + golden fixtures, for the sizes boards ALREADY use
 *
 * Output
 *   frame-size-bounds.json  — { frame: { current, derived, evidence, flags } }
 *
 * `layout` can only express a BOX — every width in [minW, maxW] paired with
 * every height in [minH, maxH] — so the derivation solves for the box rather
 * than for a floor with a ceiling bolted on afterwards. The best box is the one
 * allowing the most spans while every span inside it measures clean: nothing
 * clipped, no labels truncated past the frame's own baseline, no chart squeezed
 * below legibility, no list down to one row, nothing the frame quietly stopped
 * rendering. Solving both ends together is what lets an ASPECT-COUPLED frame be
 * described at all — one that only breaks when wide AND short needs a width
 * ceiling, and reading that as a floor would claim it needs seven rows.
 *
 * A second, softer ceiling sits on top, because nothing BREAKS when a card
 * grows — the failure is aesthetic. Its proxy is "ink", the union box of
 * everything that actually paints: a card whose ink stops covering half its box
 * has become a number floating in a void. The tighter of the two ceilings wins.
 *
 * Frames whose ink keeps up all the way to the board edge get NO ceiling at all,
 * deliberately: an unbounded frame is honest about scaling, and a fabricated
 * `maxW: 12` would cap it wrongly on a wider board.
 *
 * Shipped boards are consulted last, and are not allowed to overrule the
 * measurement — a board placing a card at a span that measures faulty is a board
 * with a clipped card on it, and relaxing the bound would bury exactly the
 * defect this was built to find.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";

interface Cell {
  w: number;
  h: number;
  err: boolean;
  clipY: number;
  clipX: number;
  ell: number;
  chartW: number;
  chartH: number;
  rows: number;
  inkW: number;
  inkH: number;
  inkN: number;
  boxW: number;
  boxH: number;
}
interface FrameProbe {
  frame: string;
  failed?: string;
  cells: Cell[];
}
interface FrameMeta {
  label: string;
  category: string;
  chrome: string;
  container: boolean;
  capabilities: string[];
  description: string;
  layout: {
    w: number;
    h: number;
    minW?: number;
    minH?: number;
    maxW?: number;
    maxH?: number;
  } | null;
}

/**
 * How much overflow matters depends on the card, not on a pixel count. Eight
 * pixels cut from a 35px-tall body is a shaved digit — the clock at one row
 * high, plainly broken to look at. Nine pixels cut from a 470px body is a
 * hairline nobody will ever see. A single absolute tolerance gets one of those
 * two wrong whichever value it takes, so the threshold scales with the card and
 * is then clamped: never below a few px of rounding noise, and never above one
 * line of text — past that, content is genuinely missing however big the card.
 */
const CLIP_MIN_PX = 3;
const CLIP_MAX_PX = 24;
const CLIP_RATIO = 0.05;
const clipTolerance = (box: number) =>
  Math.max(CLIP_MIN_PX, Math.min(CLIP_MAX_PX, CLIP_RATIO * box));
/** A responsive chart narrower/shorter than this has lost its axes. */
const CHART_MIN_W = 200;
const CHART_MIN_H = 120;
/** How square a chart box must be to count as a dial rather than a plot. */
const DIAL_ASPECT = 0.25;
/** …and the far smaller box a dial still reads at, having no axes to fit. */
const DIAL_MIN_PX = 80;
/** A scroll list showing fewer rows than this reads as broken, not scrollable. */
const MIN_ROWS = 2;
/** Extra truncated labels always tolerated, whatever the card's density. */
const ELL_TOL = 2;
/** ...and beyond that, the share of on-screen elements allowed to truncate. */
const ELL_SHARE = 0.12;
/** A chart box that moves less than this across the envelope is a fixed glyph. */
const CHART_RESPONSIVE_DELTA = 40;
/** Ink coverage below this reads as a stretched, mostly-empty card. */
const INK_MIN = 0.5;
/**
 * Spans' worth of allowance a finite ceiling has to earn. Without it, one bad
 * far corner buys a cap on the whole frame — the box search would sooner cap a
 * frame at 11 columns than admit it needs two rows.
 */
const CAP_PENALTY = 6;
/**
 * How much of what a frame renders at its roomiest it may stop rendering before
 * the size counts as too small. Frames that react to a narrow card by hiding a
 * sparkline or dropping a column clip nothing and overflow nothing — they just
 * show less — so this is the only signal that catches them.
 */
const DROP_RATIO = 0.7;
/**
 * How much of the envelope a frame's ink count must sit at one value for that
 * value to count as its "complete" state. Below this the frame is treated as
 * density-scaling and exempt from the drop rule.
 */
const PLATEAU_SHARE = 0.5;

const probeFile = process.env.PROBE_IN ?? "frame-size-probe.json";
const metaFile = process.env.META_IN ?? "frame-meta.json";
const out = process.env.BOUNDS_OUT ?? "frame-size-bounds.json";

const probe = JSON.parse(readFileSync(probeFile, "utf8")) as {
  maxW: number;
  maxH: number;
  results: FrameProbe[];
};
const metas = JSON.parse(readFileSync(metaFile, "utf8")) as Record<
  string,
  FrameMeta
>;
const MAX_W = probe.maxW;
const MAX_H = probe.maxH;

/* ── sizes real boards already use ─────────────────────────────────────────── */

interface Used {
  minW: number;
  minH: number;
  maxW: number;
  maxH: number;
  n: number;
  /** Every distinct span the boards place this frame at, as "WxH". */
  spans: Set<string>;
}
const used = new Map<string, Used>();
function note(frame: string, w: number, h: number) {
  const u = used.get(frame) ?? {
    minW: 99,
    minH: 99,
    maxW: 0,
    maxH: 0,
    n: 0,
    spans: new Set<string>(),
  };
  u.minW = Math.min(u.minW, w);
  u.minH = Math.min(u.minH, h);
  u.maxW = Math.max(u.maxW, w);
  u.maxH = Math.max(u.maxH, h);
  u.n++;
  u.spans.add(`${w}x${h}`);
  used.set(frame, u);
}
/** Board-level frames only — a group's children are placed in the GROUP's units. */
function walkSpec(spec: {
  frames?: { frame: string; position: { w: number; h: number } }[];
}) {
  for (const f of spec.frames ?? []) note(f.frame, f.position.w, f.position.h);
}
const BOARD_SOURCES = [
  "apps/explorer/scripts/curated-seed.json",
  "tests/fixtures/bitkub.dashboard.json",
  "tests/fixtures/crypto-command.dashboard.json",
  "tests/fixtures/macro-watch.dashboard.json",
  "tests/fixtures/micky.dashboard.json",
  "tests/fixtures/nvda-deepdive.dashboard.json",
  "tests/fixtures/quant-terminal.dashboard.json",
];
/**
 * Boards outside the repo — the author's own store, say. A real board is
 * evidence about what a frame survives, and a ceiling it exceeds is a ceiling
 * set too low; feeding them in here is what stops the fit step from shrinking
 * someone's card to satisfy a threshold. Kept out of BOARD_SOURCES so a CI run,
 * which has none of these files, still derives the same bounds from the repo.
 */
const EXTRA_BOARDS = (process.env.EXTRA_BOARDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
for (const file of [...BOARD_SOURCES, ...EXTRA_BOARDS]) {
  if (!existsSync(file)) continue;
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const rows = Array.isArray(raw) ? raw : (raw.dashboards ?? raw.rows ?? [raw]);
  for (const row of rows) walkSpec(row.spec ?? row);
}

/* ── the per-cell verdict ──────────────────────────────────────────────────── */

interface Ctx {
  refEll: number;
  chartResponsiveW: boolean;
  chartResponsiveH: boolean;
  /**
   * How much this frame renders when it is NOT dropping anything — the value its
   * ink count sits at across most of the envelope. Null for a frame whose ink
   * count has no plateau, i.e. one whose content scales continuously with area
   * (a treemap's tiles, a scatter's labels, a list's visible rows). Those have no
   * "full" state to fall short of, so the drop rule does not apply to them at
   * all; their floor comes from clipping and chart legibility instead.
   */
  plateauInkN: number | null;
  /** The frame draws a chart when it has room for one. */
  refHasChart: boolean;
}

/**
 * The value a series sits at across most of its range, or null when it has no
 * such level. Used to tell a frame that renders a FIXED set of things (and
 * therefore has a "complete" state it can fall short of) from one whose content
 * scales continuously with the space it is given.
 */
function plateau(xs: number[]): number | null {
  if (!xs.length) return null;
  const freq = new Map<number, number>();
  for (const x of xs) freq.set(x, (freq.get(x) ?? 0) + 1);
  const [value, count] = [...freq].sort((a, b) => b[1] - a[1])[0];
  return count >= PLATEAU_SHARE * xs.length ? value : null;
}

/** The kind of a fault string, e.g. "clipY:38" -> "clipY". */
const kindOf = (fault: string) => fault.split(":")[0];

/**
 * Faults the frame has at its ROOMIEST span, and therefore at every span. A
 * frame that clips at 12x8 clips because of how it is built, not because it was
 * made small — no floor can fix it, and treating it as a floor signal would
 * either push the minimum to the board edge or, worse, find no valid size at all
 * and fall back to whatever was declared before. So these are subtracted
 * everywhere and reported separately, as the frame bugs they are.
 */
function referenceFaults(ref: Cell, ctx: Ctx): Set<string> {
  return new Set(faults(ref, ctx, null).map(kindOf));
}

/** Why a cell is unusable — empty when it is fine. */
function faults(c: Cell, ctx: Ctx, ignore: Set<string> | null): string[] {
  const f: string[] = [];
  if (c.err) f.push("error-card");
  if (c.clipY > clipTolerance(c.boxH)) f.push(`clipY:${c.clipY}/${c.boxH}`);
  if (c.clipX > clipTolerance(c.boxW)) f.push(`clipX:${c.clipX}/${c.boxW}`);
  // Truncation is judged RELATIVE to the roomiest cell: a frame whose longest
  // label never fits (a full news headline) would otherwise be unsatisfiable at
  // every size, and "this label always ellipses" is a copy decision, not a
  // sizing one. What matters is truncation the shrinking CAUSED.
  // ...and PROPORTIONALLY. One cut label out of forty treemap tiles is what a
  // treemap does; demanding that not one of them ever ellipses put the floor at
  // 11 of 12 columns. What reads as broken is a card where truncation is the
  // rule rather than the exception, so the bar scales with how much is on screen.
  const ellBudget = Math.max(ELL_TOL, ELL_SHARE * c.inkN);
  if (c.ell - ctx.refEll > ellBudget)
    f.push(`ellipsis:${c.ell}>${ctx.refEll}+${Math.round(ellBudget)}`);
  // A roughly SQUARE chart box is a dial — a gauge or a donut — not a plot with
  // axes. The width thresholds below exist because a line chart narrower than
  // ~200px has no room left for its y-axis labels and tick marks; a dial has
  // neither, reads perfectly at 120px, and is judged on area instead. Without
  // this every gauge was told it needed a third row to hold a 123px dial.
  const dial =
    c.chartW > 0 &&
    c.chartH > 0 &&
    Math.abs(c.chartW - c.chartH) / Math.max(c.chartW, c.chartH) < DIAL_ASPECT;
  const minW = dial ? DIAL_MIN_PX : CHART_MIN_W;
  const minH = dial ? DIAL_MIN_PX : CHART_MIN_H;
  if (ctx.chartResponsiveW && c.chartW >= 0 && c.chartW < minW)
    f.push(`chartW:${c.chartW}`);
  if (ctx.chartResponsiveH && c.chartH >= 0 && c.chartH < minH)
    f.push(`chartH:${c.chartH}`);
  if (c.rows >= 0 && c.rows < MIN_ROWS) f.push(`rows:${c.rows}`);
  // Content the frame decided not to render at this size. Two readings of the
  // same symptom: a chart that is simply gone is unambiguous, so it is called
  // out separately from the general "renders noticeably less" ratio.
  if (ctx.refHasChart && c.chartW < 0) f.push("chart-missing");
  if (ctx.plateauInkN != null && c.inkN < DROP_RATIO * ctx.plateauInkN)
    f.push(`dropped:${c.inkN}/${ctx.plateauInkN}`);
  return ignore ? f.filter((x) => !ignore.has(kindOf(x))) : f;
}

function derive(p: FrameProbe, meta: FrameMeta) {
  const at = new Map<string, Cell>();
  for (const c of p.cells) at.set(`${c.w}x${c.h}`, c);
  const cell = (w: number, h: number) => at.get(`${w}x${h}`);

  const ref = cell(MAX_W, MAX_H)!;
  const chartWs = p.cells.filter((c) => c.chartW > 0).map((c) => c.chartW);
  const chartHs = p.cells.filter((c) => c.chartH > 0).map((c) => c.chartH);
  const spread = (xs: number[]) =>
    xs.length ? Math.max(...xs) - Math.min(...xs) : 0;
  const ctx: Ctx = {
    refEll: ref.ell,
    chartResponsiveW: spread(chartWs) > CHART_RESPONSIVE_DELTA,
    chartResponsiveH: spread(chartHs) > CHART_RESPONSIVE_DELTA,
    plateauInkN: plateau(p.cells.map((c) => c.inkN)),
    // "Has a chart" is judged over the whole envelope, not at one size — the
    // frames this catches are exactly the ones that hide their chart when small,
    // so asking the smallest cell whether a chart exists answers itself.
    refHasChart: p.cells.some((c) => c.chartW > 0),
  };

  const inherent = referenceFaults(ref, ctx);
  const ok = (w: number, h: number) => {
    const c = cell(w, h);
    return !!c && faults(c, ctx, inherent).length === 0;
  };

  // ── the envelope: the best clean BOX of spans ─────────────────────────────
  // `layout` can only express a box — every w in [minW, maxW] paired with every
  // h in [minH, maxH] — so the derivation solves for the box, not for a floor
  // with the ceiling bolted on afterwards. Solving both together is what lets an
  // ASPECT-COUPLED frame be described at all: `breathing` sizes its circle off
  // the card's width, so at 12 columns and 2 rows it overflows by 296px. Reading
  // that as a floor alone says "this frame needs seven rows", which is nonsense;
  // reading it as a box says "not that wide unless you are also that tall".
  //
  // Score is the number of spans allowed, minus a small penalty per finite side.
  // Without the penalty a single bad far corner buys a ceiling on the whole
  // frame — a frame clean everywhere but 12x1 would rather cap its width at 11
  // than admit it needs two rows, which is the wrong reading of the same data.
  let minW = 0;
  let minH = 0;
  let boxW = MAX_W;
  let boxH = MAX_H;
  let best = -Infinity;
  for (let mw = 1; mw <= MAX_W; mw++) {
    for (let mh = 1; mh <= MAX_H; mh++) {
      for (let xw = mw; xw <= MAX_W; xw++) {
        for (let xh = mh; xh <= MAX_H; xh++) {
          let all = true;
          for (let h = mh; h <= xh && all; h++)
            for (let w = mw; w <= xw && all; w++) if (!ok(w, h)) all = false;
          if (!all) continue;
          const room = (xw - mw + 1) * (xh - mh + 1);
          const score =
            room -
            (xw < MAX_W ? CAP_PENALTY : 0) -
            (xh < MAX_H ? CAP_PENALTY : 0);
          // Tie-break on the narrower floor: board width is the scarce resource
          // (12 columns, fixed), while a board grows downward without limit.
          if (score > best || (score === best && mw < minW)) {
            best = score;
            minW = mw;
            minH = mh;
            boxW = xw;
            boxH = xh;
          }
        }
      }
    }
  }
  const unsatisfiable = minW === 0;
  if (unsatisfiable) {
    minW = meta.layout?.minW ?? meta.layout?.w ?? 3;
    minH = meta.layout?.minH ?? meta.layout?.h ?? 2;
    boxW = MAX_W;
    boxH = MAX_H;
  }

  // ── maximum: the last span where the card still looks filled ──────────────
  // A second, softer ceiling on top of the box above. That one says "past here
  // it breaks"; this one says "past here it stops being worth the space" — the
  // card still renders perfectly, it is just a number floating in an acre. The
  // tighter of the two wins.
  const refH = Math.min(MAX_H, Math.max(minH, meta.layout?.h ?? 3));
  const refW = Math.min(MAX_W, Math.max(minW, meta.layout?.w ?? 4));
  let maxW = boxW;
  for (let w = minW; w <= boxW; w++) {
    const c = cell(w, refH);
    if (c && c.inkW < INK_MIN) {
      maxW = Math.max(minW, w - 1);
      break;
    }
  }
  let maxH = boxH;
  for (let h = minH; h <= boxH; h++) {
    const c = cell(refW, h);
    if (c && c.inkH < INK_MIN) {
      maxH = Math.max(minH, h - 1);
      break;
    }
  }

  // ── reconcile with what already exists ────────────────────────────────────
  const cur = meta.layout ?? { w: 4, h: 3 };
  const u = used.get(p.frame);
  const flags: string[] = [];
  if (unsatisfiable) flags.push("no-clean-size");
  if (p.failed) flags.push(`probe-failed:${p.failed}`);

  // A shipped board placing this frame below the derived floor means one of two
  // very different things, and they must not be conflated:
  //
  //   the span measures CLEAN — the floor is merely the smallest clean
  //     RECTANGLE, and this span sits outside it while being fine in itself. The
  //     declared bound was too strict; widen it if the wider rectangle still
  //     holds throughout.
  //   the span measures FAULTY — the board is showing a clipped card today. The
  //     bound is right and the BOARD is what needs fixing. Relaxing here would
  //     bury the defect the measurement just found.
  //
  // Getting this backwards is how a floor derived from evidence quietly decays
  // into a floor derived from whatever someone happened to drag a card to.
  for (const span of u?.spans ?? []) {
    const [w, h] = span.split("x").map(Number);
    const insideHardBox = w >= minW && h >= minH && w <= boxW && h <= boxH;
    if (insideHardBox) {
      // Clean, but the soft ink ceiling would forbid it. That ceiling is a
      // judgement about emptiness, and a board shipping the frame this size is a
      // better judgement than a threshold — so it yields.
      if (w > maxW) {
        flags.push(`board-raised-maxW:${span}`);
        maxW = w;
      }
      if (h > maxH) {
        flags.push(`board-raised-maxH:${span}`);
        maxH = h;
      }
      continue;
    }
    if (!ok(w, h)) {
      flags.push(`board-violates:${span}`);
      continue;
    }
    const tryW = Math.min(minW, w);
    const tryH = Math.min(minH, h);
    const tryBoxW = Math.max(boxW, w);
    const tryBoxH = Math.max(boxH, h);
    let clean = true;
    for (let hh = tryH; hh <= tryBoxH && clean; hh++)
      for (let ww = tryW; ww <= tryBoxW && clean; ww++)
        if (!ok(ww, hh)) clean = false;
    if (clean) {
      flags.push(`board-widened:${span}`);
      minW = tryW;
      minH = tryH;
      boxW = tryBoxW;
      boxH = tryBoxH;
      maxW = Math.max(maxW, w);
      maxH = Math.max(maxH, h);
    } else {
      // The span itself is fine but no box containing it is, so `layout` cannot
      // express it. The board keeps working (the renderer ignores `layout`); it
      // is the editor that would clamp the card on the next drag.
      flags.push(`board-outside-rect:${span}`);
    }
  }
  let defW = Math.max(cur.w, minW);
  let defH = Math.max(cur.h, minH);
  maxW = Math.max(maxW, defW);
  maxH = Math.max(maxH, defH);
  defW = Math.min(defW, maxW);
  defH = Math.min(defH, maxH);

  if (minW !== (cur.minW ?? 1) || minH !== (cur.minH ?? 1))
    flags.push("min-changed");
  if (defW !== cur.w || defH !== cur.h) flags.push("default-changed");

  // The smallest cell's complaint, kept as the human-readable "why".
  const worst = cell(1, 1);
  const why = worst ? faults(worst, ctx, inherent).join(" ") : "";
  // A fault the frame carries at every size is a frame bug, not a bound. It is
  // excluded from the derivation above and reported here instead, because a
  // silently-clipping card is worth someone's attention even though no `layout`
  // value can repair it.
  if (inherent.size) flags.push(`inherent:${[...inherent].join("+")}`);

  return {
    frame: p.frame,
    category: meta.category,
    label: meta.label,
    chrome: meta.chrome,
    container: meta.container,
    current: cur,
    derived: {
      w: defW,
      h: defH,
      minW,
      minH,
      // Only a real ceiling is emitted; `null` means "scales to the board".
      maxW: maxW >= MAX_W ? null : maxW,
      maxH: maxH >= MAX_H ? null : maxH,
    },
    evidence: {
      whyNotSmallest: why,
      chartResponsive: ctx.chartResponsiveW || ctx.chartResponsiveH,
      refEll: ctx.refEll,
      plateauInkN: ctx.plateauInkN,
      inkNAtMin: cell(minW, minH)?.inkN ?? null,
      inkAtWidest: cell(MAX_W, refH)?.inkW ?? null,
      inkAtTallest: cell(refW, MAX_H)?.inkH ?? null,
      inkAtDefault: cell(refW, refH)?.inkW ?? null,
      // Sets do not survive JSON.stringify, so the spans go out as an array.
      boardUse: u ? { ...u, spans: [...u.spans] } : null,
      // The first clean cell in each direction, so a reviewer can sanity-check
      // the floor without re-reading the matrix.
      faultsAtMinMinusOne:
        minW > 1 ? faults(cell(minW - 1, MAX_H)!, ctx, inherent).join(" ") : "",
      faultsAtMinHMinusOne:
        minH > 1 ? faults(cell(minW, minH - 1)!, ctx, inherent).join(" ") : "",
      inherentFaults: [...inherent],
    },
    flags,
  };
}

const rows = probe.results
  // A partially-probed frame (the sweep writes incrementally, and can be read
  // mid-run) has no reference cell to measure anything against.
  .filter((p) => metas[p.frame] && p.cells.length === MAX_W * MAX_H)
  .map((p) => derive(p, metas[p.frame]));

writeFileSync(
  out,
  JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 0),
);

const changed = rows.filter((r) => r.flags.includes("min-changed"));
const capped = rows.filter(
  (r) => r.derived.maxW !== null || r.derived.maxH !== null,
);
const bad = rows.filter((r) =>
  r.flags.some(
    (f) =>
      f.startsWith("no-clean") ||
      f.startsWith("probe-failed") ||
      f.startsWith("board-violates") ||
      f.startsWith("board-outside-rect") ||
      f.startsWith("inherent"),
  ),
);
console.log(`${rows.length} frames`);
console.log(`  min bounds changed: ${changed.length}`);
console.log(`  gained a ceiling:   ${capped.length}`);
console.log(`  need review:        ${bad.length}`);
for (const r of bad) console.log(`    ! ${r.frame} — ${r.flags.join(", ")}`);
console.log(`report → ${out}`);
