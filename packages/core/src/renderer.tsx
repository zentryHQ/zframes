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
  background: var(--zf-frame-bg, rgba(255, 255, 255, 0.02));
  border: 1px solid var(--zf-frame-border, rgba(255, 255, 255, 0.07));
  border-radius: var(--zf-frame-radius, 12px);
  transition: border-color 0.2s ease, background 0.2s ease;
}
.zf-frame:hover {
  border-color: var(--zf-frame-border-hover, rgba(255, 255, 255, 0.16));
  background: var(--zf-frame-bg-hover, rgba(255, 255, 255, 0.035));
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
  color: var(--zf-frame-title, rgba(255, 255, 255, 0.38));
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
  return (
    <div className="zf-frame" style={style}>
      <div className="zf-frame-title">{instance.frame.replace(/-/g, ' ')}</div>
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
