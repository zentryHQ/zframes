import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import type { AnyFrameDefinition } from "@zframes/spec/frame";
import type { DayStats, MarketDataProvider } from "@zframes/spec/types";

export type SymbolKind = "Stock" | "Crypto" | "Custom";

export interface SymbolOption {
  symbol: string;
  ticker: string;
  kind: SymbolKind;
  markPx?: number;
  changePct?: number;
  rank: number;
}

export interface SymbolUniverse {
  options: SymbolOption[];
  loading: boolean;
}

export interface JsonShape {
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

export type SymbolControl =
  | { kind: "single"; minItems?: undefined; maxItems?: undefined }
  | { kind: "symbols"; minItems?: number; maxItems?: number }
  | { kind: "holdings"; minItems?: number; maxItems?: number };

// The picker fetches the whole live `xyz:*` universe; this is the offline
// fallback AND the priority ranking that floats a hand-picked set to the top.
// Stocks-first, then crypto — and deliberately spanning every xyz asset class
// (index / commodity / FX / ETF / semis-memory), not just mega-cap tech, so the
// top of the list reads as a cross-asset terminal.
const FALLBACK_SYMBOLS = [
  // Indices
  "xyz:XYZ100",
  "xyz:SP500",
  // Mega-cap tech
  "xyz:NVDA",
  "xyz:TSLA",
  "xyz:AAPL",
  "xyz:MSFT",
  "xyz:GOOGL",
  "xyz:META",
  "xyz:AMZN",
  // Semiconductors & memory
  "xyz:MU",
  "xyz:AMD",
  "xyz:AVGO",
  "xyz:ARM",
  "xyz:TSM",
  "xyz:SKHX",
  // Crypto-adjacent & growth
  "xyz:MSTR",
  "xyz:COIN",
  "xyz:HOOD",
  "xyz:PLTR",
  "xyz:SPCX",
  // Commodities
  "xyz:GOLD",
  "xyz:SILVER",
  "xyz:CL",
  "xyz:BRENTOIL",
  "xyz:COPPER",
  // FX & broad ETF
  "xyz:EUR",
  "xyz:JPY",
  "xyz:SMH",
  // Crypto majors
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

export function tickerOf(symbol: string): string {
  const i = symbol.indexOf(":");
  return (i === -1 ? symbol : symbol.slice(i + 1)).toUpperCase();
}

export function symbolKind(symbol: string): SymbolKind {
  return symbol.includes(":") ? "Stock" : "Crypto";
}

/**
 * Keyless logo URL for a symbol — HIP-3 market assets (xyz:TSLA) resolve to
 * Parqet symbol logos, bare crypto (BTC) to the CoinCap icon CDN. Mirrors
 * `assetLogoUrl` in @zframes/frames; duplicated here because core sits *below*
 * frames in the dependency graph and can't import from it. Unknown tickers 404
 * cleanly → SymbolAvatar falls back to its monogram chip.
 */
export function assetLogoUrl(symbol: string): string {
  const colon = symbol.indexOf(":");
  if (colon !== -1) {
    const ticker = symbol.slice(colon + 1);
    return `https://assets.parqet.com/logos/symbol/${encodeURIComponent(ticker)}?format=png`;
  }
  return `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`;
}

export function normaliseSymbolInput(raw: string): string {
  const compact = raw.trim().replace(/\s+/g, "");
  if (!compact) return "";
  const colon = compact.indexOf(":");
  if (colon === -1) return compact.toUpperCase();
  return `${compact.slice(0, colon).toLowerCase()}:${compact
    .slice(colon + 1)
    .toUpperCase()}`;
}

export function optionFor(
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

export function formatBriefPrice(value?: number): string {
  if (!Number.isFinite(value)) return "";
  const price = value as number;
  if (price >= 1000)
    return `$${price.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  if (price >= 100) return `$${price.toFixed(2)}`;
  if (price >= 1) return `$${price.toFixed(3)}`;
  return `$${price.toPrecision(3)}`;
}

export function formatBriefChange(value?: number): string {
  if (!Number.isFinite(value)) return "";
  const pct = value as number;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isType(shape: JsonShape | undefined, type: string): boolean {
  if (!shape?.type) return false;
  return Array.isArray(shape.type)
    ? shape.type.includes(type)
    : shape.type === type;
}

export function isStringArray(shape: JsonShape | undefined): boolean {
  const items = shape?.items;
  return Boolean(items) && isType(shape, "array") && isType(items, "string");
}

/**
 * An array of objects whose properties are all scalars — the shape behind
 * `image-gallery.images`, `link-grid.links`, `macro-calendar.events` and
 * `breakeven.fills`.
 *
 * These four were the only config fields in the whole registry that the
 * generated form had no control for, and the fallback (a plain text input) could
 * never produce a valid value — so those frames were unconfigurable in the UI and
 * could only be authored by hand-editing dashboard.json. `objectArrayFields`
 * turns the item schema into the per-column controls the row editor renders.
 */
export function isObjectArray(shape: JsonShape | undefined): boolean {
  return (
    isType(shape, "array") &&
    isType(shape?.items, "object") &&
    Object.keys(shape?.items?.properties ?? {}).length > 0
  );
}

/** The item schema's properties, as the row editor's columns. */
export function objectArrayFields(
  shape: JsonShape | undefined,
): ConfigFieldSchema[] {
  const props = shape?.items?.properties ?? {};
  return Object.entries(props).map(([key, s]) => ({
    key,
    label: humanizeKey(key),
    shape: s,
  }));
}

/** Which of the item schema's properties the row editor must fill for a new row
 *  to validate, so "Add" never seeds a row that immediately errors. */
export function objectArrayRequired(shape: JsonShape | undefined): string[] {
  const required = shape?.items?.required;
  return Array.isArray(required)
    ? required.filter((k) => typeof k === "string")
    : [];
}

export function detectSymbolControl(
  def: AnyFrameDefinition,
): SymbolControl | null {
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

export function symbolsFromConfig(
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

export interface ConfigFieldSchema {
  key: string;
  label: string;
  shape: JsonShape;
}

/** Turn a camelCase / snake / kebab config key (or enum value) into a label. */
export function humanizeKey(key: string): string {
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
export function configFields(def: AnyFrameDefinition): ConfigFieldSchema[] {
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

/** Stocks-first symbols used to seed a newly-added frame's symbol fields —
 *  a cross-asset mix (mega-cap tech + an index + gold) so a freshly-added
 *  multi-symbol frame renders varied rather than all-tech. */
const DEFAULT_SYMBOLS = [
  "xyz:TSLA",
  "xyz:NVDA",
  "xyz:AAPL",
  "xyz:MSFT",
  "xyz:SP500",
  "xyz:GOLD",
  "xyz:GOOGL",
  "xyz:AMZN",
];

/** A non-empty placeholder for a required string field, by key semantics. */
function defaultString(key: string, index: number): string {
  if (key === "symbol") return DEFAULT_SYMBOLS[index % DEFAULT_SYMBOLS.length];
  if (key === "url") return "https://";
  if (key === "text") return "New note";
  if (key === "title") return "Heading";
  // A date field wants ISO YYYY-MM-DD (macro-calendar.events). The generic
  // humanized fallback would seed the literal string "Date", which satisfies the
  // JSON-Schema type but renders as an Invalid Date on the card.
  if (key === "date") return new Date().toISOString().slice(0, 10);
  return humanizeKey(key) || "value";
}

/**
 * Minimal schema-valid value for one JSON-Schema shape, used to seed a required
 * field so a freshly-added frame validates instead of rendering as an error
 * card. `index` distinguishes sibling array items (distinct symbols/holdings).
 */
export function defaultForShape(
  shape: JsonShape,
  key: string,
  index = 0,
): unknown {
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
 * Frame definitions are module singletons and their schemas never change, so
 * the (Zod parse + JSON-Schema conversion) work is done once per definition.
 * Callers get a shallow copy — some (the catalogue's account-frame override)
 * mutate top-level keys of the result.
 */
const defaultConfigCache = new WeakMap<
  AnyFrameDefinition,
  Record<string, unknown>
>();

/**
 * A schema-valid starting config for a frame added from the palette. Frames
 * with all-optional fields resolve straight from `safeParse({})`; frames with
 * required fields (a price-chart's symbol, a note's text) get minimal
 * placeholder values seeded from the schema, so they
 * render immediately and never land as a null/undefined error card.
 */
export function buildDefaultConfig(
  def: AnyFrameDefinition,
): Record<string, unknown> {
  const cached = defaultConfigCache.get(def);
  if (cached) return { ...cached };
  const config = computeDefaultConfig(def);
  defaultConfigCache.set(def, config);
  return { ...config };
}

function computeDefaultConfig(
  def: AnyFrameDefinition,
): Record<string, unknown> {
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

export function useSymbolUniverse(
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
