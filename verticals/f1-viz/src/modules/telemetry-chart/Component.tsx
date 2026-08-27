'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChartCaptureProvider,
  StoryEChart,
  useChartColors,
  type VizRenderProps,
} from '@vismay/viz-engine'
import { graphSpecToECharts } from '../../web/charts/graphSpecToECharts'
import type { TelemetryChartConfig } from './index'

/**
 * Mirrors packages/viz-engine/src/modules/chart/Component.tsx: defer the ECharts
 * mount until the layer is activated (so the entrance animation runs on
 * scroll-in), and in capture mode claim the readiness slot + signal on the
 * chart's `finished` event via ChartCaptureProvider + StoryEChart.
 */
export default function TelemetryChartComponent({
  config,
  mode,
  noteReady,
  isActive,
}: VizRenderProps<TelemetryChartConfig>) {
  const colors = useChartColors()
  const capture = mode === 'print' || mode === 'capture'
  const signaled = useRef(false)
  const claimed = useRef(false)

  const [seen, setSeen] = useState(isActive)
  useEffect(() => {
    if (isActive) setSeen(true)
  }, [isActive])

  const signalReady = useCallback(() => {
    if (signaled.current) return
    signaled.current = true
    noteReady()
  }, [noteReady])

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
    [capture, onClaim, signalReady],
  )

  const option = useMemo(() => graphSpecToECharts(config.spec, colors), [config.spec, colors])

  if (!seen) return <div style={{ width: '100%', height: '100%' }} />

  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', padding: '0.75rem' }}>
      <ChartCaptureProvider value={captureValue}>
        <div style={{ flex: 1, minHeight: 300 }}>
          <StoryEChart option={option} style={{ width: '100%', height: '100%', minHeight: 300 }} notMerge lazyUpdate={false} />
        </div>
      </ChartCaptureProvider>
      {config.caption && (
        <div
          style={{
            color: colors.muted,
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            textAlign: 'center',
            padding: '6px 12px 0',
          }}
        >
          {config.caption}
        </div>
      )}
    </div>
  )
}
