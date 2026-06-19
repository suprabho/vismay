'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { proxiedImage } from '../shared'
import type { FsCardBadgeConfig } from '../types'

/**
 * `fscard:badge` — a crest / logo / flag, now a free-positioned layer: the
 * composer places + sizes it via the layer transform, so the module just fills
 * its box. Reproduces the old draggable Overlay as a layer.
 */
export default function BadgeCardComponent({ config, noteReady }: VizRenderProps<FsCardBadgeConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  if (!config.url) return null

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={proxiedImage(config.url)}
      alt=""
      className="h-full w-full object-contain"
      style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))' }}
    />
  )
}
