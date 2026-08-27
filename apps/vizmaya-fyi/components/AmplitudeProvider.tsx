'use client'

import { useEffect } from 'react'
import { registerRenderSurfaceAnalytics } from '@vismay/render-surface'
import {
  initAnalytics,
  trackShareCardDownloaded,
  trackShareCardsDownloadedAll,
  trackAutoplayStarted,
  trackAutoplayVideoDownloaded,
} from '@/lib/analytics'

/**
 * Boots Amplitude once on the client. Rendered in the root layout so every
 * route initializes analytics on first paint. `initAnalytics` no-ops without
 * an API key and on the headless/iframe surfaces (see lib/analytics.ts), so
 * this is safe to mount unconditionally.
 *
 * Also registers this app's Amplitude wrappers as the analytics sink for the
 * host-agnostic `@vismay/render-surface` shells (share/autoplay download
 * events) — the package no-ops where nothing registers (e.g. apps/render).
 */
export default function AmplitudeProvider() {
  useEffect(() => {
    initAnalytics()
    registerRenderSurfaceAnalytics({
      trackShareCardDownloaded,
      trackShareCardsDownloadedAll,
      trackAutoplayStarted,
      trackAutoplayVideoDownloaded,
    })
  }, [])
  return null
}
