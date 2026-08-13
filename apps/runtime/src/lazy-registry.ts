// The lazy registry was promoted into @zframes/frames so other hosts (the
// explorer) can share it; this module stays as the runtime's import site and
// the home of its contract test (./lazy-registry.test.ts).
export {
  createLazyRegistry,
  prefetchFrames,
} from "@zframes/frames/lazy-registry";
