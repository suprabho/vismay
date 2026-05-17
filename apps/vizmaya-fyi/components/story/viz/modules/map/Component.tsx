'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '../../types'
import type { MapLayerConfig } from './index'

/**
 * Placeholder for Phase 0. The real map layer renders as a persistent
 * `MapboxBackground` instance owned by `BackgroundVizSlot` (Phase 1) — it can't
 * be naively mounted per-unit because that would dispose and re-create the
 * WebGL context on every scroll snap. Mounting this directly is a programming
 * error during Phase 0 (no callers wire it).
 */
export default function MapLayerComponent({ noteReady }: VizRenderProps<MapLayerConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])
  return null
}
