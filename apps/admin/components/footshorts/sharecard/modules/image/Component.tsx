'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { proxiedImage } from '../shared'
import type { FsCardImageConfig } from '../types'

/**
 * `fscard:image` — a free image overlay (upload / AI-generated / news thumbnail).
 * Fills its transform box with the chosen object-fit. Data URLs (upload /
 * generated) render directly; remote URLs (news) route through the same-origin
 * proxy so html-to-image rasterizes them without a cross-origin taint.
 */
export default function ImageCardComponent({ config, noteReady }: VizRenderProps<FsCardImageConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  if (!config.src) return null
  const src = config.src.startsWith('data:') ? config.src : proxiedImage(config.src)

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      className="h-full w-full"
      style={{ objectFit: config.objectFit }}
    />
  )
}
