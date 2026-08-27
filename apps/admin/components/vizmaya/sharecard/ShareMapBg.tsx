'use client'

// Ported from apps/vizmaya-fyi/components/share/ShareMapBg.tsx.

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MapPinConfig, MapPalette } from '@vismay/viz-engine'
import type { MapRegionLayer, HeatmapLayer, MapStep, MapTextLabel, StoryFocusArea } from '@vismay/viz-engine'
import { MapboxBackground } from '@vismay/viz-engine'
import type { AspectRatio } from './AspectRatioToggle'
import { SHARE_FOCUS_AREA } from './constants'

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
  /**
   * Override the focal rectangle. Defaults to the full-bleed per-ratio
   * `SHARE_FOCUS_AREA`. Contained maps (hero / free-object roles) pass a
   * centered full-box area so the geographic center sits at the box center
   * with no overlay-reserved padding.
   */
  focusArea?: StoryFocusArea
}

/**
 * Share-mode map background. Renders the same Mapbox GL layers the story
 * itself uses (pins, labels, choropleth regions, heatmap) so share cards
 * match the live story. `preserveDrawingBuffer` is enabled (staticCapture) so
 * html-to-image can snapshot the canvas; fly animation is skipped so the
 * capture fires at the final pose. The map mounts only when scrolled into view
 * (IntersectionObserver) to stay under the browser's WebGL context cap, and
 * stays mounted from then on so capture works after it scrolls off.
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
  focusArea: focusAreaProp,
}: Props) {
  const focusArea = focusAreaProp ?? SHARE_FOCUS_AREA[ratio]
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
