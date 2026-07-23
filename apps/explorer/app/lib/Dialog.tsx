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
        className={`zf-surface w-full ${maxWidth} border-0 bg-transparent p-6 shadow-none`}
      >
        <DialogTitle className="sr-only">Dialog</DialogTitle>
        {children}
      </DialogContent>
    </DialogRoot>
  );
}
