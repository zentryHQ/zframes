import { Component, type CSSProperties, type ReactNode } from "react";
import type { FrameRegistry } from "./frame";
import { useProviders } from "./hooks";
import type { FrameInstance } from "./spec";

/**
 * Frame chrome ships as a tiny stylesheet so cards get hover/transition
 * states without the host needing Tailwind. Every value reads a --zf-* var
 * first, so themes (e.g. @zframes/charts theme.css) can restyle the chrome
 * by defining vars — the fallbacks keep zero-config hosts presentable.
 *
 * Lives here (not in renderer.tsx) so both the CSS-grid renderer and the
 * interactive editor render identical cards from one source.
 */
export const FRAME_CSS = `
.zf-grid {
  display: grid;
  gap: var(--zf-gap, 12px);
  grid-template-columns: repeat(var(--zf-cols, 12), minmax(0, 1fr));
  grid-auto-rows: var(--zf-row-h, 96px);
}
.zf-frame {
  grid-column: var(--zf-col-start, auto) / span var(--zf-col-span, 1);
  grid-row: var(--zf-row-start, auto) / span var(--zf-row-span, 1);
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  padding: 16px 18px;
  background: var(--zf-frame-bg, linear-gradient(165deg, rgba(26, 27, 38, 0.82) 0%, rgba(14, 15, 22, 0.86) 60%, rgba(10, 11, 17, 0.9) 100%));
  border: 1px solid var(--zf-frame-border, rgba(255, 255, 255, 0.07));
  border-radius: var(--zf-frame-radius, 18px);
  box-shadow: var(--zf-frame-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 1px 2px rgba(0, 0, 0, 0.4), 0 18px 44px -26px rgba(0, 0, 0, 0.9));
  transition:
    border-color 0.25s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    background 0.25s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    box-shadow 0.25s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    transform 0.25s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
  /* Frames arrive in a soft top-down cascade on first paint. The translate
     property (not transform) carries the motion, so the hover lift stays
     independent; the backwards fill holds the hidden state through the stagger
     delay, then hands transform back to :hover once the entrance settles. */
  animation: zf-enter 0.45s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)) backwards;
  animation-delay: min(calc((var(--zf-enter-i, 0) + 1) * 35ms), 350ms);
}
/* Hover lift is pointer-only — on touch it would stick after a tap. */
@media (hover: hover) {
  .zf-frame:hover {
    border-color: var(--zf-frame-border-hover, rgba(139, 141, 249, 0.42));
    background: var(--zf-frame-bg-hover, linear-gradient(165deg, rgba(34, 35, 50, 0.88) 0%, rgba(18, 19, 28, 0.9) 60%, rgba(12, 13, 20, 0.92) 100%));
    box-shadow: var(--zf-frame-shadow-hover, inset 0 1px 0 rgba(255, 255, 255, 0.09), 0 1px 2px rgba(0, 0, 0, 0.4), 0 26px 56px -26px rgba(0, 0, 0, 0.92), 0 0 0 1px rgba(139, 141, 249, 0.12), 0 20px 60px -28px rgba(139, 141, 249, 0.4));
    transform: translateY(-2px);
  }
  .zf-frame--featured:hover {
    border-color: var(--zf-frame-featured-border-hover, rgba(160, 162, 255, 0.75));
  }
}
/* Top edge sheen — inset past the corner radius so the bright line never
   pokes outside the rounded border (which read as a clipped corner). */
.zf-frame::before {
  content: '';
  position: absolute;
  top: 0;
  left: 18px;
  right: 18px;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.16), transparent);
  pointer-events: none;
  z-index: 2;
}
.zf-frame-title {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 12px;
  font-family: var(--font-dmsans, inherit);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--zf-frame-title, rgba(255, 255, 255, 0.5));
  flex: none;
}
.zf-frame-title::before {
  content: '';
  width: 5px;
  height: 5px;
  border-radius: 9999px;
  background: var(--zf-frame-title-dot, #8b8df9);
  box-shadow: 0 0 8px var(--zf-frame-title-dot-glow, rgba(139, 141, 249, 0.9));
}
.zf-frame-body {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.zf-frame-body > * {
  flex: 1;
  min-height: 0;
}
.zf-frame--error {
  border-color: var(--zf-frame-error-border, rgba(242, 21, 83, 0.45));
  color: var(--zf-frame-error-text, #ff8b9d);
  font-size: 12px;
  line-height: 1.5;
}
.zf-frame--error .zf-frame-title { color: var(--zf-frame-error-text, #ff8b9d); }
.zf-frame--error .zf-frame-title::before {
  background: var(--zf-frame-error-text, #ff8b9d);
  box-shadow: 0 0 8px rgba(242, 21, 83, 0.7);
}
.zf-frame--featured {
  border-color: var(--zf-frame-featured-border, rgba(139, 141, 249, 0.5));
  box-shadow: var(--zf-frame-featured-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.1), 0 0 0 1px rgba(139, 141, 249, 0.18), 0 30px 80px -34px rgba(99, 102, 241, 0.55), 0 18px 50px -30px rgba(0, 0, 0, 0.9));
}
/* Hero bloom — a soft accent glow rising from the top edge, clipped to the
   card radius by overflow:hidden. Sits at z-index 0 so the title/body (z 1)
   stay crisp on top. */
.zf-frame--featured::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  background: var(--zf-frame-featured-bloom, radial-gradient(135% 95% at 50% -10%, rgba(139, 141, 249, 0.2), rgba(139, 141, 249, 0.05) 40%, transparent 72%));
  pointer-events: none;
  z-index: 0;
}
@media (hover: hover) {
  .zf-frame--featured:hover {
    box-shadow: var(--zf-frame-featured-shadow-hover, inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 0 0 1px rgba(139, 141, 249, 0.28), 0 36px 90px -32px rgba(99, 102, 241, 0.7), 0 18px 50px -30px rgba(0, 0, 0, 0.92));
  }
}
.zf-frame--featured .zf-frame-title {
  color: var(--zf-frame-featured-title, rgba(184, 186, 255, 0.9));
}
/* Bare frames (headings) divide a dashboard into zones — positioned slot,
   no card chrome, no auto-title. */
.zf-bare {
  grid-column: var(--zf-col-start, auto) / span var(--zf-col-span, 1);
  grid-row: var(--zf-row-start, auto) / span var(--zf-row-span, 1);
  display: flex;
  align-items: flex-end;
  min-height: 0;
  overflow: hidden;
  animation: zf-enter 0.45s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)) backwards;
  animation-delay: min(calc((var(--zf-enter-i, 0) + 1) * 35ms), 350ms);
}
/* Phones: the absolute x/y/w grid can't shrink below ~30px columns, so collapse
   to a single full-width column. Frames flow in spec order and keep their row
   span (height), but ignore horizontal placement. */
@media (max-width: 640px) {
  .zf-grid {
    grid-template-columns: 1fr;
  }
  .zf-frame,
  .zf-bare {
    grid-column: 1 / -1;
    grid-row: auto / span var(--zf-row-span, 1);
  }
  .zf-frame {
    padding: 12px 14px;
  }
}
@keyframes zf-enter {
  from { opacity: 0; translate: 0 10px; }
  to { opacity: 1; translate: 0 0; }
}
/* Reduced-motion entrance: same timing + stagger, but a plain fade with no
   positional movement (motion is what triggers vestibular discomfort). */
@keyframes zf-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .zf-frame,
  .zf-bare {
    animation-name: zf-fade;
  }
  .zf-frame:hover {
    transform: none;
  }
}
`;

class FrameErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ color: "#ff8b9d", fontSize: 12 }}>
          frame crashed: {this.state.error.message}
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Renders a single frame instance — the card chrome, the error cards (unknown
 * frame / missing capability / invalid config), and the frame component itself.
 *
 * It deliberately owns only the *content*, not placement: the host positions
 * the returned element. The CSS-grid renderer passes a `style` with grid
 * coordinates; the editor lets GridStack position the wrapper and passes a
 * fill `className`. Both get pixel-identical cards from this one component.
 */
export function FrameContent({
  instance,
  registry,
  style,
  className = "",
}: {
  instance: FrameInstance;
  registry: FrameRegistry;
  style?: CSSProperties;
  className?: string;
}) {
  const providers = useProviders();
  const def = registry.get(instance.frame);
  const cx = (...c: string[]) => c.filter(Boolean).join(" ");

  if (!def) {
    return (
      <div
        className={cx("zf-frame", "zf-frame--error", className)}
        style={style}
      >
        <div className="zf-frame-title">{instance.frame}</div>
        unknown frame &quot;{instance.frame}&quot;. registered:{" "}
        {[...registry.keys()].join(", ")}
      </div>
    );
  }

  // A frame whose data needs no provider covers renders as an error card,
  // not a permanently-empty widget — generating agents read this and pick
  // frames the host can actually feed.
  const covered = new Set(providers.flatMap((p) => [...p.capabilities]));
  const missing = def.capabilities.filter((c) => !covered.has(c));
  if (missing.length > 0) {
    return (
      <div
        className={cx("zf-frame", "zf-frame--error", className)}
        style={style}
      >
        <div className="zf-frame-title">
          {instance.frame} — missing capability
        </div>
        no registered provider covers: {missing.join(", ")}
      </div>
    );
  }

  // Per-frame validation failures render as readable error cards instead of
  // breaking the dashboard — this is the feedback surface a generating agent
  // (or a human editing config) reads to self-correct.
  const parsed = def.schema.safeParse(instance.config);
  if (!parsed.success) {
    return (
      <div
        className={cx("zf-frame", "zf-frame--error", className)}
        style={style}
      >
        <div className="zf-frame-title">{instance.frame} — invalid config</div>
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {parsed.error.issues.map((issue, i) => (
            <li key={i}>
              {issue.path.join(".") || "(root)"}: {issue.message}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const FrameComponent = def.component;

  // Bare frames (e.g. headings) structure a dashboard into zones — they get a
  // positioned slot but no card chrome and no auto-title.
  if (def.chrome === "bare") {
    return (
      <div className={cx("zf-bare", className)} style={style}>
        <FrameErrorBoundary>
          <FrameComponent config={parsed.data} />
        </FrameErrorBoundary>
      </div>
    );
  }

  return (
    <div
      className={cx(
        "zf-frame",
        instance.featured ? "zf-frame--featured" : "",
        className,
      )}
      style={style}
    >
      <div className="zf-frame-title">
        {instance.title ?? instance.frame.replace(/-/g, " ")}
      </div>
      <div className="zf-frame-body">
        <FrameErrorBoundary>
          <FrameComponent config={parsed.data} />
        </FrameErrorBoundary>
      </div>
    </div>
  );
}
