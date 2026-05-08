'use client'

import { useMemo } from 'react'
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
}

const DEFAULT_FOCUS_AREA = { top: 0, left: 0, width: 1, height: 1 }

/**
 * Eager-mount Mapbox background for PDF render shells.
 *
 * Mirrors ShareMapBg's prop surface but skips the IntersectionObserver lazy
 * mount — Playwright's `page.pdf()` rasterizes the entire document at once,
 * so off-viewport maps must already have rendered.
 *
 * Note: this means a story with N units mounts N WebGL contexts. Browsers cap
 * simultaneous contexts at ~8–16; longer stories may hit the cap and have
 * later maps fail to load. Deferred to Phase 7+ if it bites.
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
}: Props) {
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
    <div className="absolute inset-0">
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
    </div>
  )
}
