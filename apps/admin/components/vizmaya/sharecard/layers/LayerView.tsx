'use client'

import type { CSSProperties } from 'react'
import * as Phosphor from '@phosphor-icons/react'
import { proxiedOverlaySrc } from '../OverlayLayer'
import type { ElementLayer, FontFamily, TextBlock, Transform } from './types'

/**
 * Renders the non-map foreground layers (text / emoji / flag / icon / image)
 * inside a transform wrapper. Generalizes the old `OverlayLayer`: position is
 * the layer CENTER, sizing is in px (container units don't survive the
 * html-to-image clone), and the drop-shadow lives on the inner content node so
 * it never shares a node with the rotated wrapper. Map layers are rendered by
 * `LayeredShareCard` itself (they need the Mapbox + capture-ready plumbing).
 */

const FONT_VAR: Record<FontFamily, string> = {
  serif: 'var(--font-serif)',
  sans: 'var(--font-sans)',
  mono: 'var(--font-mono)',
}

/** Transform wrapper style. `sizeByWidth` boxes the layer to `widthPct` of the
 *  card (image / text / map); otherwise the wrapper hugs its content (emoji /
 *  icon, sized by px on the glyph). transform-origin is pinned so rotation
 *  pivots about the center in both preview and the captured clone. */
export function transformWrapperStyle(
  t: Transform,
  opts: { sizeByWidth: boolean },
): CSSProperties {
  return {
    position: 'absolute',
    left: `${t.xPct}%`,
    top: `${t.yPct}%`,
    ...(opts.sizeByWidth ? { width: `${t.widthPct}%` } : {}),
    transform: `translate(-50%, -50%) rotate(${t.rotation}deg) scale(${t.scale})`,
    transformOrigin: 'center center',
    opacity: t.opacity,
  }
}

const DROP_SHADOW = 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))'

export function ElementView({
  element,
  cardWidth,
}: {
  element: ElementLayer
  cardWidth: number
}) {
  if (!element.visible) return null
  // Map elements are rendered by LayeredShareCard (Mapbox + ready-gate).
  if (element.kind === 'map') return null

  const sizeByWidth = element.kind === 'image'
  const glyphPx = (element.transform.widthPct / 100) * cardWidth

  return (
    <div style={transformWrapperStyle(element.transform, { sizeByWidth })}>
      {element.kind === 'emoji' ? (
        <span style={{ display: 'block', fontSize: glyphPx, lineHeight: 1, filter: DROP_SHADOW }}>
          {element.glyph}
        </span>
      ) : element.kind === 'flag' ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proxiedOverlaySrc(element.src)}
          alt=""
          style={{ display: 'block', width: '100%', objectFit: 'contain', filter: DROP_SHADOW }}
        />
      ) : element.kind === 'icon' ? (
        <PhosphorIcon
          name={element.name}
          weight={element.weight}
          color={element.color}
          size={glyphPx}
        />
      ) : (
        // image
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proxiedOverlaySrc(element.src)}
          alt=""
          style={{ display: 'block', width: '100%', objectFit: element.objectFit, filter: DROP_SHADOW }}
        />
      )}
    </div>
  )
}

export function TextView({ block, cardWidth: _cardWidth }: { block: TextBlock; cardWidth: number }) {
  if (!block.visible || !block.text.trim()) return null
  const s = block.style
  return (
    <div style={transformWrapperStyle(block.transform, { sizeByWidth: true })}>
      <div
        style={{
          color: s.color,
          fontFamily: FONT_VAR[s.fontFamily],
          fontWeight: s.fontWeight,
          fontSize: s.fontSizePx,
          lineHeight: s.lineHeight,
          textAlign: s.align,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {block.text}
      </div>
    </div>
  )
}

type PhosphorComponent = React.ComponentType<{ size?: number; weight?: string; color?: string }>

/** Render a Phosphor icon by its export name (e.g. "Lightning"), falling back
 *  to a neutral dot when the name is unknown. */
function PhosphorIcon({
  name,
  weight,
  color,
  size,
}: {
  name: string
  weight: string
  color: string
  size: number
}) {
  const lib = Phosphor as unknown as Record<string, PhosphorComponent | undefined>
  const Cmp = lib[name]
  if (!Cmp) {
    return (
      <span
        style={{ display: 'inline-block', width: size, height: size, borderRadius: '50%', background: color }}
      />
    )
  }
  return (
    <span style={{ display: 'block', filter: DROP_SHADOW }}>
      <Cmp size={size} weight={weight} color={color} />
    </span>
  )
}
