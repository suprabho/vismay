'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '../../types'
import type { StatColor } from '../../lib/storyConfig.types'
import type { BigStatLayerConfig, DeltaColor } from './index'

function tokenVar(token: StatColor | DeltaColor | undefined, fallback: string): string {
  if (!token) return `var(--color-${fallback})`
  return `var(--color-${token})`
}

const ALIGN_TO_FLEX: Record<NonNullable<BigStatLayerConfig['align']>, string> = {
  left: 'items-start text-left',
  center: 'items-center text-center',
  right: 'items-end text-right',
}

export default function BigStatLayerComponent({
  config,
  noteReady,
}: VizRenderProps<BigStatLayerConfig>) {
  useEffect(() => {
    noteReady()
  }, [noteReady])

  const align = config.align ?? 'left'
  const numberColor = tokenVar(config.color, 'accent2')
  const deltaColor = tokenVar(config.deltaColor, 'muted')
  const alignClasses = ALIGN_TO_FLEX[align]

  return (
    <div className={`w-full h-full flex flex-col justify-center ${alignClasses}`}>
      <div className="flex items-baseline gap-2">
        <span
          className="font-serif font-bold leading-none"
          style={{
            color: numberColor,
            fontSize: 'clamp(3.5rem, 11vw, 7.5rem)',
          }}
        >
          {config.value}
        </span>
        {config.unit && (
          <span
            className="font-serif font-bold leading-none"
            style={{
              color: numberColor,
              fontSize: 'clamp(1.75rem, 5vw, 3rem)',
              opacity: 0.8,
            }}
          >
            {config.unit}
          </span>
        )}
      </div>
      {config.label && (
        <div
          className="font-mono uppercase tracking-[0.15em] mt-3"
          style={{
            color: 'var(--color-text)',
            fontSize: '0.75rem',
            maxWidth: '36ch',
          }}
        >
          {config.label}
        </div>
      )}
      {config.delta && (
        <div
          className="font-sans mt-2"
          style={{
            color: deltaColor,
            fontSize: '0.85rem',
            maxWidth: '36ch',
          }}
        >
          {config.delta}
        </div>
      )}
    </div>
  )
}
