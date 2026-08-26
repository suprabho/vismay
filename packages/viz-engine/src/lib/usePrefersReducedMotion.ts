'use client'

import { useSyncExternalStore } from 'react'

/**
 * True when the OS/browser requests reduced motion. Shared by the stage
 * renderer and the section-transition hooks.
 *
 * Uses `useSyncExternalStore` rather than `useState` + `useEffect` for the
 * same reason as `useIsMobile` (see chartTheme.ts): React 19's concurrent
 * renderer can drop effect-subscribed `matchMedia` updates on the
 * toggle-back-out path. SSR snapshot is `false` (animate by default).
 */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

// Cache the MediaQueryList so the subscription target and snapshot reader
// share the same object and it can never be garbage-collected mid-session.
let _mql: MediaQueryList | null = null
function getMql(): MediaQueryList {
  if (!_mql) _mql = window.matchMedia(REDUCED_MOTION_QUERY)
  return _mql
}

function subscribe(onStoreChange: () => void): () => void {
  const mql = getMql()
  mql.addEventListener('change', onStoreChange)
  return () => mql.removeEventListener('change', onStoreChange)
}

function getSnapshot(): boolean {
  return getMql().matches
}

function getServerSnapshot(): boolean {
  return false
}

export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
