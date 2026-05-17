'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Measure a wrapper element and return the scale factor needed to fit a
 * fixed-size inner frame (`nativeWidth × nativeHeight`) inside it.
 *
 * The returned `ref` is meant for the wrapper, not the inner. Inner frame
 * uses `transform: scale(scale)` with `transform-origin: top left` and is
 * positioned absolutely inside the wrapper.
 *
 * Used by the PDF preview shells (`SlidesShell`, `ReportShell`) to fit a
 * native-size print frame into the dev viewport without the print path
 * having to know about scaling — Playwright's `?print=1` skips the wrapper
 * entirely and hits the native frame directly.
 */
export function useFitScale<T extends HTMLElement>(
  nativeWidth: number,
  nativeHeight: number
): { ref: React.RefObject<T | null>; scale: number } {
  const ref = useRef<T | null>(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const compute = (rect: { width: number; height: number }) => {
      const sw = rect.width / nativeWidth
      const sh = rect.height / nativeHeight
      // Fit with letterboxing — the smaller of the two ratios.
      const next = Math.min(sw, sh)
      setScale(next > 0 ? next : 1)
    }
    compute(el.getBoundingClientRect())
    const ro = new ResizeObserver(([entry]) => compute(entry.contentRect))
    ro.observe(el)
    return () => ro.disconnect()
  }, [nativeWidth, nativeHeight])

  return { ref, scale }
}
