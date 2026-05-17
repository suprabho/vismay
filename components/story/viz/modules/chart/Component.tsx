'use client'

import { useEffect } from 'react'
import ChartPanel from '@/components/story/ChartPanel'
import type { VizRenderProps } from '../../types'
import type { ChartLayerConfig } from './index'

export default function ChartLayerComponent({
  slug,
  config,
  activeStep,
  noteReady,
}: VizRenderProps<ChartLayerConfig>) {
  // ChartPanel doesn't expose a deterministic "first paint" hook, so we signal
  // readiness on the next frame after mount. Phase 5 swaps this for the
  // ECharts `finished` event when readiness generalizes.
  useEffect(() => {
    const handle = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(handle)
  }, [noteReady])
  return <ChartPanel chartId={config.id} activeStep={activeStep} slug={slug} />
}
