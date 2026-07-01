import Link from "next/link";
import { DashboardThumb, type ThumbFrame } from "@/app/lib/DashboardThumb";

// Shared gallery card — a live-preview link with a mini-map of the board, its
// title, frame count, an optional blurb, and tag chips. Presentational and
// server-safe; used by both the curated grid and the community grid.
export function DashboardCard({
  href,
  title,
  description,
  tags = [],
  frameCount,
  frames,
}: {
  href: string;
  title: string;
  description?: string;
  tags?: string[];
  frameCount: number;
  frames: ThumbFrame[];
}) {
  return (
    <Link
      href={href}
      className="card-lift hairline group relative flex flex-col overflow-hidden rounded-2xl bg-white/[0.02]"
    >
      {/* Preview window — the board's real silhouette over a faint glow. */}
      <div className="relative overflow-hidden border-b border-white/[0.07] bg-gradient-to-br from-[#0a0a14] to-[#08080f]">
        <div
          className="pointer-events-none absolute -inset-x-6 -top-10 h-24 opacity-70"
          style={{
            background:
              "radial-gradient(60% 100% at 50% 0%, hsla(248,90%,62%,0.25), transparent 70%)",
          }}
        />
        <div className="relative aspect-[16/9] p-3">
          <DashboardThumb frames={frames} gap={3} radius={4} />
        </div>
        <span className="absolute right-3 top-3 rounded-full border border-white/10 bg-black/40 px-2 py-0.5 font-mono text-[10px] text-white/60 backdrop-blur">
          {frameCount} {frameCount === 1 ? "frame" : "frames"}
        </span>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/70 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold text-white transition-colors group-hover:text-indigo-200">
            {title}
          </h3>
          <span className="translate-x-1 text-sm text-indigo-300 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100">
            →
          </span>
        </div>
        {description && (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-white/50">{description}</p>
        )}
        {tags.length > 0 && (
          <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
            {tags.map((t) => (
              <span
                key={t}
                className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/45"
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
