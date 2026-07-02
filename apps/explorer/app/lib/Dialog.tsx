"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Shared modal shell — the one overlay + panel used by Publish / AgentFork /
// Report. Owns the a11y contract (role, aria-modal, Escape, initial focus,
// click-outside) so each dialog only supplies its content. The panel is a
// .zf-surface: same material as every other card on the site.
export function Dialog({
  onClose,
  children,
  maxWidth = "max-w-lg",
}: {
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    // Move focus into the dialog so Escape + tabbing start from the panel.
    panelRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="animate-overlay-in fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={`animate-dialog-in zf-surface w-full ${maxWidth} p-6 outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
