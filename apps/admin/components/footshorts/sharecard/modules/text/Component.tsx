'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import type { FsCardTextConfig, TextCardSize, TextCardWeight } from '../types'

/** Map the short color tokens the form offers onto the card's theme vars; pass
 *  any explicit hex straight through. Blank → inherit the card text color.
 *  (Same convention as `fscard:icon`.) */
function resolveColor(value: string): string {
  const v = value.trim()
  if (!v) return 'currentColor'
  switch (v) {
    case 'accent':
      return 'var(--sf-color-accent)'
    case 'text':
      return 'var(--sf-color-text)'
    case 'brand':
      return 'var(--sf-color-brand)'
    case 'muted':
      return 'var(--sf-color-muted)'
    default:
      return v
  }
}

// Font size in container-query width units of the transform box: widening the
// box scales the type with it, and corner-drag `scale` zooms uniformly on top.
// `getComputedStyle` resolves cq* to px, so html-to-image captures the text
// crisply (same trick as fscard:emoji).
const SIZE_CQW: Record<TextCardSize, number> = { sm: 4, md: 6, lg: 9, xl: 13, '2xl': 18 }
const WEIGHT_VALUE: Record<TextCardWeight, number> = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  black: 900,
}

/**
 * `fscard:text` — author-typed free-form copy as an overlay layer. The transform
 * box sets the wrap width; the layer deliberately carries no `heightPct`, so the
 * box self-sizes to the text and long copy grows instead of clipping. Uses
 * `containerType: 'inline-size'` — NOT the emoji's `'size'`, which requires a
 * definite height and would collapse this auto-height box to nothing.
 */
export default function TextCardComponent({ config, noteReady }: VizRenderProps<FsCardTextConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  if (!config.text.trim()) return null

  return (
    <div style={{ containerType: 'inline-size' }}>
      <div
        style={{
          fontSize: `${SIZE_CQW[config.size]}cqw`,
          fontWeight: WEIGHT_VALUE[config.weight],
          fontFamily: `var(--sf-font-${config.font})`,
          textAlign: config.align,
          color: resolveColor(config.color),
          lineHeight: 1.1,
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
          textTransform: config.uppercase ? 'uppercase' : undefined,
        }}
      >
        {config.text}
      </div>
    </div>
  )
}
