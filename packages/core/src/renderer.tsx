import { Component, type CSSProperties, type ReactNode } from 'react'
import type { FrameRegistry } from './frame'
import { useProviders } from './hooks'
import type { DashboardSpec, FrameInstance } from './spec'

/**
 * Frame chrome ships as a tiny stylesheet so cards get hover/transition
 * states without the host needing Tailwind. Every value reads a --zf-* var
 * first, so themes (e.g. @zframes/charts theme.css) can restyle the chrome
 * by defining vars — the fallbacks keep zero-config hosts presentable.
 */
const FRAME_CSS = `
.zf-grid {
  display: grid;
  gap: var(--zf-gap, 12px);
}
.zf-frame {
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
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}
.zf-frame:hover {
  border-color: var(--zf-frame-border-hover, rgba(139, 141, 249, 0.4));
  background: var(--zf-frame-bg-hover, linear-gradient(180deg, rgba(30, 32, 46, 0.92), rgba(16, 17, 26, 0.94)));
  box-shadow: var(--zf-frame-shadow-hover, inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 18px 44px -20px rgba(0, 0, 0, 0.85));
  transform: translateY(-1px);
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
.zf-frame--featured:hover {
  border-color: var(--zf-frame-featured-border-hover, rgba(139, 141, 249, 0.72));
}
.zf-frame--featured .zf-frame-title {
  color: var(--zf-frame-featured-title, rgba(176, 178, 255, 0.85));
}
/* Bare frames (headings) divide a dashboard into zones — positioned slot,
   no card chrome, no auto-title. */
.zf-bare {
  display: flex;
  align-items: flex-end;
  min-height: 0;
  overflow: hidden;
}
`

class FrameErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ color: '#ff8b9d', fontSize: 12 }}>frame crashed: {this.state.error.message}</div>
      )
    }
    return this.props.children
  }
}

function positionStyle(instance: FrameInstance): CSSProperties {
  const { x, y, w, h } = instance.position
  return { gridColumn: `${x + 1} / span ${w}`, gridRow: `${y + 1} / span ${h}` }
}

function FrameSlot({ instance, registry }: { instance: FrameInstance; registry: FrameRegistry }) {
  const providers = useProviders()
  const def = registry.get(instance.frame)
  const style = positionStyle(instance)

  if (!def) {
    return (
      <div className="zf-frame zf-frame--error" style={style}>
        <div className="zf-frame-title">{instance.frame}</div>
        unknown frame &quot;{instance.frame}&quot;. registered: {[...registry.keys()].join(', ')}
      </div>
    )
  }

  // A frame whose data needs no provider covers renders as an error card,
  // not a permanently-empty widget — generating agents read this and pick
  // frames the host can actually feed.
  const covered = new Set(providers.flatMap((p) => [...p.capabilities]))
  const missing = def.capabilities.filter((c) => !covered.has(c))
  if (missing.length > 0) {
    return (
      <div className="zf-frame zf-frame--error" style={style}>
        <div className="zf-frame-title">{instance.frame} — missing capability</div>
        no registered provider covers: {missing.join(', ')}
      </div>
    )
  }

  // Per-frame validation failures render as readable error cards instead of
  // breaking the dashboard — this is the feedback surface a generating agent
  // reads to self-correct its spec.
  const parsed = def.schema.safeParse(instance.config)
  if (!parsed.success) {
    return (
      <div className="zf-frame zf-frame--error" style={style}>
        <div className="zf-frame-title">{instance.frame} — invalid config</div>
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {parsed.error.issues.map((issue, i) => (
            <li key={i}>
              {issue.path.join('.') || '(root)'}: {issue.message}
            </li>
          ))}
        </ul>
      </div>
    )
  }

  const FrameComponent = def.component

  // Bare frames (e.g. headings) structure a dashboard into zones — they get a
  // positioned slot but no card chrome and no auto-title.
  if (def.chrome === 'bare') {
    return (
      <div className="zf-bare" style={style}>
        <FrameErrorBoundary>
          <FrameComponent config={parsed.data} />
        </FrameErrorBoundary>
      </div>
    )
  }

  return (
    <div className={instance.featured ? 'zf-frame zf-frame--featured' : 'zf-frame'} style={style}>
      <div className="zf-frame-title">{instance.title ?? instance.frame.replace(/-/g, ' ')}</div>
      <div className="zf-frame-body">
        <FrameErrorBoundary>
          <FrameComponent config={parsed.data} />
        </FrameErrorBoundary>
      </div>
    </div>
  )
}

export function DashboardRenderer({
  spec,
  registry,
}: {
  spec: DashboardSpec
  registry: FrameRegistry
}) {
  return (
    <>
      <style>{FRAME_CSS}</style>
      <div
        className="zf-grid"
        style={{
          gridTemplateColumns: `repeat(${spec.grid.columns}, minmax(0, 1fr))`,
          gridAutoRows: spec.grid.rowHeight,
          ['--zf-gap' as string]: `${spec.grid.gap}px`,
        }}
      >
        {spec.frames.map((instance) => (
          <FrameSlot key={instance.id} instance={instance} registry={registry} />
        ))}
      </div>
    </>
  )
}
