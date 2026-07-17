import Link from "next/link";
import { DashboardThumb, type ThumbFrame } from "@/app/lib/DashboardThumb";
import { ThumbImage } from "@/app/lib/ThumbImage";

// Shared gallery card — a live-preview link with a mini-map of the board, its
// title, frame count, and tag chips. Presentational and server-safe; used by
// both the curated grid and the community grid. When a nightly screenshot
// exists (`thumbSrc`), it fades in over the SVG mini-map and drifts (Ken-Burns)
// on hover; otherwise (404 — no capture yet) the silhouette stays. The blurb +
// an "Open live preview" affordance live in a caption that reveals over the
// poster on hover (always shown on touch), keeping the resting grid media-first.
export function DashboardCard({
  href,
  title,
  description,
  tags = [],
  frameCount,
  frames,
  thumbSrc,
}: {
  href: string;
  title: string;
  description?: string;
  tags?: string[];
  frameCount: number;
  frames: ThumbFrame[];
  thumbSrc?: string;
}) {
  return (
    <Link
      href={href}
      className="card-lift zf-surface group relative flex flex-col overflow-hidden"
    >
      {/* Preview window — the board's real silhouette over a faint glow. */}
      <div className="relative overflow-hidden border-b border-white/[0.07] bg-gradient-to-br from-[#0a0a14] to-[#08080f]">
        <div className="pointer-events-none absolute -inset-x-6 -top-10 h-24 bg-[image:radial-gradient(60%_100%_at_50%_0%,hsla(248,90%,62%,0.25),transparent_70%)] opacity-70" />
        <div className="relative aspect-[16/9] p-3">
          <DashboardThumb frames={frames} gap={3} radius={4} />
          {thumbSrc && (
            <ThumbImage
              src={thumbSrc}
              alt={`${title} — live preview`}
              className="zf-kenburns"
            />
          )}
        </div>
        <span className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/40 px-2 py-0.5 font-mono text-[10px] text-white/70 backdrop-blur">
          {frameCount} {frameCount === 1 ? "frame" : "frames"}
        </span>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
        {/* Caption reveal — description + an Open affordance grow in over the
            poster bottom on hover (always shown on touch; see globals). */}
        <div className="zf-caption pointer-events-none absolute inset-x-0 bottom-0">
          <div>
            <div className="bg-gradient-to-t from-black/90 via-black/65 to-transparent px-4 pb-3 pt-9">
              {description && (
                <p className="line-clamp-2 text-xs leading-relaxed text-white/80">
                  {description}
                </p>
              )}
              <span className="mt-1.5 flex items-center gap-1 text-xs font-semibold text-indigo-200">
                Open live preview
                <span className="zf-arrow-reveal">→</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Body — title + tags stay at rest; the description lives in the poster
          caption reveal above. */}
      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-semibold text-white transition-colors group-hover:text-indigo-200">
          {title}
        </h3>
        {tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/60"
              >
                {t}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
