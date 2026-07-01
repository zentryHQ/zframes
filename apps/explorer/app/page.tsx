import Link from "next/link";
import { CommunitySection } from "@/app/lib/CommunitySection";
import { CURATED } from "@/app/lib/curated-dashboards";

// Gallery home — a server component (no live frames here, so it's SSR/SEO-friendly
// and fast). Each card links to the live preview. In Phase 3 this list comes from
// Neon (curated + community); today it's the static curated set.
export default function GalleryHome() {
  return (
    <main className="mx-auto max-w-7xl px-6 py-10">
      <section className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight text-white">
          Explore market dashboards
        </h1>
        <p className="mt-2 max-w-2xl text-white/60">
          Live, personalizable dashboards for stocks &amp; crypto. Preview any board
          with real data, browse the frame{" "}
          <Link href="/catalogue" className="text-indigo-400 hover:underline">
            catalogue
          </Link>
          , or fork one in the{" "}
          <Link href="/tinker" className="text-indigo-400 hover:underline">
            tinker
          </Link>{" "}
          editor.
        </p>
      </section>

      <h2 className="mb-4 text-lg font-semibold text-white">Curated</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CURATED.map((d) => (
          <Link
            key={d.id}
            href={`/d/${d.id}`}
            className="group flex flex-col rounded-xl border border-white/10 bg-white/[0.02] p-5 transition-colors hover:border-indigo-400/40 hover:bg-white/[0.04]"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold text-white group-hover:text-indigo-300">
                {d.title}
              </h2>
              <span className="text-xs text-white/40">
                {d.spec.frames.length} frames
              </span>
            </div>
            <p className="mb-4 flex-1 text-sm text-white/55">{d.description}</p>
            <div className="flex flex-wrap gap-1.5">
              {d.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] uppercase tracking-wide text-white/45"
                >
                  {t}
                </span>
              ))}
            </div>
          </Link>
        ))}
      </div>

      <CommunitySection />
    </main>
  );
}
