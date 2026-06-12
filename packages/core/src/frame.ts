import type { ComponentType } from "react";
import type { z } from "zod";
import type { Capability } from "./types";

/**
 * AI-facing frame metadata — everything but the React component. Kept
 * separate so tooling (CLI lint, catalogue export, the /zframe skill) can
 * load schemas without pulling React, chart code, or CSS.
 */
export interface FrameMeta<S extends z.ZodType = z.ZodType> {
  /** Unique frame name, referenced by dashboard specs. */
  name: string;
  /** AI-facing: what the frame shows and when a generating agent should pick it. */
  description: string;
  /** Data needs; the host must supply providers covering them. */
  capabilities: readonly Capability[];
  /** Config schema. Every field needs .describe() — agents read this catalogue. */
  schema: S;
}

/** Identity helper so the schema generic flows through meta declarations. */
export function defineFrameMeta<S extends z.ZodType>(
  meta: FrameMeta<S>,
): FrameMeta<S> {
  return meta;
}

export interface FrameDefinition<S extends z.ZodType = z.ZodType>
  extends FrameMeta<S> {
  component: ComponentType<{ config: z.output<S> }>;
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
