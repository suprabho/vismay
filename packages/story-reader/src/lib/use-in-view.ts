'use client'

import { useEffect, useState, RefObject } from 'react'

export function useInView(
  ref: RefObject<HTMLElement | null>,
  options: IntersectionObserverInit = {}
): boolean {
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true)
      }
    }, options)

    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, options.threshold, options.rootMargin])

  return isInView
}
