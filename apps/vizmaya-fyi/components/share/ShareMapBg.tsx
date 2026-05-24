'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MapPinConfig, MapPalette } from '@vismay/viz-engine'
import type { MapRegionLayer, HeatmapLayer, MapStep, MapTextLabel } from '@vismay/viz-engine'
import { MapboxBackground } from '@vismay/viz-engine'
import type { AspectRatio } from './AspectRatioToggle'

// Per-aspect-ratio focus area for the share-card map. Mapbox padding shifts
// the geographic center coordinate to land inside this fractional rectangle
// of the canvas; the rest of the map fills around it.
//
// Title overlays sit at the top of each card. The square/portrait ratios push
// the focal point down into the lower-middle so the subject clears the
// caption panel. The 4:3 landscape uses a left-column caption, so its focal
// point shifts right into the unobscured 2/3.
//
// Hoisted to module scope so the object identity is stable across renders.
// MapboxBackground's region/heatmap effect lists these focus-area props in
// its deps; an inline literal would be a fresh object every render and would
// cause the effect to tear down and rebuild the choropleth on every parent
// re-render — a visible flicker, especially with custom GeoJSON regions.
type FocusArea = { top: number; left: number; width: number; height: number }
const SHARE_FOCUS_AREA: Record<AspectRatio, FocusArea> = {
  '1:1': { top: 0.20, left: 0, width: 1.0, height: 0.40 },
  '4:5': { top: 0.22, left: 0, width: 1.0, height: 0.40 },
  '3:4': { top: 0.25, left: 0, width: 1.0, height: 0.40 },
  '4:3': { top: 0.10, left: 0.28, width: 0.70, height: 0.40 },
}

interface Props {
  /** Share-card aspect ratio — picks the focal area used to frame the map. */
  ratio: AspectRatio
  center: [number, number]
  zoom: number
  pitch?: number
  bearing?: number
  style?: string
  accessToken: string
  pins?: MapPinConfig[]
  regions?: MapRegionLayer
  heatmap?: HeatmapLayer
  textLabels?: MapTextLabel[]
  onReady?: () => void
  palette?: MapPalette
  fontstack?: string[]
  /** Story `defaults.highlightCountry` — ISO alpha-2 (e.g. "KR"). */
  highlightCountry?: string
  /** Story `defaults.highlightColor` — falls back to pinColor in MapboxBackground. */
  highlightColor?: string
  /** Story `defaults.mapOpacity`. */
  defaultOpacity?: number
  /** Story `defaults.pinColor`. */
  defaultPinColor?: string
  /** Story `defaults.pinRadius`. */
  defaultPinRadius?: number
  /**
   * WebGL canvas pixel ratio. Set to the share-card export ratio so the
   * rasterized map isn't upscaled (and pixelated) when html-to-image draws
   * the canvas into the higher-resolution output.
   */
  pixelRatio?: number
}

/**
 * Share-mode map background. Renders the same Mapbox GL layers the story
 * itself uses (pins, labels, choropleth regions, heatmap) so share cards
 * match the live story. `preserveDrawingBuffer` is enabled so html-to-image
 * can snapshot the canvas; fly animation is skipped so the capture fires at
 * the final pose.
 *
 * A share page can have dozens of cards. Each Mapbox GL instance claims its
 * own WebGL context, and browsers cap simultaneous contexts at ~8–16. If
 * we mount all of them at once, the later maps never finish loading. So we
 * only mount the map when the card is visible (IntersectionObserver), and
 * keep it mounted from then on so capture still works after the card has
 * scrolled back off.
 */
export default function ShareMapBg({
  ratio,
  center,
  zoom,
  pitch = 9,
  bearing = 0,
  style,
  accessToken,
  pins,
  regions,
  heatmap,
  textLabels,
  onReady,
  palette,
  fontstack,
  highlightCountry,
  highlightColor,
  defaultOpacity,
  defaultPinColor,
  defaultPinRadius,
  pixelRatio,
}: Props) {
  const focusArea = SHARE_FOCUS_AREA[ratio]
  const hostRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const el = hostRef.current
    if (!el || mounted) return
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
  }, [mounted])

  // Share cards render at 390px wide — much smaller than the interactive
  // viewport — so scale configured pin radii up a bit to keep them readable.
  const SHARE_PIN_SCALE = 1.6
  const scaledPins = useMemo(
    () =>
      pins?.map((p) => ({
        ...p,
        radius: Math.round((p.radius ?? 10) * SHARE_PIN_SCALE),
      })),
    [pins]
  )

  const steps: MapStep[] = useMemo(
    () => [
      {
        center,
        zoom,
        pitch,
        bearing,
        pins: scaledPins,
        regions,
        heatmap,
        textLabels,
      },
    ],
    [center, zoom, pitch, bearing, scaledPins, regions, heatmap, textLabels]
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
          pixelRatio={pixelRatio}
          landscapeFocusArea={focusArea}
          portraitFocusArea={focusArea}
        />
      )}
    </div>
  )
}
