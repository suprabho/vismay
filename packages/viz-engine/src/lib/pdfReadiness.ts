'use client'

/**
 * Back-compat shim. The readiness machinery lives in `lib/storyReadiness.ts`
 * — this file preserves the old `usePdfReadiness({ noteMapReady })` API so
 * legacy callers don't break. New code should import from `storyReadiness`
 * directly and use `{ noteReady }`.
 */

import { useStoryReadiness } from './storyReadiness'

export interface PdfReadinessApi {
  noteMapReady: () => void
}

export function usePdfReadiness(expectedMaps: number): PdfReadinessApi {
  const { noteReady } = useStoryReadiness(expectedMaps)
  return { noteMapReady: noteReady }
}
