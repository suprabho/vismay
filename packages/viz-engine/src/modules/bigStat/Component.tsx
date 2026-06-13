'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '../../types'
import type { StatColor } from '../../lib/storyConfig.types'
import type { BigStatLayerConfig, BigStatStyle, DeltaColor } from './index'

function tokenVar(token: StatColor | DeltaColor | undefined, fallback: string): string {
  if (!token) return `var(--color-${fallback})`
  return `var(--color-${token})`
}

/** Resolve a `CssLength` config value (number → px, string → as-is). */
function len(v: number | string | undefined): string | undefined {
  if (v == null) return undefined
  return typeof v === 'number' ? `${v}px` : v
}

const ALIGN_TO_FLEX: Record<NonNullable<BigStatLayerConfig['align']>, string> = {
  left: 'items-start text-left',
  center: 'items-center text-center',
  right: 'items-end text-right',
}

const JUSTIFY_TO_FLEX: Record<NonNullable<BigStatStyle['justify']>, string> = {
  top: 'justify-start',
  center: 'justify-center',
  bottom: 'justify-end',
}

/**
 * Headline size presets. `live` uses `vw`-relative `clamp()` so the number
 * tracks the viewport; `capture` uses flat values because share cards render
 * the foreground in a fixed box where `vw` resolves against the full browser
 * viewport and balloons to the cap.
 */
const NUMBER_SIZE_PRESET: Record<
  NonNullable<BigStatStyle['size']>,
  { live: { number: string; unit: string }; capture: { number: string; unit: string } }
> = {
  sm: {
    live: { number: 'clamp(2.5rem, 7vw, 4.5rem)', unit: 'clamp(1.25rem, 3.5vw, 2rem)' },
    capture: { number: '3rem', unit: '1.35rem' },
  },
  md: {
    live: { number: 'clamp(3.5rem, 11vw, 7.5rem)', unit: 'clamp(1.75rem, 5vw, 3rem)' },
    capture: { number: '4rem', unit: '1.75rem' },
  },
  lg: {
    live: { number: 'clamp(4.5rem, 14vw, 9.5rem)', unit: 'clamp(2.25rem, 6vw, 3.75rem)' },
    capture: { number: '5rem', unit: '2.25rem' },
  },
  xl: {
    live: { number: 'clamp(5.5rem, 17vw, 12rem)', unit: 'clamp(2.75rem, 7vw, 4.5rem)' },
    capture: { number: '6rem', unit: '2.75rem' },
  },
}

const GAP_PRESET: Record<NonNullable<BigStatStyle['gap']>, string> = {
  tight: '0.25rem',
  normal: '0.75rem',
  loose: '1.5rem',
}

export default function BigStatLayerComponent({
  config,
  mode,
  noteReady,
}: VizRenderProps<BigStatLayerConfig>) {
  useEffect(() => {
    noteReady()
  }, [noteReady])

  const align = config.align ?? 'left'
  const numberColor = tokenVar(config.color, 'accent2')
  const deltaColor = tokenVar(config.deltaColor, 'muted')
  const alignClasses = ALIGN_TO_FLEX[align]

  // `statStyle` is `.default({})` in the schema, so it's always present — but
  // guard anyway for configs parsed outside the schema path.
  const s = config.statStyle ?? {}
  const justifyClass = JUSTIFY_TO_FLEX[s.justify ?? 'center']

  // Share cards render the foreground in a fixed ~390px box, but the deck's
  // `vw`-based number sizing resolves against the full browser viewport — so
  // `11vw` balloons to the cap and clips inside the narrow card. In capture
  // mode (share cards only), size the number/unit with flat, card-relative
  // values instead. Explicit `numberFontSize`/`unitFontSize` overrides win in
  // either mode.
  const isCapture = mode === 'capture'
  const sizePreset = NUMBER_SIZE_PRESET[s.size ?? 'md']
  const preset = isCapture ? sizePreset.capture : sizePreset.live
  const numberSize = len(s.numberFontSize) ?? preset.number
  const unitSize = len(s.unitFontSize) ?? preset.unit
  const labelSize = len(s.labelFontSize) ?? '0.75rem'
  const deltaSize = len(s.deltaFontSize) ?? '0.85rem'

  const stackGap = len(s.gapSize) ?? GAP_PRESET[s.gap ?? 'normal']
  const unitGap = len(s.unitGap) ?? '0.5rem'
  const textMaxWidth = len(s.textMaxWidth) ?? '36ch'

  return (
    <div
      className={`w-full h-full flex flex-col ${justifyClass} ${alignClasses}`}
      style={{
        gap: stackGap,
        width: len(s.width),
        minWidth: len(s.minWidth),
        maxWidth: len(s.maxWidth),
      }}
    >
      <div className="flex items-baseline" style={{ gap: unitGap }}>
        <span
          className="font-serif font-bold leading-none"
          style={{
            color: numberColor,
            fontSize: numberSize,
          }}
        >
          {config.value}
        </span>
        {config.unit && (
          <span
            className="font-serif font-bold leading-none"
            style={{
              color: numberColor,
              fontSize: unitSize,
              opacity: 0.8,
            }}
          >
            {config.unit}
          </span>
        )}
      </div>
      {config.label && (
        <div
          className="font-mono uppercase tracking-[0.15em]"
          style={{
            color: 'var(--color-text)',
            fontSize: labelSize,
            maxWidth: textMaxWidth,
          }}
        >
          {config.label}
        </div>
      )}
      {config.delta && (
        <div
          className="font-sans"
          style={{
            color: deltaColor,
            fontSize: deltaSize,
            maxWidth: textMaxWidth,
          }}
        >
          {config.delta}
        </div>
      )}
    </div>
  )
}
