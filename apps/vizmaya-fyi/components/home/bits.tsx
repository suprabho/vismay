'use client'

import { useEffect } from 'react'
import { MARK } from '@/lib/home/homeShape'

/** Small pieces of the home page: the Penrose mark and the gentle scroll reveal. */

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
