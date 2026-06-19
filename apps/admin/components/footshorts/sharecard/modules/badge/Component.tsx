'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { proxiedImage } from '../shared'
import type { FsCardBadgeConfig } from '../types'

/**
 * `fscard:badge` — a crest / logo / flag floated over the card. An `overlay`
 * module: the composer renders it absolutely at the card level (not in the stack
 * flow), and it positions itself from its config (center x/y + width as % of the
 * card). Reproduces the old draggable Overlay, now as a layer.
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
      className="absolute object-contain"
      style={{
        left: `${config.xPct}%`,
        top: `${config.yPct}%`,
        width: `${config.widthPct}%`,
        transform: 'translate(-50%, -50%)',
        filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))',
      }}
    />
  )
}
