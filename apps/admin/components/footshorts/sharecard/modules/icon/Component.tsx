'use client'

import { useEffect } from 'react'
import * as Phosphor from '@phosphor-icons/react'
import type { VizRenderProps } from '@vismay/viz-engine'
import type { PhosphorWeight } from '../../types'
import type { FsCardIconConfig } from '../types'

type PhosphorComponent = React.ComponentType<{
  size?: number | string
  weight?: PhosphorWeight
  color?: string
}>

const PhosphorLib = Phosphor as unknown as Record<string, PhosphorComponent | undefined>

/** Map the short color tokens the picker offers onto the card's theme vars; pass
 *  any explicit hex straight through. Blank → inherit the card text color. */
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

/**
 * `fscard:icon` — a Phosphor icon as a free-positioned layer. `size="100%"` makes
 * the SVG fill its transform box, so the composer's resize handle scales it; the
 * SVG rasterizes cleanly for html-to-image capture (no proxy needed).
 */
export default function IconCardComponent({ config, noteReady }: VizRenderProps<FsCardIconConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  const Cmp = config.iconName ? PhosphorLib[config.iconName] : undefined
  if (!Cmp) return null

  return (
    <div className="flex h-full w-full items-center justify-center" style={{ color: 'var(--sf-color-text)' }}>
      <Cmp size="100%" weight={config.iconWeight} color={resolveColor(config.iconColor)} />
    </div>
  )
}
