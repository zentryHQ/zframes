import { createRegistry } from "@zframes/core";
import { allFrames } from "@zframes/frames";

/** One shared registry of every built-in frame, reused across all stories. */
export const registry = createRegistry(allFrames);
