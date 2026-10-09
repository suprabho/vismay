'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MARK } from '@/lib/home/homeShape'

/**
 * Small pieces of the home page's story styling: the chapter frame, the
 * Penrose mark, count-ups and the gentle scroll reveal.
 */

/**
 * Fades an element up the first time it scrolls into view. Only once the page
 * is hydrated (`.hs-js` on the root), so without JS everything stays visible,
 * and never under reduced motion.
 */
export const REVEAL =
  'motion-safe:[.hs-js_&]:opacity-0 motion-safe:[.hs-js_&]:translate-y-5 [.hs-js_&.is-in]:opacity-100 [.hs-js_&.is-in]:translate-y-0 transition-[opacity,translate] duration-700 ease-[cubic-bezier(.22,1,.36,1)]'

/** Marks the root hydrated and reveals each [data-reveal] child as it arrives. */
export function useReveal(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current
    if (!el) return
    el.classList.add('hs-js')
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('is-in')
            io.unobserve(e.target)
          }
        }),
      { rootMargin: '0px 0px -8% 0px' }
    )
    el.querySelectorAll('[data-reveal]').forEach((n) => io.observe(n))
    return () => io.disconnect()
  }, [root])
}

/** One chapter of the page: its headline and dek, then its content. */
export function Chapter({
  id,
  title,
  dek,
  aside,
  children,
}: {
  id: string
  title: ReactNode
  dek?: ReactNode
  aside?: ReactNode
  children: ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-16 border-t border-(--line) px-4 py-20 sm:px-8 md:py-28">
      <div className="mx-auto max-w-[1180px]">
        <header data-reveal className={`mb-10 grid gap-6 md:mb-14 md:grid-cols-[minmax(0,1fr)_auto] md:items-end ${REVEAL}`}>
          <div>
            <h2
              id={`${id}-h`}
              className="max-w-[18ch] font-(family-name:--serif) text-[clamp(44px,6.4vw,84px)] font-normal leading-[.95] tracking-[-.02em] text-balance [&_em]:text-(--signal)"
            >
              {title}
            </h2>
            {dek && <p className="mt-5 max-w-[60ch] text-[17px] leading-[1.7] text-(--muted) md:text-[18px]">{dek}</p>}
          </div>
          {aside}
        </header>
        {children}
      </div>
    </section>
  )
}

/** The studio's three-mysteries logo, in its own colours. */
export function PenroseMark({ size = 20, line = 'color-mix(in srgb, var(--text) 30%, transparent)', className = '' }: { size?: number; line?: string; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 150 150" aria-hidden className={className}>
      <path d="M75 28L28 122M75 28l47 94M28 122h94" style={{ stroke: line }} strokeWidth="1.2" fill="none" />
      <circle cx="75" cy="28" r="15" fill={MARK.teal} />
      <circle cx="28" cy="122" r="15" fill={MARK.pink} />
      <circle cx="122" cy="122" r="15" fill={MARK.blue} />
    </svg>
  )
}

/**
 * A number that counts up the first time it is seen. The final value is what
 * the server renders, and what stays when JS or motion is off.
 */
export function CountUp({ value, className = '' }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const [shown, setShown] = useState(value)
  useEffect(() => {
    const el = ref.current
    if (!el || value <= 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      const t0 = performance.now()
      const frame = (t: number) => {
        const p = Math.min(1, (t - t0) / 1200)
        setShown(Math.round(value * (1 - Math.pow(1 - p, 3))))
        if (p < 1) raf = requestAnimationFrame(frame)
      }
      raf = requestAnimationFrame(frame)
    })
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [value])
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {shown}
    </span>
  )
}
