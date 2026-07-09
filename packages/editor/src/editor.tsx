import {
  GridStack,
  type GridItemHTMLElement,
  type GridStackNode,
} from "gridstack";
import "gridstack/dist/gridstack.min.css";
import { Search, SlidersHorizontal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import "./editor.css";
import { FrameConfigDialog } from "./editor-config";
import {
  GEAR_SVG,
  colsForHorizontal,
  posFor,
  seedHorizontal,
  type LayoutMode,
} from "./editor-grid";
import { buildDefaultConfig, useSymbolUniverse } from "./editor-symbols";
import {
  FRAME_CATEGORIES,
  type AnyFrameDefinition,
  type FrameCategory,
  type FrameRegistry,
} from "@zframes/spec/frame";
import {
  FRAME_CSS,
  FrameContent,
  FramePatchContext,
  FramesProvider,
  useProviders,
} from "@zframes/core";
import { BACKGROUND_SCENES, THEME_PRESETS, type ThemePreset } from "@zframes/spec/presets";
import {
  FONT_FAMILY_STACKS,
  NUMERIC_VARIANTS,
  type DashboardBackground,
  type DashboardSpec,
  type DashboardTypography,
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
  const instancesRef = useRef<Map<string, FrameInstance>>(new Map());
  const rootsRef = useRef<Map<string, Root>>(new Map());
  const contentRef = useRef<Map<string, HTMLElement>>(new Map());
  const snapshotRef = useRef<FrameInstance[]>([]);
  const snapshotHueRef = useRef(spec.theme.accentHue);
  const snapshotSatRef = useRef(spec.theme.accentSat);
  const snapshotBaseHueRef = useRef(spec.theme.baseHue);
  const snapshotBaseSatRef = useRef(spec.theme.baseSat);
  const snapshotUpColorRef = useRef(spec.theme.upColor);
  const snapshotDownColorRef = useRef(spec.theme.downColor);
  const snapshotGapRef = useRef(spec.grid.gap);
  const snapshotModeRef = useRef(spec.grid.mode);
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotRadiusRef = useRef(spec.appearance.radius);
  const snapshotBorderRef = useRef(spec.appearance.borderStrength);
  const snapshotSurfaceRef = useRef(spec.appearance.surfaceOpacity);
  const snapshotDensityRef = useRef(spec.appearance.density);
  const snapshotElevationRef = useRef(spec.appearance.elevation);
  const snapshotFontFamilyRef = useRef(spec.typography.fontFamily);
  const snapshotNumericRef = useRef(spec.typography.numericStyle);
  const snapshotFontScaleRef = useRef(spec.typography.scale);
  const snapshotBgTypeRef = useRef(spec.background.type);
  const snapshotBgProjectIdRef = useRef(spec.background.projectId);
  const snapshotBgOpacityRef = useRef(spec.background.opacity);
  const snapshotBgColorRef = useRef(spec.background.color);
  const snapshotBgGradFromRef = useRef(spec.background.gradientFrom);
  const snapshotBgGradToRef = useRef(spec.background.gradientTo);
  const snapshotBgGradAngleRef = useRef(spec.background.gradientAngle);
  const counterRef = useRef(0);

  const [editing, setEditing] = useState(false);
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
  // appearance) or the add-a-frame palette. The rail used to stack both; the
  // tabs split them so theme knobs and frame management each get the full panel.
  const [railTab, setRailTab] = useState<"cosmetics" | "frames">("frames");
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
    });
  }, [
    bgType,
    bgProjectId,
    bgOpacity,
    bgColor,
    bgGradFrom,
    bgGradTo,
    bgGradAngle,
    spec.background,
    onBackgroundChange,
  ]);

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
  const paletteQueryTokens = useMemo(() => {
    const q = paletteQuery.trim().toLowerCase();
    return q ? q.split(/\s+/) : [];
  }, [paletteQuery]);
  const paletteSearching = paletteQueryTokens.length > 0;
  const filteredGroups = useMemo(() => {
    if (paletteQueryTokens.length === 0) return paletteGroups;
    return paletteGroups
      .map((group) => {
        const cat = group.label.toLowerCase();
        return {
          ...group,
          frames: group.frames.filter((def) => {
            const hay =
              `${def.label} ${def.description ?? ""} ${def.name} ${cat}`.toLowerCase();
            return paletteQueryTokens.every((token) => hay.includes(token));
          }),
        };
      })
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
        <FramePatchContext.Provider
          value={(patch) => patchInstanceRef.current?.(id, patch)}
        >
          <FrameContent
            instance={instance}
            registry={registryRef.current}
            className="zf-fill"
          />
        </FramePatchContext.Provider>
      </FramesProvider>,
    );
  }, []);

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
    const grid = gridInstanceRef.current;
    if (!grid) return;
    const id = el.getAttribute("gs-id");
    if (id) {
      const root = rootsRef.current.get(id);
      if (root) unmountRootSoon(root);
      rootsRef.current.delete(id);
      contentRef.current.delete(id);
      instancesRef.current.delete(id);
      if (editingIdRef.current === id) setEditingId(null);
    }
    grid.removeWidget(el, true);
    setCount(grid.getGridItems().length);
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
      contentRef.current.set(instance.id, content);
      return el;
    },
    [spec.grid.rows],
  );

  // Tears down all items + roots and rebuilds the grid from a frame list.
  const restore = useCallback(
    (frames: FrameInstance[]) => {
      const grid = gridInstanceRef.current;
      if (!grid) return;
      rootsRef.current.forEach(unmountRootSoon);
      rootsRef.current.clear();
      contentRef.current.clear();
      instancesRef.current = new Map(frames.map((f) => [f.id, f]));

      grid.removeAll(true);
      grid.el
        .querySelectorAll(".grid-stack-item")
        .forEach((node) => node.remove());

      grid.batchUpdate();
      for (const f of frames) {
        const el = buildItemEl(f);
        grid.el.appendChild(el);
        grid.makeWidget(el);
        renderInstance(f.id);
      }
      grid.batchUpdate(false);
      setCount(frames.length);
    },
    [buildItemEl, renderInstance],
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
      const el = buildItemEl(instance, true);
      grid.el.appendChild(el);
      grid.makeWidget(el);
      renderInstance(id);
      decorateItem(el);
      setCount(grid.getGridItems().length);
      // Newly added → open its settings dialog straight away (required-field
      // frames land as error cards until configured, so jump the user there).
      setEditingId(id);
    },
    [buildItemEl, decorateItem, defaultConfig, renderInstance, uniqueId],
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
      const cell = horizontal ? horizontalCellPx() : spec.grid.rowHeight;
      const grid = GridStack.init(
        {
          column: horizontal ? cols : spec.grid.columns,
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
      );
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
        const id = el.getAttribute("gs-id") || uniqueId(frame);
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
        contentRef.current.set(id, content);
        renderInstance(id);
        decorateItem(el);
        setCount(grid.getGridItems().length);
        setEditingId(id);
      });

      grid.on("removed", () => setCount(grid.getGridItems().length));

      // Hold the closed-hand cursor for the whole drag. A hover-only rule drops
      // as soon as GridStack slides the pointer off the dragged content box onto
      // the placeholder/grid, so pin `grabbing` on <body> from dragstart→dragstop
      // — covers the placeholder, sibling cards, and any body-appended helper.
      grid.on("dragstart", () => document.body.classList.add("zf-dragging"));
      grid.on("dragstop", () => document.body.classList.remove("zf-dragging"));

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
      spec.grid.columns,
      spec.grid.rowHeight,
      spec.grid.rows,
      spec.grid.gap,
      uniqueId,
      defaultConfig,
      renderInstance,
      decorateItem,
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
      : spec.grid.columns;
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
    grid.enableMove(editing);
    grid.enableResize(editing);
    if (editing) {
      grid.getGridItems().forEach(decorateItem);
    } else {
      grid.getGridItems().forEach(undecorateItem);
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
        frames.push(
          mode === "flow-horizontal"
            ? { ...inst, layouts: { ...inst.layouts, "flow-horizontal": pos } }
            : { ...inst, position: pos },
        );
      }
    }
    // Reading order keeps the written file diff-friendly (by the vertical layout).
    frames.sort(
      (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
    );
    return {
      ...spec,
      grid: { ...spec.grid, gap, mode },
      background: {
        ...spec.background,
        type: bgType,
        projectId: bgProjectId,
        opacity: bgOpacity,
        color: bgColor,
        gradientFrom: bgGradFrom,
        gradientTo: bgGradTo,
        gradientAngle: bgGradAngle,
      },
      theme: {
        ...spec.theme,
        accentHue,
        accentSat,
        baseHue,
        baseSat,
        upColor,
        downColor,
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
      frames,
    };
  }, [
    spec,
    accentHue,
    accentSat,
    baseHue,
    baseSat,
    upColor,
    downColor,
    fontFamily,
    numericStyle,
    fontScale,
    gap,
    mode,
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
    snapshotRef.current = collectSpec().frames;
    snapshotHueRef.current = accentHue;
    snapshotSatRef.current = accentSat;
    snapshotBaseHueRef.current = baseHue;
    snapshotBaseSatRef.current = baseSat;
    snapshotUpColorRef.current = upColor;
    snapshotDownColorRef.current = downColor;
    snapshotGapRef.current = gap;
    snapshotModeRef.current = mode;
    snapshotRadiusRef.current = radius;
    snapshotBorderRef.current = borderStrength;
    snapshotSurfaceRef.current = surfaceOpacity;
    snapshotDensityRef.current = density;
    snapshotElevationRef.current = elevation;
    snapshotFontFamilyRef.current = fontFamily;
    snapshotNumericRef.current = numericStyle;
    snapshotFontScaleRef.current = fontScale;
    snapshotBgTypeRef.current = bgType;
    snapshotBgProjectIdRef.current = bgProjectId;
    snapshotBgOpacityRef.current = bgOpacity;
    snapshotBgColorRef.current = bgColor;
    snapshotBgGradFromRef.current = bgGradFrom;
    snapshotBgGradToRef.current = bgGradTo;
    snapshotBgGradAngleRef.current = bgGradAngle;
    setEditing(true);
  }, [
    collectSpec,
    accentHue,
    accentSat,
    baseHue,
    baseSat,
    upColor,
    downColor,
    gap,
    mode,
    radius,
    borderStrength,
    surfaceOpacity,
    density,
    elevation,
    fontFamily,
    numericStyle,
    fontScale,
    bgType,
    bgProjectId,
    bgOpacity,
    bgColor,
    bgGradFrom,
    bgGradTo,
    bgGradAngle,
  ]);

  const cancel = useCallback(() => {
    // restore() unmounts + recreates EVERY frame's React root (re-subscribing
    // WS/poll hooks and replaying first-render for each) — a real hitch on a big
    // board. Skip it when the frames are byte-for-byte unchanged: collectSpec()
    // reads the same shape the snapshot was taken from (positions AND configs),
    // so an identical JSON means nothing structural changed and the live roots
    // already show the snapshot state. A mode switch re-inited the grid under a
    // different layout, so it always needs the restore. The cosmetic setters
    // below always run, so an accent/appearance/background tweak still reverts.
    const modeChanged = snapshotModeRef.current !== modeRef.current;
    const changed =
      modeChanged ||
      JSON.stringify(collectSpec().frames) !==
        JSON.stringify(snapshotRef.current);
    if (changed) restore(snapshotRef.current);
    setAccentHue(snapshotHueRef.current);
    setAccentSat(snapshotSatRef.current);
    setBaseHue(snapshotBaseHueRef.current);
    setBaseSat(snapshotBaseSatRef.current);
    setUpColor(snapshotUpColorRef.current);
    setDownColor(snapshotDownColorRef.current);
    setGap(snapshotGapRef.current);
    setMode(snapshotModeRef.current);
    setRadius(snapshotRadiusRef.current);
    setBorderStrength(snapshotBorderRef.current);
    setSurfaceOpacity(snapshotSurfaceRef.current);
    setDensity(snapshotDensityRef.current);
    setElevation(snapshotElevationRef.current);
    setFontFamily(snapshotFontFamilyRef.current);
    setNumericStyle(snapshotNumericRef.current);
    setFontScale(snapshotFontScaleRef.current);
    setBgType(snapshotBgTypeRef.current);
    setBgProjectId(
      snapshotBgProjectIdRef.current ?? BACKGROUND_SCENES[0].projectId,
    );
    setBgOpacity(snapshotBgOpacityRef.current);
    setBgColor(snapshotBgColorRef.current);
    setBgGradFrom(snapshotBgGradFromRef.current);
    setBgGradTo(snapshotBgGradToRef.current);
    setBgGradAngle(snapshotBgGradAngleRef.current);
    setEditingId(null);
    setEditing(false);
  }, [restore, collectSpec]);

  const save = useCallback(async () => {
    const next = collectSpec();
    setEditing(false);
    setEditingId(null);
    if (onSave) await onSave(next);
    else download(next);
  }, [collectSpec, onSave, download]);

  // Reclaim empty space in the ACTIVE grid (float:true otherwise preserves gaps).
  // Mode-aware: the vertical column grid reflows top-left to fill any hole
  // ('compact'); the horizontal side-scroller closes gaps while keeping its
  // deliberate left->right order ('list'), so a curated arrangement isn't
  // reshuffled. collectSpec reads positions live off gridstackNode, so the
  // tidied layout round-trips through Save with no extra bookkeeping.
  const tidy = useCallback(() => {
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

  // Swap the layout mode behind a brief blur+fade. The two layouts are different
  // GridStack configs (vertical column grid vs the coerced wide side-scroller)
  // with independent positions, so we capture the current arrangement, re-init
  // GridStack for the new mode, and restore each frame at the new mode's layout
  // — all while the grid is blurred out, so the structural swap is invisible.
  // Reduced-motion users get the instant swap.
  const switchMode = useCallback(
    (next: LayoutMode) => {
      if (next === modeRef.current) return;
      const swap = () => {
        captureLayout();
        const frames = [...instancesRef.current.values()];
        const wasEditing = editing;
        const horizontal = next === "flow-horizontal";
        const cols = horizontal
          ? colsForHorizontal(frames, spec.grid.rows)
          : spec.grid.columns;
        teardownGrid();
        modeRef.current = next;
        setMode(next);
        const grid = initGrid(next, cols);
        gridInstanceRef.current = grid;
        restore(
          horizontal ? seedHorizontal(frames, cols, spec.grid.rows) : frames,
        );
        if (wasEditing) {
          grid.enableMove(true);
          grid.enableResize(true);
          grid.getGridItems().forEach(decorateItem);
        }
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
    [
      editing,
      captureLayout,
      teardownGrid,
      initGrid,
      restore,
      decorateItem,
      spec.grid.rows,
      spec.grid.columns,
    ],
  );

  useEffect(
    () => () => {
      if (switchTimerRef.current) clearTimeout(switchTimerRef.current);
    },
    [],
  );

  const renderCustomiseButton = () => (
    <button
      type="button"
      className="zf-btn zf-btn--icon"
      onClick={startCustomise}
      aria-label="Customise"
      title="Customise"
    >
      <SlidersHorizontal size={18} aria-hidden="true" />
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
    <>
      <style>{FRAME_CSS}</style>
      {customiseButtonTarget && !editing
        ? createPortal(renderCustomiseButton(), customiseButtonTarget)
        : null}
      <div
        className={editing ? "zf-editor zf-customise" : "zf-editor"}
        data-mode={mode}
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
        }}
      >
        {(editing || !customiseButtonTarget) && (
          <div className="zf-editor-bar">
            <div className="zf-editor-bar-spacer" />
            {!editing ? (
              renderCustomiseButton()
            ) : (
              <>
                <button
                  type="button"
                  className="zf-btn zf-btn--ghost"
                  onClick={tidy}
                  title="Reclaim empty grid space"
                >
                  Tidy
                </button>
                <button
                  type="button"
                  className="zf-btn zf-btn--ghost"
                  onClick={cancel}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="zf-btn zf-btn--primary"
                  onClick={save}
                >
                  Save
                </button>
              </>
            )}
          </div>
        )}

        <div className="zf-editor-main">
          <div className="zf-editor-grid" data-switching={switching}>
            <div ref={gridRef} className="grid-stack" />
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
                <button
                  type="button"
                  role="tab"
                  aria-selected={railTab === "frames"}
                  className={
                    railTab === "frames"
                      ? "zf-rail-tab is-active"
                      : "zf-rail-tab"
                  }
                  onClick={() => setRailTab("frames")}
                >
                  Frames
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={railTab === "cosmetics"}
                  className={
                    railTab === "cosmetics"
                      ? "zf-rail-tab is-active"
                      : "zf-rail-tab"
                  }
                  onClick={() => setRailTab("cosmetics")}
                >
                  Cosmetics
                </button>
              </div>

              {railTab === "cosmetics" && (
                <>
                  <section className="zf-theme">
                    <h3 className="zf-rail-title" style={{ margin: 0 }}>
                      Presets
                    </h3>
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
                  </section>

                  <section className="zf-theme">
                    <h3 className="zf-rail-title" style={{ margin: 0 }}>
                      Accent
                    </h3>
                    <div
                      className="zf-theme-row"
                      style={{ margin: "10px 0 0" }}
                    >
                      <span className="zf-theme-val">
                        <span className="zf-theme-swatch" />
                        Hue {accentHue}°
                      </span>
                      {accentHue !== 242 && (
                        <button
                          type="button"
                          className="zf-theme-reset"
                          onClick={() => setAccentHue(242)}
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
                        {accentSat !== 90 && (
                          <button
                            type="button"
                            className="zf-theme-reset"
                            onClick={() => setAccentSat(90)}
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
                  </section>

                  <section className="zf-theme">
                    <h3 className="zf-rail-title">Surface</h3>
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
                      {baseHue !== 233 && (
                        <button
                          type="button"
                          className="zf-theme-reset"
                          onClick={() => setBaseHue(233)}
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
                        {baseSat !== 20 && (
                          <button
                            type="button"
                            className="zf-theme-reset"
                            onClick={() => setBaseSat(20)}
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
                  </section>

                  <section className="zf-theme">
                    <h3 className="zf-rail-title">Gain / Loss</h3>
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
                      {upColor.toLowerCase() !== "#3fd08f" && (
                        <button
                          type="button"
                          className="zf-theme-reset"
                          onClick={() => setUpColor("#3fd08f")}
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
                      {downColor.toLowerCase() !== "#ff6b81" && (
                        <button
                          type="button"
                          className="zf-theme-reset"
                          onClick={() => setDownColor("#ff6b81")}
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </section>

                  <section className="zf-theme">
                    <h3 className="zf-rail-title">Background</h3>
                    <div
                      className="zf-seg"
                      role="group"
                      aria-label="Background style"
                    >
                      {(["none", "color", "gradient", "unicorn"] as const).map(
                        (t) => (
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
                                  : "Scene"}
                          </button>
                        ),
                      )}
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
                        {bgColor.toLowerCase() !== "#0a0a12" && (
                          <button
                            type="button"
                            className="zf-theme-reset"
                            onClick={() => setBgColor("#0a0a12")}
                          >
                            Reset
                          </button>
                        )}
                      </div>
                    )}
                    {bgType === "gradient" && (
                      <>
                        <div className="zf-theme-row" style={{ marginTop: 12 }}>
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
                        <div className="zf-theme-row" style={{ marginTop: 9 }}>
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
                        <div className="zf-theme-row" style={{ marginTop: 13 }}>
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
                            <span className="zf-theme-val">{bgGradAngle}°</span>
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
                              <span className="zf-preset-label">{s.label}</span>
                            </button>
                          ))}
                        </div>
                        <div className="zf-theme-row" style={{ marginTop: 13 }}>
                          <span className="zf-theme-val">Opacity</span>
                          <span className="zf-theme-knob-end">
                            {bgOpacity !== 0.16 && (
                              <button
                                type="button"
                                className="zf-theme-reset"
                                onClick={() => setBgOpacity(0.16)}
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
                  </section>

                  <section className="zf-theme">
                    <h3 className="zf-rail-title">Layout</h3>
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
                        Arrange it freely — this layout is saved separately from
                        Vertical.
                      </p>
                    )}
                    <div className="zf-theme-row" style={{ marginTop: 13 }}>
                      <span className="zf-theme-val">Frame gap</span>
                      <span className="zf-theme-knob-end">
                        {gap !== 12 && (
                          <button
                            type="button"
                            className="zf-theme-reset"
                            onClick={() => setGap(12)}
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
                  </section>

                  <section className="zf-theme">
                    <h3 className="zf-rail-title">Appearance</h3>
                    <div className="zf-theme-row">
                      <span className="zf-theme-val">Corner radius</span>
                      <span className="zf-theme-knob-end">
                        {radius !== 18 && (
                          <button
                            type="button"
                            className="zf-theme-reset"
                            onClick={() => setRadius(18)}
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
                        {borderStrength !== 0.22 && (
                          <button
                            type="button"
                            className="zf-theme-reset"
                            onClick={() => setBorderStrength(0.22)}
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
                        {surfaceOpacity !== 1 && (
                          <button
                            type="button"
                            className="zf-theme-reset"
                            onClick={() => setSurfaceOpacity(1)}
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
                        {density !== 1 && (
                          <button
                            type="button"
                            className="zf-theme-reset"
                            onClick={() => setDensity(1)}
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
                        {elevation !== 1 && (
                          <button
                            type="button"
                            className="zf-theme-reset"
                            onClick={() => setElevation(1)}
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
                  </section>

                  <section className="zf-theme">
                    <h3 className="zf-rail-title">Typography</h3>
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
                            style={{ fontVariantNumeric: NUMERIC_VARIANTS[n] }}
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
                        {fontScale !== 1 && (
                          <button
                            type="button"
                            className="zf-theme-reset"
                            onClick={() => setFontScale(1)}
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
                  </section>
                </>
              )}

              {railTab === "frames" && (
                <section>
                  <h3 className="zf-rail-title">Add a frame</h3>
                  <p className="zf-palette-hint">
                    Search, or open a category, then click a frame to add it — or
                    drag it onto the grid.
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
              onApply={(id) => renderInstance(id)}
              onClose={() => setEditingId(null)}
            />,
            document.body,
          )
        : null}
    </>
  );
}
