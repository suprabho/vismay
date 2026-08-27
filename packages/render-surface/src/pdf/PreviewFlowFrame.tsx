'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'

interface Props {
  /** Native (print) page width in CSS px (e.g. A4 short side at 96dpi). */
  nativeWidth: number
  /** Minimum native page height — the card grows past this if content runs long. */
  minNativeHeight: number
  /** CSS expression for the preview card's max width on a desktop viewport. */
  maxWidth?: string
  children: ReactNode
}

/**
 * Variant of PreviewFrame that lets the card grow taller than the native page
 * when content overflows. The slides shell needs a fixed-aspect frame (each
 * slide is exactly 1920×1080 by design); the report doesn't — a section's
 * content can spill onto a second physical page in print, and the preview
 * card should reflect that overflow rather than silently clip it.
 *
 * Inner is laid out at native size with `zoom: scale`. We use `zoom` (not
 * `transform: scale`) for the same reason PreviewFrame does — Mapbox GL's
 * WebGL canvas renders blank under a CSS transform, but `zoom` changes
 * layout dimensions cleanly. With `zoom`, the wrapper's natural block height
 * already reflects the zoomed inner, so we don't need to measure heights.
 */
export default function PreviewFlowFrame({
  nativeWidth,
  minNativeHeight,
  maxWidth = 'min(95vw, 900px)',
  children,
}: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = wrapperRef.current
    if (!el) return
    const compute = () => {
      const w = el.getBoundingClientRect().width
      setScale(w > 0 ? w / nativeWidth : 1)
    }
    compute()
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [nativeWidth])

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
        ref={wrapperRef}
        style={{
          width: maxWidth,
          borderRadius: '10px',
          border: '1px solid var(--color-line)',
          boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)',
          background: 'var(--color-bg)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${nativeWidth}px`,
            minHeight: `${minNativeHeight}px`,
            zoom: scale,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
