import { defineFrame } from "@zframes/core";
import type { z } from "zod";
import { rulesCardMeta } from "./schemas";
import { FrameStatus, scrollAreaClass } from "./ui";

const schema = rulesCardMeta.schema;
type Config = z.output<typeof schema>;

function RulesCard({ config }: { config: Config }) {
  const rules = config.rules.filter((r) => r.trim());
  const title = config.title.trim();

  if (rules.length === 0) return <FrameStatus>no rules yet</FrameStatus>;

  return (
    <div className="flex h-full w-full flex-col">
      {title && (
        <div className="body-sm text-strong mb-1 shrink-0 font-semibold">
          {title}
        </div>
      )}
      <ol className={`min-h-0 flex-1 ${scrollAreaClass}`}>
        {rules.map((r, i) => (
          <li key={i} className="flex gap-2 py-1">
            <span className="caption text-highlight shrink-0 tabular-nums">
              {i + 1}
            </span>
            <span className="body-sm text-normal">{r}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export const rulesCardFrame = defineFrame({
  ...rulesCardMeta,
  component: RulesCard,
});
