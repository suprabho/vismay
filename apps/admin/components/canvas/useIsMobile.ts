'use client'

import { useSyncExternalStore } from 'react'

/** Narrow-viewport breakpoint shared by the right-docked canvas panels
 *  (inspector, editor, theme, chart). Below this, the panels go full-width
 *  instead of docking to a thin strip that leaves them unusable on phones. */
const MOBILE_QUERY = '(max-width: 640px)'

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {}
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

/**
 * SSR-safe `matchMedia` hook. Returns true when the viewport is at or below
 * the mobile breakpoint. Uses `useSyncExternalStore` so the server snapshot
 * (false → desktop) matches first client render and avoids hydration warnings.
 */
export function useIsMobile(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  )
}
