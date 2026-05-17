'use client'

import { useEffect, useRef } from 'react'

/**
 * Generic readiness signal for headless capture (PDF, share, video).
 *
 * The PDF render pipeline (`lib/storyPdfRender.ts`) waits on
 * `window.__pdfReady__ === true` before calling `page.pdf()`. Without a
 * deterministic signal, capture either races tile loads (rasterizing blank
 * canvases) or burns time waiting on `networkidle`, which never resolves for
 * pages with persistent websockets / Mapbox tile streaming.
 *
 * Strategy:
 *   - The page reports a count of signals it expects (`expectedSignals`).
 *     Each map, image, video, Rive, embed, chart, etc. contributes one.
 *   - The hook returns `{ noteReady }`. Each signal source calls it once
 *     when its first-paintable state is reached (`onLoad`, `loadeddata`,
 *     ECharts `finished`, Mapbox `idle`, Rive `load`, …).
 *   - When all expected signals are in, the hook waits POST_SETTLE_MS to
 *     give ECharts entrance animations + Rive intros a moment to finish.
 *   - A FALLBACK_TIMEOUT_MS guard flips the flag regardless if anything
 *     stalls, so one broken signal source can't hang the render forever.
 *
 * `expectedSignals` may be 0 (a pure-prose page) — the settle delay still
 * fires so the flag eventually flips.
 *
 * The hook is named `useStoryReadiness` because it's no longer PDF-specific
 * — share and video pipelines could read the same flag in future. The legacy
 * `usePdfReadiness` alias in `lib/pdfReadiness.ts` is preserved for callers
 * that still expect the map-only `{ noteMapReady }` API.
 */

const READY_FLAG = '__pdfReady__'
const POST_SETTLE_MS = 2000
const FALLBACK_TIMEOUT_MS = 60_000

declare global {
  interface Window {
    __pdfReady__?: boolean
  }
}

export interface StoryReadinessApi {
  /** Called once per signal source. Subsequent calls past `expectedSignals` are ignored. */
  noteReady: () => void
}

export function useStoryReadiness(expectedSignals: number): StoryReadinessApi {
  const stateRef = useRef({
    received: 0,
    settleTimer: null as ReturnType<typeof setTimeout> | null,
    fallbackTimer: null as ReturnType<typeof setTimeout> | null,
    done: false,
  })

  useEffect(() => {
    const s = stateRef.current
    if (typeof window !== 'undefined') {
      window[READY_FLAG] = false
    }

    const finalize = () => {
      if (s.done) return
      s.done = true
      if (s.fallbackTimer) clearTimeout(s.fallbackTimer)
      if (s.settleTimer) clearTimeout(s.settleTimer)
      window[READY_FLAG] = true
    }

    s.fallbackTimer = setTimeout(finalize, FALLBACK_TIMEOUT_MS)

    // Zero expected → just settle and flip. Useful for prose-only pages
    // (or pages where the count slipped to 0 because every viz failed).
    if (expectedSignals === 0) {
      s.settleTimer = setTimeout(finalize, POST_SETTLE_MS)
    }

    return () => {
      if (s.fallbackTimer) clearTimeout(s.fallbackTimer)
      if (s.settleTimer) clearTimeout(s.settleTimer)
    }
  }, [expectedSignals])

  return {
    noteReady: () => {
      const s = stateRef.current
      if (s.done) return
      s.received++
      if (s.received >= expectedSignals) {
        if (s.settleTimer) clearTimeout(s.settleTimer)
        s.settleTimer = setTimeout(() => {
          if (s.done) return
          s.done = true
          if (s.fallbackTimer) clearTimeout(s.fallbackTimer)
          window[READY_FLAG] = true
        }, POST_SETTLE_MS)
      }
    },
  }
}
