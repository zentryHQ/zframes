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
  padding: 14px 16px;
  background: var(--zf-frame-bg, linear-gradient(180deg, rgba(20, 22, 34, 0.88), rgba(11, 12, 19, 0.91)));
  border: 1px solid var(--zf-frame-border, rgba(255, 255, 255, 0.08));
  border-radius: var(--zf-frame-radius, 14px);
  box-shadow: var(--zf-frame-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 12px 32px -18px rgba(0, 0, 0, 0.75));
  transition:
    border-color 0.2s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    background 0.2s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    box-shadow 0.2s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1)),
    transform 0.2s var(--zf-ease-out, cubic-bezier(0.23, 1, 0.32, 1));
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
    border-color: var(--zf-frame-border-hover, rgba(139, 141, 249, 0.4));
    background: var(--zf-frame-bg-hover, linear-gradient(180deg, rgba(30, 32, 46, 0.92), rgba(16, 17, 26, 0.94)));
    box-shadow: var(--zf-frame-shadow-hover, inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 18px 44px -20px rgba(0, 0, 0, 0.85));
    transform: translateY(-1px);
  }
  .zf-frame--featured:hover {
    border-color: var(--zf-frame-featured-border-hover, rgba(139, 141, 249, 0.72));
  }
}
.zf-frame::before {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.08), transparent);
  pointer-events: none;
}
.zf-frame-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-family: var(--font-dmsans, inherit);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--zf-frame-title, rgba(255, 255, 255, 0.46));
  flex: none;
}
.zf-frame-title::before {
  content: '';
  width: 4px;
  height: 4px;
  border-radius: 9999px;
  background: var(--zf-frame-title-dot, rgba(139, 141, 249, 0.8));
}
.zf-frame-body {
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
.zf-frame--error .zf-frame-title::before { background: var(--zf-frame-error-text, #ff8b9d); }
.zf-frame--featured {
  border-color: var(--zf-frame-featured-border, rgba(139, 141, 249, 0.55));
  box-shadow: var(--zf-frame-featured-shadow, inset 0 1px 0 rgba(255, 255, 255, 0.09), 0 0 0 1px rgba(139, 141, 249, 0.22), 0 24px 64px -28px rgba(99, 102, 241, 0.6));
}
.zf-frame--featured .zf-frame-title {
  color: var(--zf-frame-featured-title, rgba(176, 178, 255, 0.85));
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
