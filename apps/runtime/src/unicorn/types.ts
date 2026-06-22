// Minimal slice of the UnicornStudio runtime types we touch — enough to find
// the orb's effect layer and drive its speed. Lifted/trimmed from Nexus's
// lib/unicorn/type.ts (Zentry's own IP).

export type Layer = { id: string } & (
  | { layerType: "shape"; opacity: number; fill: string[] }
  | {
      layerType: "effect";
      /** 0..n animation speed, mutated live */ speed: number;
    }
);

export type EffectLayer = Extract<Layer, { layerType: "effect" }>;

export interface UnicornSceneType {
  destroy(): void;
  layers: Layer[];
  paused?: boolean;
}

export interface AddSceneConfig {
  /** URL (here a blob: URL) of the exported scene JSON. */
  filePath: string;
  elementId: string;
  dpi: number;
  scale: number;
  fps: number;
}

export interface UnicornStudioType {
  addScene(config: AddSceneConfig): Promise<UnicornSceneType>;
}
