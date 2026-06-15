import {
  createRegistry,
  DashboardRenderer,
  DashboardSpecSchema,
  FramesProvider,
} from '@zframes/core'
import { allFrames } from '@zframes/frames'
import { AlternativeMeProvider } from '@zframes/provider-alternativeme'
import { CoinGeckoProvider } from '@zframes/provider-coingecko'
import { DefiLlamaProvider } from '@zframes/provider-defillama'
import { HyperliquidProvider } from '@zframes/provider-hyperliquid'
import rawSpec from './dashboard.json'
import { DashboardBackground } from './background'

const registry = createRegistry(allFrames)
const providers = [
  new HyperliquidProvider(),
  new DefiLlamaProvider(),
  new AlternativeMeProvider(),
  new CoinGeckoProvider(),
]
const spec = DashboardSpecSchema.parse(rawSpec)

export default function App() {
  return (
    <FramesProvider providers={providers}>
      <DashboardBackground background={spec.background} />
      <main className="relative z-10 mx-auto max-w-[1320px] px-6 pb-16 pt-5">
        <header className="mb-5 flex items-baseline justify-between border-b border-white/[0.06] pb-4">
          <div className="flex items-baseline gap-3">
            <h1 className="font-dmsans text-strong text-lg font-extrabold tracking-tight">
              z<span className="text-[#8b8df9]">frames</span>
            </h1>
            <span className="body-sm text-soft">{spec.title}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
            </span>
            <span className="caption text-soft">
              live · hyperliquid + defillama + alternative.me + coingecko · no API keys
            </span>
          </div>
        </header>
        <DashboardRenderer spec={spec} registry={registry} />
      </main>
    </FramesProvider>
  )
}
