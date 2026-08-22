"use client";

import { Input } from "@/app/components/ui/input";
import { cn } from "@/app/lib/utils";

/**
 * The explorer's one search box: a leading magnifier over a `type="search"`
 * Input. The gallery (dashboards) and the catalogue (frames) had a verbatim copy
 * each — same wrapper, same inline SVG, same focus classes — differing only in
 * the strings and the top margin.
 *
 * Deliberately NOT a compound component: there are no sub-parts and no shared
 * state to thread, so `SearchField.Icon` / `.Input` would be ceremony around a
 * single element. `label` supplies both the placeholder (with an ellipsis) and
 * the accessible name, which is why the two can never disagree; `className`
 * carries the caller's layout (the gallery's `mt-6`).
 */
export function SearchField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("relative max-w-md", className)}>
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={`${label}…`}
        aria-label={label}
        className="border-white/10 py-2.5 pl-10 pr-3 focus:border-indigo-300/50 focus:bg-white/[0.06]"
      />
    </div>
  );
}
