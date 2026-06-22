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
import type { AnyFrameDefinition, FrameRegistry } from "./frame";
import { FRAME_CSS, FrameContent } from "./frame-content";
import { FramesProvider, useProviders } from "./hooks";
import type { DashboardSpec, FrameInstance } from "./spec";
import type { DayStats, MarketDataProvider } from "./types";

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
  if (def.name === "allocation") return { kind: "holdings" };
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
 * required fields (a price-chart's symbol, a note's text, an allocation's
 * holdings) get minimal placeholder values seeded from the schema, so they
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
    Promise.allSettled([
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
}: {
  spec: DashboardSpec;
  registry: FrameRegistry;
  /** Persist the edited spec. If omitted, Save downloads a dashboard.json. */
  onSave?: (next: DashboardSpec) => void | Promise<void>;
  /** Optional host slot for the collapsed Customise icon. */
  customiseButtonTarget?: HTMLElement | null;
  /** Notified on every accent-hue change (live drag, Reset, Cancel-restore) so
   *  the host can mirror it onto chrome the editor doesn't own — the page header
   *  and the :root-scoped --color-highlight token — in real time, not just after
   *  a save + reload. */
  onAccentHueChange?: (hue: number) => void;
}) {
  const providers = useProviders();

  const gridRef = useRef<HTMLDivElement>(null);
  const gridInstanceRef = useRef<GridStack | null>(null);
  const gridReadyRef = useRef(false);
  // Authoritative per-instance data (frame/title/config). GridStack
  // owns position; we merge the two at save time.
  const instancesRef = useRef<Map<string, FrameInstance>>(new Map());
  const rootsRef = useRef<Map<string, Root>>(new Map());
  const contentRef = useRef<Map<string, HTMLElement>>(new Map());
  const snapshotRef = useRef<FrameInstance[]>([]);
  const snapshotHueRef = useRef(spec.theme.accentHue);
  const snapshotSatRef = useRef(spec.theme.accentSat);
  const snapshotGapRef = useRef(spec.grid.gap);
  const snapshotRadiusRef = useRef(spec.appearance.radius);
  const snapshotBorderRef = useRef(spec.appearance.borderStrength);
  const snapshotSurfaceRef = useRef(spec.appearance.surfaceOpacity);
  const snapshotDensityRef = useRef(spec.appearance.density);
  const snapshotElevationRef = useRef(spec.appearance.elevation);
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
  // Which rail panel is showing: dashboard-wide cosmetics (accent/layout/
  // appearance) or the add-a-frame palette. The rail used to stack both; the
  // tabs split them so theme knobs and frame management each get the full panel.
  const [railTab, setRailTab] = useState<"cosmetics" | "frames">("cosmetics");
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

  const paletteFrames = useMemo(
    () => [...registry.values()].sort((a, b) => a.name.localeCompare(b.name)),
    [registry],
  );

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
        <FrameContent
          instance={instance}
          registry={registryRef.current}
          className="zf-fill"
        />
      </FramesProvider>,
    );
  }, []);

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
      const def = registryRef.current.get(instance.frame);
      const layout = def?.layout;
      const el = document.createElement("div") as GridItemHTMLElement;
      el.className = "grid-stack-item";
      el.setAttribute("gs-id", instance.id);
      el.setAttribute("data-frame", instance.frame);
      if (autoPosition) {
        el.setAttribute("gs-auto-position", "true");
      } else {
        el.setAttribute("gs-x", String(instance.position.x));
        el.setAttribute("gs-y", String(instance.position.y));
      }
      el.setAttribute("gs-w", String(instance.position.w));
      el.setAttribute("gs-h", String(instance.position.h));
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
    [],
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

  // Mount once: init GridStack, render the spec, wire drag-in drops.
  useEffect(() => {
    if (!gridRef.current || gridReadyRef.current) return;
    gridReadyRef.current = true;

    const grid = GridStack.init(
      {
        column: spec.grid.columns,
        cellHeight: spec.grid.rowHeight,
        margin: spec.grid.gap / 2,
        float: false,
        animate: true,
        acceptWidgets: true,
        disableDrag: true,
        disableResize: true,
      },
      gridRef.current,
    );
    gridInstanceRef.current = grid;
    restore(spec.frames);

    // A palette card dropped onto the grid: GridStack created the item, we
    // attach the frame (default config) and render it.
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
      const instance: FrameInstance = {
        id,
        frame,
        position: {
          x: node?.x ?? 0,
          y: node?.y ?? 0,
          w: node?.w ?? def?.layout?.w ?? 4,
          h: node?.h ?? def?.layout?.h ?? 3,
        },
        config: defaultConfig(def),
      };
      instancesRef.current.set(id, instance);
      contentRef.current.set(id, content);
      renderInstance(id);
      decorateItem(el);
      setCount(grid.getGridItems().length);
      setEditingId(id);
    });

    grid.on("removed", () => setCount(grid.getGridItems().length));

    return () => {
      grid.off("dropped");
      grid.off("removed");
      rootsRef.current.forEach((root) => root.unmount());
      rootsRef.current.clear();
      contentRef.current.clear();
      grid.destroy(false);
      gridInstanceRef.current = null;
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

  // Register palette cards as GridStack drag sources while customising. The
  // palette only mounts on the Frames tab, so re-run when that tab opens too —
  // otherwise the freshly-mounted cards wouldn't be draggable.
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
        helper.innerHTML = `<div class="grid-stack-item-content" data-frame="${frame}"></div>`;
        return helper;
      },
    });
  }, [editing, railTab, paletteFrames]);

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
        frames.push({
          ...inst,
          position: {
            x: node?.x ?? inst.position.x,
            y: node?.y ?? inst.position.y,
            w: node?.w ?? inst.position.w,
            h: node?.h ?? inst.position.h,
          },
        });
      }
    }
    // Reading order keeps the written file diff-friendly.
    frames.sort(
      (a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
    );
    return {
      ...spec,
      grid: { ...spec.grid, gap },
      theme: { ...spec.theme, accentHue, accentSat },
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
    gap,
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
    snapshotGapRef.current = gap;
    snapshotRadiusRef.current = radius;
    snapshotBorderRef.current = borderStrength;
    snapshotSurfaceRef.current = surfaceOpacity;
    snapshotDensityRef.current = density;
    snapshotElevationRef.current = elevation;
    setEditing(true);
  }, [
    collectSpec,
    accentHue,
    accentSat,
    gap,
    radius,
    borderStrength,
    surfaceOpacity,
    density,
    elevation,
  ]);

  const cancel = useCallback(() => {
    restore(snapshotRef.current);
    setAccentHue(snapshotHueRef.current);
    setAccentSat(snapshotSatRef.current);
    setGap(snapshotGapRef.current);
    setRadius(snapshotRadiusRef.current);
    setBorderStrength(snapshotBorderRef.current);
    setSurfaceOpacity(snapshotSurfaceRef.current);
    setDensity(snapshotDensityRef.current);
    setElevation(snapshotElevationRef.current);
    setEditingId(null);
    setEditing(false);
  }, [restore]);

  const clearAll = useCallback(() => {
    if (!window.confirm("Remove all frames from the dashboard?")) return;
    restore([]);
    setEditingId(null);
  }, [restore]);

  const save = useCallback(async () => {
    const next = collectSpec();
    setEditing(false);
    setEditingId(null);
    if (onSave) await onSave(next);
    else download(next);
  }, [collectSpec, onSave, download]);

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

  return (
    <>
      <style>{FRAME_CSS}</style>
      {customiseButtonTarget && !editing
        ? createPortal(renderCustomiseButton(), customiseButtonTarget)
        : null}
      <div
        className={editing ? "zf-editor zf-customise" : "zf-editor"}
        style={{
          // Color identity — hue + saturation drive every accent in FRAME_CSS.
          ["--zf-accent-hue" as string]: accentHue,
          ["--zf-accent-sat" as string]: `${accentSat}%`,
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
            {editing && (
              <span className="zf-editor-hint">
                drag to move · drag a corner to resize · hover to delete
              </span>
            )}
            <div className="zf-editor-bar-spacer" />
            {!editing ? (
              renderCustomiseButton()
            ) : (
              <>
                <button
                  type="button"
                  className="zf-btn zf-btn--danger"
                  onClick={clearAll}
                >
                  Clear
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
          <div className="zf-editor-grid">
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
              </div>

              {railTab === "cosmetics" && (
                <>
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
                    <h3 className="zf-rail-title">Layout</h3>
                    <div className="zf-theme-row">
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
                </>
              )}

              {railTab === "frames" && (
                <section>
                  <h3 className="zf-rail-title">Add a frame</h3>
                  <p className="zf-palette-hint">
                    Click to add, or drag onto the grid.
                  </p>
                  <div className="zf-palette">
                    {paletteFrames.map((def) => (
                      <div
                        key={def.name}
                        className="zf-newwidget"
                        data-frame={def.name}
                        role="button"
                        tabIndex={0}
                        title={`Add ${def.name.replace(/-/g, " ")}`}
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
  const fallback = typeof shape.default === "number" ? shape.default : min ?? 0;
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
      : colorDefault ?? "#8b8df9";
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
