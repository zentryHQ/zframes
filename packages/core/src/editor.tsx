import {
  GridStack,
  type GridItemHTMLElement,
  type GridStackNode,
} from "gridstack";
import "gridstack/dist/gridstack.min.css";
import {
  Check,
  ChevronDown,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { z } from "zod";
import "./editor.css";
import {
  FRAME_CATEGORIES,
  type AnyFrameDefinition,
  type FrameCategory,
  type FrameRegistry,
} from "./frame";
import { FRAME_CSS, FrameContent, FramePatchContext } from "./frame-content";
import { FramesProvider, useProviders } from "./hooks";
import { THEME_PRESETS, type ThemePreset } from "./presets";
import {
  FONT_FAMILY_STACKS,
  NUMERIC_VARIANTS,
  type DashboardSpec,
  type DashboardTypography,
  type FrameInstance,
  type GridPosition,
} from "./spec";
import type { DayStats, MarketDataProvider } from "./types";

type LayoutMode = DashboardSpec["grid"]["mode"];

// flow-horizontal runs GridStack as a wide, height-bounded grid: the column
// count is sized to the content (colsForHorizontal) so the forced-wide element
// fits the frames with little trailing space, while maxRow/minRow lock it to
// spec.grid.rows bands. This is GridStack coerced out of its native vertical
// orientation — see the layout-modes plan.
const H_COLS_MIN = 24;

// The placement a frame uses in a given mode: its own per-mode override if
// present, else (flow-vertical) the canonical `position`. flow-horizontal with
// no override returns undefined → the caller seeds/packs it.
function posFor(
  instance: FrameInstance,
  mode: LayoutMode,
): GridPosition | undefined {
  if (mode === "flow-horizontal") return instance.layouts?.["flow-horizontal"];
  return instance.position;
}

// How many columns the horizontal board needs to hold every frame across `rows`
// bands, with headroom for fragmentation + a few extra for future additions.
function colsForHorizontal(frames: FrameInstance[], rows: number): number {
  const cells = frames.reduce(
    (sum, f) =>
      sum +
      Math.max(1, f.position.w) * Math.min(Math.max(1, f.position.h), rows),
    0,
  );
  return Math.max(H_COLS_MIN, Math.ceil((cells / rows) * 1.25) + 8);
}

// Fill in a flow-horizontal layout for any frame missing one, dense first-fit
// packed into `cols` × `rows` (scanning columns left→right, rows top→bottom).
// Frames that already have a horizontal layout keep it (and block those cells),
// so the seed only ever lays out the un-arranged frames — the tidy first-time
// arrangement a dashboard gets the first time it enters horizontal mode. With
// float:true on the grid, the seed is then freely drag-editable and preserved.
function seedHorizontal(
  frames: FrameInstance[],
  cols: number,
  rows: number,
): FrameInstance[] {
  const taken = new Set<string>();
  const fill = (x: number, y: number, w: number, h: number) => {
    for (let i = 0; i < w; i++)
      for (let j = 0; j < h; j++) {
        const c = x + i;
        const r = y + j;
        if (c >= 0 && r >= 0) taken.add(`${c},${r}`);
      }
  };
  const free = (x: number, y: number, w: number, h: number) => {
    if (x + w > cols || y + h > rows) return false;
    for (let i = 0; i < w; i++)
      for (let j = 0; j < h; j++)
        if (taken.has(`${x + i},${y + j}`)) return false;
    return true;
  };
  for (const f of frames) {
    const hl = f.layouts?.["flow-horizontal"];
    if (hl) fill(hl.x, hl.y, hl.w, Math.min(hl.h, rows));
  }
  return frames.map((f) => {
    if (f.layouts?.["flow-horizontal"]) return f;
    const w = Math.min(Math.max(1, f.position.w), cols);
    const h = Math.min(Math.max(1, f.position.h), rows);
    let placed: GridPosition = { x: 0, y: 0, w, h };
    search: for (let c = 0; c <= cols - w; c++)
      for (let r = 0; r <= rows - h; r++)
        if (free(c, r, w, h)) {
          placed = { x: c, y: r, w, h };
          break search;
        }
    fill(placed.x, placed.y, placed.w, placed.h);
    return { ...f, layouts: { ...f.layouts, "flow-horizontal": placed } };
  });
}

type SymbolKind = "Stock" | "Crypto" | "Custom";

interface SymbolOption {
  symbol: string;
  ticker: string;
  kind: SymbolKind;
  markPx?: number;
  changePct?: number;
  rank: number;
}

interface SymbolUniverse {
  options: SymbolOption[];
  loading: boolean;
}

interface JsonShape {
  type?: string | string[];
  properties?: Record<string, JsonShape>;
  items?: JsonShape;
  required?: string[];
  minItems?: number;
  maxItems?: number;
  enum?: unknown[];
  default?: unknown;
  description?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
}

type SymbolControl =
  | { kind: "single"; minItems?: undefined; maxItems?: undefined }
  | { kind: "symbols"; minItems?: number; maxItems?: number }
  | { kind: "holdings"; minItems?: number; maxItems?: number };

const FALLBACK_SYMBOLS = [
  "xyz:TSLA",
  "xyz:NVDA",
  "xyz:AAPL",
  "xyz:MSFT",
  "xyz:GOOGL",
  "xyz:AMD",
  "xyz:META",
  "xyz:AMZN",
  "xyz:NFLX",
  "xyz:AVGO",
  "xyz:MSTR",
  "xyz:COIN",
  "xyz:HOOD",
  "xyz:PLTR",
  "BTC",
  "ETH",
  "SOL",
  "HYPE",
  "BNB",
  "XRP",
  "DOGE",
  "LINK",
  "AVAX",
  "SUI",
] as const;

const FALLBACK_RANK: ReadonlyMap<string, number> = new Map(
  FALLBACK_SYMBOLS.map((symbol, index) => [symbol, index]),
);

function tickerOf(symbol: string): string {
  const i = symbol.indexOf(":");
  return (i === -1 ? symbol : symbol.slice(i + 1)).toUpperCase();
}

function symbolKind(symbol: string): SymbolKind {
  return symbol.includes(":") ? "Stock" : "Crypto";
}

/**
 * Keyless logo URL for a symbol — HIP-3 market assets (xyz:TSLA) resolve to
 * Parqet symbol logos, bare crypto (BTC) to the CoinCap icon CDN. Mirrors
 * `assetLogoUrl` in @zframes/frames; duplicated here because core sits *below*
 * frames in the dependency graph and can't import from it. Unknown tickers 404
 * cleanly → SymbolAvatar falls back to its monogram chip.
 */
function assetLogoUrl(symbol: string): string {
  const colon = symbol.indexOf(":");
  if (colon !== -1) {
    const ticker = symbol.slice(colon + 1);
    return `https://assets.parqet.com/logos/symbol/${encodeURIComponent(ticker)}?format=png`;
  }
  return `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`;
}

function normaliseSymbolInput(raw: string): string {
  const compact = raw.trim().replace(/\s+/g, "");
  if (!compact) return "";
  const colon = compact.indexOf(":");
  if (colon === -1) return compact.toUpperCase();
  return `${compact.slice(0, colon).toLowerCase()}:${compact
    .slice(colon + 1)
    .toUpperCase()}`;
}

function optionFor(
  symbol: string,
  stats?: DayStats,
  rank = FALLBACK_RANK.get(symbol) ?? 10_000,
): SymbolOption {
  return {
    symbol,
    ticker: tickerOf(symbol),
    kind: symbolKind(symbol),
    markPx: stats?.markPx,
    changePct: stats?.changePct,
    rank,
  };
}

function formatBriefPrice(value?: number): string {
  if (!Number.isFinite(value)) return "";
  const price = value as number;
  if (price >= 1000)
    return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (price >= 100) return `$${price.toFixed(2)}`;
  if (price >= 1) return `$${price.toFixed(3)}`;
  return `$${price.toPrecision(3)}`;
}

function formatBriefChange(value?: number): string {
  if (!Number.isFinite(value)) return "";
  const pct = value as number;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isType(shape: JsonShape | undefined, type: string): boolean {
  if (!shape?.type) return false;
  return Array.isArray(shape.type)
    ? shape.type.includes(type)
    : shape.type === type;
}

function isStringArray(shape: JsonShape | undefined): boolean {
  const items = shape?.items;
  return Boolean(items) && isType(shape, "array") && isType(items, "string");
}

function detectSymbolControl(def: AnyFrameDefinition): SymbolControl | null {
  try {
    const schema = z.toJSONSchema(def.schema, { io: "input" }) as JsonShape;
    const props = schema.properties ?? {};
    if (isType(props.symbol, "string")) return { kind: "single" };
    if (isStringArray(props.symbols)) {
      return {
        kind: "symbols",
        minItems: props.symbols?.minItems,
        maxItems: props.symbols?.maxItems,
      };
    }
    const holdings = props.holdings;
    const holdingProps = holdings?.items?.properties ?? {};
    if (isType(holdings, "array") && isType(holdingProps.symbol, "string")) {
      return {
        kind: "holdings",
        minItems: holdings?.minItems,
        maxItems: holdings?.maxItems,
      };
    }
  } catch {
    // Fall through to known built-ins if a schema cannot be converted at runtime.
  }

  if (def.name === "price-chart") return { kind: "single" };
  if (
    [
      "price-liveline",
      "price-ticker",
      "funding-rate-chart",
      "funding-heatmap",
      "price-compare",
    ].includes(def.name)
  )
    return { kind: "symbols" };
  return null;
}

function symbolsFromConfig(
  control: SymbolControl,
  config: Record<string, unknown>,
): string[] {
  if (control.kind === "single") {
    return typeof config.symbol === "string" && config.symbol
      ? [config.symbol]
      : [];
  }
  if (control.kind === "symbols") {
    return Array.isArray(config.symbols)
      ? config.symbols.filter(
          (value): value is string => typeof value === "string",
        )
      : [];
  }
  return Array.isArray(config.holdings)
    ? config.holdings
        .map((holding) =>
          isObject(holding) && typeof holding.symbol === "string"
            ? holding.symbol
            : "",
        )
        .filter(Boolean)
    : [];
}

/** Symbol-shaped keys the richer ticker picker owns, so the generic form skips
 *  them. */
const SYMBOL_FIELD_KEYS = new Set(["symbol", "symbols", "holdings"]);

interface ConfigFieldSchema {
  key: string;
  label: string;
  shape: JsonShape;
}

/** Turn a camelCase / snake / kebab config key (or enum value) into a label. */
function humanizeKey(key: string): string {
  const spaced = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : key;
}

/**
 * The frame's config fields that get a generated UI control — every schema
 * property except the symbol/holdings keys (the ticker picker owns those).
 * Pure JSON-Schema introspection, so the rail stays frame-agnostic.
 */
function configFields(def: AnyFrameDefinition): ConfigFieldSchema[] {
  let schema: JsonShape;
  try {
    schema = z.toJSONSchema(def.schema, { io: "input" }) as JsonShape;
  } catch {
    return [];
  }
  return Object.entries(schema.properties ?? {})
    .filter(([key]) => !SYMBOL_FIELD_KEYS.has(key))
    .map(([key, shape]) => ({ key, label: humanizeKey(key), shape }));
}

/** Stocks-first symbols used to seed a newly-added frame's symbol fields. */
const DEFAULT_SYMBOLS = [
  "xyz:TSLA",
  "xyz:NVDA",
  "xyz:AAPL",
  "xyz:MSFT",
  "xyz:META",
  "xyz:AMD",
  "xyz:GOOGL",
  "xyz:AMZN",
];

/** A non-empty placeholder for a required string field, by key semantics. */
function defaultString(key: string, index: number): string {
  if (key === "symbol") return DEFAULT_SYMBOLS[index % DEFAULT_SYMBOLS.length];
  if (key === "url") return "https://";
  if (key === "text") return "New note";
  if (key === "title") return "Heading";
  return humanizeKey(key) || "value";
}

/**
 * Minimal schema-valid value for one JSON-Schema shape, used to seed a required
 * field so a freshly-added frame validates instead of rendering as an error
 * card. `index` distinguishes sibling array items (distinct symbols/holdings).
 */
function defaultForShape(shape: JsonShape, key: string, index = 0): unknown {
  if (shape.default !== undefined) return shape.default;
  if (Array.isArray(shape.enum) && shape.enum.length) return shape.enum[0];
  if (isType(shape, "string")) return defaultString(key, index);
  if (isType(shape, "number") || isType(shape, "integer")) {
    if (shape.exclusiveMinimum !== undefined) return shape.exclusiveMinimum + 1;
    return shape.minimum ?? 0;
  }
  if (isType(shape, "boolean")) return false;
  if (isType(shape, "array")) {
    const items = shape.items ?? {};
    const itemKey = key === "symbols" ? "symbol" : key;
    return Array.from({ length: shape.minItems ?? 0 }, (_, i) =>
      defaultForShape(items, itemKey, i),
    );
  }
  if (isType(shape, "object")) {
    const out: Record<string, unknown> = {};
    for (const req of shape.required ?? []) {
      const prop = shape.properties?.[req];
      if (prop) out[req] = defaultForShape(prop, req, index);
    }
    return out;
  }
  return null;
}

/**
 * A schema-valid starting config for a frame added from the palette. Frames
 * with all-optional fields resolve straight from `safeParse({})`; frames with
 * required fields (a price-chart's symbol, a note's text) get minimal
 * placeholder values seeded from the schema, so they
 * render immediately and never land as a null/undefined error card.
 */
function buildDefaultConfig(def: AnyFrameDefinition): Record<string, unknown> {
  const empty = def.schema.safeParse({});
  if (empty.success) return empty.data as Record<string, unknown>;
  let shape: JsonShape;
  try {
    shape = z.toJSONSchema(def.schema, { io: "input" }) as JsonShape;
  } catch {
    return {};
  }
  const seed: Record<string, unknown> = {};
  const required = new Set(shape.required ?? []);
  for (const [key, prop] of Object.entries(shape.properties ?? {})) {
    if (required.has(key)) seed[key] = defaultForShape(prop, key);
  }
  const parsed = def.schema.safeParse(seed);
  return parsed.success ? (parsed.data as Record<string, unknown>) : seed;
}

/** Inline gear glyph for the per-frame edit button. That button lives in
 *  GridStack-owned DOM (built imperatively, like the delete ×), so it can't be a
 *  React <Settings/> — it's injected as markup. Mirrors lucide's settings icon. */
const GEAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

function useSymbolUniverse(
  providers: MarketDataProvider[],
  enabled: boolean,
): SymbolUniverse {
  const provider = useMemo(
    () => providers.find((p) => p.capabilities.includes("day-stats")),
    [providers],
  );
  const [statsBySymbol, setStatsBySymbol] = useState<Record<string, DayStats>>(
    {},
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !provider?.getDayStats) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    // Fire-and-forget: allSettled never rejects and the chain handles its own
    // outcome (cancelled guard + finally), so explicitly mark it ignored.
    void Promise.allSettled([
      provider.getDayStats(),
      provider.getDayStats(["xyz:*"]),
    ])
      .then((results) => {
        if (cancelled) return;
        const next: Record<string, DayStats> = {};
        for (const result of results) {
          if (result.status !== "fulfilled") continue;
          Object.assign(next, result.value);
        }
        setStatsBySymbol(next);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, provider]);

  const options = useMemo(() => {
    const bySymbol = new Map<string, SymbolOption>();
    FALLBACK_SYMBOLS.forEach((symbol, index) => {
      bySymbol.set(symbol, optionFor(symbol, statsBySymbol[symbol], index));
    });
    Object.entries(statsBySymbol).forEach(([symbol, stats]) => {
      bySymbol.set(
        symbol,
        optionFor(symbol, stats, FALLBACK_RANK.get(symbol) ?? 10_000),
      );
    });
    return [...bySymbol.values()].sort((a, b) => {
      if (a.rank !== b.rank) return a.rank - b.rank;
      if (a.kind !== b.kind) return a.kind === "Stock" ? -1 : 1;
      return a.ticker.localeCompare(b.ticker);
    });
  }, [statsBySymbol]);

  return { options, loading };
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
  }, []);

  // The preset whose every owned value matches the live state, if any, so its
  // chip reads as selected (and drifts to none once a slider moves).
  const activePresetKey =
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
        p.appearance.elevation === elevation,
    )?.key ?? null;
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
      rootsRef.current.get(id)?.unmount();
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
      rootsRef.current.forEach((root) => root.unmount());
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
    rootsRef.current.forEach((root) => root.unmount());
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
  ]);

  const cancel = useCallback(() => {
    restore(snapshotRef.current);
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
    setEditingId(null);
    setEditing(false);
  }, [restore]);

  const save = useCallback(async () => {
    const next = collectSpec();
    setEditing(false);
    setEditingId(null);
    if (onSave) await onSave(next);
    else download(next);
  }, [collectSpec, onSave, download]);

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
                      <button
                        type="button"
                        className="zf-mode-seg-btn"
                        disabled
                        title="Infinite canvas — coming soon"
                      >
                        Canvas
                      </button>
                    </div>
                    {isHorizontal && (
                      <p className="zf-mode-seg-hint">
                        Rows fill the height; the board scrolls sideways.
                        Rearranging stays in Vertical for now.
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
                    Open a category, then click a frame to add it — or drag it
                    onto the grid.
                  </p>
                  <div className="zf-palette-cats">
                    {paletteGroups.map((group) => {
                      const open = expandedCats.has(group.key);
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
                                    title={`Drag onto the board, or click to add ${def.name.replace(
                                      /-/g,
                                      " ",
                                    )}`}
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
                                        {def.name.replace(/-/g, " ")}
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

/**
 * The per-frame settings dialog — a modal that edits ONE frame. Each grid item
 * carries its own gear button (see decorateItem); clicking it opens this over a
 * dimmed backdrop. It renders a generated form control for every config field
 * (plus the richer ticker picker for symbol fields), validated live against the
 * frame's own schema: a valid draft is pushed to the shared instance and
 * re-renders that frame; an invalid one surfaces an error and stays local, so
 * inputs never snap back mid-edit. A frame's title is author-set in the spec,
 * not editable here.
 *
 * Portaled to <body> (outside .zf-editor), so it re-establishes --zf-accent-hue
 * / --zf-accent from the live hue and is keyed by frame id by the caller, which
 * resets the draft per frame.
 */
function FrameConfigDialog({
  instance,
  registry,
  instancesRef,
  symbolUniverse,
  accentHue,
  onApply,
  onClose,
}: {
  instance: FrameInstance;
  registry: FrameRegistry;
  instancesRef: RefObject<Map<string, FrameInstance>>;
  symbolUniverse: SymbolUniverse;
  accentHue: number;
  onApply: (id: string) => void;
  onClose: () => void;
}) {
  const def = registry.get(instance.frame);
  const symbolControl = useMemo(
    () => (def ? detectSymbolControl(def) : null),
    [def],
  );
  const fields = useMemo(() => (def ? configFields(def) : []), [def]);

  // The working draft backing every control — the source of truth for what's
  // shown, so an in-progress edit never snaps back. Valid drafts are pushed to
  // the shared instance and re-render the frame; invalid ones surface an error
  // and stay local. The keyed remount (key={frame id}) resets it per frame.
  const [config, setConfig] = useState<Record<string, unknown>>(() => ({
    ...(instance.config ?? {}),
  }));
  const [error, setError] = useState<string | null>(null);
  const instanceId = instance.id;

  const commit = useCallback(
    (next: Record<string, unknown>) => {
      setConfig(next);
      if (def) {
        const result = def.schema.safeParse(next);
        if (!result.success) {
          setError(
            result.error.issues
              .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
              .join("\n"),
          );
          return;
        }
      }
      setError(null);
      const current = instancesRef.current.get(instanceId);
      if (!current) return;
      instancesRef.current.set(instanceId, { ...current, config: next });
      onApply(instanceId);
    },
    [def, instanceId, instancesRef, onApply],
  );

  // Esc closes the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const setField = (key: string, value: unknown) =>
    commit({ ...config, [key]: value });
  const frameLabel = instance.frame.replace(/-/g, " ");

  return (
    <div
      className="zf-dialog-backdrop"
      style={{ ["--zf-accent-hue" as string]: accentHue }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="zf-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Configure ${frameLabel}`}
      >
        <header className="zf-dialog-head">
          <h3 className="zf-dialog-title">Configure · {frameLabel}</h3>
          <button
            type="button"
            className="zf-dialog-close"
            onClick={onClose}
            aria-label="Close"
            title="Close"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>
        <div className="zf-dialog-body">
          {symbolControl && (
            <TickerConfigEditor
              control={symbolControl}
              config={config}
              loading={symbolUniverse.loading}
              options={symbolUniverse.options}
              onChangeSymbol={(symbol) => commit({ ...config, symbol })}
              onChangeSymbols={(symbols) => commit({ ...config, symbols })}
              onChangeHoldings={(holdings) => commit({ ...config, holdings })}
            />
          )}
          {fields.map((field) => (
            <ConfigField
              key={field.key}
              field={field}
              value={config[field.key]}
              onChange={(value) => setField(field.key, value)}
            />
          ))}
          {!symbolControl && fields.length === 0 && (
            <p className="zf-rail-empty">This frame has no settings.</p>
          )}
          {error && <div className="zf-config-error">{error}</div>}
        </div>
        <footer className="zf-dialog-foot">
          <button
            type="button"
            className="zf-btn zf-btn--primary"
            onClick={onClose}
          >
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Dispatches a single config field to the right control by its JSON-Schema
 *  shape: checkbox (boolean), dropdown (enum), slider/number (number), tag list
 *  (string[]), color picker (hex string), or text/textarea (string). */
function ConfigField({
  field,
  value,
  onChange,
}: {
  field: ConfigFieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { key, label, shape } = field;
  const id = `zf-cfg-${key}`;
  const tip = shape.description;

  if (isType(shape, "boolean")) {
    const checked = typeof value === "boolean" ? value : Boolean(shape.default);
    return (
      <label className="zf-checkbox" title={tip}>
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        {label}
      </label>
    );
  }

  const enumValues =
    Array.isArray(shape.enum) && shape.enum.every((v) => typeof v === "string")
      ? (shape.enum as string[])
      : null;
  if (enumValues && enumValues.length > 0) {
    const fallback =
      typeof shape.default === "string" ? shape.default : enumValues[0];
    const current =
      typeof value === "string" && enumValues.includes(value)
        ? value
        : fallback;
    return (
      <div className="zf-field">
        <label htmlFor={id} title={tip}>
          {label}
        </label>
        <select
          id={id}
          className="zf-select"
          value={current}
          onChange={(e) => onChange(e.target.value)}
        >
          {enumValues.map((option) => (
            <option key={option} value={option}>
              {humanizeKey(option)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  if (isType(shape, "integer") || isType(shape, "number")) {
    return (
      <NumberField id={id} field={field} value={value} onChange={onChange} />
    );
  }

  if (isStringArray(shape)) {
    return (
      <StringListField
        id={id}
        field={field}
        value={value}
        onChange={onChange}
      />
    );
  }

  return (
    <StringField id={id} field={field} value={value} onChange={onChange} />
  );
}

function NumberField({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: ConfigFieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { label, shape } = field;
  const tip = shape.description;
  const min = typeof shape.minimum === "number" ? shape.minimum : undefined;
  const max = typeof shape.maximum === "number" ? shape.maximum : undefined;
  const isInt = isType(shape, "integer");
  const step = isInt ? 1 : "any";
  const fallback =
    typeof shape.default === "number" ? shape.default : (min ?? 0);
  const numeric =
    typeof value === "number" && Number.isFinite(value) ? value : undefined;

  // A fully-bounded range gets a slider + live value badge, mirroring the accent
  // hue control above it. Anything open-ended falls back to a number input.
  if (min !== undefined && max !== undefined) {
    const current = numeric ?? fallback;
    return (
      <div className="zf-field">
        <div className="zf-field-row">
          <label htmlFor={id} title={tip}>
            {label}
          </label>
          <span className="zf-field-num">{current}</span>
        </div>
        <input
          id={id}
          type="range"
          className="zf-range"
          min={min}
          max={max}
          step={step}
          value={current}
          onChange={(e) =>
            onChange(
              isInt
                ? Math.round(Number(e.target.value))
                : Number(e.target.value),
            )
          }
        />
      </div>
    );
  }

  return (
    <div className="zf-field">
      <label htmlFor={id} title={tip}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        className="zf-input"
        min={min}
        max={max}
        step={step}
        value={value === undefined || value === null ? "" : String(value)}
        onChange={(e) =>
          onChange(e.target.value === "" ? "" : Number(e.target.value))
        }
      />
    </div>
  );
}

function StringField({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: ConfigFieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { key, label, shape } = field;
  const tip = shape.description;
  const str = typeof value === "string" ? value : "";
  const placeholder = typeof shape.default === "string" ? shape.default : "";
  const colorDefault =
    typeof shape.default === "string" && /^#[0-9a-f]{6}$/i.test(shape.default)
      ? shape.default
      : null;

  if (key === "color" || colorDefault) {
    const swatch = /^#[0-9a-f]{6}$/i.test(str)
      ? str
      : (colorDefault ?? "#8b8df9");
    return (
      <div className="zf-field">
        <label htmlFor={id} title={tip}>
          {label}
        </label>
        <div className="zf-color-row">
          <input
            type="color"
            className="zf-color"
            value={swatch}
            aria-label={`${label} swatch`}
            onChange={(e) => onChange(e.target.value)}
          />
          <input
            id={id}
            className="zf-input"
            value={str}
            placeholder={placeholder}
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      </div>
    );
  }

  if (key === "text") {
    return (
      <div className="zf-field">
        <label htmlFor={id} title={tip}>
          {label}
        </label>
        <textarea
          id={id}
          className="zf-textarea zf-textarea--prose"
          value={str}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="zf-field">
      <label htmlFor={id} title={tip}>
        {label}
      </label>
      <input
        id={id}
        className="zf-input"
        value={str}
        placeholder={placeholder}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function StringListField({
  id,
  field,
  value,
  onChange,
}: {
  id: string;
  field: ConfigFieldSchema;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const { label, shape } = field;
  const tip = shape.description;
  const items = Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
  const [draft, setDraft] = useState("");
  const maxItems =
    typeof shape.maxItems === "number" ? shape.maxItems : undefined;
  const maxReached = maxItems !== undefined && items.length >= maxItems;

  const add = (raw: string) => {
    const token = raw.trim().toUpperCase();
    setDraft("");
    if (!token || items.includes(token) || maxReached) return;
    onChange([...items, token]);
  };

  return (
    <div className="zf-field">
      <label htmlFor={id} title={tip}>
        {label}
      </label>
      {items.length > 0 && (
        <div className="zf-taglist">
          {items.map((item) => (
            <span className="zf-tag" key={item}>
              {item}
              <button
                type="button"
                className="zf-symbol-remove"
                aria-label={`Remove ${item}`}
                onClick={() => onChange(items.filter((v) => v !== item))}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        id={id}
        className="zf-input"
        value={draft}
        disabled={maxReached}
        spellCheck={false}
        placeholder={
          maxReached ? "Maximum reached" : "Type a code, Enter to add"
        }
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => add(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (
            e.key === "Backspace" &&
            draft === "" &&
            items.length > 0
          ) {
            onChange(items.slice(0, -1));
          }
        }}
      />
    </div>
  );
}

function TickerConfigEditor({
  control,
  config,
  loading,
  options,
  onChangeSymbol,
  onChangeSymbols,
  onChangeHoldings,
}: {
  control: SymbolControl;
  config: Record<string, unknown>;
  loading: boolean;
  options: SymbolOption[];
  onChangeSymbol: (symbol: string) => void;
  onChangeSymbols: (symbols: string[]) => void;
  onChangeHoldings: (holdings: Record<string, unknown>[]) => void;
}) {
  const selected = symbolsFromConfig(control, config);

  if (control.kind === "single") {
    const symbol = selected[0] ?? "";
    return (
      <div className="zf-symbol-editor">
        <SymbolEditorHeader
          title="Ticker"
          detail={symbol ? tickerOf(symbol) : "None"}
          loading={loading}
        />
        {symbol ? (
          <SelectedTicker
            symbol={symbol}
            option={optionForSelected(symbol, options)}
          />
        ) : null}
        <SymbolCombobox
          loading={loading}
          options={options}
          selectedSymbols={symbol ? [symbol] : []}
          placeholder="Search TSLA, BTC..."
          onSelect={onChangeSymbol}
        />
      </div>
    );
  }

  if (control.kind === "symbols") {
    const maxReached =
      typeof control.maxItems === "number" &&
      selected.length >= control.maxItems;
    return (
      <div className="zf-symbol-editor">
        <SymbolEditorHeader
          title="Tickers"
          detail={tickerCountLabel(selected.length, control)}
          loading={loading}
        />
        <TickerChipList
          symbols={selected}
          options={options}
          onRemove={(symbol) =>
            onChangeSymbols(selected.filter((value) => value !== symbol))
          }
        />
        <SymbolCombobox
          disabled={maxReached}
          loading={loading}
          options={options}
          selectedSymbols={selected}
          placeholder={maxReached ? "Maximum tickers added" : "Add ticker"}
          keepOpenOnSelect
          onSelect={(symbol) => {
            if (selected.includes(symbol) || maxReached) return;
            onChangeSymbols([...selected, symbol]);
          }}
        />
      </div>
    );
  }

  const holdings = Array.isArray(config.holdings)
    ? config.holdings.filter(isObject)
    : [];
  const maxReached =
    typeof control.maxItems === "number" && holdings.length >= control.maxItems;

  return (
    <div className="zf-symbol-editor">
      <SymbolEditorHeader
        title="Holding tickers"
        detail={tickerCountLabel(holdings.length, control)}
        loading={loading}
      />
      <div className="zf-holding-list">
        {holdings.map((holding, index) => {
          const symbol =
            typeof holding.symbol === "string" ? holding.symbol : "";
          return (
            <div className="zf-holding-row" key={`${symbol}-${index}`}>
              <div className="zf-holding-main">
                {symbol ? (
                  <SelectedTicker
                    symbol={symbol}
                    option={optionForSelected(symbol, options)}
                    compact
                  />
                ) : (
                  <span className="zf-symbol-empty">No ticker</span>
                )}
                {typeof holding.amount === "number" && (
                  <span className="zf-holding-amount">x {holding.amount}</span>
                )}
              </div>
              <button
                type="button"
                className="zf-symbol-remove"
                aria-label={`Remove ${symbol || "holding"}`}
                onClick={() => {
                  onChangeHoldings(holdings.filter((_, i) => i !== index));
                }}
              >
                <X size={13} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
      <SymbolCombobox
        disabled={maxReached}
        loading={loading}
        options={options}
        selectedSymbols={selected}
        placeholder={maxReached ? "Maximum holdings added" : "Add holding"}
        keepOpenOnSelect
        onSelect={(symbol) => {
          if (maxReached) return;
          onChangeHoldings([...holdings, { symbol, amount: 1 }]);
        }}
      />
    </div>
  );
}

function SymbolEditorHeader({
  title,
  detail,
  loading,
}: {
  title: string;
  detail: string;
  loading: boolean;
}) {
  return (
    <div className="zf-symbol-head">
      <div>
        <div className="zf-symbol-label">{title}</div>
        <div className="zf-symbol-detail">{detail}</div>
      </div>
      <span
        className={loading ? "zf-symbol-source is-loading" : "zf-symbol-source"}
      >
        {loading ? "Loading" : "Live list"}
      </span>
    </div>
  );
}

function tickerCountLabel(count: number, control: SymbolControl): string {
  if (typeof control.maxItems === "number")
    return `${count}/${control.maxItems}`;
  if (typeof control.minItems === "number" && count < control.minItems)
    return `${count}/${control.minItems}+`;
  return String(count);
}

function optionForSelected(
  symbol: string,
  options: SymbolOption[],
): SymbolOption {
  return (
    options.find((option) => option.symbol === symbol) ?? optionFor(symbol)
  );
}

function TickerChipList({
  symbols,
  options,
  onRemove,
}: {
  symbols: string[];
  options: SymbolOption[];
  onRemove: (symbol: string) => void;
}) {
  if (symbols.length === 0)
    return <div className="zf-symbol-empty">No tickers selected</div>;

  return (
    <div className="zf-symbol-chips">
      {symbols.map((symbol) => (
        <span className="zf-symbol-chip" key={symbol}>
          <SelectedTicker
            symbol={symbol}
            option={optionForSelected(symbol, options)}
            compact
          />
          <button
            type="button"
            className="zf-symbol-remove"
            aria-label={`Remove ${symbol}`}
            onClick={() => onRemove(symbol)}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}

function SelectedTicker({
  symbol,
  option,
  compact = false,
}: {
  symbol: string;
  option: SymbolOption;
  compact?: boolean;
}) {
  return (
    <span
      className={
        compact ? "zf-selected-symbol is-compact" : "zf-selected-symbol"
      }
    >
      <SymbolAvatar symbol={symbol} />
      <span className="zf-selected-symbol-text">
        <strong>{tickerOf(symbol)}</strong>
        {!compact && <em>{symbol}</em>}
      </span>
      {!compact && option.markPx !== undefined && (
        <span className="zf-selected-symbol-price">
          {formatBriefPrice(option.markPx)}
        </span>
      )}
    </span>
  );
}

function SymbolCombobox({
  disabled = false,
  loading,
  options,
  selectedSymbols,
  placeholder,
  keepOpenOnSelect = false,
  onSelect,
}: {
  disabled?: boolean;
  loading: boolean;
  options: SymbolOption[];
  selectedSymbols: string[];
  placeholder: string;
  keepOpenOnSelect?: boolean;
  onSelect: (symbol: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => new Set(selectedSymbols), [selectedSymbols]);
  const known = useMemo(
    () => new Set(options.map((option) => option.symbol)),
    [options],
  );
  const normalized = normaliseSymbolInput(query);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? options.filter(
          (option) =>
            option.ticker.toLowerCase().includes(q) ||
            option.symbol.toLowerCase().includes(q),
        )
      : options.slice(0, 28);
    return filtered
      .slice()
      .sort((a, b) => scoreOption(a, q) - scoreOption(b, q))
      .slice(0, 36);
  }, [options, query]);

  const custom = useMemo(() => {
    if (!normalized) return [];
    const candidates = normalized.includes(":")
      ? [normalized]
      : [`xyz:${normalized}`, normalized];
    return candidates.filter(
      (symbol, index) =>
        candidates.indexOf(symbol) === index &&
        !known.has(symbol) &&
        !selected.has(symbol),
    );
  }, [known, normalized, selected]);

  const commit = (symbol: string) => {
    if (!symbol || (keepOpenOnSelect && selected.has(symbol))) return;
    onSelect(symbol);
    setQuery("");
    setOpen(keepOpenOnSelect);
  };

  return (
    <div
      className="zf-symbol-combo"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <div
        className={
          disabled ? "zf-symbol-search is-disabled" : "zf-symbol-search"
        }
      >
        <Search size={14} aria-hidden="true" />
        <input
          value={query}
          disabled={disabled}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-expanded={open}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(visible[0]?.symbol ?? custom[0] ?? normalized);
            }
          }}
        />
        <ChevronDown size={14} aria-hidden="true" />
      </div>

      {open && !disabled && (
        <div className="zf-symbol-menu" role="listbox">
          {loading && (
            <div className="zf-symbol-menu-status">
              Loading live universe...
            </div>
          )}
          {visible.map((option) => {
            const isSelected = selected.has(option.symbol);
            return (
              <button
                type="button"
                key={option.symbol}
                className={
                  isSelected
                    ? "zf-symbol-option is-selected"
                    : "zf-symbol-option"
                }
                disabled={keepOpenOnSelect && isSelected}
                role="option"
                aria-selected={isSelected}
                onMouseDown={(event) => {
                  event.preventDefault();
                  commit(option.symbol);
                }}
                onClick={(event) => {
                  if (event.detail === 0) commit(option.symbol);
                }}
              >
                <SymbolAvatar symbol={option.symbol} />
                <span className="zf-symbol-option-main">
                  <strong>{option.ticker}</strong>
                  <em>{option.symbol}</em>
                </span>
                <span className="zf-symbol-option-meta">
                  <span>{formatBriefPrice(option.markPx) || option.kind}</span>
                  {option.changePct !== undefined && (
                    <span
                      className={
                        option.changePct >= 0
                          ? "zf-symbol-change is-up"
                          : "zf-symbol-change is-down"
                      }
                    >
                      {formatBriefChange(option.changePct)}
                    </span>
                  )}
                </span>
                {isSelected && <Check size={14} aria-hidden="true" />}
              </button>
            );
          })}
          {custom.map((symbol) => (
            <button
              type="button"
              key={symbol}
              className="zf-symbol-option zf-symbol-option--custom"
              onMouseDown={(event) => {
                event.preventDefault();
                commit(symbol);
              }}
              onClick={(event) => {
                if (event.detail === 0) commit(symbol);
              }}
            >
              <span className="zf-symbol-custom-icon">
                <Plus size={13} aria-hidden="true" />
              </span>
              <span className="zf-symbol-option-main">
                <strong>{tickerOf(symbol)}</strong>
                <em>{symbol}</em>
              </span>
              <span className="zf-symbol-option-meta">
                <span>{symbolKind(symbol)}</span>
              </span>
            </button>
          ))}
          {!loading && visible.length === 0 && custom.length === 0 && (
            <div className="zf-symbol-menu-status">No matches</div>
          )}
        </div>
      )}
    </div>
  );
}

function scoreOption(option: SymbolOption, query: string): number {
  if (!query) return option.rank;
  const ticker = option.ticker.toLowerCase();
  const symbol = option.symbol.toLowerCase();
  if (ticker === query || symbol === query) return -40 + option.rank / 10_000;
  if (ticker.startsWith(query)) return -20 + option.rank / 10_000;
  if (symbol.startsWith(query)) return -10 + option.rank / 10_000;
  return option.rank;
}

function SymbolAvatar({ symbol }: { symbol: string }) {
  const kind = symbolKind(symbol).toLowerCase();
  // Show the real asset logo; fall back to the two-letter monogram chip when the
  // CDN 404s (indices, pre-IPO names, long-tail coins). A fresh symbol gets a
  // new shot at its logo since avatars are reused as watchlists change.
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [symbol]);

  if (failed) {
    return (
      <span className={`zf-symbol-avatar zf-symbol-avatar--${kind}`}>
        {tickerOf(symbol).slice(0, 2)}
      </span>
    );
  }
  return (
    <img
      className={`zf-symbol-avatar zf-symbol-avatar--logo zf-symbol-avatar--${kind}`}
      src={assetLogoUrl(symbol)}
      alt=""
      aria-hidden="true"
      draggable={false}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
