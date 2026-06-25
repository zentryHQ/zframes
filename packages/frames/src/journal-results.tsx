import { defineFrame } from "@zframes/core";
import type { z } from "zod";
import { useJournal } from "./journal-store";
import { JournalEmpty, ResolvedCard } from "./journal-ui";
import { journalResultsMeta } from "./schemas";
import { scrollAreaClass } from "./ui";

const schema = journalResultsMeta.schema;

function JournalResults({ config }: { config: z.output<typeof schema> }) {
  const { resolved } = useJournal();

  if (resolved.length === 0)
    return <JournalEmpty>nothing graded yet — your calls resolve here</JournalEmpty>;

  const shown = resolved.slice(0, config.max);
  return (
    <div className={`flex flex-col gap-2 ${scrollAreaClass}`}>
      {shown.map((c) => (
        <ResolvedCard key={c.id} call={c} />
      ))}
    </div>
  );
}

export const journalResultsFrame = defineFrame({
  ...journalResultsMeta,
  component: JournalResults,
});
