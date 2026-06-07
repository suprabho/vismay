'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  isActive,
}: VizRenderProps<ChartLayerConfig>) {
  const capture = mode === 'print' || mode === 'capture'
  const signaled = useRef(false)
  const claimed = useRef(false)

  // ECharts plays its entrance animation on first paint, so a chart mounted
  // below the fold would finish animating before the reader ever scrolls to
  // it. Latch on the first activation and defer the chart mount until then —
  // the entrance now runs as the section scrolls into view. Capture/autoplay/
  // print mount only the active unit (isActive=true), so charts there render
  // immediately and the deterministic pipelines stay unaffected.
  const [seen, setSeen] = useState(isActive)
  useEffect(() => {
    if (isActive) setSeen(true)
  }, [isActive])

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
  // its data series have tweened into view. Gated on `seen` so a deferred
  // (not-yet-scrolled-to) chart doesn't prematurely flip its readiness slot.
  useEffect(() => {
    if (!seen) return
    const handle = requestAnimationFrame(() => {
      if (!claimed.current) signalReady()
    })
    return () => cancelAnimationFrame(handle)
  }, [seen, signalReady])

  const onClaim = useCallback(() => {
    claimed.current = true
  }, [])

  const captureValue = useMemo(
    () => ({ capture, onClaim, onPainted: signalReady }),
    [capture, onClaim, signalReady]
  )

  // Not yet scrolled into view — hold the slot's box so layout stays stable
  // and defer the echarts mount (and its entrance animation) until activation.
  if (!seen) return <div style={{ width: '100%', height: '100%' }} />

  return (
    <ChartCaptureProvider value={captureValue}>
      <ChartPanel chartId={config.id} activeStep={activeStep} slug={slug} />
    </ChartCaptureProvider>
  )
}
