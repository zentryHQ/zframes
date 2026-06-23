import type { ReactNode } from "react";

/**
 * One row in a link feed (SEC filings, news headlines) — a leading element
 * (badge or thumbnail), a two-line title + optional subtitle, and right-aligned
 * meta (a relative timestamp). Shared so both feeds get the same accent `::before`
 * tick on hover, the same hover arrow, the same border/padding rhythm, and the
 * same timestamp treatment — previously they diverged on all of those.
 */
export function FeedRow({
  href,
  leading,
  title,
  subtitle,
  meta,
  titleAttr,
}: {
  href: string;
  /** Leading element — a form badge or article thumbnail. */
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Right-aligned meta, typically a `timeAgo` timestamp. */
  meta?: ReactNode;
  titleAttr?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      title={titleAttr}
      className="group relative flex min-w-0 items-start gap-3 border-b border-white/[0.06] py-2 pl-3 no-underline transition-colors last:border-b-0 before:absolute before:bottom-1.5 before:left-0 before:top-1.5 before:w-0.5 before:rounded-full before:bg-highlight before:opacity-0 before:transition-opacity hover:bg-white/[0.03] group-hover:before:opacity-100 hover:before:opacity-100"
    >
      {leading}
      <span className="min-w-0 flex-1">
        <span className="body-sm text-normal line-clamp-2 block font-medium leading-snug transition-colors group-hover:text-strong">
          {title}
        </span>
        {subtitle && (
          <span className="caption text-soft mt-1 line-clamp-2 block leading-relaxed">
            {subtitle}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1.5 pt-px">
        {meta !== undefined && meta !== null && (
          <span className="caption text-soft tabular-nums">{meta}</span>
        )}
        <span className="caption text-highlight/70 -mr-0.5 w-2 opacity-0 transition-opacity group-hover:opacity-100">
          ↗
        </span>
      </span>
    </a>
  );
}
