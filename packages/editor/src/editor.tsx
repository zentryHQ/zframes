import {
  GridStack,
  type GridItemHTMLElement,
  type GridStackNode,
} from "gridstack";
import "gridstack/dist/gridstack.min.css";
import { Redo2, Search, SlidersHorizontal, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import "./editor.css";
import { CurrencyPicker } from "./currency-picker";
import { FrameConfigDialog } from "./editor-config";
import {
  GEAR_SVG,
  colsForHorizontal,
  containerGeometry,
  posFor,
  seedHorizontal,
  subCellPx,
  type ContainerGeometry,
  type LayoutMode,
} from "./editor-grid";
import { buildDefaultConfig, useSymbolUniverse } from "./editor-symbols";
import {
  baselineOf,
  canRedo,
  canUndo,
  initHistory,
  isDirty,
  pushHistory,
  redoHistory,
  undoHistory,
  type History,
} from "./editor-history";
import {
  FRAME_CATEGORIES,
  type AnyFrameDefinition,
  type FrameCategory,
  type FrameRegistry,
} from "@zframes/spec/frame";
import { frameMatchesSearch, frameSearchTokens } from "@zframes/spec/catalogue";
import {
  DashboardCurrencyProvider,
  FRAME_CSS,
  FrameContent,
  FramePatchContext,
  FramesProvider,
  useProviders,
} from "@zframes/core";
import {
  BACKGROUND_SCENES,
  THEME_PRESETS,
  type ThemePreset,
} from "@zframes/spec/presets";
import {
  DashboardSpecSchema,
  FONT_FAMILY_STACKS,
  NUMERIC_VARIANTS,
  surfaceModeVars,
  type DashboardBackground,
  type DashboardSpec,
  type DashboardTypography,
  type ChildFrameInstance,
  type FrameInstance,
  type GridPosition,
} from "@zframes/spec/spec";

/**
 * Unmount a per-frame React root *after* the current render/commit finishes.
 * Frame components load lazily (`React.lazy` + `Suspense`), so a root can still
 * be mid-render when the editor tears the grid down; a synchronous
 * `root.unmount()` inside React's render phase warns ("Attempted to
 * synchronously unmount a root while React was already rendering"). Deferring
 * to a microtask sidesteps it — GridStack has already detached the DOM node, so
 * the late unmount is harmless and the new grid builds fresh nodes/roots.
 *
 * Load-bearing invariant: every caller MUST drop the id from rootsRef/contentRef
 * before scheduling the deferred unmount, so renderInstance can't reuse a root
 * that's queued for teardown. All three call sites do this synchronously.
 */
function unmountRootSoon(root: Root): void {
  queueMicrotask(() => root.unmount());
}

/**
 * The Cosmetics rail's sections, with the words that should find each one.
 *
 * The rail was nine non-collapsible sections — roughly 35 controls stacked in a
 * single 320px scroll column — so reaching "elevation" meant scrolling past every
 * background control. Sections now collapse, and searching matches these keywords
 * so a term auto-opens the section holding it. Keywords are the vocabulary a user
 * would actually type, not just the visible labels: "shadow" finds Appearance,
 * "font" finds Typography, "green" finds Gain / Loss.
 */
const COSMETIC_SECTIONS = [
  { key: "presets", label: "Presets", words: "preset look theme style named" },
  { key: "mode", label: "Mode", words: "mode dark light daylight surface" },
  {
    key: "accent",
    label: "Accent",
    words: "accent hue saturation colour color",
  },
  { key: "surface", label: "Surface", words: "surface tint base hue card" },
  {
    key: "updown",
    label: "Gain / Loss",
    words: "gain loss up down green red profit semantic colourblind",
  },
  {
    key: "background",
    label: "Background",
    words:
      "background backdrop scene gradient image colour color opacity blur overlay unicorn",
  },
  {
    key: "layout",
    label: "Layout",
    words:
      "layout direction vertical horizontal gap padding columns rows grid geometry cell height",
  },
  {
    key: "appearance",
    label: "Appearance",
    words:
      "appearance radius corner border opacity density elevation shadow card",
  },
  {
    key: "typography",
    label: "Typography",
    words:
      "typography font family sans mono serif numbers tabular text size scale",
  },
  {
    key: "currency",
    label: "Currency",
    words:
      "currency money price fx code exchange rate convert denominate dollar usd euro eur pound gbp yen jpy baht thb franc rupee peso",
  },
] as const;

type CosmeticSectionKey = (typeof COSMETIC_SECTIONS)[number]["key"];

/** Which cosmetic sections a query matches, or null when not searching. */
function matchCosmeticSections(query: string): Set<string> | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const terms = q.split(/\s+/);
  return new Set(
    COSMETIC_SECTIONS.filter((s) => {
      const haystack = `${s.label} ${s.words}`.toLowerCase();
      return terms.every((t) => haystack.includes(t));
    }).map((s) => s.key),
  );
}

/** Trailing window used to collapse a continuous slider drag into ONE undo step.
 *  Long enough to span the gaps in a slow drag, short enough that two deliberate
 *  tweaks stay separately undoable. */
const COMMIT_DEBOUNCE_MS = 400;

/** How long the "Frame removed — Undo" toast stays up. */
const UNDO_TOAST_MS = 7000;

/**
 * The spec's own default for every cosmetic field, parsed straight out of the
 * schema.
 *
 * Each "Reset" link in the Cosmetics rail decides whether to appear by comparing
 * the live value to a default, and each of those was an inline literal repeated
 * at 20-odd call sites — so a schema default could change and silently desync
 * every one of them. It already had: the schema's `rowHeight` default is 96,
 * and a hand-written `!== 90` here would have offered "Reset" on an untouched
 * board and reset it to a value the schema never chose.
 */
const SPEC_DEFAULTS = DashboardSpecSchema.parse({ title: "", frames: [] });

/**
 * One collapsible Cosmetics section. Mirrors the frame palette's category
 * accordion (same chevron, same aria-expanded header button) so the rail's two
 * tabs behave identically rather than each inventing a disclosure.
 */
function RailSection({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={open ? "zf-theme is-open" : "zf-theme"}>
      <button
        type="button"
        className="zf-theme-header"
        aria-expanded={open}
        onClick={onToggle}
      >
        <svg
          className="zf-theme-chevron"
          viewBox="0 0 16 16"
          aria-hidden="true"
        >
          <path
            d="M6 4l4 4-4 4"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="zf-theme-header-label">{label}</span>
      </button>
      {open && <div className="zf-theme-body">{children}</div>}
    </section>
  );
}

/**
 * Interactive, in-browser dashboard editor — a drag/resize/add/delete
 * "customise mode" on a GridStack 12-column grid.
 *
 * Edits round-trip the human-editable dashboard.json: `onSave` receives the
 * full updated spec, and the host writes it back to disk (dev) or downloads
 * it. The artifact the agent generates and the one a human drags around stay
 * the same file.
 *
 * GridStack owns the DOM of each grid item, so every frame renders into its
 * own React root mounted in the item's content node. The roots reuse the
 * host's shared provider instances via FramesProvider (no duplicate WebSocket
 * connections).
 */
export function DashboardEditor({
  spec,
  registry,
  onSave,
  customiseButtonTarget,
  onAccentHueChange,
  onAccentSatChange,
  onFontScaleChange,
  onUpColorChange,
  onDownColorChange,
  onModeChange,
  onBackgroundChange,
  onSurfaceChange,
}: {
  spec: DashboardSpec;
  registry: FrameRegistry;
  /** Persist the edited spec. If omitted, Save downloads a dashboard.json. */
  onSave?: (next: DashboardSpec) => void | Promise<void>;
  /** Optional host slot for the collapsed Customise icon. */
  customiseButtonTarget?: HTMLElement | null;
  /** Notified on every layout-mode change so the host can react to it live —
   *  flow-horizontal goes full-bleed, which means dropping the page's centred
   *  max-width, and that lives on the host's <main>, not the editor. */
  onModeChange?: (mode: DashboardSpec["grid"]["mode"]) => void;
  /** Notified on every accent-hue change (live drag, Reset, Cancel-restore) so
   *  the host can mirror it onto chrome the editor doesn't own — the page header
   *  and the :root-scoped --color-highlight token — in real time, not just after
   *  a save + reload. */
  onAccentHueChange?: (hue: number) => void;
  /** Mirror of onAccentHueChange for accent *saturation* (0–100), so the host
   *  re-tints the :root chart tokens and the background scene's saturate()
   *  filter live — a muted accent then reads muted everywhere, not just on the
   *  editor's own cards. */
  onAccentSatChange?: (sat: number) => void;
  /** Notified on every text-scale change so the host can set the root font size
   *  (spec.typography.scale) live — chart text is rem-based, so only the root
   *  font size scales it; a container var can't. Mirrors the accent callbacks. */
  onFontScaleChange?: (scale: number) => void;
  /** Notified on every semantic gain/loss colour change so the host can push
   *  --zf-up / --zf-down to :root for chrome outside the dashboard container
   *  (the ticker tape). The in-grid frames already follow the inline vars. */
  onUpColorChange?: (color: string) => void;
  onDownColorChange?: (color: string) => void;
  /** Notified on every background change (style toggle, scene pick, opacity, and
   *  Cancel-restore) so the host can repaint the live full-bleed backdrop — the
   *  <Background> the editor doesn't own lives above .zf-editor on <FramesProvider>.
   *  Mirrors the accent/mode callbacks; the picked spec lands via collectSpec. */
  onBackgroundChange?: (background: DashboardBackground) => void;
  /** Notified on every dark/light surface-mode toggle (and Cancel-restore) so the
   *  host repaints the full-bleed backdrop live — it renders outside .zf-editor,
   *  which flips its own cards via inline vars. Mirrors onBackgroundChange. */
  onSurfaceChange?: (surface: DashboardSpec["theme"]["surface"]) => void;
}) {
  const providers = useProviders();

  const gridRef = useRef<HTMLDivElement>(null);
  const gridInstanceRef = useRef<GridStack | null>(null);
  const gridReadyRef = useRef(false);
  // Mirrors the `mode` state for the []-deps GridStack callbacks (buildItemEl,
  // collectSpec, captureLayout) that must read the *current* mode without being
  // re-created. switchMode sets it before re-initialising the grid.
  const modeRef = useRef<LayoutMode>(spec.grid.mode);
  // Authoritative per-instance data (frame/title/config). GridStack
  // owns position; we merge the two at save time.
  // Children of a group live in this SAME flat map, keyed by their own id (ids are
  // unique board-wide), so renderInstance / patchInstance / the config rail work
  // on a nested frame with no special case. The tree is reassembled only at save
  // time, from the two refs below.
  const instancesRef = useRef<Map<string, FrameInstance>>(new Map());
  const rootsRef = useRef<Map<string, Root>>(new Map());
  const contentRef = useRef<Map<string, HTMLElement>>(new Map());
  // The nested GridStack per container instance, rebuilt from scratch by
  // restore(). Parentage itself is deliberately NOT tracked here: GridStack moves
  // an item's DOM between grids on a cross-grid drag, so the nested grid's own
  // item list is the only account of who is inside a group that can't go stale —
  // collectSpec reads children straight off it.
  const subGridsRef = useRef<Map<string, GridStack>>(new Map());
  // One ResizeObserver per group, keeping its inner row height fitted to its
  // current pixel height (GridStack nested grids need a px cellHeight). Held so
  // they can be disconnected — an observer on a removed group's detached node
  // would otherwise leak for the life of the editor.
  const subObserversRef = useRef<Map<string, ResizeObserver>>(new Map());
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counterRef = useRef(0);

  // Undo/redo, Cancel, and the dirty indicator all read from ONE linear history
  // of whole-spec snapshots (see editor-history.ts for why snapshots rather than
  // a command stack). Entry 0 is the state customise mode opened on, so Cancel is
  // "apply the baseline" and dirty is "index !== 0" — no parallel bookkeeping.
  const historyRef = useRef<History<DashboardSpec>>(initHistory(spec));
  // Mirror of the ref for the toolbar's disabled/dirty states. The ref is what
  // the []-deps callbacks read; this is what re-renders the buttons.
  const [historyState, setHistoryState] = useState(() => ({
    undo: false,
    redo: false,
    dirty: false,
  }));
  const publishHistory = useCallback(() => {
    const h = historyRef.current;
    setHistoryState({
      undo: canUndo(h),
      redo: canRedo(h),
      dirty: isDirty(h),
    });
  }, []);
  // Timestamp until which commits are ignored — applySpec sets it so writing an
  // undone snapshot back isn't recorded as a fresh edit.
  const suppressCommitUntilRef = useRef(0);
  // Indirection for the GridStack handlers, which are registered once at grid
  // init and must reach the *current* commitHistory (defined far below, since it
  // depends on collectSpec).
  const commitHistoryRef = useRef<(() => void) | null>(null);

  const [editing, setEditing] = useState(false);
  // Save is in flight (the host is writing dashboard.json). Disables the toolbar
  // so the same spec can't be submitted twice.
  const [saving, setSaving] = useState(false);
  // Why the last save failed, if it did — shown in the toolbar so a rejected
  // write is visible instead of looking exactly like a successful one.
  const [saveError, setSaveError] = useState<string | null>(null);
  // The frame the last delete removed, kept so it can be put back with one click.
  // The history already holds the state to undo to; this only drives the toast.
  const [removed, setRemoved] = useState<{ id: string; label: string } | null>(
    null,
  );
  // Mirror for the []-deps callbacks (rebuildGrid, the keyboard handler) that
  // must read the *current* mode without being re-created on every toggle.
  const editingRef = useRef(editing);
  editingRef.current = editing;
  const symbolUniverse = useSymbolUniverse(providers, editing);
  const [count, setCount] = useState(spec.frames.length);
  // Dashboard-wide accent hue (0–360). Set inline on .zf-editor so it themes
  // the live grid + editor chrome in both view and customise modes, and lands
  // in the saved spec via collectSpec.
  const [accentHue, setAccentHue] = useState(spec.theme.accentHue);
  // Accent saturation (0–100%) — pairs with the hue to set how vivid the accent
  // reads. Rides spec.theme alongside accentHue via collectSpec.
  const [accentSat, setAccentSat] = useState(spec.theme.accentSat);
  // Base surface tint (spec.theme): hue + saturation of the dark card surface
  // itself. Applied as --zf-base-hue/--zf-base-sat on .zf-editor below; the card
  // gradient in FRAME_CSS is expressed off them with lightness baked, so this
  // re-temperatures every card without leaving dark mode.
  const [baseHue, setBaseHue] = useState(spec.theme.baseHue);
  const [baseSat, setBaseSat] = useState(spec.theme.baseSat);
  // Semantic gain/loss colours (spec.theme). Applied as --zf-up/--zf-down on
  // .zf-editor below; the frames' UP_COLOR/DOWN_COLOR resolve them. Customisable
  // for a colourblind-safe pair; default green/red.
  const [upColor, setUpColor] = useState(spec.theme.upColor);
  const [downColor, setDownColor] = useState(spec.theme.downColor);
  // Surface mode (spec.theme.surface): "dark" (signature) or "light" (daylight
  // scheme — dark ink on near-white cards). Drives the four --zf-*-l vars on
  // .zf-editor below (which core's FRAME_CSS reads to flip ink + card lightness)
  // plus a light page fill on the grid area; default "dark" is a visual no-op.
  const [surface, setSurface] = useState(spec.theme.surface);
  // Dashboard layout model (spec.grid.mode). Each mode is its own GridStack
  // config with an independent per-frame layout (vertical → position; horizontal
  // → layouts["flow-horizontal"]); switchMode re-inits the grid between them.
  const [mode, setMode] = useState(spec.grid.mode);
  // True during a mode swap — drives the blur+fade that masks the structural
  // reflow between vertical and horizontal (the two layouts can't morph, so we
  // dissolve through, per the design-eng "blur to mask imperfect transitions").
  const [switching, setSwitching] = useState(false);
  // The inter-frame gap (px) is grid geometry — applied as GridStack margin/2
  // and saved to spec.grid via collectSpec.
  const [gap, setGap] = useState(spec.grid.gap);
  // Horizontal grid padding (px) — the left/right inset between the board and
  // the viewport edges (spec.grid.paddingX). Applied as --zf-pad-x on
  // .zf-editor below (which pads .zf-editor-grid, shrinking the GridStack
  // content box) and saved via collectSpec; default 0 is a visual no-op.
  const [paddingX, setPaddingX] = useState(spec.grid.paddingX);
  // Card surface knobs — all applied as inline --zf-* vars on .zf-editor below
  // and saved to spec.appearance via collectSpec: corner radius (px), accent rim
  // opacity (0–1), surface translucency (0.3–1), padding density (0.6–1.4) and
  // shadow depth (0–2). Every default is a visual no-op.
  const [radius, setRadius] = useState(spec.appearance.radius);
  const [borderStrength, setBorderStrength] = useState(
    spec.appearance.borderStrength,
  );
  const [surfaceOpacity, setSurfaceOpacity] = useState(
    spec.appearance.surfaceOpacity,
  );
  const [density, setDensity] = useState(spec.appearance.density);
  const [elevation, setElevation] = useState(spec.appearance.elevation);
  // Typography (spec.typography): the type family routes through --zf-font-family
  // (→ the --font-dmsans token), the numeric style sets --zf-numeric (digit
  // spacing). Both applied inline on .zf-editor below and saved via collectSpec.
  const [fontFamily, setFontFamily] = useState<
    DashboardTypography["fontFamily"]
  >(spec.typography.fontFamily);
  const [numericStyle, setNumericStyle] = useState<
    DashboardTypography["numericStyle"]
  >(spec.typography.numericStyle);
  // Global text scale (spec.typography.scale). Bubbled to the host via
  // onFontScaleChange below — chart text is rem-based, so the host sets the root
  // font size (the editor can't scale rem text with an inline var).
  const [fontScale, setFontScale] = useState(spec.typography.scale);
  // Dashboard background (spec.background). The host renders the actual backdrop
  // (the heavy WebGL engine never reaches @zframes/core), so these are reported
  // up via onBackgroundChange for a live repaint and saved via collectSpec. The
  // projectId stays "sticky" across a none/gradient detour so toggling back to a
  // scene restores the last pick; default to the first curated scene if unset.
  const [bgType, setBgType] = useState(spec.background.type);
  const [bgProjectId, setBgProjectId] = useState(
    spec.background.projectId ?? BACKGROUND_SCENES[0].projectId,
  );
  const [bgOpacity, setBgOpacity] = useState(spec.background.opacity);
  // Solid-colour fill (type "color") and the custom two-colour gradient (type
  // "gradient": from → to at an angle). Schema-defaulted, so always defined.
  const [bgColor, setBgColor] = useState(spec.background.color);
  const [bgGradFrom, setBgGradFrom] = useState(spec.background.gradientFrom);
  const [bgGradTo, setBgGradTo] = useState(spec.background.gradientTo);
  const [bgGradAngle, setBgGradAngle] = useState(spec.background.gradientAngle);
  // Background image (type "image"): a full-bleed photo/illustration with a
  // legibility scrim. imageUrl is optional (empty until the user pastes one);
  // fit/blur/overlayOpacity are schema-defaulted, so always defined.
  const [bgImageUrl, setBgImageUrl] = useState(spec.background.imageUrl ?? "");
  const [bgImageFit, setBgImageFit] = useState(spec.background.imageFit);
  const [bgImageBlur, setBgImageBlur] = useState(spec.background.imageBlur);
  const [bgOverlayOpacity, setBgOverlayOpacity] = useState(
    spec.background.overlayOpacity,
  );
  // Display currency (spec.currency.code). Every money figure on the board is
  // converted from USD through it, which made it the highest-impact setting the
  // editor didn't expose at all — changing it meant hand-editing dashboard.json.
  const [currencyCode, setCurrencyCode] = useState(spec.currency.code);
  // Grid geometry (spec.grid): the column count the board is laid out on, and the
  // pixel height of one row. Neither was editable — a board's shape could only be
  // changed by hand-editing dashboard.json. Both apply LIVE through GridStack's
  // own column()/cellHeight() setters, so changing them never tears down the 200+
  // per-item React roots (which would re-subscribe every frame's data hooks).
  const [columns, setColumns] = useState(spec.grid.columns);
  const [rowHeight, setRowHeight] = useState(spec.grid.rowHeight);
  // Unlike the other cosmetics, currency must also follow the `spec` PROP: the
  // host can swap in a different board (the dashboard switcher does), and the
  // per-item roots read the code from a ref, so nothing else would notice.
  // A local edit is unaffected — the prop's value hasn't changed, so this
  // doesn't re-run.
  const specCurrencyCode = spec.currency.code;
  useEffect(() => {
    setCurrencyCode(specCurrencyCode);
  }, [specCurrencyCode]);

  // One-click looks. A preset sets the full colour, typography, and card-surface
  // state it owns (everything except grid geometry) — no separate render path, so
  // it round-trips through the spec exactly like a hand-tuned look; tweak any
  // slider afterwards to drift off it.
  const applyPreset = useCallback((p: ThemePreset) => {
    setAccentHue(p.theme.accentHue);
    setAccentSat(p.theme.accentSat);
    setBaseHue(p.theme.baseHue);
    setBaseSat(p.theme.baseSat);
    setFontFamily(p.typography.fontFamily);
    setNumericStyle(p.typography.numericStyle);
    setRadius(p.appearance.radius);
    setBorderStrength(p.appearance.borderStrength);
    setSurfaceOpacity(p.appearance.surfaceOpacity);
    setDensity(p.appearance.density);
    setElevation(p.appearance.elevation);
    // Switch to the preset's paired backdrop so the animated scene matches the
    // look. Its hue tracks the accent, so the host's accent hue-rotate (relative
    // to the scene's baseHue) renders it essentially as authored. Unknown key →
    // leave the backdrop as-is rather than blanking it.
    const scene = BACKGROUND_SCENES.find((s) => s.key === p.scene);
    if (scene) {
      setBgType("unicorn");
      setBgProjectId(scene.projectId);
    }
  }, []);

  // The preset whose every owned value matches the live state, if any, so its
  // chip reads as selected (and drifts to none once a slider moves).
  const activePresetKey = useMemo(
    () =>
      THEME_PRESETS.find(
        (p) =>
          p.theme.accentHue === accentHue &&
          p.theme.accentSat === accentSat &&
          p.theme.baseHue === baseHue &&
          p.theme.baseSat === baseSat &&
          p.typography.fontFamily === fontFamily &&
          p.typography.numericStyle === numericStyle &&
          p.appearance.radius === radius &&
          p.appearance.borderStrength === borderStrength &&
          p.appearance.surfaceOpacity === surfaceOpacity &&
          p.appearance.density === density &&
          p.appearance.elevation === elevation &&
          // A preset now owns the backdrop too, so a different scene (or a
          // non-scene background) counts as drifting off it.
          bgType === "unicorn" &&
          BACKGROUND_SCENES.find((s) => s.key === p.scene)?.projectId ===
            bgProjectId,
      )?.key ?? null,
    [
      accentHue,
      accentSat,
      baseHue,
      baseSat,
      fontFamily,
      numericStyle,
      radius,
      borderStrength,
      surfaceOpacity,
      density,
      elevation,
      bgType,
      bgProjectId,
    ],
  );
  // Which rail panel is showing: dashboard-wide cosmetics (accent/layout/
  // appearance), the add-a-frame palette, or the board's event markers. The
  // rail used to stack both; the tabs split them so theme knobs and frame
  // management each get the full panel.
  const [railTab, setRailTab] = useState<"cosmetics" | "frames">("frames");
  // Which Cosmetics sections are expanded. Presets opens by default — it's the
  // one-click route to a whole look, so it should be the first thing offered;
  // everything else is opened deliberately.
  const [openSections, setOpenSections] = useState<Set<string>>(
    () => new Set<CosmeticSectionKey>(["presets"]),
  );
  const [cosmeticQuery, setCosmeticQuery] = useState("");
  const cosmeticMatches = useMemo(
    () => matchCosmeticSections(cosmeticQuery),
    [cosmeticQuery],
  );
  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  // While searching, a matching section is forced open — the point of the query
  // is to reveal the control, not to reveal a header you then have to click.
  const sectionOpen = useCallback(
    (key: string) =>
      cosmeticMatches ? cosmeticMatches.has(key) : openSections.has(key),
    [cosmeticMatches, openSections],
  );
  /** Hide a section entirely when a search excludes it. */
  const sectionVisible = useCallback(
    (key: string) => !cosmeticMatches || cosmeticMatches.has(key),
    [cosmeticMatches],
  );
  // Which frame's settings dialog is open (null = none). The per-item gear
  // button (added imperatively in decorateItem) flips it; the portaled
  // FrameConfigDialog reads it. The ref mirrors it for the imperative deleteItem
  // closure, so deleting the frame being edited also closes the dialog.
  const [editingId, setEditingId] = useState<string | null>(null);
  const editingIdRef = useRef<string | null>(null);
  editingIdRef.current = editingId;

  // The editor sets --zf-accent-hue on .zf-editor, which themes the live grid +
  // its own chrome. But the page header lives *above* .zf-editor and the chart
  // layer's --color-highlight is computed at :root — neither sees that inline
  // var. Report every change up so the host can re-tint them live too.
  useEffect(() => {
    onAccentHueChange?.(accentHue);
  }, [accentHue, onAccentHueChange]);

  useEffect(() => {
    onAccentSatChange?.(accentSat);
  }, [accentSat, onAccentSatChange]);

  // Text scale lives on the root font size (chart text is rem-based), which is
  // above .zf-editor — so, like the accent, report it up for the host to apply
  // live rather than only on save + reload.
  useEffect(() => {
    onFontScaleChange?.(fontScale);
  }, [fontScale, onFontScaleChange]);

  // Semantic up/down ride inline vars on .zf-editor for the in-grid frames, but
  // the ticker tape lives outside it — report changes up so the host mirrors
  // them to :root (same reason as the accent callbacks).
  useEffect(() => {
    onUpColorChange?.(upColor);
  }, [upColor, onUpColorChange]);
  useEffect(() => {
    onDownColorChange?.(downColor);
  }, [downColor, onDownColorChange]);

  // Mirror the live layout mode up to the host: flow-horizontal is full-bleed,
  // which means the host's centred max-width has to drop. Reports on the initial
  // mount, on the toggle, and on Cancel-restore.
  useEffect(() => {
    modeRef.current = mode;
    onModeChange?.(mode);
  }, [mode, onModeChange]);

  // The full-bleed backdrop lives on the host's <FramesProvider>, above
  // .zf-editor — so report every background change up for the host to repaint
  // live (scene swap, opacity, none/gradient toggle) instead of only on save +
  // reload. Built off spec.background so scale/dpi (no UI knob) ride along.
  useEffect(() => {
    onBackgroundChange?.({
      ...spec.background,
      type: bgType,
      projectId: bgProjectId,
      opacity: bgOpacity,
      color: bgColor,
      gradientFrom: bgGradFrom,
      gradientTo: bgGradTo,
      gradientAngle: bgGradAngle,
      imageUrl: bgImageUrl || undefined,
      imageFit: bgImageFit,
      imageBlur: bgImageBlur,
      overlayOpacity: bgOverlayOpacity,
    });
  }, [
    bgType,
    bgProjectId,
    bgOpacity,
    bgColor,
    bgGradFrom,
    bgGradTo,
    bgGradAngle,
    bgImageUrl,
    bgImageFit,
    bgImageBlur,
    bgOverlayOpacity,
    spec.background,
    onBackgroundChange,
  ]);

  // The full-bleed backdrop (outside .zf-editor) must flip with the dark/light
  // Mode toggle live — the editor's own cards flip via inline vars, but the host
  // backdrop reads this. Reports on mount, toggle, and Cancel-restore (all set
  // `surface`), mirroring the mode/background effects above.
  useEffect(() => {
    onSurfaceChange?.(surface);
  }, [surface, onSurfaceChange]);

  // Live gap: GridStack positions items absolutely, so the inter-frame gutter is
  // its `margin` (half on each side → matches the bare renderer's CSS `gap`).
  // Push every change straight to the live grid. Radius needs no effect — it
  // rides the inline --zf-frame-radius var on .zf-editor below.
  useEffect(() => {
    gridInstanceRef.current?.margin(gap / 2);
  }, [gap]);

  // Stable closures for the GridStack callbacks captured by the mount effect.
  const providersRef = useRef(providers);
  providersRef.current = providers;
  const registryRef = useRef(registry);
  registryRef.current = registry;

  // The palette, grouped by category in FRAME_CATEGORIES order (frames sorted
  // by name within each group). Empty groups are dropped, and any frame whose
  // category isn't a known key folds into a trailing "Other" group so a host's
  // custom frame still shows up.
  const paletteGroups = useMemo(() => {
    const byCategory = new Map<string, AnyFrameDefinition[]>();
    for (const def of registry.values()) {
      const key = def.category ?? "other";
      const list = byCategory.get(key);
      if (list) list.push(def);
      else byCategory.set(key, [def]);
    }
    const known: FrameCategory[] = FRAME_CATEGORIES.map((c) => c.key);
    const groups: {
      key: string;
      label: string;
      description: string;
      frames: AnyFrameDefinition[];
    }[] = FRAME_CATEGORIES.map((c) => ({
      key: c.key as string,
      label: c.label as string,
      description: c.description as string,
      frames: byCategory.get(c.key) ?? [],
    }));
    const leftovers = [...byCategory.entries()]
      .filter(([key]) => !known.includes(key as FrameCategory))
      .flatMap(([, frames]) => frames);
    if (leftovers.length)
      groups.push({
        key: "other",
        label: "Other",
        description: "",
        frames: leftovers,
      });
    return groups
      .filter((g) => g.frames.length > 0)
      .map((g) => ({
        ...g,
        frames: [...g.frames].sort((a, b) => a.name.localeCompare(b.name)),
      }));
  }, [registry]);

  // Free-text palette search. An empty query leaves the accordion untouched; a
  // query filters frames by label / description / name and by their category
  // label (so "crypto" surfaces the whole family), requiring every
  // whitespace-separated token to match somewhere. Matching categories are
  // force-expanded in the render so results are visible without a click.
  const [paletteQuery, setPaletteQuery] = useState("");
  const paletteQueryTokens = useMemo(
    () => frameSearchTokens(paletteQuery),
    [paletteQuery],
  );
  const paletteSearching = paletteQueryTokens.length > 0;
  const filteredGroups = useMemo(() => {
    if (paletteQueryTokens.length === 0) return paletteGroups;
    return paletteGroups
      .map((group) => ({
        ...group,
        frames: group.frames.filter((def) =>
          frameMatchesSearch(def, group.label, paletteQueryTokens),
        ),
      }))
      .filter((group) => group.frames.length > 0);
  }, [paletteGroups, paletteQueryTokens]);

  // The palette is a category accordion — one collapsible section per group, so
  // the ~40-frame catalogue reads as a scannable menu instead of an endless
  // scroll. Open the first group by default so a fresh Frames tab still shows
  // some draggable cards; the rest reveal on click. Multiple may be open at once.
  const [expandedCats, setExpandedCats] = useState<Set<string>>(
    () => new Set(paletteGroups[0] ? [paletteGroups[0].key] : []),
  );
  const toggleCat = useCallback((key: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const defaultConfig = useCallback(
    (def?: AnyFrameDefinition): Record<string, unknown> =>
      def ? buildDefaultConfig(def) : {},
    [],
  );

  const uniqueId = useCallback((frame: string): string => {
    let id = `${frame}-${++counterRef.current}`;
    while (instancesRef.current.has(id))
      id = `${frame}-${++counterRef.current}`;
    return id;
  }, []);

  // Allows frame components (e.g. note) to patch their own config in-place
  // without opening the config rail. Kept in a ref so the stable renderInstance
  // closure always calls the latest version.
  const patchInstanceRef = useRef<
    ((id: string, patch: Record<string, unknown>) => void) | null
  >(null);

  // GridStack owns each item's DOM, so every frame lives in its OWN React root
  // (below). Context from the editor's tree does NOT reach those roots — they
  // must re-provide anything frames read, which is why the display currency is
  // provided per item here as well as at the editor root.
  const currencyRef = useRef(currencyCode);
  currencyRef.current = currencyCode;
  // Mirrors for the []-deps GridStack callbacks, same reason as modeRef.
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const rowHeightRef = useRef(rowHeight);
  rowHeightRef.current = rowHeight;

  const renderInstance = useCallback((id: string) => {
    const content = contentRef.current.get(id);
    const instance = instancesRef.current.get(id);
    if (!content || !instance) return;
    let root = rootsRef.current.get(id);
    if (!root) {
      content.innerHTML = "";
      root = createRoot(content);
      rootsRef.current.set(id, root);
    }
    root.render(
      <FramesProvider providers={providersRef.current}>
        <DashboardCurrencyProvider code={currencyRef.current}>
          <FramePatchContext.Provider
            value={(patch) => patchInstanceRef.current?.(id, patch)}
          >
            <FrameContent
              instance={instance}
              registry={registryRef.current}
              className="zf-fill"
            />
          </FramePatchContext.Provider>
        </DashboardCurrencyProvider>
      </FramesProvider>,
    );
  }, []);

  // The currency code is read from a ref, so React has no dependency that would
  // notice a change: re-render every item root when the dashboard currency
  // changes, or already-mounted cards would keep quoting the old one.
  useEffect(() => {
    for (const id of instancesRef.current.keys()) renderInstance(id);
  }, [currencyCode, renderInstance]);

  const patchInstance = useCallback(
    (id: string, patch: Record<string, unknown>) => {
      const inst = instancesRef.current.get(id);
      if (!inst) return;
      instancesRef.current.set(id, {
        ...inst,
        config: { ...inst.config, ...patch },
      });
      renderInstance(id);
    },
    [renderInstance],
  );
  patchInstanceRef.current = patchInstance;

  const deleteItem = useCallback((el: GridItemHTMLElement) => {
    // The owning grid, which for a frame inside a group is that group's NESTED
    // grid — removing it from the board grid instead would leave the item's DOM
    // in place and the board's item count unchanged.
    const grid = el.gridstackNode?.grid ?? gridInstanceRef.current;
    if (!grid) return;
    const id = el.getAttribute("gs-id");
    if (id) {
      // Name the removal before the instance is gone, so the toast can say what
      // was deleted rather than "a frame".
      const inst = instancesRef.current.get(id);
      const label =
        inst?.title ??
        registryRef.current.get(inst?.frame ?? "")?.label ??
        inst?.frame.replace(/-/g, " ") ??
        "Frame";
      const root = rootsRef.current.get(id);
      if (root) unmountRootSoon(root);
      rootsRef.current.delete(id);
      contentRef.current.delete(id);
      instancesRef.current.delete(id);
      // Deleting a group takes its children with it — they exist only inside it.
      // Their instances have to go too, or the next save would still carry them
      // (and the recoverable-delete snapshot is what puts them all back).
      const sub = subGridsRef.current.get(id);
      if (sub) {
        for (const childEl of sub.getGridItems()) {
          const childId = childEl.getAttribute("gs-id");
          if (!childId) continue;
          const childRoot = rootsRef.current.get(childId);
          if (childRoot) unmountRootSoon(childRoot);
          rootsRef.current.delete(childId);
          contentRef.current.delete(childId);
          instancesRef.current.delete(childId);
        }
        subGridsRef.current.delete(id);
        // An observer left watching a removed group's detached node would leak
        // for the life of the editor.
        subObserversRef.current.get(id)?.disconnect();
        subObserversRef.current.delete(id);
      }
      if (editingIdRef.current === id) setEditingId(null);
      setRemoved({ id, label });
    }
    grid.removeWidget(el, true);
    setCount(gridInstanceRef.current?.getGridItems().length ?? 0);
    // Record the removal so ⌘Z and the toast's Undo can both put it back — with
    // its config, tickers, events and style overrides, which a re-add can't.
    commitHistoryRef.current?.();
  }, []);

  // Adds the customise-mode affordances to a grid item: a per-frame gear that
  // opens *that* frame's settings dialog, plus the delete ×. Idempotent —
  // guarded so repeated calls don't stack buttons/listeners.
  const decorateItem = useCallback(
    (el: GridItemHTMLElement) => {
      if (!el.querySelector(".zf-cfg-btn")) {
        const cfg = document.createElement("button");
        cfg.className = "zf-cfg-btn";
        cfg.type = "button";
        cfg.title = "Edit frame";
        cfg.setAttribute("aria-label", "Edit frame");
        cfg.innerHTML = GEAR_SVG;
        cfg.addEventListener("click", (e) => {
          e.stopPropagation();
          const id = el.getAttribute("gs-id");
          if (id) setEditingId(id);
        });
        el.appendChild(cfg);
      }
      if (!el.querySelector(".zf-del-btn")) {
        const btn = document.createElement("button");
        btn.className = "zf-del-btn";
        btn.type = "button";
        btn.title = "Remove frame";
        btn.innerHTML = "&times;";
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          deleteItem(el);
        });
        el.appendChild(btn);
      }
    },
    [deleteItem],
  );

  const undecorateItem = useCallback((el: GridItemHTMLElement) => {
    el.querySelector(".zf-cfg-btn")?.remove();
    el.querySelector(".zf-del-btn")?.remove();
  }, []);

  // Builds the GridStack item DOM for an instance and registers its content
  // node + data. Does not render React (caller calls renderInstance).
  // `autoPosition` lets GridStack pick the first free slot (used by click-to-add,
  // where the instance has no meaningful x/y yet).
  const buildItemEl = useCallback(
    (instance: FrameInstance, autoPosition = false): GridItemHTMLElement => {
      const mode = modeRef.current;
      const horizontal = mode === "flow-horizontal";
      // Position in the active mode. flow-horizontal with no stored layout →
      // pos is undefined: auto-position so GridStack packs it into the bands.
      const pos = posFor(instance, mode);
      const w = pos?.w ?? instance.position.w;
      const rawH = pos?.h ?? instance.position.h;
      const h = horizontal ? Math.min(rawH, spec.grid.rows) : rawH;
      const def = registryRef.current.get(instance.frame);
      const layout = def?.layout;
      const el = document.createElement("div") as GridItemHTMLElement;
      el.className = "grid-stack-item";
      el.setAttribute("gs-id", instance.id);
      el.setAttribute("data-frame", instance.frame);
      if (autoPosition || !pos) {
        el.setAttribute("gs-auto-position", "true");
      } else {
        el.setAttribute("gs-x", String(pos.x));
        el.setAttribute("gs-y", String(pos.y));
      }
      el.setAttribute("gs-w", String(w));
      el.setAttribute("gs-h", String(h));
      if (layout?.minW) el.setAttribute("gs-min-w", String(layout.minW));
      if (layout?.minH) el.setAttribute("gs-min-h", String(layout.minH));
      if (layout?.maxW) el.setAttribute("gs-max-w", String(layout.maxW));
      if (layout?.maxH) el.setAttribute("gs-max-h", String(layout.maxH));
      const content = document.createElement("div");
      content.className = "grid-stack-item-content";
      el.appendChild(content);
      // A container frame's content div becomes the nested GridStack itself (see
      // mountSubGrid), so it gets NO React root of its own — registering it would
      // have FrameContent render the group's chrome into the very element
      // GridStack is about to fill with child items. Its children each get their
      // own root instead, exactly like a top-level frame.
      if (!containerGeometry(def, instance.config)) {
        contentRef.current.set(instance.id, content);
      }
      return el;
    },
    [spec.grid.rows],
  );

  // Re-fit a group's inner row height to its CURRENT pixel height. GridStack
  // nested grids need a px cellHeight (its docs are explicit that % doesn't
  // work), so without this the children keep the height they were built with and
  // either overflow or float above the bottom of a resized group.
  const fitSubGrid = useCallback(
    (item: HTMLElement, host: HTMLElement, sub: GridStack) => {
      const rows = Number(host.dataset.subRows) || 2;
      const gap = Number(host.dataset.subGap) || 0;
      // Measured off the ITEM, not the grid host — deliberately. `sub.cellHeight`
      // drives the host's own height, so measuring the host makes this a feedback
      // loop: each fit shrinks the box the next fit measures, converging a few
      // percent short. (That was visible in the browser as dead space under a
      // panel group's last child.) The item's height comes from the BOARD grid
      // and is unaffected by the nested row height, so it's a stable input.
      const cs = getComputedStyle(host);
      const pad =
        (parseFloat(cs.paddingTop) || 0) +
        (parseFloat(cs.paddingBottom) || 0) +
        // The item's own inter-frame gutter, which GridStack applies as margin on
        // the content box rather than as item padding.
        (parseFloat(getComputedStyle(host).marginTop) || 0) +
        (parseFloat(getComputedStyle(host).marginBottom) || 0);
      const h = item.clientHeight - pad;
      // Pre-layout (height 0) there is nothing to fit yet — the ResizeObserver in
      // mountSubGrid calls back once the browser has sized the item.
      if (h <= 0) return;
      sub.cellHeight(subCellPx(h, rows, gap));
    },
    [],
  );

  // Turn a container item into a real nested GridStack and mount its children.
  //
  // `makeSubGrid(el, opts, undefined, false)` is the whole trick: with
  // saveContent=false GridStack calls addGrid on the item's EXISTING content div
  // (rather than wrapping that content as a first child, which is what the
  // default `true` does and is wrong here — the group has no content of its own).
  // It also sets `node.subGrid`, which is how collectSpec reads the children back,
  // and registers the nested grid for cross-grid dragging so a card can be
  // dragged into and out of the group.
  const mountSubGrid = useCallback(
    (
      parent: GridStack,
      el: GridItemHTMLElement,
      instance: FrameInstance,
      geo: ContainerGeometry,
    ) => {
      const host = el.querySelector<HTMLElement>(
        ".grid-stack-item-content",
      ) as HTMLElement | null;
      if (!host) return;
      el.setAttribute("data-container", "true");
      // `grid-stack` goes on FIRST, deliberately: GridStack.addGrid (which
      // makeSubGrid calls) only reuses the element it is handed if that element
      // already carries the class — otherwise it creates its own inner div. With
      // the class here, `sub.el === host`, so the box fitSubGrid measures is the
      // box the children are laid out in. Without it there is a silent extra
      // wrapper and the row height is computed against the wrong height.
      host.classList.add("grid-stack", "zf-group-host");
      // The group's own label. In the read-only renderer it's a flow child above
      // the subgrid; here the subgrid IS the content box, so it rides a ::before
      // fed from this attribute, with the grid inset to match. Same words, same
      // place, without a stray non-item child inside a GridStack container.
      if (instance.title) {
        host.classList.add("zf-group-host--titled");
        host.setAttribute("data-group-title", instance.title);
      }
      // `config.panel` has to be restated here too: the editor never renders the
      // renderer's `.zf-group--panel`, so without this the surrounding surface
      // appeared only after Save + reload — a WYSIWYG break in the one mode whose
      // whole job is to look like the result.
      host.classList.toggle("zf-group-host--panel", geo.panel);
      // Stashed on the element so fitSubGrid (called from resize handlers that
      // have only the DOM) doesn't need to re-resolve the instance's config.
      host.dataset.subRows = String(geo.rows);
      host.dataset.subGap = String(geo.gap);

      const sub = parent.makeSubGrid(
        el,
        {
          column: geo.columns,
          maxRow: geo.rows,
          margin: geo.gap / 2,
          // Same reasoning as the board grid: explicit placements are preserved
          // rather than gravity-packed, so a child stays where it was dropped.
          float: true,
          animate: true,
          acceptWidgets: true,
          disableDrag: !editingRef.current,
          disableResize: !editingRef.current,
        },
        undefined,
        false,
      );
      subGridsRef.current.set(instance.id, sub);

      for (const child of instance.children ?? []) {
        instancesRef.current.set(child.id, child);
        const childEl = document.createElement("div") as GridItemHTMLElement;
        childEl.className = "grid-stack-item";
        childEl.setAttribute("gs-id", child.id);
        childEl.setAttribute("data-frame", child.frame);
        childEl.setAttribute(
          "gs-x",
          String(Math.min(child.position.x, geo.columns - 1)),
        );
        childEl.setAttribute(
          "gs-y",
          String(Math.min(child.position.y, geo.rows - 1)),
        );
        childEl.setAttribute(
          "gs-w",
          String(Math.min(child.position.w, geo.columns)),
        );
        childEl.setAttribute(
          "gs-h",
          String(Math.min(child.position.h, geo.rows)),
        );
        const childContent = document.createElement("div");
        childContent.className = "grid-stack-item-content";
        childEl.appendChild(childContent);
        sub.el.appendChild(childEl);
        sub.makeWidget(childEl);
        contentRef.current.set(child.id, childContent);
        renderInstance(child.id);
        if (editingRef.current) decorateItem(childEl);
      }

      // A drop lands in whichever grid the pointer was over, so the nested grid
      // needs the same new-frame handling the board has — otherwise a palette card
      // dropped into a group becomes a GridStack item with no instance behind it
      // and saves as nothing.
      sub.on("dropped", (_event, _prev, node?: GridStackNode) => {
        const dropped = node?.el as GridItemHTMLElement | undefined;
        if (!dropped) return;
        const content = dropped.querySelector<HTMLElement>(
          ".grid-stack-item-content",
        );
        const frame = dropped.getAttribute("data-frame");
        if (!content || !frame) return;
        const existing = dropped.getAttribute("gs-id");
        // A card dragged in from the board (or another group) already has an
        // instance, a content node and a live React root — GridStack moved the
        // whole item element, so all of that came with it and there is nothing to
        // register. Its new parentage is simply where its DOM now sits.
        if (existing && instancesRef.current.has(existing)) {
          commitHistoryRef.current?.();
          return;
        }
        const def = registryRef.current.get(frame);
        // A group holds frames, not more groups — the spec makes a nested group
        // unrepresentable, so refuse the drop here rather than saving something
        // that won't parse.
        if (def?.container) {
          sub.removeWidget(dropped, true);
          return;
        }
        const id = existing || uniqueId(frame);
        dropped.setAttribute("gs-id", id);
        instancesRef.current.set(id, {
          id,
          frame,
          position: {
            x: node?.x ?? 0,
            y: node?.y ?? 0,
            w: node?.w ?? def?.layout?.w ?? 1,
            h: node?.h ?? def?.layout?.h ?? 1,
          },
          config: defaultConfig(def),
        });
        contentRef.current.set(id, content);
        renderInstance(id);
        decorateItem(dropped);
        commitHistoryRef.current?.();
        setEditingId(id);
      });

      sub.on("dragstop", () => commitHistoryRef.current?.());
      sub.on("resizestop", () => commitHistoryRef.current?.());

      // A ResizeObserver rather than a one-shot rAF: the group's pixel height is
      // not final on the next frame (GridStack animates, fonts settle, the
      // customise toolbar appears and reflows the board), and a fit computed
      // against a half-laid-out box sticks — which showed up in the browser as
      // dead space under a panel group's last child. The observer also covers the
      // cases a resize handler misses: window resize, a density/gap change, and
      // the board's own column reflow.
      // Guarded because jsdom (the test environment) has no ResizeObserver, and
      // the fit is an enhancement over GridStack's own layout rather than a
      // prerequisite for it — one deferred fit is the honest fallback there.
      // Observes the ITEM for the same reason fitSubGrid measures it: the host's
      // height is an output of the fit, so watching it would feed back.
      if (typeof ResizeObserver === "function") {
        const ro = new ResizeObserver(() => fitSubGrid(el, host, sub));
        ro.observe(el);
        subObserversRef.current.set(instance.id, ro);
      } else {
        requestAnimationFrame(() => fitSubGrid(el, host, sub));
      }
    },
    [decorateItem, defaultConfig, fitSubGrid, renderInstance, uniqueId],
  );

  // Build an item, register it with the grid, and — when it's a container — turn
  // it into a nested grid holding its children. The one path every add/restore
  // route goes through, so nesting can't be forgotten in one of them.
  const addItemEl = useCallback(
    (
      grid: GridStack,
      instance: FrameInstance,
      autoPosition = false,
    ): GridItemHTMLElement => {
      const el = buildItemEl(instance, autoPosition);
      grid.el.appendChild(el);
      grid.makeWidget(el);
      const geo = containerGeometry(
        registryRef.current.get(instance.frame),
        instance.config,
      );
      if (geo) mountSubGrid(grid, el, instance, geo);
      return el;
    },
    [buildItemEl, mountSubGrid],
  );

  // Tears down all items + roots and rebuilds the grid from a frame list.
  const restore = useCallback(
    (frames: FrameInstance[]) => {
      const grid = gridInstanceRef.current;
      if (!grid) return;
      rootsRef.current.forEach(unmountRootSoon);
      rootsRef.current.clear();
      contentRef.current.clear();
      // Nested grids are recreated per item below, so the old instances are
      // dropped wholesale — keeping a stale one would leave collectSpec reading a
      // detached grid and saving the pre-undo children.
      for (const ro of subObserversRef.current.values()) ro.disconnect();
      subObserversRef.current.clear();
      subGridsRef.current.clear();
      instancesRef.current = new Map(frames.map((f) => [f.id, f]));

      grid.removeAll(true);
      grid.el
        .querySelectorAll(".grid-stack-item")
        .forEach((node) => node.remove());

      grid.batchUpdate();
      for (const f of frames) {
        // addItemEl also mounts the nested grid + child roots for a container,
        // and registers each child in instancesRef — so an undo restores a
        // group's contents, not just the empty group.
        const el = addItemEl(grid, f);
        renderInstance(f.id);
        // These are brand-new item elements, so the per-item gear + delete have
        // to be re-attached. The `editing` effect that normally decorates won't
        // re-run (its deps didn't change), so a restore mid-customise would
        // otherwise leave every card unconfigurable and undeletable until the
        // mode was toggled — which is exactly what an undo does.
        if (editingRef.current) decorateItem(el);
      }
      grid.batchUpdate(false);
      setCount(frames.length);
    },
    [addItemEl, renderInstance, decorateItem],
  );

  // Click-to-add: append a new frame to the grid in the first free slot.
  // The drag-in path (the `dropped` handler) covers the same job for users who
  // prefer dragging; this is the one-click equivalent.
  const addFrame = useCallback(
    (frameName: string) => {
      const grid = gridInstanceRef.current;
      if (!grid) return;
      const def = registryRef.current.get(frameName);
      const id = uniqueId(frameName);
      const instance: FrameInstance = {
        id,
        frame: frameName,
        position: {
          x: 0,
          y: 0,
          w: def?.layout?.w ?? 4,
          h: def?.layout?.h ?? 3,
        },
        config: defaultConfig(def),
      };
      instancesRef.current.set(id, instance);
      const el = addItemEl(grid, instance, true);
      renderInstance(id);
      decorateItem(el);
      setCount(grid.getGridItems().length);
      commitHistoryRef.current?.();
      // Newly added → open its settings dialog straight away (required-field
      // frames land as error cards until configured, so jump the user there).
      setEditingId(id);
    },
    [addItemEl, decorateItem, defaultConfig, renderInstance, uniqueId],
  );

  // Pixel size of one horizontal band: the height left below the chrome / row
  // count, so the bands fill the viewport. Measured live from the grid wrapper's
  // top offset (header + toolbar above it) rather than its clientHeight — the
  // wrapper is a flex child whose height follows its own content, so reading
  // clientHeight would feed back its current (too-short) size. Reused as the
  // column width too (square-ish cells), since GridStack derives column width
  // from the element's width.
  const horizontalCellPx = useCallback(() => {
    const vh = typeof window !== "undefined" ? window.innerHeight : 800;
    const top =
      gridRef.current?.parentElement?.getBoundingClientRect().top ?? 120;
    const avail = vh - top - 56; // 56 ≈ pinned ticker tape + breathing room
    return Math.max(80, Math.floor(avail / spec.grid.rows));
  }, [spec.grid.rows]);

  // Tear down the live GridStack (listeners, React roots, item DOM, inline
  // sizing) so it can be re-initialised in a different mode. Shared by unmount
  // and switchMode.
  const teardownGrid = useCallback(() => {
    const grid = gridInstanceRef.current;
    if (!grid) return;
    const el = grid.el;
    grid.off("dropped");
    grid.off("removed");
    grid.off("drag");
    grid.off("dragstart");
    grid.off("dragstop");
    document.body.classList.remove("zf-dragging");
    rootsRef.current.forEach(unmountRootSoon);
    rootsRef.current.clear();
    contentRef.current.clear();
    // Nested grids are destroyed along with their parent items by grid.destroy,
    // but the maps pointing at them are ours to clear — a stale entry would have
    // collectSpec read a detached grid after a mode switch.
    for (const ro of subObserversRef.current.values()) ro.disconnect();
    subObserversRef.current.clear();
    subGridsRef.current.clear();
    grid.destroy(false);
    if (el) {
      el.querySelectorAll(".grid-stack-item").forEach((node) => node.remove());
      el.style.width = "";
      el.style.height = "";
    }
    gridInstanceRef.current = null;
  }, []);

  // Initialise GridStack for a layout mode and wire its drop/removal handlers.
  // flow-vertical is the classic column grid; flow-horizontal is the coerced
  // wide, height-bounded, side-scrolling grid — the element is forced wide
  // (cols × cell, square cells) so .zf-editor-grid scrolls it sideways.
  // float:true (both modes) so explicit (seeded/dragged) placements are
  // preserved, not gravity-packed: with float:false the engine compacts upward
  // after every drop, so on a busy board a dropped frame can't sit where you put
  // it and gets yanked to the only free space. The read-only renderer places
  // frames at their explicit x/y too, so honouring gaps keeps customise mode and
  // the live dashboard pixel-consistent. `cols` is the content-fitted column
  // count (ignored vertical).
  const initGrid = useCallback(
    (m: LayoutMode, cols: number): GridStack => {
      const horizontal = m === "flow-horizontal";
      const cell = horizontal ? horizontalCellPx() : rowHeightRef.current;
      const grid = GridStack.init(
        {
          column: horizontal ? cols : columnsRef.current,
          cellHeight: cell,
          margin: spec.grid.gap / 2,
          float: true,
          ...(horizontal
            ? { maxRow: spec.grid.rows, minRow: spec.grid.rows }
            : {}),
          animate: true,
          // The drop accept check is `el.matches('.grid-stack-item')`, so the
          // palette cards carry that class (see the `.zf-newwidget` markup) —
          // else GridStack silently rejects the drag and nothing lands.
          acceptWidgets: true,
          disableDrag: true,
          disableResize: true,
        },
        gridRef.current!,
      )!;
      grid.el.style.width = horizontal ? `${cols * cell}px` : "";

      // A palette card dropped onto the grid lands in the *active* mode, so its
      // position writes to that mode's slot (and seeds the other with a default).
      grid.on("dropped", (_event, _prev, node?: GridStackNode) => {
        const el = node?.el as GridItemHTMLElement | undefined;
        if (!el) return;
        const content = el.querySelector(
          ".grid-stack-item-content",
        ) as HTMLElement | null;
        const frame = el.getAttribute("data-frame");
        if (!content || !frame) return;
        const existing = el.getAttribute("gs-id");
        // A frame dragged OUT of a group and onto the board already has an
        // instance and a React root — it just stopped being someone's child.
        // Re-registering it here would build a second root over the live one.
        if (existing && instancesRef.current.has(existing)) {
          setCount(grid.getGridItems().length);
          commitHistoryRef.current?.();
          return;
        }
        const id = existing || uniqueId(frame);
        el.setAttribute("gs-id", id);
        const def = registryRef.current.get(frame);
        const w = node?.w ?? def?.layout?.w ?? 4;
        const h = node?.h ?? def?.layout?.h ?? 3;
        const dropPos: GridPosition = {
          x: node?.x ?? 0,
          y: node?.y ?? 0,
          w,
          h,
        };
        const instance: FrameInstance =
          modeRef.current === "flow-horizontal"
            ? {
                id,
                frame,
                position: { x: 0, y: 0, w, h },
                layouts: { "flow-horizontal": dropPos },
                config: defaultConfig(def),
              }
            : { id, frame, position: dropPos, config: defaultConfig(def) };
        instancesRef.current.set(id, instance);
        // A group dragged in from the palette becomes a nested grid immediately,
        // so the user can drop frames straight into it — the alternative was an
        // inert box until the board was reloaded.
        const geo = containerGeometry(def, instance.config);
        if (geo) {
          mountSubGrid(grid, el, instance, geo);
        } else {
          contentRef.current.set(id, content);
          renderInstance(id);
        }
        decorateItem(el);
        setCount(grid.getGridItems().length);
        commitHistoryRef.current?.();
        setEditingId(id);
      });

      grid.on("removed", () => setCount(grid.getGridItems().length));

      // Hold the closed-hand cursor for the whole drag. A hover-only rule drops
      // as soon as GridStack slides the pointer off the dragged content box onto
      // the placeholder/grid, so pin `grabbing` on <body> from dragstart→dragstop
      // — covers the placeholder, sibling cards, and any body-appended helper.
      grid.on("dragstart", () => document.body.classList.add("zf-dragging"));
      grid.on("dragstop", () => {
        document.body.classList.remove("zf-dragging");
        // One undo step per completed gesture, not per intermediate position.
        // A drag that ended where it began pushes nothing (pushHistory drops
        // structural no-ops), so ⌘Z never burns a press on a non-change.
        commitHistoryRef.current?.();
      });
      // Resizing a group re-fits its children's row height too, but that is the
      // per-group ResizeObserver's job (mountSubGrid) — it sees the settled box,
      // which this event does not. Nothing to do here but record the gesture.
      grid.on("resizestop", () => commitHistoryRef.current?.());

      if (horizontal) {
        // GridStack has no horizontal drag-scroll — nudge the wrapper when the
        // pointer nears its left/right edge during a drag.
        grid.on("drag", (event: Event) => {
          const scroller = gridRef.current?.parentElement;
          if (!scroller) return;
          const r = scroller.getBoundingClientRect();
          const cx =
            (event as MouseEvent).clientX ??
            (event as TouchEvent).touches?.[0]?.clientX;
          if (cx == null) return;
          const edge = 64;
          if (cx < r.left + edge) scroller.scrollLeft -= 18;
          else if (cx > r.right - edge) scroller.scrollLeft += 18;
        });
      }
      return grid;
    },
    [
      horizontalCellPx,
      spec.grid.rows,
      spec.grid.gap,
      uniqueId,
      defaultConfig,
      renderInstance,
      decorateItem,
      mountSubGrid,
    ],
  );

  // Mount once: init GridStack for the saved mode, render the spec. Horizontal
  // seeds a tidy layout for any frame that doesn't have one yet.
  useEffect(() => {
    if (!gridRef.current || gridReadyRef.current) return;
    gridReadyRef.current = true;
    const horizontal = modeRef.current === "flow-horizontal";
    const cols = horizontal
      ? colsForHorizontal(spec.frames, spec.grid.rows)
      : columnsRef.current;
    gridInstanceRef.current = initGrid(modeRef.current, cols);
    restore(
      horizontal
        ? seedHorizontal(spec.frames, cols, spec.grid.rows)
        : spec.frames,
    );
    return () => {
      teardownGrid();
      gridReadyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enter/leave customise mode: toggle drag+resize and the per-item affordances.
  useEffect(() => {
    const grid = gridInstanceRef.current;
    if (!grid) return;
    // Nested grids get the same treatment as the board: without this a group's
    // children stay locked (or stay draggable) while the board toggles, so a
    // cluster couldn't be rearranged in customise mode at all.
    const grids = [grid, ...subGridsRef.current.values()];
    for (const g of grids) {
      g.enableMove(editing);
      g.enableResize(editing);
      g.getGridItems().forEach(editing ? decorateItem : undecorateItem);
    }
  }, [editing, decorateItem, undecorateItem]);

  // flow-horizontal is height-locked, but the customise toolbar is a row above
  // the grid that shrinks/grows the available height as it appears/disappears.
  // Re-fit the band size live (grid.cellHeight — no re-init, no reload) so the
  // board keeps filling exactly the room left, rather than being pushed past the
  // viewport. Deferred a frame so the toolbar's DOM change is measured first.
  useEffect(() => {
    const grid = gridInstanceRef.current;
    if (!grid || modeRef.current !== "flow-horizontal") return;
    const id = requestAnimationFrame(() => {
      const cell = horizontalCellPx();
      grid.cellHeight(cell);
      grid.el.style.width = `${grid.getColumn() * cell}px`;
    });
    return () => cancelAnimationFrame(id);
  }, [editing, horizontalCellPx]);

  // Register palette cards as GridStack drag sources while customising. The
  // palette only mounts on the Frames tab, and each category's cards only mount
  // while that section is expanded — so re-run when the tab opens or the set of
  // open categories changes, else freshly-mounted cards wouldn't be draggable.
  useEffect(() => {
    if (!editing || railTab !== "frames" || !gridInstanceRef.current) return;
    GridStack.setupDragIn(".zf-newwidget", {
      appendTo: "body",
      helper: (el: HTMLElement) => {
        const card = (el.closest(".zf-newwidget") as HTMLElement) ?? el;
        const frame = card.dataset.frame ?? "";
        const def = registryRef.current.get(frame);
        const layout = def?.layout;
        const helper = document.createElement("div");
        helper.className = "grid-stack-item";
        helper.setAttribute("data-frame", frame);
        helper.setAttribute("gs-w", String(layout?.w ?? 4));
        helper.setAttribute("gs-h", String(layout?.h ?? 3));
        if (layout?.minW) helper.setAttribute("gs-min-w", String(layout.minW));
        if (layout?.minH) helper.setAttribute("gs-min-h", String(layout.minH));
        if (layout?.maxW) helper.setAttribute("gs-max-w", String(layout.maxW));
        if (layout?.maxH) helper.setAttribute("gs-max-h", String(layout.maxH));
        // The helper is appended to <body>, outside .zf-editor, so it can't
        // inherit the accent/font vars — copy the live ones onto it so the drag
        // ghost reads in-theme. (See .zf-drag-ghost in editor.css.)
        const editorEl = gridRef.current?.closest(".zf-editor");
        if (editorEl) {
          const cs = getComputedStyle(editorEl);
          for (const v of [
            "--zf-accent-hue",
            "--zf-accent-sat",
            "--font-dmsans",
          ]) {
            const value = cs.getPropertyValue(v).trim();
            if (value) helper.style.setProperty(v, value);
          }
        }
        // A visible ghost (frame icon + name) so the user can see what they're
        // dragging — not just the empty footprint of the drop placeholder.
        const label = frame.replace(/-/g, " ");
        const icon = def?.iconUrl
          ? `<img class="zf-drag-ghost-icon" src="${def.iconUrl}" alt="" />`
          : "";
        helper.innerHTML = `<div class="grid-stack-item-content zf-drag-ghost" data-frame="${frame}">${icon}<span class="zf-drag-ghost-name">${label}</span></div>`;
        return helper;
      },
    });
  }, [editing, railTab, paletteGroups, expandedCats]);

  const collectSpec = useCallback((): DashboardSpec => {
    const grid = gridInstanceRef.current;
    const frames: FrameInstance[] = [];
    if (grid) {
      for (const el of grid.getGridItems()) {
        const id = el.getAttribute("gs-id");
        if (!id) continue;
        const inst = instancesRef.current.get(id);
        if (!inst) continue;
        const node = el.gridstackNode;
        // Write the live position into the ACTIVE mode's slot, leaving the other
        // mode's layout untouched so each stays independently editable.
        const prev = posFor(inst, mode) ?? inst.position;
        const pos: GridPosition = {
          x: node?.x ?? prev.x,
          y: node?.y ?? prev.y,
          w: node?.w ?? prev.w,
          h: node?.h ?? prev.h,
        };
        // A container's children come from its live nested grid, so a child
        // dragged/resized inside the group is saved from the same source of truth
        // as a board-level move. `node.subGrid` is set by makeSubGrid; a group
        // whose subgrid somehow never mounted keeps whatever it loaded with
        // rather than silently saving as empty.
        const sub = node?.subGrid ?? subGridsRef.current.get(id);
        const children = sub
          ? sub
              .getGridItems()
              .map((childEl): ChildFrameInstance | null => {
                const childId = childEl.getAttribute("gs-id");
                const childInst = childId
                  ? instancesRef.current.get(childId)
                  : undefined;
                if (!childInst) return null;
                const cn = childEl.gridstackNode;
                // Built field by field rather than spread, because a child carries
                // neither `layouts` nor `children` — a group holds one arrangement
                // for every board mode, and groups don't nest — and a frame
                // dragged in from the board arrives still carrying its `layouts`.
                // Spreading would smuggle that into the saved child (where the
                // schema strips it on the next read, so the junk would be
                // invisible until someone diffed the file).
                return {
                  id: childInst.id,
                  frame: childInst.frame,
                  config: childInst.config,
                  ...(childInst.title !== undefined
                    ? { title: childInst.title }
                    : {}),
                  ...(childInst.style !== undefined
                    ? { style: childInst.style }
                    : {}),
                  ...(childInst.currency !== undefined
                    ? { currency: childInst.currency }
                    : {}),
                  ...(childInst.events !== undefined
                    ? { events: childInst.events }
                    : {}),
                  position: {
                    x: cn?.x ?? childInst.position.x,
                    y: cn?.y ?? childInst.position.y,
                    w: cn?.w ?? childInst.position.w,
                    h: cn?.h ?? childInst.position.h,
                  },
                };
              })
              .filter((c): c is NonNullable<typeof c> => c !== null)
              // Same reason the board sorts: keep the written JSON diff-friendly.
              .sort(
                (a, b) =>
                  a.position.y - b.position.y || a.position.x - b.position.x,
              )
          : inst.children;
        // `undefined` rather than `[]` for an empty group: the two mean the same
        // thing to the schema, and JSON.stringify omits the key entirely, so the
        // written file stays the short one a human reads. Set explicitly (not by
        // omission) because `inst` may itself carry a stale `children` — an
        // emptied group would otherwise save the array it loaded with.
        const nextChildren =
          children && children.length > 0 ? children : undefined;
        frames.push(
          mode === "flow-horizontal"
            ? {
                ...inst,
                children: nextChildren,
                layouts: { ...inst.layouts, "flow-horizontal": pos },
              }
            : { ...inst, children: nextChildren, position: pos },
        );
      }
    }
    // Reading order keeps the written file diff-friendly (by the vertical layout).
    frames.sort(
      (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
    );
    return {
      ...spec,
      grid: { ...spec.grid, gap, paddingX, mode, columns, rowHeight },
      background: {
        ...spec.background,
        type: bgType,
        projectId: bgProjectId,
        opacity: bgOpacity,
        color: bgColor,
        gradientFrom: bgGradFrom,
        gradientTo: bgGradTo,
        gradientAngle: bgGradAngle,
        imageUrl: bgImageUrl || undefined,
        imageFit: bgImageFit,
        imageBlur: bgImageBlur,
        overlayOpacity: bgOverlayOpacity,
      },
      theme: {
        ...spec.theme,
        accentHue,
        accentSat,
        baseHue,
        baseSat,
        upColor,
        downColor,
        surface,
      },
      typography: {
        ...spec.typography,
        fontFamily,
        numericStyle,
        scale: fontScale,
      },
      appearance: {
        ...spec.appearance,
        radius,
        borderStrength,
        surfaceOpacity,
        density,
        elevation,
      },
      currency: { ...spec.currency, code: currencyCode },
      frames,
    };
  }, [
    spec,
    currencyCode,
    accentHue,
    accentSat,
    baseHue,
    baseSat,
    upColor,
    downColor,
    surface,
    fontFamily,
    numericStyle,
    fontScale,
    gap,
    paddingX,
    mode,
    columns,
    rowHeight,
    radius,
    borderStrength,
    surfaceOpacity,
    density,
    elevation,
    bgType,
    bgProjectId,
    bgOpacity,
    bgColor,
    bgGradFrom,
    bgGradTo,
    bgGradAngle,
    bgImageUrl,
    bgImageFit,
    bgImageBlur,
    bgOverlayOpacity,
  ]);

  const download = useCallback((next: DashboardSpec) => {
    const blob = new Blob([`${JSON.stringify(next, null, 2)}\n`], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "dashboard.json";
    a.click();
    // Defer revoke so the click's download isn't cancelled in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }, []);

  const startCustomise = useCallback(() => {
    // The session baseline. Everything else — undo's floor, Cancel's target, the
    // dirty flag — is derived from this one entry.
    historyRef.current = initHistory(collectSpec());
    publishHistory();
    setSaveError(null);
    setEditing(true);
  }, [collectSpec, publishHistory]);

  // Reclaim empty space in the ACTIVE grid (float:true otherwise preserves gaps).
  // Mode-aware: the vertical column grid reflows top-left to fill any hole
  // ('compact'); the horizontal side-scroller closes gaps while keeping its
  // deliberate left->right order ('list'), so a curated arrangement isn't
  // reshuffled. collectSpec reads positions live off gridstackNode, so the
  // tidied layout round-trips through Save with no extra bookkeeping.
  const tidy = useCallback(() => {
    // Tidy reflows every card at once — the single most disruptive thing in the
    // toolbar — so it must be one ⌘Z away.
    queueMicrotask(() => commitHistoryRef.current?.());
    gridInstanceRef.current?.compact(
      modeRef.current === "flow-horizontal" ? "list" : "compact",
    );
  }, []);

  // Persist the CURRENT mode's GridStack positions back into instancesRef before
  // a mode switch, so the arrangement you just made isn't lost on re-init.
  const captureLayout = useCallback(() => {
    const grid = gridInstanceRef.current;
    if (!grid) return;
    const m = modeRef.current;
    for (const el of grid.getGridItems()) {
      const id = el.getAttribute("gs-id");
      if (!id) continue;
      const inst = instancesRef.current.get(id);
      if (!inst) continue;
      const node = el.gridstackNode;
      if (!node) continue;
      const pos: GridPosition = {
        x: node.x ?? 0,
        y: node.y ?? 0,
        w: node.w ?? 1,
        h: node.h ?? 1,
      };
      instancesRef.current.set(
        id,
        m === "flow-horizontal"
          ? { ...inst, layouts: { ...inst.layouts, "flow-horizontal": pos } }
          : { ...inst, position: pos },
      );
    }
  }, []);

  /**
   * Tear the grid down and rebuild it for `nextMode` from an explicit frame list.
   *
   * The two modes are different GridStack configs (vertical column grid vs the
   * coerced wide side-scroller) with independent per-frame positions, so they
   * can't morph — crossing between them means a re-init. Extracted from
   * `switchMode` because `applySpec` needs exactly the same rebuild when an undo
   * lands on a snapshot from the *other* mode; taking the frames as an argument
   * is what lets applySpec pass the snapshot's list rather than the live one.
   */
  const rebuildGrid = useCallback(
    (nextMode: LayoutMode, frames: FrameInstance[]) => {
      const wasEditing = editingRef.current;
      const horizontal = nextMode === "flow-horizontal";
      const cols = horizontal
        ? colsForHorizontal(frames, spec.grid.rows)
        : columnsRef.current;
      teardownGrid();
      modeRef.current = nextMode;
      setMode(nextMode);
      const grid = initGrid(nextMode, cols);
      gridInstanceRef.current = grid;
      restore(
        horizontal ? seedHorizontal(frames, cols, spec.grid.rows) : frames,
      );
      if (wasEditing) {
        grid.enableMove(true);
        grid.enableResize(true);
        grid.getGridItems().forEach(decorateItem);
      }
    },
    [teardownGrid, initGrid, restore, decorateItem, spec.grid.rows],
  );

  // Swap the layout mode behind a brief blur+fade, so the structural reflow is
  // invisible. Reduced-motion users get the instant swap.
  const switchMode = useCallback(
    (next: LayoutMode) => {
      if (next === modeRef.current) return;
      const swap = () => {
        captureLayout();
        rebuildGrid(next, [...instancesRef.current.values()]);
      };
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      if (reduce) {
        swap();
        return;
      }
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
      setSwitching(true); // blur/fade out
      switchTimerRef.current = setTimeout(() => {
        swap(); // re-init + restore while invisible
        requestAnimationFrame(() => setSwitching(false)); // dissolve back in
      }, 150);
    },
    [captureLayout, rebuildGrid],
  );

  useEffect(
    () => () => {
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
    },
    [],
  );

  /**
   * Write a whole snapshot back over the live editor — the inverse of
   * `collectSpec()`, and the single mechanism behind undo, redo and Cancel.
   *
   * Every cosmetic setter runs unconditionally (they're cheap React state), but
   * the grid is only rebuilt when it has to be: `restore()` unmounts and
   * recreates EVERY frame's React root, re-subscribing its WS/poll hooks and
   * replaying first render, which is a visible hitch on a large board. So a
   * pure-cosmetic undo touches no roots at all.
   */
  const applySpec = useCallback(
    (next: DashboardSpec) => {
      // Suppress the debounced cosmetics watcher for longer than its own window,
      // so writing this snapshot back can't be mistaken for a fresh edit. Without
      // it, any tiny non-round-trip between collectSpec and applySpec (a frame
      // re-sort, an omitted-vs-undefined key) would push a new entry and silently
      // truncate the redo tail.
      suppressCommitUntilRef.current = Date.now() + COMMIT_DEBOUNCE_MS + 200;

      setAccentHue(next.theme.accentHue);
      setAccentSat(next.theme.accentSat);
      setBaseHue(next.theme.baseHue);
      setBaseSat(next.theme.baseSat);
      setUpColor(next.theme.upColor);
      setDownColor(next.theme.downColor);
      setSurface(next.theme.surface);
      setGap(next.grid.gap);
      setPaddingX(next.grid.paddingX);
      setColumns(next.grid.columns);
      setRowHeight(next.grid.rowHeight);
      setRadius(next.appearance.radius);
      setBorderStrength(next.appearance.borderStrength);
      setSurfaceOpacity(next.appearance.surfaceOpacity);
      setDensity(next.appearance.density);
      setElevation(next.appearance.elevation);
      setFontFamily(next.typography.fontFamily);
      setNumericStyle(next.typography.numericStyle);
      setFontScale(next.typography.scale);
      setBgType(next.background.type);
      setBgProjectId(
        next.background.projectId ?? BACKGROUND_SCENES[0].projectId,
      );
      setBgOpacity(next.background.opacity);
      setBgColor(next.background.color);
      setBgGradFrom(next.background.gradientFrom);
      setBgGradTo(next.background.gradientTo);
      setBgGradAngle(next.background.gradientAngle);
      setBgImageUrl(next.background.imageUrl ?? "");
      setBgImageFit(next.background.imageFit);
      setBgImageBlur(next.background.imageBlur);
      setBgOverlayOpacity(next.background.overlayOpacity);
      setCurrencyCode(next.currency.code);

      // A snapshot from the other layout mode can't be morphed into — the two are
      // separate GridStack configs — so crossing modes always means a rebuild.
      if (next.grid.mode !== modeRef.current) {
        rebuildGrid(next.grid.mode, next.frames);
      } else if (
        JSON.stringify(collectSpec().frames) !== JSON.stringify(next.frames)
      ) {
        restore(next.frames);
      }

      // The open dialog may belong to a frame this snapshot doesn't have (undoing
      // an add, redoing a delete) — close it rather than leaving it configuring a
      // frame that no longer exists.
      const openId = editingIdRef.current;
      if (openId && !next.frames.some((f) => f.id === openId)) {
        setEditingId(null);
      }
    },
    [collectSpec, rebuildGrid, restore],
  );

  const undo = useCallback(() => {
    const step = undoHistory(historyRef.current);
    if (!step) return;
    historyRef.current = step.history;
    applySpec(step.snapshot);
    publishHistory();
  }, [applySpec, publishHistory]);

  const redo = useCallback(() => {
    const step = redoHistory(historyRef.current);
    if (!step) return;
    historyRef.current = step.history;
    applySpec(step.snapshot);
    publishHistory();
  }, [applySpec, publishHistory]);

  const cancel = useCallback(() => {
    applySpec(baselineOf(historyRef.current));
    historyRef.current = initHistory(baselineOf(historyRef.current));
    publishHistory();
    setSaveError(null);
    setEditingId(null);
    setEditing(false);
  }, [applySpec, publishHistory]);

  /**
   * Persist the edited spec.
   *
   * Leaving customise mode is deferred until `onSave` actually resolves: the host
   * writes `dashboard.json` over HTTP, and reporting success before that lands
   * meant a failed write was indistinguishable from a successful one — the user
   * walked away believing the board was saved. A rejection now keeps you in
   * customise mode with your work intact and the reason on screen.
   */
  const save = useCallback(async () => {
    const next = collectSpec();
    if (!onSave) {
      download(next);
      historyRef.current = initHistory(next);
      publishHistory();
      setEditing(false);
      setEditingId(null);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(next);
      // The saved state is the new clean baseline, so re-opening customise mode
      // doesn't offer to revert to a state that's already on disk.
      historyRef.current = initHistory(next);
      publishHistory();
      setEditing(false);
      setEditingId(null);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Could not save the dashboard.",
      );
    } finally {
      setSaving(false);
    }
  }, [collectSpec, onSave, download, publishHistory]);

  /**
   * Record the current state as a history entry.
   *
   * Deliberately coarse: callers signal "a gesture just ended" (a card was
   * dropped, a dialog closed, a drag stopped) without knowing whether anything
   * actually changed. `pushHistory` drops no-op pushes structurally, so an
   * over-eager call site costs nothing and ⌘Z always produces one visible change.
   */
  const commitHistory = useCallback(() => {
    if (!editingRef.current) return;
    if (Date.now() < suppressCommitUntilRef.current) return;
    historyRef.current = pushHistory(historyRef.current, collectSpec());
    publishHistory();
  }, [collectSpec, publishHistory]);
  commitHistoryRef.current = commitHistory;

  /**
   * Record cosmetic changes on a trailing debounce.
   *
   * `collectSpec`'s identity changes exactly when any cosmetic state does (they
   * are all its dependencies), so depending on it here is a precise "some
   * cosmetic moved" signal without wiring a commit into all ~35 rail controls.
   * The trailing window is what collapses a continuous slider drag into a single
   * undo step instead of one per pixel.
   */
  useEffect(() => {
    if (!editing) return;
    const t = setTimeout(
      () => commitHistoryRef.current?.(),
      COMMIT_DEBOUNCE_MS,
    );
    return () => clearTimeout(t);
  }, [collectSpec, editing]);

  /** The undo toast is a time-limited offer, and it's scoped to customise mode —
   *  a stale "Undo" after leaving would rewind an edit the user has moved on
   *  from. Keyed on the removed id so each delete restarts the countdown. */
  useEffect(() => {
    if (!removed) return;
    if (!editing) {
      setRemoved(null);
      return;
    }
    const t = setTimeout(() => setRemoved(null), UNDO_TOAST_MS);
    return () => clearTimeout(t);
  }, [removed, editing]);

  /**
   * Push grid geometry into the live GridStack.
   *
   * `column()` and `cellHeight()` both reflow in place, so changing the board's
   * shape costs no teardown — the alternative (re-initialising the grid) would
   * unmount and remount every frame's React root, re-subscribing all their
   * WS/poll hooks, on each step of a slider.
   *
   * flow-horizontal is excluded on purpose: there the column count is derived
   * from the frames and the cell height from the viewport, so both are computed,
   * not chosen.
   */
  useEffect(() => {
    const grid = gridInstanceRef.current;
    if (!grid || modeRef.current === "flow-horizontal") return;
    if (grid.getColumn() !== columns) grid.column(columns);
    grid.cellHeight(rowHeight);
  }, [columns, rowHeight]);

  /**
   * Customise-mode keyboard shortcuts: ⌘Z / ⌘⇧Z to undo/redo, ⌘S to save
   * (Ctrl on Windows/Linux).
   *
   * ⌘Z is skipped while focus is in a text field so it keeps its native
   * text-editing meaning; ⌘S is not, because the browser's own ⌘S (save this
   * page) is never what someone editing a dashboard wants.
   */
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const key = e.key.toLowerCase();

      if (key === "s") {
        e.preventDefault();
        if (!saving) void save();
        return;
      }
      if (key !== "z") return;

      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editing, undo, redo, save, saving]);

  const renderCustomiseButton = () => (
    <button
      type="button"
      className="zf-btn zf-btn--customise"
      onClick={startCustomise}
      aria-label="Customise"
      title="Customise"
    >
      <SlidersHorizontal size={18} aria-hidden="true" />
      <span>Customize</span>
    </button>
  );

  // The frame whose settings dialog is open, if any. Read from the live ref —
  // the dialog keys off its id and owns its own draft, so a stale object here is
  // harmless.
  const editingInstance =
    editing && editingId ? instancesRef.current.get(editingId) : undefined;

  // flow-horizontal is now a live GridStack (drag-editable), so it no longer
  // needs a read-only preview — the same grid renders and edits both modes.
  // data-mode drives the horizontal scroll wrapper in editor.css.
  const isHorizontal = mode === "flow-horizontal";

  return (
    // Same display-currency wrapper the renderer applies, so a board looks
    // identical in customise mode and when served.
    <DashboardCurrencyProvider code={currencyCode}>
      <style>{FRAME_CSS}</style>
      {customiseButtonTarget && !editing
        ? createPortal(renderCustomiseButton(), customiseButtonTarget)
        : null}
      <div
        className={editing ? "zf-editor zf-customise" : "zf-editor"}
        data-mode={mode}
        // Surface mode ("dark"|"light") — drives the light page fill on the grid
        // area (editor.css) alongside the four --zf-*-l vars below.
        data-surface={surface}
        // Past ~12 frames the per-item jiggle promotes that many compositing
        // layers and repaints them continuously through customise mode; drop the
        // animation (a pure affordance) on big boards. The dashed outline + grab
        // cursor still signal editability.
        data-wiggle={editing && count > 12 ? "off" : undefined}
        style={{
          // Colour identity — accent drives every accent in FRAME_CSS; base
          // tints the dark card surface itself.
          ["--zf-accent-hue" as string]: accentHue,
          ["--zf-accent-sat" as string]: `${accentSat}%`,
          ["--zf-base-hue" as string]: baseHue,
          ["--zf-base-sat" as string]: `${baseSat}%`,
          // Surface mode — shared helper (same source the renderer uses, so the
          // customise preview never drifts from the served runtime). FRAME_CSS
          // reads these four lightness vars to flip ink + card surface.
          ...surfaceModeVars(surface),
          // Semantic gain/loss colours — frames' UP_COLOR/DOWN_COLOR resolve these.
          ["--zf-up" as string]: upColor,
          ["--zf-down" as string]: downColor,
          // Typography — family routes through --font-dmsans, numeric sets digit
          // spacing; both cascade into every card via FRAME_CSS.
          ["--zf-font-family" as string]: FONT_FAMILY_STACKS[fontFamily],
          ["--zf-numeric" as string]: NUMERIC_VARIANTS[numericStyle],
          // Card surface treatment — each cascades into every card via FRAME_CSS.
          ["--zf-frame-radius" as string]: `${radius}px`,
          ["--zf-border-alpha" as string]: borderStrength,
          ["--zf-surface-opacity" as string]: surfaceOpacity,
          ["--zf-density" as string]: density,
          ["--zf-elevation" as string]: elevation,
          // Grid geometry — horizontal board inset; pads .zf-editor-grid so the
          // GridStack element (positioned in % of its own width) reflows live.
          ["--zf-pad-x" as string]: `${paddingX}px`,
        }}
      >
        {(editing || !customiseButtonTarget) && (
          <div className="zf-editor-bar">
            {/* Unsaved-changes state, stated rather than implied. Sits at the far
                left so it reads before the actions it applies to. */}
            {editing && (
              <p className="zf-editor-state" aria-live="polite">
                {saving ? (
                  "Saving…"
                ) : historyState.dirty ? (
                  <>
                    <span className="zf-dirty-dot" aria-hidden="true" />
                    Unsaved changes
                  </>
                ) : (
                  "No changes"
                )}
              </p>
            )}
            <div className="zf-editor-bar-spacer" />
            {!editing ? (
              renderCustomiseButton()
            ) : (
              <>
                {/* A rejected save must not read like a successful one. */}
                {saveError && (
                  <p className="zf-editor-error" role="alert">
                    {saveError}
                  </p>
                )}
                <button
                  type="button"
                  className="zf-btn zf-btn--icon"
                  onClick={undo}
                  disabled={!historyState.undo || saving}
                  aria-label="Undo"
                  title="Undo (⌘Z)"
                >
                  <Undo2 size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="zf-btn zf-btn--icon"
                  onClick={redo}
                  disabled={!historyState.redo || saving}
                  aria-label="Redo"
                  title="Redo (⌘⇧Z)"
                >
                  <Redo2 size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="zf-btn zf-btn--ghost"
                  onClick={tidy}
                  disabled={saving}
                  title="Reclaim empty grid space"
                >
                  Tidy
                </button>
                <button
                  type="button"
                  className="zf-btn zf-btn--ghost"
                  onClick={cancel}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="zf-btn zf-btn--primary"
                  // `save` settles its own rejection into `saveError`, so nothing
                  // is left floating — discard the promise explicitly.
                  onClick={() => void save()}
                  disabled={saving}
                  // With no host to persist to, this button downloads a file.
                  // Saying so is the difference between a deliberate export and
                  // a save the user thinks went somewhere.
                  title={
                    onSave
                      ? "Save the dashboard"
                      : "Download dashboard.json (no host to save to)"
                  }
                >
                  {saving ? "Saving…" : onSave ? "Save" : "Download"}
                </button>
              </>
            )}
          </div>
        )}

        {/* Deleting a card takes its config, tickers, events and style overrides
            with it — none of which a re-add restores. The toast makes that
            recoverable in one click, for the case where ⌘Z isn't reached for. */}
        {editing && removed && (
          <div className="zf-toast" role="status">
            {/* Verb first, name quoted. "{label} removed" reads as a quantifier
                when the card is titled something like "All frames" — the board
                this was first tried on produced "All frames removed". */}
            <span className="zf-toast-text">
              Removed &ldquo;{removed.label}&rdquo;
            </span>
            <button
              type="button"
              className="zf-toast-action"
              // Distinct from the toolbar's Undo, which is on screen at the same
              // time — two controls both announcing "Undo" is ambiguous by voice
              // even though the visible label is unmistakable in context.
              aria-label={`Undo removing ${removed.label}`}
              onClick={() => {
                setRemoved(null);
                undo();
              }}
            >
              Undo
            </button>
            <button
              type="button"
              className="zf-toast-close"
              onClick={() => setRemoved(null)}
              aria-label="Dismiss"
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}

        <div className="zf-editor-main">
          <div className="zf-editor-grid" data-switching={switching}>
            <div ref={gridRef} className="grid-stack" />
            {/* A board with no frames rendered as a blank page with no
                explanation and no way forward — the one state where the user
                most needs telling what to do next. */}
            {count === 0 && (
              <div className="zf-board-empty">
                <p className="zf-board-empty-title">This board is empty</p>
                {editing ? (
                  <p className="zf-board-empty-note">
                    Pick a frame from the{" "}
                    <button
                      type="button"
                      className="zf-board-empty-link"
                      onClick={() => setRailTab("frames")}
                    >
                      Frames
                    </button>{" "}
                    panel — click to drop it in, or drag it onto the grid.
                  </p>
                ) : (
                  <p className="zf-board-empty-note">
                    Open Customise to add your first frame.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* The rail stays mounted so its width reveal animates *both* ways —
              the grid (flex:1) reflows to follow it. `inert` keeps the collapsed
              rail unfocusable and unclickable while it's clipped to zero width. */}
          <aside className="zf-rail" aria-hidden={!editing} inert={!editing}>
            <div className="zf-rail-inner">
              <div
                className="zf-rail-tabs"
                role="tablist"
                aria-label="Customise"
              >
                {/* Complete tab semantics: each tab owns its panel via
                    aria-controls, only the selected tab is in the tab order
                    (tabIndex -1 on the other), and Left/Right move between them
                    — the pattern role="tab" already promised. */}
                {(["frames", "cosmetics"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    id={`zf-rail-tab-${tab}`}
                    aria-selected={railTab === tab}
                    aria-controls={`zf-rail-panel-${tab}`}
                    tabIndex={railTab === tab ? 0 : -1}
                    className={
                      railTab === tab ? "zf-rail-tab is-active" : "zf-rail-tab"
                    }
                    onClick={() => setRailTab(tab)}
                    onKeyDown={(e) => {
                      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight")
                        return;
                      e.preventDefault();
                      const next = tab === "frames" ? "cosmetics" : "frames";
                      setRailTab(next);
                      document.getElementById(`zf-rail-tab-${next}`)?.focus();
                    }}
                  >
                    {tab === "frames" ? "Frames" : "Cosmetics"}
                  </button>
                ))}
              </div>

              {railTab === "cosmetics" && (
                <div
                  role="tabpanel"
                  id="zf-rail-panel-cosmetics"
                  aria-labelledby="zf-rail-tab-cosmetics"
                >
                  {/* Same affordance the frame palette already offers. With ~35
                      controls behind nine headers, a header list alone still
                      means knowing which family owns "elevation". */}
                  <div className="zf-palette-search">
                    <Search
                      size={13}
                      className="zf-palette-search-icon"
                      aria-hidden="true"
                    />
                    <input
                      className="zf-palette-search-input"
                      type="search"
                      value={cosmeticQuery}
                      placeholder="Search settings…"
                      aria-label="Search settings"
                      spellCheck={false}
                      onChange={(e) => setCosmeticQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape" && cosmeticQuery) {
                          e.stopPropagation();
                          setCosmeticQuery("");
                        }
                      }}
                    />
                  </div>
                  {cosmeticMatches?.size === 0 && (
                    <p className="zf-palette-empty">
                      No settings match &ldquo;{cosmeticQuery.trim()}&rdquo;.
                    </p>
                  )}
                  {sectionVisible("presets") && (
                    <RailSection
                      label="Presets"
                      open={sectionOpen("presets")}
                      onToggle={() => toggleSection("presets")}
                    >
                      <div className="zf-presets">
                        {THEME_PRESETS.map((p) => (
                          <button
                            key={p.key}
                            type="button"
                            className={
                              activePresetKey === p.key
                                ? "zf-preset is-active"
                                : "zf-preset"
                            }
                            title={p.description}
                            aria-pressed={activePresetKey === p.key}
                            onClick={() => applyPreset(p)}
                          >
                            <span
                              className="zf-preset-swatch"
                              style={{
                                background: `linear-gradient(135deg, hsl(${p.theme.baseHue} ${p.theme.baseSat}% 16%) 0 52%, hsl(${p.theme.accentHue} ${p.theme.accentSat}% 62%) 52% 100%)`,
                              }}
                            />
                            <span className="zf-preset-label">{p.label}</span>
                          </button>
                        ))}
                      </div>
                    </RailSection>
                  )}

                  {sectionVisible("mode") && (
                    <RailSection
                      label="Mode"
                      open={sectionOpen("mode")}
                      onToggle={() => toggleSection("mode")}
                    >
                      <div
                        className="zf-seg"
                        role="group"
                        aria-label="Surface mode"
                        style={{ marginTop: 10 }}
                      >
                        {(["dark", "light"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            className={
                              surface === s
                                ? "zf-seg-btn is-active"
                                : "zf-seg-btn"
                            }
                            aria-pressed={surface === s}
                            onClick={() => setSurface(s)}
                          >
                            {s === "dark" ? "Dark" : "Light"}
                          </button>
                        ))}
                      </div>
                    </RailSection>
                  )}

                  {sectionVisible("accent") && (
                    <RailSection
                      label="Accent"
                      open={sectionOpen("accent")}
                      onToggle={() => toggleSection("accent")}
                    >
                      <div
                        className="zf-theme-row"
                        style={{ margin: "10px 0 0" }}
                      >
                        <span className="zf-theme-val">
                          <span className="zf-theme-swatch" />
                          Hue {accentHue}°
                        </span>
                        {accentHue !== SPEC_DEFAULTS.theme.accentHue && (
                          <button
                            type="button"
                            className="zf-theme-reset"
                            onClick={() =>
                              setAccentHue(SPEC_DEFAULTS.theme.accentHue)
                            }
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      <input
                        type="range"
                        className="zf-hue-slider"
                        min={0}
                        max={360}
                        value={accentHue}
                        aria-label="Accent hue"
                        onChange={(e) => setAccentHue(Number(e.target.value))}
                      />
                      <div className="zf-theme-row" style={{ marginTop: 13 }}>
                        <span className="zf-theme-val">Saturation</span>
                        <span className="zf-theme-knob-end">
                          {accentSat !== SPEC_DEFAULTS.theme.accentSat && (
                            <button
                              type="button"
                              className="zf-theme-reset"
                              onClick={() =>
                                setAccentSat(SPEC_DEFAULTS.theme.accentSat)
                              }
                            >
                              Reset
                            </button>
                          )}
                          <span className="zf-theme-val">{accentSat}%</span>
                        </span>
                      </div>
                      <input
                        type="range"
                        className="zf-range"
                        min={0}
                        max={100}
                        value={accentSat}
                        aria-label="Accent saturation"
                        onChange={(e) => setAccentSat(Number(e.target.value))}
                      />
                    </RailSection>
                  )}

                  {sectionVisible("surface") && (
                    <RailSection
                      label="Surface"
                      open={sectionOpen("surface")}
                      onToggle={() => toggleSection("surface")}
                    >
                      <div
                        className="zf-theme-row"
                        style={{ margin: "10px 0 0" }}
                      >
                        <span className="zf-theme-val">
                          <span
                            className="zf-theme-swatch"
                            style={{
                              background: `hsl(${baseHue} ${baseSat}% 32%)`,
                              boxShadow: "none",
                            }}
                          />
                          Tint {baseHue}°
                        </span>
                        {baseHue !== SPEC_DEFAULTS.theme.baseHue && (
                          <button
                            type="button"
                            className="zf-theme-reset"
                            onClick={() =>
                              setBaseHue(SPEC_DEFAULTS.theme.baseHue)
                            }
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      <input
                        type="range"
                        className="zf-hue-slider"
                        min={0}
                        max={360}
                        value={baseHue}
                        aria-label="Surface tint hue"
                        onChange={(e) => setBaseHue(Number(e.target.value))}
                      />
                      <div className="zf-theme-row" style={{ marginTop: 13 }}>
                        <span className="zf-theme-val">Tint strength</span>
                        <span className="zf-theme-knob-end">
                          {baseSat !== SPEC_DEFAULTS.theme.baseSat && (
                            <button
                              type="button"
                              className="zf-theme-reset"
                              onClick={() =>
                                setBaseSat(SPEC_DEFAULTS.theme.baseSat)
                              }
                            >
                              Reset
                            </button>
                          )}
                          <span className="zf-theme-val">{baseSat}%</span>
                        </span>
                      </div>
                      <input
                        type="range"
                        className="zf-range"
                        min={0}
                        max={100}
                        value={baseSat}
                        aria-label="Surface tint strength"
                        onChange={(e) => setBaseSat(Number(e.target.value))}
                      />
                    </RailSection>
                  )}

                  {sectionVisible("updown") && (
                    <RailSection
                      label="Gain / Loss"
                      open={sectionOpen("updown")}
                      onToggle={() => toggleSection("updown")}
                    >
                      <div
                        className="zf-theme-row"
                        style={{ margin: "10px 0 0" }}
                      >
                        <label className="zf-theme-val">
                          <input
                            type="color"
                            className="zf-color"
                            value={upColor}
                            aria-label="Gain (up) colour"
                            onChange={(e) => setUpColor(e.target.value)}
                          />
                          Up {upColor}
                        </label>
                        {upColor.toLowerCase() !==
                          SPEC_DEFAULTS.theme.upColor && (
                          <button
                            type="button"
                            className="zf-theme-reset"
                            onClick={() =>
                              setUpColor(SPEC_DEFAULTS.theme.upColor)
                            }
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      <div className="zf-theme-row" style={{ marginTop: 9 }}>
                        <label className="zf-theme-val">
                          <input
                            type="color"
                            className="zf-color"
                            value={downColor}
                            aria-label="Loss (down) colour"
                            onChange={(e) => setDownColor(e.target.value)}
                          />
                          Down {downColor}
                        </label>
                        {downColor.toLowerCase() !==
                          SPEC_DEFAULTS.theme.downColor && (
                          <button
                            type="button"
                            className="zf-theme-reset"
                            onClick={() =>
                              setDownColor(SPEC_DEFAULTS.theme.downColor)
                            }
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    </RailSection>
                  )}

                  {sectionVisible("background") && (
                    <RailSection
                      label="Background"
                      open={sectionOpen("background")}
                      onToggle={() => toggleSection("background")}
                    >
                      <div
                        className="zf-bg-seg"
                        role="group"
                        aria-label="Background style"
                      >
                        {(
                          [
                            "none",
                            "color",
                            "gradient",
                            "unicorn",
                            "image",
                          ] as const
                        ).map((t) => (
                          <button
                            key={t}
                            type="button"
                            className={
                              bgType === t
                                ? "zf-seg-btn is-active"
                                : "zf-seg-btn"
                            }
                            aria-pressed={bgType === t}
                            onClick={() => setBgType(t)}
                          >
                            {t === "none"
                              ? "Glow"
                              : t === "color"
                                ? "Color"
                                : t === "gradient"
                                  ? "Gradient"
                                  : t === "unicorn"
                                    ? "Scene"
                                    : "Image"}
                          </button>
                        ))}
                      </div>
                      {bgType === "color" && (
                        <div className="zf-theme-row" style={{ marginTop: 12 }}>
                          <label className="zf-theme-val">
                            <input
                              type="color"
                              className="zf-color"
                              value={bgColor}
                              aria-label="Background colour"
                              onChange={(e) => setBgColor(e.target.value)}
                            />
                            {bgColor}
                          </label>
                          {bgColor.toLowerCase() !==
                            SPEC_DEFAULTS.background.color && (
                            <button
                              type="button"
                              className="zf-theme-reset"
                              onClick={() =>
                                setBgColor(SPEC_DEFAULTS.background.color)
                              }
                            >
                              Reset
                            </button>
                          )}
                        </div>
                      )}
                      {bgType === "gradient" && (
                        <>
                          <div
                            className="zf-theme-row"
                            style={{ marginTop: 12 }}
                          >
                            <label className="zf-theme-val">
                              <input
                                type="color"
                                className="zf-color"
                                value={bgGradFrom}
                                aria-label="Gradient start colour"
                                onChange={(e) => setBgGradFrom(e.target.value)}
                              />
                              From {bgGradFrom}
                            </label>
                          </div>
                          <div
                            className="zf-theme-row"
                            style={{ marginTop: 9 }}
                          >
                            <label className="zf-theme-val">
                              <input
                                type="color"
                                className="zf-color"
                                value={bgGradTo}
                                aria-label="Gradient end colour"
                                onChange={(e) => setBgGradTo(e.target.value)}
                              />
                              To {bgGradTo}
                            </label>
                          </div>
                          <div
                            className="zf-theme-row"
                            style={{ marginTop: 13 }}
                          >
                            <span className="zf-theme-val">Angle</span>
                            <span className="zf-theme-knob-end">
                              {bgGradAngle !== 160 && (
                                <button
                                  type="button"
                                  className="zf-theme-reset"
                                  onClick={() => setBgGradAngle(160)}
                                >
                                  Reset
                                </button>
                              )}
                              <span className="zf-theme-val">
                                {bgGradAngle}°
                              </span>
                            </span>
                          </div>
                          <input
                            type="range"
                            className="zf-range"
                            min={0}
                            max={360}
                            value={bgGradAngle}
                            aria-label="Gradient angle"
                            onChange={(e) =>
                              setBgGradAngle(Number(e.target.value))
                            }
                          />
                        </>
                      )}
                      {bgType === "unicorn" && (
                        <>
                          <div
                            className="zf-presets"
                            style={{ marginTop: 12 }}
                            role="group"
                            aria-label="Background scene"
                          >
                            {BACKGROUND_SCENES.map((s) => (
                              <button
                                key={s.key}
                                type="button"
                                className={
                                  bgProjectId === s.projectId
                                    ? "zf-preset is-active"
                                    : "zf-preset"
                                }
                                title={s.description}
                                aria-pressed={bgProjectId === s.projectId}
                                onClick={() => setBgProjectId(s.projectId)}
                              >
                                <span
                                  className="zf-preset-swatch"
                                  style={{ background: s.swatch }}
                                />
                                <span className="zf-preset-label">
                                  {s.label}
                                </span>
                              </button>
                            ))}
                          </div>
                          <div
                            className="zf-theme-row"
                            style={{ marginTop: 13 }}
                          >
                            <span className="zf-theme-val">Opacity</span>
                            <span className="zf-theme-knob-end">
                              {bgOpacity !==
                                SPEC_DEFAULTS.background.opacity && (
                                <button
                                  type="button"
                                  className="zf-theme-reset"
                                  onClick={() =>
                                    setBgOpacity(
                                      SPEC_DEFAULTS.background.opacity,
                                    )
                                  }
                                >
                                  Reset
                                </button>
                              )}
                              <span className="zf-theme-val">
                                {Math.round(bgOpacity * 100)}%
                              </span>
                            </span>
                          </div>
                          <input
                            type="range"
                            className="zf-range"
                            min={0}
                            max={0.6}
                            step={0.02}
                            value={bgOpacity}
                            aria-label="Background scene opacity"
                            onChange={(e) =>
                              setBgOpacity(
                                Math.round(Number(e.target.value) * 100) / 100,
                              )
                            }
                          />
                        </>
                      )}
                      {bgType === "image" && (
                        <>
                          <div className="zf-field" style={{ marginTop: 12 }}>
                            <label htmlFor="zf-bg-image-url">Image URL</label>
                            <input
                              id="zf-bg-image-url"
                              className="zf-input"
                              type="url"
                              value={bgImageUrl}
                              placeholder="https://… or /hero.png"
                              spellCheck={false}
                              autoComplete="off"
                              aria-label="Background image URL"
                              onChange={(e) => setBgImageUrl(e.target.value)}
                            />
                            <p className="zf-field-hint">
                              Full-bleed behind the dashboard, with a dark scrim
                              for legibility.
                            </p>
                          </div>
                          <div className="zf-theme-row">
                            <span className="zf-theme-val">Fit</span>
                          </div>
                          <div
                            className="zf-seg"
                            role="group"
                            aria-label="Background image fit"
                          >
                            {(["cover", "contain"] as const).map((f) => (
                              <button
                                key={f}
                                type="button"
                                className={
                                  bgImageFit === f
                                    ? "zf-seg-btn is-active"
                                    : "zf-seg-btn"
                                }
                                aria-pressed={bgImageFit === f}
                                onClick={() => setBgImageFit(f)}
                              >
                                {f === "cover" ? "Cover" : "Contain"}
                              </button>
                            ))}
                          </div>
                          <div
                            className="zf-theme-row"
                            style={{ marginTop: 13 }}
                          >
                            <span className="zf-theme-val">Blur</span>
                            <span className="zf-theme-knob-end">
                              {bgImageBlur !==
                                SPEC_DEFAULTS.background.imageBlur && (
                                <button
                                  type="button"
                                  className="zf-theme-reset"
                                  onClick={() =>
                                    setBgImageBlur(
                                      SPEC_DEFAULTS.background.imageBlur,
                                    )
                                  }
                                >
                                  Reset
                                </button>
                              )}
                              <span className="zf-theme-val">
                                {bgImageBlur}px
                              </span>
                            </span>
                          </div>
                          <input
                            type="range"
                            className="zf-range"
                            min={0}
                            max={40}
                            value={bgImageBlur}
                            aria-label="Background image blur"
                            onChange={(e) =>
                              setBgImageBlur(Number(e.target.value))
                            }
                          />
                          <div
                            className="zf-theme-row"
                            style={{ marginTop: 13 }}
                          >
                            <span className="zf-theme-val">Overlay</span>
                            <span className="zf-theme-knob-end">
                              {bgOverlayOpacity !==
                                SPEC_DEFAULTS.background.overlayOpacity && (
                                <button
                                  type="button"
                                  className="zf-theme-reset"
                                  onClick={() =>
                                    setBgOverlayOpacity(
                                      SPEC_DEFAULTS.background.overlayOpacity,
                                    )
                                  }
                                >
                                  Reset
                                </button>
                              )}
                              <span className="zf-theme-val">
                                {Math.round(bgOverlayOpacity * 100)}%
                              </span>
                            </span>
                          </div>
                          <input
                            type="range"
                            className="zf-range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={bgOverlayOpacity}
                            aria-label="Background image overlay opacity"
                            onChange={(e) =>
                              setBgOverlayOpacity(
                                Math.round(Number(e.target.value) * 100) / 100,
                              )
                            }
                          />
                        </>
                      )}
                    </RailSection>
                  )}

                  {sectionVisible("layout") && (
                    <RailSection
                      label="Layout"
                      open={sectionOpen("layout")}
                      onToggle={() => toggleSection("layout")}
                    >
                      <div className="zf-theme-row">
                        <span className="zf-theme-val">Direction</span>
                      </div>
                      <div
                        className="zf-mode-seg"
                        role="group"
                        aria-label="Dashboard layout direction"
                      >
                        <button
                          type="button"
                          className={
                            mode === "flow-vertical"
                              ? "zf-mode-seg-btn is-active"
                              : "zf-mode-seg-btn"
                          }
                          aria-pressed={mode === "flow-vertical"}
                          onClick={() => switchMode("flow-vertical")}
                        >
                          Vertical
                        </button>
                        <button
                          type="button"
                          className={
                            mode === "flow-horizontal"
                              ? "zf-mode-seg-btn is-active"
                              : "zf-mode-seg-btn"
                          }
                          aria-pressed={mode === "flow-horizontal"}
                          onClick={() => switchMode("flow-horizontal")}
                        >
                          Horizontal
                        </button>
                      </div>
                      {isHorizontal && (
                        <p className="zf-mode-seg-hint">
                          Rows fill the height; the board scrolls sideways.
                          Arrange it freely — this layout is saved separately
                          from Vertical.
                        </p>
                      )}
                      <div className="zf-theme-row" style={{ marginTop: 13 }}>
                        <span className="zf-theme-val">Frame gap</span>
                        <span className="zf-theme-knob-end">
                          {gap !== SPEC_DEFAULTS.grid.gap && (
                            <button
                              type="button"
                              className="zf-theme-reset"
                              onClick={() => setGap(SPEC_DEFAULTS.grid.gap)}
                            >
                              Reset
                            </button>
                          )}
                          <span className="zf-theme-val">{gap}px</span>
                        </span>
                      </div>
                      <input
                        type="range"
                        className="zf-range"
                        min={0}
                        max={12}
                        value={gap}
                        aria-label="Frame gap"
                        onChange={(e) => setGap(Number(e.target.value))}
                      />
                      <div className="zf-theme-row" style={{ marginTop: 13 }}>
                        <span className="zf-theme-val">Side padding</span>
                        <span className="zf-theme-knob-end">
                          {paddingX !== SPEC_DEFAULTS.grid.paddingX && (
                            <button
                              type="button"
                              className="zf-theme-reset"
                              onClick={() =>
                                setPaddingX(SPEC_DEFAULTS.grid.paddingX)
                              }
                            >
                              Reset
                            </button>
                          )}
                          <span className="zf-theme-val">{paddingX}px</span>
                        </span>
                      </div>
                      <input
                        type="range"
                        className="zf-range"
                        min={0}
                        max={96}
                        step={4}
                        value={paddingX}
                        aria-label="Grid side padding"
                        onChange={(e) => setPaddingX(Number(e.target.value))}
                      />
                      {/* Geometry. Both apply live via GridStack's own setters —
                          and both are hidden in flow-horizontal, where the column
                          count comes from the frames and the cell height from the
                          viewport, so neither is the user's to pick. */}
                      {!isHorizontal && (
                        <>
                          <div className="zf-theme-row">
                            <span className="zf-theme-val">Columns</span>
                            <span className="zf-theme-knob-end">
                              {columns !== SPEC_DEFAULTS.grid.columns && (
                                <button
                                  type="button"
                                  className="zf-theme-reset"
                                  onClick={() =>
                                    setColumns(SPEC_DEFAULTS.grid.columns)
                                  }
                                >
                                  Reset
                                </button>
                              )}
                              <span className="zf-theme-val">{columns}</span>
                            </span>
                          </div>
                          <input
                            type="range"
                            className="zf-range"
                            min={4}
                            max={24}
                            step={1}
                            value={columns}
                            aria-label="Grid columns"
                            onChange={(e) => setColumns(Number(e.target.value))}
                          />
                          <div className="zf-theme-row">
                            <span className="zf-theme-val">Row height</span>
                            <span className="zf-theme-knob-end">
                              {rowHeight !== SPEC_DEFAULTS.grid.rowHeight && (
                                <button
                                  type="button"
                                  className="zf-theme-reset"
                                  onClick={() =>
                                    setRowHeight(SPEC_DEFAULTS.grid.rowHeight)
                                  }
                                >
                                  Reset
                                </button>
                              )}
                              <span className="zf-theme-val">
                                {rowHeight}px
                              </span>
                            </span>
                          </div>
                          <input
                            type="range"
                            className="zf-range"
                            min={40}
                            max={200}
                            step={2}
                            value={rowHeight}
                            aria-label="Grid row height"
                            onChange={(e) =>
                              setRowHeight(Number(e.target.value))
                            }
                          />
                        </>
                      )}
                    </RailSection>
                  )}

                  {sectionVisible("appearance") && (
                    <RailSection
                      label="Appearance"
                      open={sectionOpen("appearance")}
                      onToggle={() => toggleSection("appearance")}
                    >
                      <div className="zf-theme-row">
                        <span className="zf-theme-val">Corner radius</span>
                        <span className="zf-theme-knob-end">
                          {radius !== SPEC_DEFAULTS.appearance.radius && (
                            <button
                              type="button"
                              className="zf-theme-reset"
                              onClick={() =>
                                setRadius(SPEC_DEFAULTS.appearance.radius)
                              }
                            >
                              Reset
                            </button>
                          )}
                          <span className="zf-theme-val">{radius}px</span>
                        </span>
                      </div>
                      <input
                        type="range"
                        className="zf-range"
                        min={0}
                        max={32}
                        value={radius}
                        aria-label="Corner radius"
                        onChange={(e) => setRadius(Number(e.target.value))}
                      />
                      <div className="zf-theme-row" style={{ marginTop: 13 }}>
                        <span className="zf-theme-val">Border</span>
                        <span className="zf-theme-knob-end">
                          {borderStrength !==
                            SPEC_DEFAULTS.appearance.borderStrength && (
                            <button
                              type="button"
                              className="zf-theme-reset"
                              onClick={() =>
                                setBorderStrength(
                                  SPEC_DEFAULTS.appearance.borderStrength,
                                )
                              }
                            >
                              Reset
                            </button>
                          )}
                          <span className="zf-theme-val">
                            {Math.round(borderStrength * 100)}%
                          </span>
                        </span>
                      </div>
                      <input
                        type="range"
                        className="zf-range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={borderStrength}
                        aria-label="Border strength"
                        onChange={(e) =>
                          setBorderStrength(
                            Math.round(Number(e.target.value) * 100) / 100,
                          )
                        }
                      />
                      <div className="zf-theme-row" style={{ marginTop: 13 }}>
                        <span className="zf-theme-val">Card opacity</span>
                        <span className="zf-theme-knob-end">
                          {surfaceOpacity !==
                            SPEC_DEFAULTS.appearance.surfaceOpacity && (
                            <button
                              type="button"
                              className="zf-theme-reset"
                              onClick={() =>
                                setSurfaceOpacity(
                                  SPEC_DEFAULTS.appearance.surfaceOpacity,
                                )
                              }
                            >
                              Reset
                            </button>
                          )}
                          <span className="zf-theme-val">
                            {Math.round(surfaceOpacity * 100)}%
                          </span>
                        </span>
                      </div>
                      <input
                        type="range"
                        className="zf-range"
                        min={0.3}
                        max={1}
                        step={0.05}
                        value={surfaceOpacity}
                        aria-label="Card opacity"
                        onChange={(e) =>
                          setSurfaceOpacity(
                            Math.round(Number(e.target.value) * 100) / 100,
                          )
                        }
                      />
                      <div className="zf-theme-row" style={{ marginTop: 13 }}>
                        <span className="zf-theme-val">Density</span>
                        <span className="zf-theme-knob-end">
                          {density !== SPEC_DEFAULTS.appearance.density && (
                            <button
                              type="button"
                              className="zf-theme-reset"
                              onClick={() =>
                                setDensity(SPEC_DEFAULTS.appearance.density)
                              }
                            >
                              Reset
                            </button>
                          )}
                          <span className="zf-theme-val">
                            {Math.round(density * 100)}%
                          </span>
                        </span>
                      </div>
                      <input
                        type="range"
                        className="zf-range"
                        min={0.6}
                        max={1.4}
                        step={0.05}
                        value={density}
                        aria-label="Card density"
                        onChange={(e) =>
                          setDensity(
                            Math.round(Number(e.target.value) * 100) / 100,
                          )
                        }
                      />
                      <div className="zf-theme-row" style={{ marginTop: 13 }}>
                        <span className="zf-theme-val">Elevation</span>
                        <span className="zf-theme-knob-end">
                          {elevation !== SPEC_DEFAULTS.appearance.elevation && (
                            <button
                              type="button"
                              className="zf-theme-reset"
                              onClick={() =>
                                setElevation(SPEC_DEFAULTS.appearance.elevation)
                              }
                            >
                              Reset
                            </button>
                          )}
                          <span className="zf-theme-val">
                            {elevation.toFixed(1)}×
                          </span>
                        </span>
                      </div>
                      <input
                        type="range"
                        className="zf-range"
                        min={0}
                        max={2}
                        step={0.1}
                        value={elevation}
                        aria-label="Card elevation"
                        onChange={(e) =>
                          setElevation(
                            Math.round(Number(e.target.value) * 10) / 10,
                          )
                        }
                      />
                    </RailSection>
                  )}

                  {sectionVisible("typography") && (
                    <RailSection
                      label="Typography"
                      open={sectionOpen("typography")}
                      onToggle={() => toggleSection("typography")}
                    >
                      <div className="zf-theme-row">
                        <span className="zf-theme-val">Font</span>
                      </div>
                      <div
                        className="zf-seg"
                        role="group"
                        aria-label="Font family"
                      >
                        {(["sans", "mono", "serif"] as const).map((f) => (
                          <button
                            key={f}
                            type="button"
                            className={
                              fontFamily === f
                                ? "zf-seg-btn is-active"
                                : "zf-seg-btn"
                            }
                            aria-pressed={fontFamily === f}
                            style={{ fontFamily: FONT_FAMILY_STACKS[f] }}
                            onClick={() => setFontFamily(f)}
                          >
                            {f === "sans"
                              ? "Sans"
                              : f === "mono"
                                ? "Mono"
                                : "Serif"}
                          </button>
                        ))}
                      </div>
                      <div className="zf-theme-row" style={{ marginTop: 13 }}>
                        <span className="zf-theme-val">Numbers</span>
                      </div>
                      <div
                        className="zf-seg"
                        role="group"
                        aria-label="Numeric style"
                      >
                        {(["proportional", "tabular"] as const).map((n) => (
                          <button
                            key={n}
                            type="button"
                            className={
                              numericStyle === n
                                ? "zf-seg-btn is-active"
                                : "zf-seg-btn"
                            }
                            aria-pressed={numericStyle === n}
                            onClick={() => setNumericStyle(n)}
                          >
                            <span
                              style={{
                                fontVariantNumeric: NUMERIC_VARIANTS[n],
                              }}
                            >
                              {n === "proportional"
                                ? "Normal 1,071"
                                : "Tabular 1,071"}
                            </span>
                          </button>
                        ))}
                      </div>
                      <div className="zf-theme-row" style={{ marginTop: 13 }}>
                        <span className="zf-theme-val">Text size</span>
                        <span className="zf-theme-knob-end">
                          {fontScale !== SPEC_DEFAULTS.typography.scale && (
                            <button
                              type="button"
                              className="zf-theme-reset"
                              onClick={() =>
                                setFontScale(SPEC_DEFAULTS.typography.scale)
                              }
                            >
                              Reset
                            </button>
                          )}
                          <span className="zf-theme-val">
                            {Math.round(fontScale * 100)}%
                          </span>
                        </span>
                      </div>
                      <input
                        type="range"
                        className="zf-range"
                        min={0.85}
                        max={1.25}
                        step={0.05}
                        value={fontScale}
                        aria-label="Text size"
                        onChange={(e) =>
                          setFontScale(
                            Math.round(Number(e.target.value) * 100) / 100,
                          )
                        }
                      />
                    </RailSection>
                  )}

                  {sectionVisible("currency") && (
                    <RailSection
                      label="Currency"
                      open={sectionOpen("currency")}
                      onToggle={() => toggleSection("currency")}
                    >
                      <p className="zf-field-hint">
                        Every money figure is converted from USD at the live ECB
                        rate. Percentages and counts are unaffected, and
                        US-macro series (Treasury yields, CPI, the national
                        debt) stay in USD — a converted national debt is a
                        figure nobody quotes.
                      </p>
                      <div
                        className="zf-theme-row"
                        style={{ margin: "10px 0 6px" }}
                      >
                        <span className="zf-theme-val">Board currency</span>
                        {currencyCode !== SPEC_DEFAULTS.currency.code && (
                          <button
                            type="button"
                            className="zf-theme-reset"
                            onClick={() =>
                              setCurrencyCode(SPEC_DEFAULTS.currency.code)
                            }
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      {/* 146 codes: a native select over that can only be used
                          by someone who already knows the ISO code, so this
                          searches code + symbol + name instead. */}
                      <CurrencyPicker
                        value={currencyCode}
                        label="Display currency"
                        onChange={(code) =>
                          setCurrencyCode(
                            (code ??
                              SPEC_DEFAULTS.currency
                                .code) as DashboardSpec["currency"]["code"],
                          )
                        }
                      />
                    </RailSection>
                  )}
                </div>
              )}

              {railTab === "frames" && (
                <section
                  role="tabpanel"
                  id="zf-rail-panel-frames"
                  aria-labelledby="zf-rail-tab-frames"
                >
                  <h3 className="zf-rail-title">Add a frame</h3>
                  <p className="zf-palette-hint">
                    Search, or open a category, then click a frame to add it —
                    or drag it onto the grid.
                  </p>
                  <div className="zf-palette-search">
                    <Search size={14} aria-hidden="true" />
                    <input
                      type="text"
                      value={paletteQuery}
                      placeholder="Search frames…"
                      aria-label="Search frames"
                      autoComplete="off"
                      spellCheck={false}
                      onChange={(e) => setPaletteQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Escape" && paletteQuery) {
                          e.preventDefault();
                          setPaletteQuery("");
                        }
                      }}
                    />
                    {paletteQuery && (
                      <button
                        type="button"
                        className="zf-palette-search-clear"
                        aria-label="Clear search"
                        onClick={() => setPaletteQuery("")}
                      >
                        <svg viewBox="0 0 16 16" aria-hidden="true">
                          <path
                            d="M4 4l8 8M12 4l-8 8"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="zf-palette-cats">
                    {paletteSearching && filteredGroups.length === 0 && (
                      <p className="zf-palette-empty">
                        No frames match “{paletteQuery.trim()}”.
                      </p>
                    )}
                    {filteredGroups.map((group) => {
                      const open =
                        paletteSearching || expandedCats.has(group.key);
                      return (
                        <div
                          key={group.key}
                          className={
                            open ? "zf-palette-cat is-open" : "zf-palette-cat"
                          }
                        >
                          <button
                            type="button"
                            className="zf-palette-cat-header"
                            aria-expanded={open}
                            onClick={() => toggleCat(group.key)}
                          >
                            <svg
                              className="zf-palette-cat-chevron"
                              viewBox="0 0 16 16"
                              aria-hidden="true"
                            >
                              <path
                                d="M6 4l4 4-4 4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="1.6"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                            <span className="zf-palette-cat-label">
                              {group.label}
                            </span>
                            <span className="zf-palette-cat-count">
                              {group.frames.length}
                            </span>
                          </button>
                          {open && (
                            <div className="zf-palette-cat-body">
                              {group.description && (
                                <p className="zf-palette-cat-desc">
                                  {group.description}
                                </p>
                              )}
                              <div className="zf-palette">
                                {group.frames.map((def) => (
                                  <div
                                    key={def.name}
                                    // `grid-stack-item` makes GridStack accept the
                                    // card as a drag-in source (its accept check is
                                    // el.matches('.grid-stack-item')); the gs-* attrs
                                    // size the drop placeholder while dragging. Safe
                                    // off-grid: gridstack's position:absolute rule is
                                    // scoped to `.grid-stack > .grid-stack-item`.
                                    className="grid-stack-item zf-newwidget"
                                    data-frame={def.name}
                                    gs-w={def.layout?.w ?? 4}
                                    gs-h={def.layout?.h ?? 3}
                                    gs-min-w={def.layout?.minW}
                                    gs-min-h={def.layout?.minH}
                                    gs-max-w={def.layout?.maxW}
                                    gs-max-h={def.layout?.maxH}
                                    role="button"
                                    tabIndex={0}
                                    title={`Drag onto the board, or click to add ${def.label}`}
                                    onClick={() => addFrame(def.name)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter" || e.key === " ") {
                                        e.preventDefault();
                                        addFrame(def.name);
                                      }
                                    }}
                                  >
                                    {def.iconUrl && (
                                      <img
                                        className="zf-newwidget-icon"
                                        src={def.iconUrl}
                                        alt=""
                                        loading="lazy"
                                        draggable={false}
                                      />
                                    )}
                                    <div className="zf-newwidget-copy">
                                      <div className="zf-newwidget-name">
                                        {def.label}
                                      </div>
                                      <div className="zf-newwidget-desc">
                                        {def.description}
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>
          </aside>
        </div>
      </div>
      {editingInstance
        ? createPortal(
            <FrameConfigDialog
              key={editingInstance.id}
              instance={editingInstance}
              registry={registry}
              instancesRef={instancesRef}
              symbolUniverse={symbolUniverse}
              accentHue={accentHue}
              // The live board currency, so the card's picker can name what
              // "inherit" currently resolves to.
              boardCurrency={currencyCode}
              // The live dashboard-level cosmetics a card inherits when a
              // per-frame style override is unset — the Style panel seeds each
              // enabled override with the matching value so toggling is a no-op.
              inherited={{
                accentHue,
                accentSat,
                baseHue,
                baseSat,
                surfaceOpacity,
                radius,
                borderStrength,
                density,
                elevation,
              }}
              onApply={(id) => renderInstance(id)}
              onClose={() => {
                setEditingId(null);
                // The dialog commits each valid keystroke straight into
                // instancesRef, so the *close* is the gesture boundary — one undo
                // step for the whole configuring session rather than one per
                // character typed.
                commitHistoryRef.current?.();
              }}
            />,
            document.body,
          )
        : null}
    </DashboardCurrencyProvider>
  );
}
