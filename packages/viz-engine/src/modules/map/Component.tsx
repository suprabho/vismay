'use client'

import { useEffect, useMemo, useState, type ComponentType } from 'react'
import type { VizRenderProps } from '../../types'
import { useStoryShell } from '../../StoryShellContext'
import type MapboxBackgroundType from '../../charts/MapboxBackground'
import type { MapStep } from '../../charts/MapboxBackground'
import type { MapLayerConfig } from './index'

type MapboxBackgroundProps = React.ComponentProps<typeof MapboxBackgroundType>

/**
 * Client-only loader for MapboxBackground. Mirrors the pattern from
 * `PersistentComponent.tsx` — `mapbox-gl` touches `window` at import time, and
 * `next/dynamic({ ssr: false })` triggers BailoutToCSR in Next 16 + Turbopack
 * that can drop sibling DOM at hydration.
 */
function LazyMapboxBackground(props: MapboxBackgroundProps) {
  const [Comp, setComp] = useState<ComponentType<MapboxBackgroundProps> | null>(null)
  useEffect(() => {
    let cancelled = false
    import('../../charts/MapboxBackground').then((m) => {
      if (!cancelled) setComp(() => m.default)
    })
    return () => {
      cancelled = true
    }
  }, [])
  if (!Comp) return null
  return <Comp {...props} />
}

/**
 * Per-unit map renderer for the foreground slot. Mounts a `MapboxBackground`
 * sized to its parent (the foreground region's wrapper) with a single-step
 * `steps` array built from this unit's config.
 *
 * Unlike the background-slot mount, this does NOT share a Mapbox instance
 * with the background map. Authors mixing background-map and
 * foreground-map slots in the same story pay for two WebGL contexts.
 *
 * Within a single foreground configuration, however, React reuses the same
 * component instance across units (the map module's `stableIdentity` is the
 * constant `'map:default'`), so the WebGL context survives unit transitions
 * and `MapboxBackground` animates between unit configs via its existing
 * camera/pin reconciliation.
 */
export default function MapLayerComponent({
  config,
  noteReady,
}: VizRenderProps<MapLayerConfig>) {
  const shell = useStoryShell()

  const step: MapStep = useMemo(() => {
    const pins = config.pins?.map((p) => ({
      coordinates: p.coordinates,
      label: p.label,
      color: p.color ?? shell.defaults.pinColor,
      radius: p.radius ?? shell.defaults.pinRadius,
      pulse: p.pulse,
      labelAnchor: p.labelAnchor,
    }))
    return {
      center: config.center,
      zoom: config.zoom,
      pitch: config.pitch,
      bearing: config.bearing,
      flySpeed: config.flySpeed ?? shell.defaults.flySpeed,
      opacity: config.opacity ?? shell.defaults.mapOpacity,
      pins,
      regions: config.regions,
      heatmap: config.heatmap,
      textLabels: config.textLabels,
    }
  }, [config, shell.defaults])

  return (
    <LazyMapboxBackground
      accessToken={shell.accessToken}
      steps={[step]}
      activeStep={0}
      style={shell.defaults.mapStyle}
      defaultPinColor={shell.defaults.pinColor}
      defaultPinRadius={shell.defaults.pinRadius}
      defaultOpacity={shell.defaults.mapOpacity}
      highlightCountry={shell.defaults.highlightCountry}
      highlightColor={shell.defaults.highlightColor}
      palette={shell.defaults.mapPalette}
      fontstack={shell.defaults.mapFontstack}
      staticCapture={shell.isCapture}
      onReady={noteReady}
    />
  )
}
