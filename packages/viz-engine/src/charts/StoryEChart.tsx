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
  opts?: { renderer?: 'canvas' | 'svg'; [key: string]: unknown }
  notMerge?: boolean
  lazyUpdate?: boolean
}

/**
 * Shared host for every foreground ECharts chart. Centralizes the
 * capture-mode behaviours that keep charts from vanishing in PDF/slide
 * renders (see `chartCapture.tsx` for the why):
 *
 *   1. The CANVAS renderer is forced in capture mode. ECharts' SVG output
 *      does not survive Chromium's print-to-PDF reliably (it broke around
 *      Skia/PDF m148, and only the bespoke charts ever used SVG — every
 *      `data:` chart already rendered to canvas and printed fine, which is
 *      why this bug was specific to the one SVG-rendered story). Canvas
 *      rasterizes deterministically into the PDF.
 *   2. Animation is forced off in capture mode, so ECharts paints its final
 *      frame on the first `setOption` — no zeroed transient for `page.pdf()`
 *      to snapshot mid-entrance-animation.
 *   3. Readiness is driven by the ECharts `finished` event. The chart module
 *      claims the layer's readiness slot on mount (`onClaim`) and only flips
 *      it once the chart has actually rendered (`onPainted`).
 *
 * Outside capture the context defaults are no-ops, and each chart keeps its
 * authored renderer (bespoke charts stay on SVG for crisp interactive
 * tooltips) and `animation`, so live scroll/autoplay behaviour is unchanged.
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
  // Capture: always canvas (prints deterministically). Live: keep the chart's
  // authored renderer, defaulting to canvas to match echarts-for-react's own
  // default (the renderer `GenericChart` has always used).
  const renderer: 'canvas' | 'svg' = capture ? 'canvas' : (opts?.renderer ?? 'canvas')

  return (
    <ReactECharts
      option={finalOption}
      style={style}
      opts={{ ...opts, renderer }}
      notMerge={notMerge}
      lazyUpdate={lazyUpdate}
      onEvents={capture ? { finished: signalPainted } : undefined}
    />
  )
}
