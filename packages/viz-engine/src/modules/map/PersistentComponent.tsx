'use client'

import { useEffect, useMemo, useState, type ComponentType } from 'react'
import type { VizPersistentRenderProps } from '../../types'
import { useStoryShell } from '../../StoryShellContext'
import type MapboxBackgroundType from '../../charts/MapboxBackground'
import type { MapStep } from '../../charts/MapboxBackground'
import type { SubsectionMapOverride } from '../../lib/storyConfig.types'
import type { MapOverrideConfig } from '../../lib/storyMapOverrides'
import {
  STORY_LANDSCAPE_FOCUS_AREA,
  STORY_PORTRAIT_FOCUS_AREA,
} from '../../lib/storyFocusArea'
import type { MapLayerConfig } from './index'

type MapboxBackgroundProps = React.ComponentProps<typeof MapboxBackgroundType>

/**
 * Client-only loader for MapboxBackground. Mirrors the pattern from
 * StoryMapShell.tsx — `mapbox-gl` touches `window` at import time, and
 * `next/dynamic({ ssr: false })` triggers BailoutToCSR in Next 16 + Turbopack
 * that can drop sibling DOM at hydration. The useEffect import path is the
 * known-safe workaround.
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

function indexOverrides(
  cfg: MapOverrideConfig | null | undefined
): Map<string, SubsectionMapOverride> {
  const map = new Map<string, SubsectionMapOverride>()
  if (!cfg) return map
  for (const o of cfg.overrides) {
    map.set(`${o.parentIndex}.${o.subIndex ?? '_'}`, o.map)
  }
  return map
}

/**
 * Persistent-aggregated map renderer. Owns the per-unit step-layering logic
 * lifted from the legacy `StoryMapShell.tsx` mount so the slot stays generic
 * across viz types.
 *
 * Layering for each unit, lowest → highest priority:
 *   1. parent section `map`
 *   2. subsection `map` (if any)
 *   3. autoplay parent override   (only when isAutoplay)
 *   4. autoplay subsection override (only when isAutoplay)
 *   5. mobile layer (`.mobile` block from whichever level provided it)
 *   6. autoplay mobile overrides at parent + sub level (only when both
 *      isAutoplay AND isPortrait — the 9:16 video render).
 */
export default function MapPersistentComponent({
  configs,
  activeUnit,
  noteReady,
}: VizPersistentRenderProps<MapLayerConfig>) {
  const shell = useStoryShell()
  const overrideIndex = useMemo(
    () => indexOverrides(shell.mapOverrides),
    [shell.mapOverrides]
  )

  const mapSteps: MapStep[] = useMemo(() => {
    // `configs` and `shell.units` are unit-indexed and same length. The slot's
    // contract guarantees this — the persistent-aggregated mode always passes
    // one config slot per unit, with `null` where this background instance is
    // not referenced.
    // Track the most-recent valid step so units that opt out of the map
    // (`background: { type: 'none' }` or non-map backgrounds in new stories)
    // still have a defined camera position. Mapbox needs `center` / `zoom`
    // for every step in the array; visibility is the slot's concern.
    let lastValid: MapStep | null = null
    return shell.units.map((unit, unitIdx) => {
      const cfg = configs[unitIdx]
      // `parentMap` may be undefined on units that don't carry the legacy
      // top-level `map:` field (new viz-only stories). Treat it as an empty
      // object so the fallback chain stays linear.
      const parentMap = (unit.parentConfig.map ?? {}) as Partial<NonNullable<typeof unit.parentConfig.map>>
      const sub = unit.parentConfig.subsections?.[unit.subIndex]
      const subOver = sub?.map
      const apParent = shell.isAutoplay
        ? overrideIndex.get(`${unit.parentIndex}._`)
        : undefined
      const apSub = shell.isAutoplay
        ? overrideIndex.get(`${unit.parentIndex}.${unit.subIndex}`)
        : undefined

      const resolvedCenter =
        apSub?.center ?? apParent?.center ?? subOver?.center ?? cfg?.center ?? parentMap.center
      const resolvedZoom =
        apSub?.zoom ?? apParent?.zoom ?? subOver?.zoom ?? cfg?.zoom ?? parentMap.zoom

      // Unit has no map data anywhere — reuse the previous unit's camera so
      // Mapbox doesn't fly to (0, 0) every time the active unit advances
      // through a no-map section. The slot keeps it hidden anyway.
      if (resolvedCenter == null || resolvedZoom == null) {
        if (lastValid) return lastValid
        // First unit and no map config — use a neutral camera.
        const placeholder: MapStep = { center: [0, 0], zoom: 1, opacity: 0 }
        return placeholder
      }

      let center = resolvedCenter
      let zoom = resolvedZoom
      let pitch =
        apSub?.pitch ?? apParent?.pitch ?? subOver?.pitch ?? cfg?.pitch ?? parentMap.pitch
      let bearing =
        apSub?.bearing ?? apParent?.bearing ?? subOver?.bearing ?? cfg?.bearing ?? parentMap.bearing
      let flySpeed =
        apSub?.flySpeed ??
        apParent?.flySpeed ??
        subOver?.flySpeed ??
        cfg?.flySpeed ??
        parentMap.flySpeed ??
        shell.defaults.flySpeed
      let opacity =
        apSub?.opacity ??
        apParent?.opacity ??
        subOver?.opacity ??
        cfg?.opacity ??
        parentMap.opacity ??
        shell.defaults.mapOpacity
      let pins = apSub?.pins ?? apParent?.pins ?? subOver?.pins ?? cfg?.pins ?? parentMap.pins
      let regions =
        apSub?.regions ?? apParent?.regions ?? subOver?.regions ?? cfg?.regions ?? parentMap.regions
      let heatmap =
        apSub?.heatmap ?? apParent?.heatmap ?? subOver?.heatmap ?? cfg?.heatmap ?? parentMap.heatmap

      if (shell.isPortrait) {
        const mob = subOver?.mobile ?? cfg?.mobile ?? parentMap.mobile
        if (mob) {
          center = mob.center ?? center
          zoom = mob.zoom ?? zoom
          pitch = mob.pitch ?? pitch
          bearing = mob.bearing ?? bearing
          flySpeed = mob.flySpeed ?? flySpeed
          opacity = mob.opacity ?? opacity
          pins = mob.pins ?? pins
          regions = mob.regions ?? regions
          heatmap = mob.heatmap ?? heatmap
        }
        if (shell.isAutoplay) {
          for (const apMob of [apParent?.mobile, apSub?.mobile]) {
            if (!apMob) continue
            center = apMob.center ?? center
            zoom = apMob.zoom ?? zoom
            pitch = apMob.pitch ?? pitch
            bearing = apMob.bearing ?? bearing
            flySpeed = apMob.flySpeed ?? flySpeed
            opacity = apMob.opacity ?? opacity
            pins = apMob.pins ?? pins
            regions = apMob.regions ?? regions
            heatmap = apMob.heatmap ?? heatmap
          }
        }
      }

      const step: MapStep = {
        center,
        zoom,
        pitch,
        bearing,
        flySpeed,
        opacity,
        pins: pins?.map((p) => ({
          coordinates: p.coordinates,
          label: p.label,
          color: p.color ?? shell.defaults.pinColor,
          radius: p.radius ?? shell.defaults.pinRadius,
          pulse: p.pulse,
          labelAnchor: p.labelAnchor,
        })),
        regions,
        heatmap,
      }
      lastValid = step
      return step
    })
  }, [
    configs,
    shell.units,
    overrideIndex,
    shell.isAutoplay,
    shell.isPortrait,
    shell.defaults,
  ])

  return (
    <LazyMapboxBackground
      accessToken={shell.accessToken}
      steps={mapSteps}
      activeStep={activeUnit}
      style={shell.defaults.mapStyle}
      defaultPinColor={shell.defaults.pinColor}
      defaultPinRadius={shell.defaults.pinRadius}
      defaultOpacity={shell.defaults.mapOpacity}
      highlightCountry={shell.defaults.highlightCountry}
      highlightColor={shell.defaults.highlightColor}
      palette={shell.defaults.mapPalette}
      fontstack={shell.defaults.mapFontstack}
      landscapeFocusArea={STORY_LANDSCAPE_FOCUS_AREA}
      portraitFocusArea={STORY_PORTRAIT_FOCUS_AREA}
      staticCapture={shell.isCapture}
      onReady={noteReady}
    />
  )
}
