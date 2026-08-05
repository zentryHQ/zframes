import { defineFrame } from "@zframes/core";
import type { z } from "zod";
import { groupMeta } from "./schemas";

const schema = groupMeta.schema;

/**
 * A group's *empty* state — the only thing this component ever renders.
 *
 * `group` is a **container** frame (`container: true` on its meta), so once it
 * has children the renderer draws them as the group's own nested grid and never
 * reaches the component at all. What's left for the component is the state a
 * freshly-added group is in: an empty slot that has to say what it wants, or it
 * reads as a frame that failed to load.
 */
function GroupEmpty({ config }: { config: z.output<typeof schema> }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-white/10 px-3 text-center">
      <p className="caption text-soft">Empty group</p>
      <p className="caption text-disabled">
        Holds {config.columns}&times;{config.rows} frames
      </p>
    </div>
  );
}

export const groupFrame = defineFrame({
  ...groupMeta,
  component: GroupEmpty,
});
