import { defineFrame, useFramePatch } from "@zframes/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { noteMeta } from "./schemas";

const schema = noteMeta.schema;

function Note({ config }: { config: z.output<typeof schema> }) {
  const patch = useFramePatch();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(config.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setDraft(config.text);
  }, [config.text]);

  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const commit = useCallback(() => {
    if (draft !== config.text) patch?.({ text: draft });
    setEditing(false);
  }, [patch, draft, config.text]);

  const centerClass =
    config.align === "center"
      ? "flex items-center justify-center text-center"
      : "";

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        className={`body-md text-normal h-full w-full resize-none bg-transparent outline-none placeholder:text-white/30 ${centerClass}`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(config.text);
            setEditing(false);
          }
        }}
        placeholder="Write a note…"
      />
    );
  }

  return (
    <div
      className={`body-md text-normal h-full overflow-auto whitespace-pre-wrap ${centerClass} ${
        patch ? "cursor-text" : ""
      }`}
      onClick={() => patch && setEditing(true)}
      title={patch ? "Click to edit" : undefined}
    >
      {config.text || (
        <span className="text-soft italic">
          {patch ? "Click to add a note…" : "New note"}
        </span>
      )}
    </div>
  );
}

export const noteFrame = defineFrame({
  ...noteMeta,
  component: Note,
});
