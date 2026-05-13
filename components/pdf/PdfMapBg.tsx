'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { MapPinConfig, MapPalette } from '@/lib/storyConfig.types'
import type { MapRegionLayer, HeatmapLayer, MapStep } from '@/types/story'
import MapboxBackground from '@/components/story/charts/MapboxBackground'

interface Props {
  center: [number, number]
  zoom: number
  pitch?: number
  bearing?: number
  style?: string
  accessToken: string
  pins?: MapPinConfig[]
  regions?: MapRegionLayer
  heatmap?: HeatmapLayer
  onReady?: () => void
  palette?: MapPalette
  fontstack?: string[]
  highlightCountry?: string
  highlightColor?: string
  defaultOpacity?: number
  defaultPinColor?: string
  defaultPinRadius?: number
  /**
   * Where in the canvas the geographic center should fall — top, left,
   * width, height as fractions of the canvas. Defaults to centered.
   */
  focusArea?: { top: number; left: number; width: number; height: number }
  /**
   * When true, defer Mapbox mount until the host enters the viewport. Use for
   * the in-browser preview path where only one section is on screen at a time
   * and mounting all N maps eagerly blows past the browser's WebGL context cap
   * (~8–16) on long stories. Leave false for the headless print path —
   * Playwright's page.pdf() rasterizes the entire document at once, so every
   * map must already be live when capture fires.
   */
  lazy?: boolean
}

const DEFAULT_FOCUS_AREA = { top: 0, left: 0, width: 1, height: 1 }

/**
 * Mapbox background for PDF render shells.
 *
 * Two modes via `lazy`:
 *   - `lazy=false` (default, print path): mount eagerly. Playwright's
 *     `page.pdf()` rasterizes the entire document in one shot, so off-viewport
 *     maps must already be live.
 *   - `lazy=true` (preview path): mount on first viewport intersection, then
 *     keep mounted. Mirrors ShareMapBg. Avoids creating N simultaneous WebGL
 *     contexts on long reports — browsers cap at ~8–16 and evict the oldest,
 *     causing earlier sections to flash blank.
 *
 * Print-path persistence: as soon as a map fires `onReady` we snapshot its
 * canvas into a sibling `<img>` tucked behind the live WebGL canvas. Mapbox
 * keeps creating contexts for every map in the doc; when the cap is hit
 * Chromium silently drops the oldest, which turns the live canvas transparent.
 * The pre-snapshotted image then shines through, so the first maps in the
 * document don't end up blank in the captured PDF. Pin markers are DOM
 * elements managed by Mapbox and sit on top of both layers — they survive
 * context loss the same way.
 */
export default function PdfMapBg({
  center,
  zoom,
  pitch = 0,
  bearing = 0,
  style,
  accessToken,
  pins,
  regions,
  heatmap,
  onReady,
  palette,
  fontstack,
  highlightCountry,
  highlightColor,
  defaultOpacity,
  defaultPinColor,
  defaultPinRadius,
  focusArea = DEFAULT_FOCUS_AREA,
  lazy = false,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(!lazy)
  const [snapshot, setSnapshot] = useState<string | null>(null)

  useEffect(() => {
    if (!lazy || mounted) return
    const el = hostRef.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMounted(true)
          io.disconnect()
        }
      },
      { rootMargin: '400px' }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [lazy, mounted])

  const steps: MapStep[] = useMemo(
    () => [
      {
        center,
        zoom,
        pitch,
        bearing,
        pins,
        regions,
        heatmap,
      },
    ],
    [center, zoom, pitch, bearing, pins, regions, heatmap]
  )

  const handleReady = useCallback(() => {
    // Fire the readiness signal FIRST so the page-side fallback timer in
    // lib/pdfReadiness can flip __pdfReady__ on schedule. The snapshot is a
    // best-effort fallback for WebGL context eviction — it must never block
    // or delay the gating signal, or the Playwright wait times out.
    onReady?.()
    if (lazy) return
    const canvas = hostRef.current?.querySelector('canvas.mapboxgl-canvas')
    if (!(canvas instanceof HTMLCanvasElement)) return
    // `toBlob` is async (background encoder thread in headless Chromium), so
    // 20+ maps firing onReady within milliseconds don't pile up sync PNG
    // encodes on the main thread. `preserveDrawingBuffer: true` (set by
    // MapboxBackground when `staticCapture`) keeps the WebGL buffer readable
    // here — otherwise the blob would be transparent.
    try {
      canvas.toBlob(
        (blob) => {
          if (!blob) return
          setSnapshot(URL.createObjectURL(blob))
        },
        'image/png'
      )
    } catch {
      // Tainted-canvas / OOM are non-fatal — fall back to the live canvas.
    }
  }, [lazy, onReady])

  // Free the snapshot blob URL on unmount so long-lived previews don't leak.
  useEffect(() => {
    return () => {
      if (snapshot) URL.revokeObjectURL(snapshot)
    }
  }, [snapshot])

  return (
    <div ref={hostRef} className="absolute inset-0">
      {snapshot && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={snapshot}
          alt=""
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'fill',
            zIndex: 0,
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        style={{ position: 'absolute', inset: 0, zIndex: 1 }}
      >
        {mounted && (
          <MapboxBackground
            accessToken={accessToken}
            steps={steps}
            activeStep={0}
            style={style}
            interactive={false}
            staticCapture
            onReady={handleReady}
            palette={palette}
            fontstack={fontstack}
            hideAllLabels
            highlightCountry={highlightCountry}
            highlightColor={highlightColor}
            defaultOpacity={defaultOpacity}
            defaultPinColor={defaultPinColor}
            defaultPinRadius={defaultPinRadius}
            landscapeFocusArea={focusArea}
            portraitFocusArea={focusArea}
          />
        )}
      </div>
    </div>
  )
}
