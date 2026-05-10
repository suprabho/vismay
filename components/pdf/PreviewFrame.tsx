'use client'

import type { ReactNode } from 'react'
import { useFitScale } from '@/lib/useFitScale'

interface Props {
  /** Native (print) width of the frame, in CSS px. */
  nativeWidth: number
  /** Native (print) height of the frame, in CSS px. */
  nativeHeight: number
  /**
   * How wide the preview wrapper should be on a desktop viewport. The
   * height follows from the aspect ratio and is also clamped via `maxHeight`
   * so a tall page doesn't push other slides off-screen. Defaults to
   * `min(95vw, calc((100vh - 120px) * <aspect>))` when `maxHeight` is set,
   * otherwise just `min(95vw, 1200px)`.
   */
  maxHeight?: string
  children: ReactNode
}

/**
 * Wraps a native-size print frame in a centered, framed, scaled-down preview
 * card. Used by SlidesShell + ReportShell when `print=false` so the dev view
 * fits any viewport without breaking the print path — Playwright (`?print=1`)
 * skips this wrapper entirely.
 *
 * Inner children are rendered at native `nativeWidth × nativeHeight`, then
 * scaled down via CSS transform to fit the wrapper's measured rect.
 */
export default function PreviewFrame({
  nativeWidth,
  nativeHeight,
  maxHeight,
  children,
}: Props) {
  const { ref, scale } = useFitScale<HTMLDivElement>(nativeWidth, nativeHeight)
  const aspect = nativeWidth / nativeHeight
  const aspectMaxWidth = maxHeight ? `calc((${maxHeight}) * ${aspect})` : null
  const widthExpr = aspectMaxWidth
    ? `min(95vw, ${aspectMaxWidth})`
    : 'min(95vw, 1200px)'

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        padding: '24px 16px',
        breakInside: 'avoid',
      }}
    >
      <div
        ref={ref}
        style={{
          width: widthExpr,
          aspectRatio: `${nativeWidth} / ${nativeHeight}`,
          position: 'relative',
          overflow: 'hidden',
          borderRadius: '10px',
          border: '1px solid var(--color-line)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)',
          background: 'var(--color-bg)',
        }}
      >
        {/*
         * `transform: scale()` (not `zoom`) — in Chrome, CSS `zoom` propagates
         * into descendants' `clientWidth`, so Mapbox (which sizes its WebGL
         * canvas from `container.clientWidth`) reads already-scaled dimensions
         * and the canvas then gets scaled AGAIN by the parent zoom — ending up
         * `scale²` the size it should be. With `transform: scale()`, layout
         * dimensions stay native, Mapbox sizes the canvas to the full 1920×1080
         * frame, and the visual transform shrinks it once to fit the wrapper.
         * `transform-origin: top left` keeps the visual top-left aligned with
         * the wrapper's top-left so `overflow: hidden` clips cleanly.
         */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: `${nativeWidth}px`,
            height: `${nativeHeight}px`,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
