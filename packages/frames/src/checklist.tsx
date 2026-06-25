import { defineFrame, useFramePatch } from "@zframes/core";
import { useState } from "react";
import type { z } from "zod";
import { checklistMeta } from "./schemas";
import { scrollAreaClass } from "./ui";

const schema = checklistMeta.schema;
type Config = z.output<typeof schema>;

function Checklist({ config }: { config: Config }) {
  const patch = useFramePatch();
  // Persisted into the dashboard when editable; local-only in the bare renderer.
  const [local, setLocal] = useState<boolean[]>(config.checked);
  const checked = patch ? config.checked : local;

  const toggle = (i: number) => {
    const next = config.items.map((_, j) =>
      j === i ? !checked[j] : !!checked[j],
    );
    if (patch) patch({ checked: next });
    else setLocal(next);
  };

  const done = config.items.filter((_, i) => checked[i]).length;
  const title = config.title.trim();

  return (
    <div className="flex h-full w-full flex-col">
      <div className="mb-1 flex shrink-0 items-baseline justify-between gap-2">
        {title && (
          <div className="body-sm text-strong truncate font-semibold">
            {title}
          </div>
        )}
        <div className="caption text-soft shrink-0 tabular-nums">
          {done}/{config.items.length}
        </div>
      </div>
      <div className={`min-h-0 flex-1 ${scrollAreaClass}`}>
        {config.items.map((item, i) => (
          <button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            className="flex w-full items-center gap-2 py-1 text-left"
          >
            <span
              className="caption flex h-4 w-4 shrink-0 items-center justify-center rounded border leading-none"
              style={{
                borderColor: checked[i]
                  ? "var(--color-highlight)"
                  : "rgba(255,255,255,0.2)",
                background: checked[i]
                  ? "var(--color-highlight)"
                  : "transparent",
                color: checked[i] ? "#0b0e14" : "transparent",
              }}
            >
              ✓
            </span>
            <span
              className={`body-sm ${checked[i] ? "text-disabled line-through" : "text-normal"}`}
            >
              {item}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export const checklistFrame = defineFrame({
  ...checklistMeta,
  component: Checklist,
});
