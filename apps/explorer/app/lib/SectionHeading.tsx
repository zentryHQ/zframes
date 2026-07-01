import type { ReactNode } from "react";

// Eyebrow + title + blurb used to open each section on the gallery + catalogue.
export function SectionHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <div className="max-w-2xl">
        <div className="mb-2 flex items-center gap-2">
          <span className="h-4 w-1 rounded-full bg-gradient-to-b from-indigo-400 to-violet-400" />
          <span className="text-xs font-semibold uppercase tracking-widest text-indigo-300/80">
            {eyebrow}
          </span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h2>
        {description && (
          <p className="mt-2 text-sm leading-relaxed text-white/55">{description}</p>
        )}
      </div>
      {action && <div className="hidden shrink-0 sm:block">{action}</div>}
    </div>
  );
}
