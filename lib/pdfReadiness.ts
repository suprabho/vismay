'use client'

import { useEffect, useRef } from 'react'

/**
 * Readiness signal for headless PDF capture.
 *
 * The PDF render path (lib/storyPdfRender.ts) waits on
 * `window.__pdfReady__ === true` before calling `page.pdf()`. Without a
 * deterministic signal, capture either races map-tile loads (rasterizing a
 * blank canvas) or burns time waiting on `networkidle`, which never resolves
 * for pages with persistent websockets / Mapbox tile streaming.
 *
 * Strategy:
 *   - Maps own the gating signal — they're the slowest to settle and have a
 *     concrete `onReady` from MapboxBackground when tiles + layers are ready.
 *   - Once the last map fires onReady, we wait POST_MAP_SETTLE_MS to give
 *     ECharts entrance animations time to finish (ECharts charts use
 *     animation~1s by default; we double it to be safe).
 *   - If there are zero maps on the page, we just wait POST_MAP_SETTLE_MS
 *     after mount and call it ready.
 *   - A FALLBACK_TIMEOUT_MS guard flips the flag regardless if anything
 *     stalls, so a single broken map can't hang the render forever.
 */

const READY_FLAG = '__pdfReady__'
const POST_MAP_SETTLE_MS = 2000
const FALLBACK_TIMEOUT_MS = 60_000

export interface PdfReadinessApi {
  noteMapReady: () => void
}

declare global {
  interface Window {
    __pdfReady__?: boolean
  }
}

// Temporary instrumentation toggle. Logs go to in-page console; Playwright
// runner captures them via `page.on('console')`. Flip to false once we've
// diagnosed the slides timeout.
const PDF_READY_LOG = true
const t0 =
  typeof performance !== 'undefined' ? performance.now() : Date.now()
function pdfLog(msg: string) {
  if (!PDF_READY_LOG) return
  const dt = (
    (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0
  ).toFixed(0)
  console.log(`[pdf-ready +${dt}ms] ${msg}`)
}

export function usePdfReadiness(expectedMaps: number): PdfReadinessApi {
  const stateRef = useRef({
    mapsReady: 0,
    settleTimer: null as ReturnType<typeof setTimeout> | null,
    fallbackTimer: null as ReturnType<typeof setTimeout> | null,
    done: false,
  })

  useEffect(() => {
    const s = stateRef.current
    if (typeof window !== 'undefined') {
      window[READY_FLAG] = false
    }
    pdfLog(`mount expectedMaps=${expectedMaps}`)

    const finalize = (reason: string) => () => {
      if (s.done) {
        pdfLog(`finalize(${reason}) noop — already done`)
        return
      }
      pdfLog(`finalize(${reason}) → __pdfReady__=true (mapsReady=${s.mapsReady}/${expectedMaps})`)
      s.done = true
      if (s.fallbackTimer) clearTimeout(s.fallbackTimer)
      if (s.settleTimer) clearTimeout(s.settleTimer)
      window[READY_FLAG] = true
    }

    s.fallbackTimer = setTimeout(finalize('fallback'), FALLBACK_TIMEOUT_MS)

    if (expectedMaps === 0) {
      s.settleTimer = setTimeout(finalize('no-maps'), POST_MAP_SETTLE_MS)
    }

    return () => {
      if (s.fallbackTimer) clearTimeout(s.fallbackTimer)
      if (s.settleTimer) clearTimeout(s.settleTimer)
    }
  }, [expectedMaps])

  return {
    noteMapReady: () => {
      const s = stateRef.current
      if (s.done) {
        pdfLog('noteMapReady after done — ignored')
        return
      }
      s.mapsReady++
      pdfLog(`noteMapReady → ${s.mapsReady}/${expectedMaps}`)
      if (s.mapsReady >= expectedMaps) {
        if (s.settleTimer) clearTimeout(s.settleTimer)
        s.settleTimer = setTimeout(() => {
          if (s.done) return
          pdfLog(`settle done → __pdfReady__=true`)
          s.done = true
          if (s.fallbackTimer) clearTimeout(s.fallbackTimer)
          window[READY_FLAG] = true
        }, POST_MAP_SETTLE_MS)
      }
    },
  }
}
