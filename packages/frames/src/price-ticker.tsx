import { defineFrame, useDayStats, useMids } from '@zframes/core'
import type { z } from 'zod'
import { changeColor, formatChangePct, formatPrice } from './format'
import { priceTickerMeta } from './schemas'

const schema = priceTickerMeta.schema

function PriceTicker({ config }: { config: z.output<typeof schema> }) {
  const mids = useMids(config.symbols)
  const stats = useDayStats(config.symbols)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, overflow: 'auto' }}>
      {config.symbols.map((symbol) => {
        const mid = mids[symbol] ?? stats[symbol]?.markPx
        const changePct = stats[symbol]?.changePct
        return (
          <div
            key={symbol}
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto auto',
              gap: 12,
              fontSize: 13,
              alignItems: 'baseline',
            }}
          >
            <span style={{ fontWeight: 600 }}>{symbol}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>
              {mid !== undefined ? formatPrice(mid) : '—'}
            </span>
            <span
              style={{
                fontVariantNumeric: 'tabular-nums',
                minWidth: 64,
                textAlign: 'right',
                color: changePct !== undefined ? changeColor(changePct) : 'inherit',
                opacity: changePct !== undefined ? 1 : 0.4,
              }}
            >
              {changePct !== undefined ? formatChangePct(changePct) : '…'}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export const priceTickerFrame = defineFrame({
  ...priceTickerMeta,
  component: PriceTicker,
})
