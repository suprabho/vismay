'use client'

import { useEffect } from 'react'
import { initAnalytics } from '@/lib/analytics'

/**
 * Boots Amplitude once on the client. Rendered in the root layout so every
 * route initializes analytics on first paint. `initAnalytics` no-ops without
 * an API key and on the headless/iframe surfaces (see lib/analytics.ts), so
 * this is safe to mount unconditionally.
 */
export default function AmplitudeProvider() {
  useEffect(() => {
    initAnalytics()
  }, [])
  return null
}
