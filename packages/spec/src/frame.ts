import type { ComponentType } from "react";
import type { z } from "zod";
import type { Capability } from "./types";

/**
 * Grid sizing hints in grid units (columns × rows). The CSS-grid renderer
 * ignores these — every instance carries an explicit `position`. They drive
 * the interactive editor: the default size of a frame dragged in from the
 * palette, and the min/max bounds the resize handles enforce.
 */
export interface FrameLayout {
  /** Default width in grid columns when added from the palette. */
  w: number;
  /** Default height in grid rows when added from the palette. */
  h: number;
  /** Minimum width in columns (resize floor). */
  minW?: number;
  /** Minimum height in rows (resize floor). */
  minH?: number;
  /** Maximum width in columns (resize ceiling). */
  maxW?: number;
  /** Maximum height in rows (resize ceiling). */
  maxH?: number;
}

/**
 * The catalogue's top-level taxonomy — ordered, with the label + one-line
 * blurb each category shows in the editor palette and the AI catalogue. This
 * is the single source of truth for both the set of valid categories (the
 * `FrameCategory` union derives from it) and their display order; the palette
 * renders groups in this order and the AI reads the blurb to reason about
 * which family a need falls into. Adding a category = one entry here.
 */
export const FRAME_CATEGORIES = [
  {
    key: "markets",
    label: "Prices & Markets",
    description:
      "Live price charts, tickers, and market movers across stocks and crypto.",
  },
  {
    key: "crypto",
    label: "Crypto & On-chain",
    description:
      "Crypto market structure and DeFi/on-chain activity — dominance, market caps, TVL, DEX volume, and fees.",
  },
  {
    key: "bitcoin",
    label: "Bitcoin Network",
    description:
      "Bitcoin chain health — fees, mempool, blocks, hashrate, difficulty, mining pools, and Lightning.",
  },
  {
    key: "onchain",
    label: "On-chain & Cycle",
    description:
      "Bitcoin valuation ratios and cycle timing — MVRV, NUPL, SOPR, Puell, Mayer Multiple, Pi Cycle, moving-average multipliers, RSI momentum, and cycle top/bottom signal checklists.",
  },
  {
    key: "derivatives",
    label: "Derivatives & Options",
    description:
      "Perp funding, open interest, and options positioning and volatility.",
  },
  {
    key: "macro",
    label: "Macro & Rates",
    description:
      "Official macro data — rates, the yield curve, inflation, jobs, debt, Treasury auctions, and financial stress.",
  },
  {
    key: "equities",
    label: "Equities & Filings",
    description:
      "Single-company fundamentals, SEC filings, and short-sale volume.",
  },
  {
    key: "sentiment",
    label: "Sentiment & News",
    description: "Market-mood gauges and news headline feeds.",
  },
  {
    key: "portfolio",
    label: "Portfolio",
    description: "Your own holdings and their live allocation.",
  },
  {
    key: "journal",
    label: "Decision Journal",
    description:
      "Your decision journal — log market calls, watch them play out, see them graded, and track how calibrated your judgment is over time.",
  },
  {
    key: "tools",
    label: "Tools & Utility",
    description:
      "Clocks, countdowns, calculators, link grids, and the daily brief.",
  },
  {
    key: "layout",
    label: "Layout & Media",
    description:
      "Structural and decorative frames — headings, dividers, notes, images, video, and quotes.",
  },
  {
    key: "games",
    label: "Games",
    description: "Idle canvas games for when the market is quiet.",
  },
] as const satisfies readonly {
  key: string;
  label: string;
  description: string;
}[];

/** The family a frame belongs to — one of {@link FRAME_CATEGORIES}' keys. */
export type FrameCategory = (typeof FRAME_CATEGORIES)[number]["key"];

/**
 * A data-provenance credit shown on the card chrome: the provider's display
 * name and the page opened when it's clicked. Frames with no external data
 * (headings, notes, the clock, client-side market hours) declare none.
 */
export interface FrameSource {
  /** Display name, e.g. "Hyperliquid", "DeFiLlama", "SEC EDGAR". */
  name: string;
  /** Canonical URL opened in a new tab when the credit is clicked. */
  url: string;
}

/**
 * AI-facing frame metadata — everything but the React component. Kept
 * separate so tooling (CLI lint, catalogue export, the /zframes skill) can
 * load schemas without pulling React, chart code, or CSS.
 */
export interface FrameMeta<S extends z.ZodType = z.ZodType> {
  /** Unique frame name, referenced by dashboard specs. */
  name: string;
  /**
   * Human-readable display name. It's the card's default title when an instance
   * sets no `title`, and the name shown in the editor palette / AI catalogue.
   * Required so every frame ships a polished default and no dashboard has to
   * hand-author a title just to avoid a raw `frame-id` label.
   */
  label: string;
  /**
   * The family this frame belongs to — groups the editor palette and the AI
   * catalogue. One of {@link FRAME_CATEGORIES}' keys; see that list for the
   * label and blurb each category renders with.
   */
  category: FrameCategory;
  /** AI-facing: what the frame shows and when a generating agent should pick it. */
  description: string;
  /** Optional visual used by editor palettes/catalogues. */
  iconUrl?: string;
  /** Data needs; the host must supply providers covering them. */
  capabilities: readonly Capability[];
  /** Config schema. Every field needs .describe() — agents read this catalogue. */
  schema: S;
  /**
   * How the renderer wraps the frame:
   * - "card" (default) — the standard boxed chrome with an auto-title from
   *   `label` (an instance `title` overrides it).
   * - "plain" — the boxed card surface, but NO auto-title: the title row is
   *   shown only when the instance sets an explicit `title`. For media / content
   *   frames (image, note, video, quote, link-grid) whose own content is the
   *   heading, so a "NOTE" / "IMAGE" furniture label is just noise. Still fully
   *   customizable — set `title` on the instance to bring the header back.
   * - "bare" — no card and no title at all — for structural frames like
   *   `heading` / `divider` that divide a dashboard into zones.
   */
  chrome?: "card" | "plain" | "bare";
  /**
   * Default size + resize bounds for the interactive editor. Optional; the
   * editor falls back to a sensible default when absent. Not used by the
   * CSS-grid renderer (instances always declare an explicit `position`).
   */
  layout?: FrameLayout;
  /**
   * Where this frame's data comes from. The chrome renders it as a clickable
   * credit in the title row (one or more provider links). Omit for frames with
   * no external data feed.
   */
  source?: FrameSource | FrameSource[];
  /**
   * Marks a frame as part of the opt-in *connected-account* tier: it renders the
   * user's own portfolio (a keyed CEX account or a keyless on-chain wallet)
   * instead of keyless public data. The catalogue, editor palette, and renderer
   * use this to group it apart and show a connect-state until a source is
   * configured/connected. Deliberately source-agnostic — whether the configured
   * source needs credentials (Binance) or just a public address (wallet) is
   * per-instance config, not declared here. Keyless frames omit it.
   */
  account?: boolean;
}

/** Identity helper so the schema generic flows through meta declarations. */
export function defineFrameMeta<S extends z.ZodType>(
  meta: FrameMeta<S>,
): FrameMeta<S> {
  return meta;
}

export interface FrameDefinition<
  S extends z.ZodType = z.ZodType,
> extends FrameMeta<S> {
  component: ComponentType<{ config: z.output<S> }>;
  /**
   * Optional leading element for the card title (e.g. an asset logo for a
   * single-symbol chart). Core renders it inside `.zf-frame-title` and hides
   * the default dot when present. Lives on the definition, not the meta, so
   * the React-free catalogue stays React-free; asset-specific rendering stays
   * in the frame and core just provides the slot.
   */
  titleIcon?: ComponentType<{ config: z.output<S> }>;
  /**
   * Optional replacement for the card title *text* — a frame-owned component
   * that renders inside the same `.zf-frame-title-text` slot (so it inherits
   * the title's type/tracking/truncation) in place of the frame-name default,
   * e.g. a live ticker + mid on a price chart or the compared symbols joined by
   * "VS". Runs inside the frame's provider context, so it may use data hooks.
   * An explicit per-instance `title` still wins; the leading `titleIcon` and
   * the source credit are unaffected. Lives on the definition, not the meta,
   * so the React-free catalogue stays React-free.
   */
  titleContent?: ComponentType<{ config: z.output<S> }>;
}

/** Registry entries erase the schema generic; defineFrame guarantees coherence. */
export type AnyFrameDefinition = FrameDefinition;

export function defineFrame<S extends z.ZodType>(
  def: FrameDefinition<S>,
): AnyFrameDefinition {
  return def as AnyFrameDefinition;
}

export type FrameRegistry = Map<string, AnyFrameDefinition>;

export function createRegistry(frames: AnyFrameDefinition[]): FrameRegistry {
  return new Map(frames.map((frame) => [frame.name, frame]));
}
