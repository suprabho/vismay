'use client'

import dynamic from 'next/dynamic'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { EChartsOption } from 'echarts'
import { useChartCapture } from './chartCapture'

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false })

/**
 * Read the active theme's `--color-bg` off the given element by walking up the
 * computed-style cascade. `ThemeProvider` writes the var to a wrapper div, not
 * documentElement, so reading from any element inside the theme tree picks it
 * up; reading from documentElement does not.
 */
function readThemeBg(el: HTMLElement | null): string | null {
  if (!el || typeof window === 'undefined') return null
  try {
    const v = getComputedStyle(el).getPropertyValue('--color-bg').trim()
    return v || null
  } catch {
    return null
  }
}

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
 *      canvas, so the bug only surfaced once these charts were rendered by
 *      the production CI runner. Painting with the story's --color-bg
 *      sidesteps the compositor; the chart blends into the page background
 *      regardless of how alpha is handled. `GenericChart` has always done
 *      this; doing it here covers the bespoke hand-built charts too.
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
  const painted = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)
  // Capture mode reads --color-bg off the chart's mounted element (so it
  // walks up to ThemeProvider's wrapper). We need the DOM node to exist
  // before we can read it, so the first render falls back to whatever the
  // option declared; the second render (after the ref attaches) uses the
  // resolved theme bg. In practice capture mode runs animation-off, so the
  // single extra render is invisible.
  const [themeBg, setThemeBg] = useState<string | null>(null)

  useEffect(() => {
    if (!capture) return
    setThemeBg(readThemeBg(rootRef.current))
  }, [capture])

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
        // whatever the option already set if the theme var isn't readable yet
        // (first render before the ref attaches).
        backgroundColor: themeBg ?? option.backgroundColor ?? '#000',
      }
    : option
  // Capture: always canvas (prints deterministically). Live: keep the chart's
  // authored renderer, defaulting to canvas to match echarts-for-react's own
  // default (the renderer `GenericChart` has always used).
  const renderer: 'canvas' | 'svg' = capture ? 'canvas' : (opts?.renderer ?? 'canvas')

  return (
    // `display: contents` keeps the ref attached without affecting the
    // surrounding flex layout (chart parents are flex-col with the caption
    // sibling counting on a 380px-tall echarts box, not a wrapped one).
    <div ref={rootRef} style={{ display: 'contents' }}>
      <ReactECharts
        option={finalOption}
        style={style}
        opts={{ ...opts, renderer }}
        notMerge={notMerge}
        lazyUpdate={lazyUpdate}
        onEvents={capture ? { finished: signalPainted } : undefined}
      />
    </div>
  )
}
