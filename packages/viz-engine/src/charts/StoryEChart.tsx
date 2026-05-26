'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { EChartsOption } from 'echarts'
import { useChartCapture } from './chartCapture'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

interface Props {
  option: EChartsOption
  style?: CSSProperties
  /** Defaults to the SVG renderer — it rasterizes cleanly into Chromium's PDF. */
  opts?: { renderer?: 'canvas' | 'svg'; [key: string]: unknown }
  notMerge?: boolean
  lazyUpdate?: boolean
}

/**
 * Shared host for every foreground ECharts chart. Centralizes the two
 * capture-only behaviours that keep charts from vanishing in PDF/slide
 * renders (see `chartCapture.tsx` for the why):
 *
 *   1. Animation is forced off in capture mode, so ECharts paints its final
 *      frame on the first `setOption` — there is no zeroed transient for
 *      `page.pdf()` to snapshot.
 *   2. Readiness is driven by the ECharts `finished` event. The chart module
 *      claims the layer's readiness slot on mount (`onClaim`) and only flips
 *      it once the chart has actually rendered (`onPainted`).
 *
 * Outside capture the context defaults are no-ops and the authored
 * `animation` is preserved, so live scroll/autoplay behaviour is unchanged.
 */
export default function StoryEChart({ option, style, opts, notMerge, lazyUpdate }: Props) {
  const { capture, onClaim, onPainted } = useChartCapture()
  const painted = useRef(false)

  const signalPainted = () => {
    if (painted.current) return
    painted.current = true
    onPainted()
  }

  useEffect(() => {
    if (!capture) return
    onClaim()
    // Backstop: if `finished` never lands (e.g. a chunk error) signal anyway
    // so the render rides this short delay instead of the 60s global fallback.
    const timer = setTimeout(signalPainted, 8000)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capture, onClaim])

  const finalOption: EChartsOption = capture ? { ...option, animation: false } : option

  return (
    <ReactECharts
      option={finalOption}
      style={style}
      opts={opts ?? { renderer: 'svg' }}
      notMerge={notMerge}
      lazyUpdate={lazyUpdate}
      onEvents={capture ? { finished: signalPainted } : undefined}
    />
  )
}
