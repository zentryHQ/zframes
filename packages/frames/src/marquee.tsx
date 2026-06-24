import { defineFrame } from "@zframes/core";
import type { z } from "zod";
import { marqueeMeta } from "./schemas";

const schema = marqueeMeta.schema;
type Config = z.output<typeof schema>;

// One full right-to-left cycle, in seconds, per speed step.
const DURATION: Record<Config["speed"], number> = {
  slow: 24,
  normal: 14,
  fast: 8,
};

// Self-contained keyframes (no data, no provider). The track holds two identical
// copies of the text and slides by -50% — exactly one copy's width — so the
// second copy lands where the first began and the loop is seamless. Pausing on
// hover and honouring reduced-motion keep it calm. Same seamless technique as
// the host's pinned ticker tape, scoped here to the .zf-marquee class so it
// can't leak into other frames.
const MARQUEE_CSS = `
.zf-marquee {
  display: flex;
  align-items: center;
  height: 100%;
  width: 100%;
  overflow: hidden;
}
.zf-marquee-track {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  white-space: nowrap;
  will-change: transform;
  animation-name: zf-marquee-scroll;
  animation-timing-function: linear;
  animation-iteration-count: infinite;
}
.zf-marquee:hover .zf-marquee-track { animation-play-state: paused; }
.zf-marquee-item { padding-right: 3rem; }
@keyframes zf-marquee-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .zf-marquee-track { animation: none; }
}
`;

function Marquee({ config }: { config: Config }) {
  const colorClass = config.accent ? "text-highlight" : "text-strong";
  const duration = DURATION[config.speed];

  return (
    <>
      <style>{MARQUEE_CSS}</style>
      <div className="zf-marquee" aria-label={config.text}>
        {/* Two identical copies; the -50% slide makes the second seamlessly
            take over from the first. The duplicate is decorative. */}
        <div
          className="zf-marquee-track"
          style={{ animationDuration: `${duration}s` }}
        >
          <span className={`zf-marquee-item metric-lg ${colorClass}`}>
            {config.text}
          </span>
          <span
            aria-hidden
            className={`zf-marquee-item metric-lg ${colorClass}`}
          >
            {config.text}
          </span>
        </div>
      </div>
    </>
  );
}

export const marqueeFrame = defineFrame({
  ...marqueeMeta,
  component: Marquee,
});
