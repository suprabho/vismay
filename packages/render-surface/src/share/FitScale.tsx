'use client'

import { useRef, useState, useLayoutEffect, type ReactNode } from 'react'

interface Props {
  /** Scale floor — never shrink below this (keeps text legible). */
  min?: number
  className?: string
  children: ReactNode
}

/**
 * Auto-shrink-to-fit: measures the intrinsic size of its content and scales it
 * down uniformly until it fits the available box. Content is vertically and
 * horizontally centered; when it already fits, scale stays at 1 (no change).
 *
 * Why transform-scale (not font-size): the share text cards lay copy out with
 * `@chenglou/pretext` at a fixed px size, so a font multiplier can't reach it.
 * A transform on the wrapper scales the whole laid-out block — measurement is
 * stable because `transform` doesn't change layout, so `scrollHeight` always
 * reports the intrinsic (unscaled) size.
 *
 * Re-measures across a few frames so it settles after pretext's async,
 * fonts-ready layout pass — important for headless share capture.
 */
export default function FitScale({ min = 0.5, className, children }: Props) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)

  useLayoutEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return
    let raf = 0
    const measure = () => {
      const availH = outer.clientHeight
      const availW = outer.clientWidth
      const needH = inner.scrollHeight
      const needW = inner.scrollWidth
      if (needH <= 0 || needW <= 0 || availH <= 0) {
        raf = requestAnimationFrame(measure)
        return
      }
      const next = Math.min(1, availH / needH, availW / needW)
      setScale(Math.max(min, next))
    }
    raf = requestAnimationFrame(measure)
    // Pretext lays out asynchronously after `document.fonts.ready`; re-measure.
    const timers = [120, 400, 900].map((ms) => setTimeout(measure, ms))
    return () => {
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
    }
  }, [children, min])

  return (
    <div
      ref={outerRef}
      className={className}
      style={{
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
      }}
    >
      <div
        ref={innerRef}
        style={{
          width: '100%',
          flex: '0 0 auto',
          transform: scale < 1 ? `scale(${scale})` : undefined,
          transformOrigin: 'center center',
        }}
      >
        {children}
      </div>
    </div>
  )
}
