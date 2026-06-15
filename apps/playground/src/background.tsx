import type { DashboardBackground as BackgroundConfig } from '@zframes/core'
import { lazy, Suspense } from 'react'

// Lazy so dashboards that don't use a Unicorn scene never fetch the SDK bundle.
const UnicornScene = lazy(() => import('unicornstudio-react'))

const SDK_URL =
  'https://cdn.jsdelivr.net/gh/hiunicornstudio/unicornstudio.js@v2.2.5/dist/unicornStudio.umd.js'

/**
 * Full-viewport background behind the dashboard. The spec picks *what* the
 * background is ("unicorn" + projectId); the host (this file) renders it —
 * same split as data providers, so the heavy WebGL engine never reaches
 * @zframes/core or the React-free tooling path.
 *
 * Rendered at a low `opacity` (from the spec) so the scene is a faint backdrop;
 * cards are opaque, so content never competes with it — no scrim needed. If the
 * Unicorn SDK fails to load (offline, CDN down, bad projectId), nothing renders
 * here and the body's dark gradient shows through — graceful default.
 */
export function DashboardBackground({ background }: { background: BackgroundConfig }) {
  if (background.type !== 'unicorn' || !background.projectId) return null

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
        opacity: background.opacity,
      }}
    >
      <Suspense fallback={null}>
        <UnicornScene
          projectId={background.projectId}
          width="100vw"
          height="100vh"
          scale={background.scale}
          dpi={background.dpi}
          sdkUrl={SDK_URL}
        />
      </Suspense>
    </div>
  )
}
