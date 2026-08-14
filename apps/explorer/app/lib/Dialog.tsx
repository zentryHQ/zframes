"use client";

import { type ReactNode } from "react";
import {
  Dialog as DialogRoot,
  DialogContent,
  DialogTitle,
} from "@/app/components/ui/dialog";

// Shared modal shell — the one overlay + panel used by Publish / AgentFork /
// Report. Now backed by shadcn/radix Dialog (focus trap, portal, scroll-lock,
// Escape + click-outside a11y come for free) while KEEPING this component's
// original API (`onClose` / `children` / `maxWidth`) and look: the panel is a
// .zf-surface, same terminal material as every other card, so consumers are
// unchanged and nothing regresses.
//
// - shadcn's built-in close (X) is suppressed — each consumer supplies its own
//   Close/Cancel/Done control.
// - A visually-hidden DialogTitle satisfies radix's a11y contract; the visible
//   heading still lives in each consumer's content.
//
// FOOTGUN: `.zf-surface` must go on an INNER div, never on DialogContent itself.
// globals.css is unlayered while Tailwind's utilities live in `@layer utilities`,
// so `.zf-surface { position: relative }` beats DialogContent's `fixed` — the
// panel then lays out in normal flow at the end of <body> instead of centred in
// the viewport. On a tall page that is thousands of pixels below the fold: the
// overlay dims, the dialog is nowhere (on /tinker it landed at y=46541px), and
// nothing errors. Keep positioning classes and surface classes on separate nodes.
export function Dialog({
  onClose,
  children,
  maxWidth = "max-w-lg",
}: {
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <DialogRoot
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        className={`w-full ${maxWidth} border-0 bg-transparent p-0 shadow-none`}
      >
        <DialogTitle className="sr-only">Dialog</DialogTitle>
        <div className="zf-surface p-6">{children}</div>
      </DialogContent>
    </DialogRoot>
  );
}
