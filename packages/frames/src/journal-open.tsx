import { defineFrame, useMids } from "@zframes/core";
import { useEffect, useState } from "react";
import type { z } from "zod";
import { resolveCall, useJournal } from "./journal-store";
import { JournalEmpty, OpenCard } from "./journal-ui";
import { journalOpenMeta } from "./schemas";
import { scrollAreaClass } from "./ui";

const schema = journalOpenMeta.schema;

function JournalOpen({ config }: { config: z.output<typeof schema> }) {
  const { open } = useJournal();
  const [now, setNow] = useState(() => Date.now());
  // Live mids for every open call's symbol — drives the unrealized return.
  const mids = useMids(open.map((c) => c.symbol));

  // One clock drives every card's countdown + live return.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Auto-resolve any call whose horizon has elapsed, at the live price.
  // resolveCall is a no-op if the call's already gone, so this is safe to
  // re-run each tick.
  useEffect(() => {
    for (const c of open) {
      const mid = mids[c.symbol];
      if (now >= c.resolveAt && mid != null) resolveCall(c.id, mid);
    }
  }, [now, open, mids]);

  if (open.length === 0)
    return (
      <JournalEmpty>no open calls — log a read in Journal · Log</JournalEmpty>
    );

  const shown = open.slice(0, config.max);
  return (
    <div className={`flex flex-col gap-2 ${scrollAreaClass}`}>
      {shown.map((c) => {
        const mid = mids[c.symbol];
        return (
          <OpenCard
            key={c.id}
            call={c}
            now={now}
            mid={mid}
            onClose={mid != null ? () => resolveCall(c.id, mid) : undefined}
          />
        );
      })}
    </div>
  );
}

export const journalOpenFrame = defineFrame({
  ...journalOpenMeta,
  component: JournalOpen,
});
