import type { Selection } from "d3";

/**
 * The chart layer's hover tooltip.
 *
 * ## Why one shared node on `document.body`
 *
 * Every chart in this package draws inside a dashboard card, and a card is a
 * clipping box: `.zf-frame-body` sets `overflow` and `content-visibility`, so a
 * tooltip positioned *inside* the chart's own container gets cut off at the card
 * edge — exactly where the interesting marks are (the last bar, the top-right
 * bubble). A single `position: fixed` node parented to `<body>` escapes every
 * card, every `overflow: hidden`, and every stacking context, so the same
 * tooltip works in a 2×2 card and in a full-width one.
 *
 * Parenting to `<body>` rather than to the grid also keeps `position: fixed`
 * honest: a transformed ancestor (GridStack applies one while dragging) would
 * otherwise become the containing block and the tooltip would drift with the
 * card.
 *
 * ## Why it is imperative
 *
 * A pointer generates up to one move event per frame per mark. Routing that
 * through React state re-renders the chart's whole subtree at 60–120 Hz for a
 * label change — the *slow* way to build this, and the reason the two hooks this
 * replaces were never wired up. Instead:
 *
 *   - position writes are coalesced into one `transform` per animation frame;
 *   - the DOM is only rebuilt when the hovered datum actually changes (cheap
 *     content signature), so sliding along a 60-bar chart costs 60 content
 *     writes, not 600;
 *   - the node's size is measured once per content change, never per frame, so
 *     tracking the cursor never reads layout;
 *   - `transform` is deliberately NOT transitioned — only `opacity` is. A
 *     transitioned transform makes the tooltip lag the cursor, which reads as
 *     jank however smooth it technically is.
 *
 * ## Integration shapes
 *
 * Three, because the charts are built three different ways:
 *
 *   - {@link attachChartTooltip} — one mark per datum (bars, dots, bubbles,
 *     cells). d3 selection in, listeners out.
 *   - {@link showChartTooltip}/{@link moveChartTooltip}/{@link hideChartTooltip}
 *     — a nearest-point overlay, where the hovered datum is derived from the
 *     cursor's x rather than from an element (line/sparkline charts).
 *   - {@link delegateChartTooltip} — React-rendered grids (treemap, matrix
 *     heatmap), where per-cell handler props would allocate on every render.
 *     One delegated listener on the container instead.
 */

/** One `label: value` line. */
export interface ChartTooltipRow {
  /** Omit for a value-only line (a single-series chart needs no label column). */
  label?: string;
  value: string;
  /** Series/category colour, drawn as a small swatch before the label. */
  color?: string;
}

export interface ChartTooltipContent {
  /** Headline — the point's identity: a date, a category, a ticker. */
  title?: string;
  rows?: ChartTooltipRow[];
  /** Dimmed trailing line — a share of total, a bin's range, a caveat. */
  footer?: string;
}

/** Gap between the cursor and the tooltip's near edge. */
const CURSOR_OFFSET = 14;
/** Minimum clearance from the viewport edge. */
const VIEWPORT_MARGIN = 8;

const STYLE_ID = "zfc-tooltip-style";
// NB: this is a template literal, so comments inside it must not use backticks —
// a stray one closes the string and the file stops parsing.
const CSS = `
.zfc-tt {
  position: fixed;
  left: 0;
  top: 0;
  z-index: 2147483000;
  /* Never a hit target: the tooltip tracks the cursor, so an interactive
     tooltip would steal the pointer from the mark it describes. */
  pointer-events: none;
  opacity: 0;
  transform: translate3d(0, 0, 0);
  will-change: transform, opacity;
  /* layout + style only: paint containment would clip the box-shadow. */
  contain: layout style;
  box-sizing: border-box;
  max-width: 264px;
  padding: 7px 9px 8px;
  border-radius: 7px;
  border: 1px solid var(--zfc-tt-border, hsl(0 0% var(--zf-ink-l, 100%) / 0.14));
  /* Two declarations on purpose. The shared node gets --zfc-tt-bg written by
     applyTheme(); the inline variant below has no JS behind it and falls back to
     the board's own surface vars, mixing a little ink into the card colour so it
     reads as floating above the card in BOTH surface modes (lighter on dark,
     darker on light). An engine without color-mix() drops the second
     declaration and keeps the flat first one. */
  background: var(--zfc-tt-bg, hsl(233 20% 14% / 0.97));
  background: var(
    --zfc-tt-bg,
    color-mix(
      in oklab,
      hsl(
          var(--zf-base-hue, 233) var(--zf-base-sat, 20%)
            var(--zf-surf-l2, 7%) / 0.97
        )
        90%,
      hsl(0 0% var(--zf-ink-l, 100%)) 10%
    )
  );
  box-shadow: var(--zfc-tt-shadow, 0 8px 28px -8px rgb(0 0 0 / 0.7));
  color: hsl(0 0% var(--zfc-tt-ink, var(--zf-ink-l, 100%)) / 0.95);
  font-family: var(--zfc-tt-font, "DM Sans", sans-serif);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.35;
  font-variant-numeric: tabular-nums;
}
/* Only opacity animates. Transform stays instant so the tooltip is glued to the
   cursor rather than easing after it. */
@media (prefers-reduced-motion: no-preference) {
  .zfc-tt { transition: opacity 110ms var(--ease-out-quad, ease-out); }
}
.zfc-tt--on { opacity: 1; }
/* The multi-series crosshair tooltip borrows this surface but positions itself
   inside its own chart container, against the hover line rather than the cursor.
   The reset has to be explicit: this stylesheet is injected UNLAYERED, and an
   unlayered rule beats every Tailwind utility whatever the source order, so an
   "absolute" utility class on the element would lose to position: fixed above. */
.zfc-tt--inline {
  position: absolute;
  z-index: 50;
  max-width: none;
  transform: none;
}
.zfc-tt-title {
  font-weight: 700;
  color: hsl(0 0% var(--zfc-tt-ink, var(--zf-ink-l, 100%)) / 0.95);
  white-space: nowrap;
}
/* The title is a heading for the rows below it, so it only earns its gap when
   there are rows. */
.zfc-tt-title:not(:last-child) { margin-bottom: 5px; }
.zfc-tt-rows {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 3px 12px;
  align-items: baseline;
}
/* Value-only content: one column, left aligned — a right-aligned lone column
   would drift away from the title above it. */
.zfc-tt-rows[data-bare="1"] { grid-template-columns: 1fr; }
.zfc-tt-rows[data-bare="1"] .zfc-tt-val { justify-content: flex-start; }
.zfc-tt-label {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  color: hsl(0 0% var(--zfc-tt-ink, var(--zf-ink-l, 100%)) / 0.6);
  white-space: nowrap;
}
.zfc-tt-label > span {
  overflow: hidden;
  text-overflow: ellipsis;
}
.zfc-tt-sw {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 2px;
  /* Nudged off the baseline the row aligns on, so the swatch centres on the
     text rather than sitting under it. */
  transform: translateY(1px);
}
.zfc-tt-val {
  display: flex;
  align-items: baseline;
  gap: 5px;
  justify-content: flex-end;
  font-weight: 700;
  white-space: nowrap;
}
.zfc-tt-foot {
  margin-top: 5px;
  color: hsl(0 0% var(--zfc-tt-ink, var(--zf-ink-l, 100%)) / 0.45);
  white-space: nowrap;
}
`;

interface RowNodes {
  row: HTMLDivElement;
  swatch: HTMLSpanElement;
  labelText: HTMLSpanElement;
  value: HTMLDivElement;
  /**
   * A second swatch, inside the value cell, for value-only rows. A bare row
   * hides its whole label cell, which would take the swatch with it — and on a
   * diverging chart the swatch IS the reading (which side of zero the mark sits
   * on), so losing it makes a gain and a loss tooltip identical.
   */
  valueSwatch: HTMLSpanElement;
  valueText: HTMLSpanElement;
}

interface Live {
  node: HTMLDivElement;
  titleEl: HTMLDivElement;
  rowsEl: HTMLDivElement;
  footEl: HTMLDivElement;
  rows: RowNodes[];
}

let live: Live | null = null;
/** Signature of the content currently in the DOM — the content-diff key. */
let renderedSig = "";
/** Cached size of the current content; `null` means "re-measure on next place". */
let measured: { w: number; h: number } | null = null;
/** Coalesced position write. */
let moveRaf = 0;
let pendingX = 0;
let pendingY = 0;
/**
 * Deferred hide. Moving between two adjacent marks fires pointerleave on the
 * old one *before* pointerenter on the new one, so an immediate hide would
 * strobe the fade across a dense chart. Deferring by a frame lets the incoming
 * show cancel it, and still hides within ~16ms when the pointer really left.
 */
let hideRaf = 0;
/** True between the first show and the matching hide. Guards stray moves. */
let sessionOpen = false;
/**
 * The element the current palette was read from — a chart, not a mark, so the
 * theme is resolved once per chart entered rather than once per bar crossed.
 * `getComputedStyle` is the one genuinely expensive call in this file.
 *
 * Deliberately NOT "once per hover session": `hide` is deferred by a frame, so
 * moving the pointer straight from one card's chart to another's arrives while
 * the session is still open, and a session-scoped resolve would paint the second
 * chart in the first one's colours (cards can carry their own `style` override).
 * Cleared on hide, so a theme edited between hovers is picked up.
 */
let themeSource: Element | null = null;

const hasDom = (): boolean =>
  typeof document !== "undefined" && typeof window !== "undefined";

/**
 * Clamp the tooltip into the viewport.
 *
 * Prefers sitting to the RIGHT of the cursor and vertically centred on it: the
 * marks these charts hover carry their own value label *above* them (bar tips,
 * bubble tickers), and a tooltip placed above the cursor covers exactly that.
 * Flips to the left when the right side runs out, then clamps — so a mark in the
 * far corner of the screen still shows its whole tooltip.
 *
 * Exported for tests: it is pure arithmetic, and it is the part that silently
 * goes wrong (off-screen tooltips) rather than loudly.
 */
export function placeChartTooltip(
  cursorX: number,
  cursorY: number,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
): { left: number; top: number } {
  let left = cursorX + CURSOR_OFFSET;
  if (left + width > viewportWidth - VIEWPORT_MARGIN) {
    const flipped = cursorX - CURSOR_OFFSET - width;
    // Only flip if the left side actually has more room; otherwise keep the
    // right placement and let the clamp below pull it back on screen.
    if (flipped >= VIEWPORT_MARGIN) left = flipped;
  }
  const maxLeft = Math.max(
    VIEWPORT_MARGIN,
    viewportWidth - width - VIEWPORT_MARGIN,
  );
  left = Math.min(Math.max(left, VIEWPORT_MARGIN), maxLeft);

  const maxTop = Math.max(
    VIEWPORT_MARGIN,
    viewportHeight - height - VIEWPORT_MARGIN,
  );
  const top = Math.min(Math.max(cursorY - height / 2, VIEWPORT_MARGIN), maxTop);

  return { left: Math.round(left), top: Math.round(top) };
}

/** Cheap identity for a content object — the key the DOM diff turns on. */
function signature(content: ChartTooltipContent): string {
  let sig = content.title ?? "";
  if (content.rows)
    for (const r of content.rows)
      sig += `${r.label ?? ""}${r.value}${r.color ?? ""}`;
  if (content.footer) sig += `${content.footer}`;
  return sig;
}

/**
 * Inject the tooltip stylesheet, once per document.
 *
 * Normally this happens lazily on the first hover. It is exported because the
 * multi-series line chart renders its own tooltip element with these classes
 * without ever calling {@link showChartTooltip} — without this it would render
 * unstyled until some *other* chart on the board was hovered.
 */
export function ensureChartTooltipStyle(): void {
  if (!hasDom()) return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function ensureNode(): Live {
  if (live) return live;
  ensureChartTooltipStyle();

  const node = document.createElement("div");
  node.className = "zfc-tt";
  // The tooltip restates data the chart already renders; announcing it as the
  // pointer sweeps would flood a screen reader. The accessible name lives on
  // the marks themselves (`aria-label`), which is where AT looks.
  node.setAttribute("aria-hidden", "true");

  const titleEl = document.createElement("div");
  titleEl.className = "zfc-tt-title";
  const rowsEl = document.createElement("div");
  rowsEl.className = "zfc-tt-rows";
  const footEl = document.createElement("div");
  footEl.className = "zfc-tt-foot";
  node.append(titleEl, rowsEl, footEl);
  document.body.appendChild(node);

  live = { node, titleEl, rowsEl, footEl, rows: [] };
  bindGlobalDismiss();
  return live;
}

let dismissBound = false;
/**
 * A fixed-position tooltip does not travel with the page, so anything that
 * moves the chart under the cursor has to dismiss it. Scroll is captured
 * because dashboards scroll their own inner containers, not just the window.
 */
function bindGlobalDismiss(): void {
  if (dismissBound) return;
  dismissBound = true;
  window.addEventListener("scroll", hideChartTooltip, {
    passive: true,
    capture: true,
  });
  window.addEventListener("resize", hideChartTooltip, { passive: true });
  // Tab-away / window-blur leaves no pointerleave behind.
  document.addEventListener("visibilitychange", hideChartTooltip);
  window.addEventListener("blur", hideChartTooltip);
}

/** Grow/shrink the pooled row elements to `count`, reusing what exists. */
function resizeRowPool(l: Live, count: number): void {
  while (l.rows.length < count) {
    const row = document.createElement("div");
    row.className = "zfc-tt-label";
    const swatch = document.createElement("span");
    swatch.className = "zfc-tt-sw";
    const labelText = document.createElement("span");
    row.append(swatch, labelText);
    const value = document.createElement("div");
    value.className = "zfc-tt-val";
    const valueSwatch = document.createElement("span");
    valueSwatch.className = "zfc-tt-sw";
    const valueText = document.createElement("span");
    value.append(valueSwatch, valueText);
    l.rowsEl.append(row, value);
    l.rows.push({ row, swatch, labelText, value, valueSwatch, valueText });
  }
  while (l.rows.length > count) {
    const spare = l.rows.pop();
    spare?.row.remove();
    spare?.value.remove();
  }
}

function setContent(l: Live, content: ChartTooltipContent): void {
  const rows = content.rows ?? [];
  resizeRowPool(l, rows.length);

  l.titleEl.textContent = content.title ?? "";
  l.titleEl.style.display = content.title ? "" : "none";

  // A row with no label collapses the label column entirely — a single-series
  // chart has nothing to put there.
  const bare = rows.length > 0 && rows.every((r) => !r.label);
  l.rowsEl.dataset.bare = bare ? "1" : "0";
  l.rowsEl.style.display = rows.length ? "" : "none";

  rows.forEach((r, i) => {
    const nodes = l.rows[i];
    nodes.row.style.display = bare ? "none" : "";
    nodes.labelText.textContent = r.label ?? "";
    // The swatch follows the visible cell: beside the label normally, inside the
    // value cell when the label column is collapsed away.
    const swatch = bare ? nodes.valueSwatch : nodes.swatch;
    const spare = bare ? nodes.swatch : nodes.valueSwatch;
    spare.style.display = "none";
    if (r.color) {
      swatch.style.display = "";
      swatch.style.background = r.color;
    } else {
      swatch.style.display = "none";
    }
    nodes.valueText.textContent = r.value;
  });

  l.footEl.textContent = content.footer ?? "";
  l.footEl.style.display = content.footer ? "" : "none";
}

const numFrom = (raw: string, fallback: number): number => {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * Copy the board's surface tokens onto the tooltip.
 *
 * The node lives on `<body>`, outside `.zf-grid`, so it inherits none of the
 * dashboard's `--zf-*` variables — left alone it would render dark-mode chrome
 * on a light-mode board. Reading them off the hovered element (where they DO
 * resolve) keeps one tooltip correct in both surface modes and under a custom
 * base hue, without the chart layer importing anything from the spec layer.
 *
 * `--zf-ink-l` doubles as the mode probe: ~100% in dark, ~16% in light. The
 * tooltip is offset from the card's own lightness *toward the ink*, so it reads
 * as floating above the card either way — lighter on dark, darker on light.
 */
function applyTheme(source: Element): void {
  const l = live;
  if (!l) return;
  const cs = getComputedStyle(source);
  const read = (name: string) => cs.getPropertyValue(name).trim();

  const inkL = numFrom(read("--zf-ink-l"), 100);
  const hue = numFrom(read("--zf-base-hue"), 233);
  const sat = numFrom(read("--zf-base-sat"), 20);
  const surfL = numFrom(read("--zf-surf-l2"), 7);
  const dark = inkL > 50;
  const bgL = dark ? Math.min(surfL + 7, 100) : Math.max(surfL - 6, 0);

  const style = l.node.style;
  style.setProperty("--zfc-tt-ink", `${inkL}%`);
  style.setProperty("--zfc-tt-bg", `hsl(${hue} ${sat}% ${bgL}% / 0.97)`);
  style.setProperty(
    "--zfc-tt-border",
    `hsl(0 0% ${inkL}% / ${dark ? 0.14 : 0.12})`,
  );
  style.setProperty(
    "--zfc-tt-shadow",
    dark
      ? "0 8px 28px -8px rgb(0 0 0 / 0.7)"
      : "0 8px 24px -10px hsl(233 20% 20% / 0.35)",
  );
  // The board can swap its type family (spec.typography.fontFamily → the
  // --font-dmsans token on .zf-grid); follow it rather than hard-coding DM Sans.
  const family = read("--font-dmsans");
  if (family) style.setProperty("--zfc-tt-font", family);

  // Forward the colour tokens a caller's row `color` may be written IN TERMS OF,
  // rather than only the ones this stylesheet uses itself. A frame passes the
  // semantic gain/loss tint as `changeColor()`, which is literally
  // `var(--zf-up, #3fd08f)`, and charts default to `var(--color-highlight, …)` —
  // both are declared inside `.zf-grid`, so on a body-level node they would
  // silently collapse to their hard-coded fallbacks and a board with a custom
  // up/down pair or accent hue would show the WRONG swatch colour while looking
  // perfectly fine (the fallbacks are the defaults). Copying the variables here
  // makes the substitution resolve on this node instead.
  //
  // Accent hue/sat rather than --color-highlight itself: that token is declared
  // at `:root` in terms of these two, and a custom property's var()s are
  // substituted where the property is USED — so setting the inputs on this node
  // is what re-resolves it.
  for (const token of [
    "--zf-up",
    "--zf-down",
    "--zf-accent-hue",
    "--zf-accent-sat",
  ]) {
    const value = read(token);
    if (value) style.setProperty(token, value);
    else style.removeProperty(token);
  }
}

function writePosition(x: number, y: number): void {
  const l = live;
  if (!l) return;
  if (!measured) {
    // One layout read per content change — never per frame.
    measured = { w: l.node.offsetWidth, h: l.node.offsetHeight };
  }
  const { left, top } = placeChartTooltip(
    x,
    y,
    measured.w,
    measured.h,
    window.innerWidth,
    window.innerHeight,
  );
  l.node.style.transform = `translate3d(${left}px, ${top}px, 0)`;
}

function commitHide(): void {
  hideRaf = 0;
  sessionOpen = false;
  // Dropped so the next hover re-reads the palette: the board's theme may have
  // been edited in between, and the chart's own element does not change when it
  // is (the editor rewrites variables, not the DOM).
  themeSource = null;
  if (live) live.node.classList.remove("zfc-tt--on");
}

/**
 * Show (or re-point) the tooltip.
 *
 * `source` is the hovered element — used only to resolve the board's theme
 * tokens, once per hover session.
 */
export function showChartTooltip(
  source: Element,
  clientX: number,
  clientY: number,
  content: ChartTooltipContent,
): void {
  if (!hasDom()) return;
  if (hideRaf) {
    cancelAnimationFrame(hideRaf);
    hideRaf = 0;
  }
  const l = ensureNode();

  const sig = signature(content);
  if (sig !== renderedSig) {
    renderedSig = sig;
    setContent(l, content);
    // Content changed, so the cached box is stale.
    measured = null;
  }

  sessionOpen = true;
  // One `<svg>` holds every mark of a d3 chart, so collapsing marks to their
  // owning svg makes this one resolve per chart instead of one per bar/dot/cell.
  // (The React grids hand us their container directly — see delegateChartTooltip.)
  const themeKey = source.closest("svg") ?? source;
  if (themeKey !== themeSource) {
    themeSource = themeKey;
    applyTheme(themeKey);
    // A theme write can change the box (font family, padding tokens).
    measured = null;
  }

  // Positioned synchronously, not on the next frame: a deferred first write
  // would flash the tooltip at the *previous* mark's position.
  if (moveRaf) {
    cancelAnimationFrame(moveRaf);
    moveRaf = 0;
  }
  writePosition(clientX, clientY);
  l.node.classList.add("zfc-tt--on");
}

/** Track the cursor. Coalesced to one transform write per animation frame. */
export function moveChartTooltip(clientX: number, clientY: number): void {
  if (!live || !sessionOpen) return;
  pendingX = clientX;
  pendingY = clientY;
  if (moveRaf) return;
  moveRaf = requestAnimationFrame(() => {
    moveRaf = 0;
    writePosition(pendingX, pendingY);
  });
}

/**
 * Hide the tooltip. Deferred by one frame so a show landing in the same frame
 * (the pointer crossing from one mark to the next) cancels it instead of
 * strobing the fade.
 */
export function hideChartTooltip(): void {
  if (!live || hideRaf) return;
  if (moveRaf) {
    cancelAnimationFrame(moveRaf);
    moveRaf = 0;
  }
  if (typeof requestAnimationFrame !== "function") {
    commitHide();
    return;
  }
  hideRaf = requestAnimationFrame(commitHide);
}

/**
 * Tear the shared node down. Only for tests and hot-reload — production keeps
 * the one node for the page's lifetime.
 */
export function resetChartTooltip(): void {
  if (moveRaf) cancelAnimationFrame(moveRaf);
  if (hideRaf) cancelAnimationFrame(hideRaf);
  moveRaf = 0;
  hideRaf = 0;
  live?.node.remove();
  live = null;
  renderedSig = "";
  measured = null;
  sessionOpen = false;
  themeSource = null;
}

/** d3 event-namespace suffix, so re-attaching replaces rather than stacks. */
const NS = ".zfc-tt";

/**
 * Attach hover-tooltip listeners to one-mark-per-datum selections (bars, dots,
 * bubbles, cells).
 *
 * `format` returning `null` opts a mark out — used for scaffolding marks that
 * carry no datum of their own (a calendar's week padding, say).
 *
 * Pointer events rather than mouse events: one code path covers mouse, pen and
 * touch, and `pointercancel` catches the gesture being taken over by a scroll.
 */
export function attachChartTooltip<
  GElement extends Element,
  Datum,
  PElement extends Element | null,
  PDatum,
>(
  selection: Selection<GElement, Datum, PElement, PDatum>,
  format: (datum: Datum) => ChartTooltipContent | null,
): void {
  selection
    .on(`pointerenter${NS}`, function (event: PointerEvent, datum: Datum) {
      const content = format(datum);
      if (content)
        showChartTooltip(this, event.clientX, event.clientY, content);
    })
    .on(`pointermove${NS}`, (event: PointerEvent) => {
      moveChartTooltip(event.clientX, event.clientY);
    })
    .on(`pointerleave${NS}`, hideChartTooltip)
    .on(`pointercancel${NS}`, hideChartTooltip);
}

/**
 * Delegated variant for React-rendered grids (treemap tiles, matrix cells).
 *
 * Per-cell handler props would allocate three closures per cell per render —
 * 900 objects for a 300-cell heatmap, on every poll. One listener on the
 * container instead: each cell only needs a `data-zfc-tt` attribute holding its
 * key, which is a string and so costs nothing to re-render.
 *
 * Uses `pointerover`/`pointerout` (which bubble) rather than enter/leave (which
 * do not), and ignores moves *within* one cell so content is rebuilt only when
 * the hovered cell actually changes.
 *
 * @returns a detach function for the effect's cleanup.
 */
export function delegateChartTooltip(
  container: HTMLElement,
  resolve: (key: string) => ChartTooltipContent | null,
): () => void {
  const ATTR = "data-zfc-tt";
  const SEL = `[${ATTR}]`;
  let activeKey: string | null = null;

  const cellFrom = (target: EventTarget | null): HTMLElement | null =>
    target instanceof Element
      ? (target.closest(SEL) as HTMLElement | null)
      : null;

  const onOver = (event: PointerEvent) => {
    const cell = cellFrom(event.target);
    if (!cell) return;
    const key = cell.getAttribute(ATTR);
    if (key === null) return;
    const content = resolve(key);
    if (!content) {
      // A cell with nothing to say still ends the previous cell's tooltip —
      // otherwise it lingers over a gap.
      activeKey = null;
      hideChartTooltip();
      return;
    }
    activeKey = key;
    // The CONTAINER, not the cell, is handed over as the theme source: it
    // inherits the same variables and is one stable element, so crossing 300
    // cells resolves the palette once instead of 300 times.
    showChartTooltip(container, event.clientX, event.clientY, content);
  };

  const onMove = (event: PointerEvent) => {
    if (activeKey === null) return;
    moveChartTooltip(event.clientX, event.clientY);
  };

  const onOut = (event: PointerEvent) => {
    // `pointerout` fires when moving between two cells too; only dismiss when
    // the pointer has left the cell for something that is not another cell.
    const to = cellFrom(event.relatedTarget);
    if (to) return;
    activeKey = null;
    hideChartTooltip();
  };

  container.addEventListener("pointerover", onOver);
  container.addEventListener("pointermove", onMove);
  container.addEventListener("pointerout", onOut);
  container.addEventListener("pointercancel", hideChartTooltip);

  return () => {
    container.removeEventListener("pointerover", onOver);
    container.removeEventListener("pointermove", onMove);
    container.removeEventListener("pointerout", onOut);
    container.removeEventListener("pointercancel", hideChartTooltip);
    if (activeKey !== null) hideChartTooltip();
  };
}

/** The attribute {@link delegateChartTooltip} looks for. */
export const CHART_TOOLTIP_ATTR = "data-zfc-tt";

/**
 * Flatten tooltip content into a one-line reading, for the `aria-label` of the
 * mark it describes.
 *
 * The tooltip node itself is `aria-hidden` — it is a single element reused by
 * every chart on the page, and announcing it as the pointer sweeps would flood a
 * screen reader with the same live region over and over. So the accessible name
 * has to live on the marks, which is also where the d3 charts put it.
 *
 * That matters beyond assistive tech: for a treemap tile or a heatmap cell too
 * small to print its own figure, this is the ONLY place the number is spelled
 * out in the DOM. `tests/frame-content-smoke` sweeps `aria-label` for exactly
 * that reason — without it the currency guard cannot see a `$` that leaked onto
 * a converted board.
 *
 * Middot-joined to match the strings these charts used to pass as a native
 * `title`, so the reading a screen reader gets did not change when the visual
 * tooltip did.
 */
export function chartTooltipLabel(
  content: ChartTooltipContent | null,
): string | undefined {
  if (!content) return undefined;
  const parts: string[] = [];
  if (content.title) parts.push(content.title);
  for (const row of content.rows ?? [])
    parts.push(row.label ? `${row.label} ${row.value}` : row.value);
  if (content.footer) parts.push(content.footer);
  return parts.length ? parts.join(" · ") : undefined;
}
