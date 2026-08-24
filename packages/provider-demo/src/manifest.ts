/**
 * The demo provider's plugin manifest — PURE DATA, mirroring the keyless
 * fleet's `manifest`/`plugin` split so a Node mount can read the declaration
 * without loading the 4.7k-line provider.
 *
 * `synthetic: true` is the load-bearing field: this is the plugin a bare
 * install mounts, and that flag is what the runtime's host chrome labels the
 * board with, so generated numbers are never mistaken for a market. No hosts,
 * no credits, no terms — it fabricates everything and contacts nothing, which
 * is exactly why it can be the default.
 */
import type { ProviderPluginManifest } from "@zframes/spec";
import { DEMO_CAPABILITIES } from "./mock-provider";

export const DEMO_MANIFEST: ProviderPluginManifest = {
  id: "demo",
  name: "Demo data",
  description:
    "Deterministic seeded data for every capability — zero network, plainly simulated. What a bare install renders on.",
  capabilities: DEMO_CAPABILITIES,
  sources: [],
  hosts: [],
  synthetic: true,
};
