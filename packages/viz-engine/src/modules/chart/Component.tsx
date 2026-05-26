'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import ChartPanel from '../../charts/ChartPanel'
import { ChartCaptureProvider } from '../../charts/chartCapture'
import type { VizRenderProps } from '../../types'
import type { ChartLayerConfig } from './index'

export default function ChartLayerComponent({
  slug,
  config,
  activeStep,
  mode,
  noteReady,
}: VizRenderProps<ChartLayerConfig>) {
  const capture = mode === 'print' || mode === 'capture'
  const signaled = useRef(false)
  const claimed = useRef(false)

  const signalReady = useCallback(() => {
    if (signaled.current) return
    signaled.current = true
    noteReady()
  }, [noteReady])

  // Default readiness signal: charts that paint synchronously (e.g.
  // FeedbackLoopDiagram) are ready a frame after mount. ECharts charts paint
  // asynchronously (dynamic import + entrance animation), so in capture mode
  // StoryEChart "claims" this slot and instead signals on its `finished`
  // event — otherwise capture would snapshot the chart mid-animation, before
  // its data series have tweened into view.
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      if (!claimed.current) signalReady()
    })
    return () => cancelAnimationFrame(handle)
  }, [signalReady])

  const onClaim = useCallback(() => {
    claimed.current = true
  }, [])

  const captureValue = useMemo(
    () => ({ capture, onClaim, onPainted: signalReady }),
    [capture, onClaim, signalReady]
  )

  return (
    <ChartCaptureProvider value={captureValue}>
      <ChartPanel chartId={config.id} activeStep={activeStep} slug={slug} />
    </ChartCaptureProvider>
  )
}
