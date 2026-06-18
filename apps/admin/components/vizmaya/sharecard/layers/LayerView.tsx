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
  opts: { sizeByWidth?: boolean; widthPx?: number; heightPx?: number },
): CSSProperties {
  const size =
    opts.widthPx != null
      ? { width: opts.widthPx, height: opts.heightPx ?? opts.widthPx }
      : opts.sizeByWidth
        ? { width: `${t.widthPct}%`, ...(t.heightPct != null ? { height: `${t.heightPct}%` } : {}) }
        : {}
  return {
    position: 'absolute',
    left: `${t.xPct}%`,
    top: `${t.yPct}%`,
    ...size,
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
  // Maps + charts are rendered by LayeredShareCard (Mapbox / chart ready-gate);
  // ElementView only handles the self-contained decorations + box images.
  if (element.kind === 'map' || element.kind === 'chart') return null

  // Flags get an explicit pixel box when widthPx is set; otherwise flags +
  // images size by widthPct. (A flag PNG is ~1280px intrinsic, so without an
  // explicit width it would render huge and `scale` couldn't tame it.)
  const flagWPx = element.kind === 'flag' ? element.widthPx : undefined
  const flagHPx = element.kind === 'flag' ? element.heightPx : undefined
  const wrapperOpts =
    flagWPx != null
      ? { widthPx: flagWPx, heightPx: flagHPx ?? flagWPx }
      : { sizeByWidth: element.kind === 'image' || element.kind === 'flag' }
  const glyphPx = (element.transform.widthPct / 100) * cardWidth
  // A box-fit ("hero") image carries a heightPct → fill the wrapper's W×H box;
  // without one it keeps its intrinsic ratio (width only).
  const boxImage = element.kind === 'image' && element.transform.heightPct != null

  return (
    <div style={transformWrapperStyle(element.transform, wrapperOpts)}>
      {element.kind === 'emoji' ? (
        <span style={{ display: 'block', fontSize: glyphPx, lineHeight: 1, filter: DROP_SHADOW }}>
          {element.glyph}
        </span>
      ) : element.kind === 'flag' ? (
        flagWPx != null ? (
          // explicit pixel box — fill it; clip to a circle/ellipse if requested
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxiedOverlaySrc(element.src)}
            alt=""
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', borderRadius: element.circle ? '50%' : undefined, filter: DROP_SHADOW }}
          />
        ) : element.circle ? (
          <div style={{ width: '100%', aspectRatio: '1 / 1', borderRadius: '50%', overflow: 'hidden', filter: DROP_SHADOW }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={proxiedOverlaySrc(element.src)} alt="" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={proxiedOverlaySrc(element.src)}
            alt=""
            style={{ display: 'block', width: '100%', objectFit: 'contain', filter: DROP_SHADOW }}
          />
        )
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
          style={{ display: 'block', width: '100%', height: boxImage ? '100%' : undefined, objectFit: element.objectFit, filter: DROP_SHADOW }}
        />
      )}
    </div>
  )
}

/** Expand a 3/6-digit hex to "r, g, b" channels; null if not hex. */
function hexChannels(hex: string): string | null {
  const h = hex.trim().replace(/^#/, '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  if (!/^[0-9a-f]{6}$/i.test(full)) return null
  const n = parseInt(full, 16)
  return `${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff}`
}
function rgba(hex: string, opacity: number): string {
  const ch = hexChannels(hex)
  return ch ? `rgba(${ch}, ${opacity})` : hex
}

export function TextView({ block, cardWidth: _cardWidth }: { block: TextBlock; cardWidth: number }) {
  if (!block.visible || !block.text.trim()) return null
  const s = block.style
  const p = block.panel
  const text = (
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
  )
  return (
    <div style={transformWrapperStyle(block.transform, { sizeByWidth: true })}>
      {p?.enabled ? (
        <div
          style={{
            padding: p.paddingPx,
            borderRadius: p.radiusPx,
            background: rgba(p.bg, p.bgOpacity),
            backdropFilter: p.blurPx > 0 ? `blur(${p.blurPx}px)` : undefined,
            WebkitBackdropFilter: p.blurPx > 0 ? `blur(${p.blurPx}px)` : undefined,
            border: p.borderWidthPx > 0 ? `${p.borderWidthPx}px solid ${p.borderColor}` : undefined,
          }}
        >
          {text}
        </div>
      ) : (
        text
      )}
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
