import { FRAME_CATEGORIES } from "@zframes/spec/frame";
import { allFrameMetas } from "@zframes/frames/schemas";
import { CATALOGUE_CATEGORY_ORDER } from "@/app/catalogue/order";
import { describeSize } from "@/app/catalogue/min-size";

/**
 * The catalogue as plain server-rendered text: every frame's name, display label
 * and description, grouped by family.
 *
 * WHY THIS EXISTS. The live catalogue above it is loaded with `ssr: false` —
 * it renders real frames against browser-only APIs, so it cannot be server
 * rendered. That means the initial HTML for the single most content-dense page
 * on the site was the words "Loading catalogue…". Google renders JavaScript and
 * would eventually see the cards; the answer-engine crawlers that would most
 * benefit from a machine-readable vocabulary of every frame largely do not.
 *
 * So this is not a fallback that disappears on hydration — that would be content
 * shown to crawlers and not to people. It is a permanent, visible section: the
 * text index of a visual catalogue, useful to a reader scanning for a capability
 * and to a model answering "can zframes show me X". Same list, same words, both
 * audiences.
 *
 * `@zframes/frames/schemas` is the React-free metadata twin of the registry and
 * the only frames import safe in a Server Component — `@zframes/frames/lazy`
 * would drag every frame component into the server graph and break the build.
 */

const rank = (key: string) => {
  const i = (CATALOGUE_CATEGORY_ORDER as readonly string[]).indexOf(key);
  return i === -1 ? Number.MAX_SAFE_INTEGER : i;
};

export function FrameIndex() {
  const byCategory = new Map<string, typeof allFrameMetas>();
  for (const meta of allFrameMetas) {
    const list = byCategory.get(meta.category) ?? [];
    list.push(meta);
    byCategory.set(meta.category, list);
  }

  // Same display order as the live catalogue above, so a reader who scrolls from
  // one into the other meets the families in the same sequence.
  const sections = [...FRAME_CATEGORIES]
    .sort((a, b) => rank(a.key) - rank(b.key))
    .map((category) => ({
      category,
      frames: (byCategory.get(category.key) ?? [])
        .slice()
        .sort((a, b) => a.label.localeCompare(b.label)),
    }))
    .filter((section) => section.frames.length > 0);

  return (
    <section
      id="frame-index"
      className="mt-8 border-t border-white/[0.07] pt-12"
      aria-labelledby="frame-index-heading"
    >
      <div className="mb-8 max-w-3xl">
        <span className="zf-label mb-2.5">Index</span>
        <h2
          id="frame-index-heading"
          className="text-2xl font-bold tracking-tight text-white sm:text-3xl"
        >
          Every frame, in words
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/65">
          The full vocabulary a generating agent picks from —{" "}
          {allFrameMetas.length} frames across {sections.length} families, each
          with the name you would write in a{" "}
          <code className="font-mono text-indigo-200">dashboard.json</code> and
          the description the agent reads to choose it.
        </p>
      </div>

      <div className="flex flex-col gap-10">
        {sections.map(({ category, frames }) => (
          <div key={category.key}>
            <h3 className="text-base font-semibold text-white">
              {category.label}{" "}
              <span className="font-mono text-xs font-normal text-white/50">
                {frames.length}
              </span>
            </h3>
            <p className="mt-1 text-sm text-white/55">{category.description}</p>
            <ul className="mt-4 grid grid-cols-1 gap-x-8 gap-y-3 md:grid-cols-2">
              {frames.map((frame) => (
                <li key={frame.name} className="text-sm leading-relaxed">
                  <span className="font-semibold text-white/90">
                    {frame.label}
                  </span>{" "}
                  <code className="font-mono text-xs text-indigo-200/80">
                    {frame.name}
                  </code>{" "}
                  <span className="font-mono text-xs text-white/45">
                    {describeSize(frame.layout)}
                  </span>
                  <span className="text-white/55"> — {frame.description}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
