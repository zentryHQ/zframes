import Markdown from "markdown-to-jsx";
import type { ComponentPropsWithoutRef } from "react";

// Renders a zAI answer as light markdown so links are clickable and lists /
// emphasis read as intended, instead of showing raw `[title](url)` / `**bold**`
// syntax as plain text. We reuse Nexus's approach (markdown-to-jsx + an
// `overrides` map) but NOT its component — that one is welded to Nexus internals
// (@zentryhq/z-compiler citation replacers, SmartLink routing, widgets). Here we
// only need links + basic formatting, themed to the orb via `.zai-md` in ORB_CSS.
//
// markdown-to-jsx renders to React elements and sanitizes URLs by default (drops
// javascript: hrefs), so it also hardens the web content zAI can now pull in — no
// separate DOMPurify pass needed for our (no-raw-HTML) use.

const MD_OPTIONS = {
  // Force block rendering so paragraphs + a trailing "Sources:" list lay out
  // consistently even when the answer is a single line.
  forceBlock: true,
  overrides: {
    // Every link opens in a new tab; rel guards against tab-nabbing. The models
    // cite with [title](url), so this turns citations into titled, clickable
    // source chips for free.
    a: {
      component: ({ children, ...props }: ComponentPropsWithoutRef<"a">) => (
        <a {...props} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ),
    },
  },
} as const;

export function MarkdownAnswer({ text }: { text: string }) {
  return (
    <div className="zai-md">
      <Markdown options={MD_OPTIONS}>{text}</Markdown>
    </div>
  );
}
