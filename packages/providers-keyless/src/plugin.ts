/**
 * The keyless fleet as a loadable `ProviderPlugin` module: `manifest` (the
 * declaration, from `./manifest`, which stays pure data) plus
 * `createProviders` (an alias of `createKeylessProviders`, not a second
 * implementation — two factories that could drift is exactly the failure this
 * package exists to remove). This is the module the runtime's plugin loader
 * dynamic-imports, so it becomes its own browser chunk: an installation that
 * never mounts the fleet never downloads it.
 */
export { KEYLESS_MANIFEST as manifest } from "./manifest";
export { createKeylessProviders as createProviders } from "./index";
