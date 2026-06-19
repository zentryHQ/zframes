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
  /** AI-facing: what the frame shows and when a generating agent should pick it. */
  description: string;
  /** Optional visual used by editor palettes/catalogues. */
  iconUrl?: string;
  /** Data needs; the host must supply providers covering them. */
  capabilities: readonly Capability[];
  /** Config schema. Every field needs .describe() — agents read this catalogue. */
  schema: S;
  /**
   * How the renderer wraps the frame. "card" (default) gets the standard boxed
   * chrome; "bare" renders the component with no card or auto-title — for
   * structural frames like `heading` that divide a dashboard into zones rather
   * than sitting in a box.
   */
  chrome?: "card" | "bare";
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
