'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '../../types'
import type { AudioLayerConfig } from './index'

/**
 * Audio layers render nothing — sound is muxed at render time from `src`. The
 * component exists only so the registry can mount the type uniformly; it signals
 * readiness immediately so it never blocks a capture surface.
 */
export default function AudioLayerComponent({ noteReady }: VizRenderProps<AudioLayerConfig>) {
  useEffect(() => {
    noteReady()
  }, [noteReady])
  return null
}
