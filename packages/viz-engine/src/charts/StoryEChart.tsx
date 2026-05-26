'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { EChartsOption } from 'echarts'
import { useChartCapture } from './chartCapture'
import { useChartColors } from '../lib/chartTheme'

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
 *   2. The chart background is forced opaque in capture mode. Chromium's
 *      print-to-PDF compositor on Linux (the GitHub Actions runner)
 *      silently drops chart canvases whose option declares
 *      `backgroundColor: 'transparent'` — the canvas paints fine in-page
 *      but its pixels never reach the PDF, leaving only the map + caption
 *      around an empty rectangle. macOS Chromium tolerates the transparent
 *      canvas, so the bug only surfaces on the CI runner. Painting with
 *      the story's theme bg (read synchronously from the `ChartColors`
 *      context that `ThemeProvider` already publishes) sidesteps the
 *      compositor; the chart blends into the page bg regardless of how
 *      alpha is handled. `GenericChart` has always done this; doing it
 *      here covers every hand-built chart too. Reading synchronously
 *      matters — the chart's first paint already has the opaque bg.
 *      `notMerge` chart instances fire `finished` once, and an async
 *      useEffect-based read leaves the chart captured with the
 *      transparent first paint (which is exactly what slipped through
 *      the earlier PR-98 attempt on the Linux runner).
 *   3. Animation is forced off in capture mode, so ECharts paints its final
 *      frame on the first `setOption` — no zeroed transient for `page.pdf()`
 *      to snapshot mid-entrance-animation.
 *   4. Readiness is driven by the ECharts `finished` event. The chart module
 *      claims the layer's readiness slot on mount (`onClaim`) and only flips
 *      it once the chart has actually rendered (`onPainted`).
 *
 * Outside capture the context defaults are no-ops, and each chart keeps its
 * authored renderer (bespoke charts stay on SVG for crisp interactive
 * tooltips), `animation`, and `backgroundColor: 'transparent'` (so the chart
 * blends into the live scroll/autoplay layouts that paint their own bg).
 */
export default function StoryEChart({ option, style, opts, notMerge, lazyUpdate }: Props) {
  const { capture, onClaim, onPainted } = useChartCapture()
  const { bg: themeBg } = useChartColors()
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

  const finalOption: EChartsOption = capture
    ? {
        ...option,
        animation: false,
        // Force opaque bg in capture (see point 2 above). Falls back to
        // whatever the option already set if context didn't provide one.
        backgroundColor: themeBg || option.backgroundColor || '#000',
      }
    : option
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
