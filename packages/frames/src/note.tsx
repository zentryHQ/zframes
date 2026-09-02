import { defineFrame, useFramePatch } from "@zframes/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { z } from "zod";
import { renderMarkdown } from "./markdown";
import { noteMeta } from "./schemas";
import { scrollAreaClass } from "./ui";

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

  // A BLANK commit is refused, and reverts to the previous note exactly as
  // Escape does. The schema requires a non-empty string, so writing "" turned
  // the card into an "Invalid configuration" error card — and because an error
  // card replaces the frame's whole interior, the click-to-edit affordance went
  // with it: the only way back was the config dialog in customise mode, which
  // is not a route a user clicking inside a note has any reason to know about.
  const commit = useCallback(() => {
    const next = draft.trim() ? draft : config.text;
    if (next !== config.text) patch?.({ text: next });
    // Re-seed the box: `config.text` didn't change on a refused commit, so the
    // effect that mirrors it wouldn't clear the blank draft on the next open.
    setDraft(next);
    setEditing(false);
  }, [patch, draft, config.text]);

  const centered = config.align === "center";

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        className={`body-sm text-normal h-full w-full resize-none bg-transparent outline-none placeholder:text-disabled ${
          centered ? "text-center" : ""
        }`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setDraft(config.text);
            setEditing(false);
          }
        }}
        placeholder="Write a note… (Markdown supported)"
      />
    );
  }

  return (
    <div
      className={`body-sm text-normal ${scrollAreaClass} ${
        centered ? "flex items-center justify-center text-center" : ""
      } ${patch ? "cursor-text" : ""}`}
      onClick={() => patch && setEditing(true)}
      title={patch ? "Click to edit" : undefined}
    >
      {config.text ? (
        <div
          className={`flex flex-col gap-2 break-words ${
            centered ? "items-center text-center" : ""
          }`}
        >
          {renderMarkdown(config.text)}
        </div>
      ) : (
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
