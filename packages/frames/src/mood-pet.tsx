import { defineFrame, useDayStats } from '@zframes/core'
import { useEffect, useState } from 'react'
import type { z } from 'zod'
import { changeColor, formatChangePct, formatPrice } from './format'
import { moodPetMeta } from './schemas'

// Sprite sheet contract: 512x512, 4 rows x 4 cols of 128px frames.
// Rows = moods (happy, neutral, tired, stressed); cols = idle cycle (rest, hop, blink, hop).
const SPRITE_FRAME = 128
const IDLE_CYCLE_LENGTH = 4
const MOOD_ROWS = { happy: 0, neutral: 1, tired: 2, stressed: 3 } as const
type Mood = keyof typeof MOOD_ROWS

const schema = moodPetMeta.schema

function moodFor(changePct: number, happyAbove: number, stressedBelow: number): Mood {
  if (changePct >= happyAbove) return 'happy'
  if (changePct <= stressedBelow) return 'stressed'
  if (changePct < 0) return 'tired'
  return 'neutral'
}

function MoodPet({ config }: { config: z.output<typeof schema> }) {
  const stats = useDayStats([config.symbol])
  const stat = stats[config.symbol]
  const [step, setStep] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % IDLE_CYCLE_LENGTH), 450)
    return () => clearInterval(id)
  }, [])

  const mood: Mood = stat
    ? moodFor(stat.changePct, config.happyAbove, config.stressedBelow)
    : 'neutral'

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        flex: 1,
        minHeight: 0,
      }}
    >
      <div
        style={{
          width: SPRITE_FRAME,
          height: SPRITE_FRAME,
          backgroundImage: `url(${config.spriteUrl})`,
          backgroundPosition: `-${step * SPRITE_FRAME}px -${MOOD_ROWS[mood] * SPRITE_FRAME}px`,
          imageRendering: 'pixelated',
          flexShrink: 0,
        }}
      />
      <div style={{ textAlign: 'center', fontSize: 13, lineHeight: 1.6 }}>
        <div style={{ fontWeight: 600 }}>
          {config.symbol}
          {stat ? ` · ${formatPrice(stat.markPx)}` : ''}
        </div>
        {stat ? (
          <div style={{ color: changeColor(stat.changePct) }}>
            {formatChangePct(stat.changePct)} · feeling {mood}
          </div>
        ) : (
          <div style={{ opacity: 0.5 }}>waking up…</div>
        )}
      </div>
    </div>
  )
}

export const moodPetFrame = defineFrame({
  ...moodPetMeta,
  component: MoodPet,
})
