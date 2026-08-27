'use client'

import { useEffect } from 'react'
import { resolveAssetUrl } from '@vismay/viz-engine'
import type { VizRenderProps } from '@vismay/viz-engine'
import type { PrefetchLayerConfig } from './index'

/** Renders nothing; warms the given image URLs when the browser is idle. */
export default function PrefetchLayerComponent({
  config,
  noteReady,
}: VizRenderProps<PrefetchLayerConfig>) {
  useEffect(() => {
    noteReady()
    const srcs = config.srcs ?? []
    if (srcs.length === 0) return
    const warm = () => {
      for (const src of srcs) {
        try {
          const img = new Image()
          img.decoding = 'async'
          img.src = resolveAssetUrl(src)
        } catch {
          /* best-effort */
        }
      }
    }
    const hasIdle = typeof window.requestIdleCallback === 'function'
    const handle = hasIdle ? window.requestIdleCallback(warm) : window.setTimeout(warm, 350)
    return () => {
      if (hasIdle) window.cancelIdleCallback(handle as number)
      else window.clearTimeout(handle as number)
    }
  }, [config.srcs, noteReady])

  return null
}
