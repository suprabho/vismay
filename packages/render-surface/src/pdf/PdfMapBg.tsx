'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MapPinConfig, MapPalette } from '@vismay/viz-engine'
import type { MapRegionLayer, HeatmapLayer, MapStep } from '@vismay/viz-engine'
import { MapboxBackground } from '@vismay/viz-engine'

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

  return (
    <div ref={hostRef} className="absolute inset-0">
      {mounted && (
        <MapboxBackground
          accessToken={accessToken}
          steps={steps}
          activeStep={0}
          style={style}
          interactive={false}
          staticCapture
          onReady={onReady}
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
  )
}
