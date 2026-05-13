'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import MapStorySection from './MapStorySection'
import ChartPanel from './ChartPanel'
import { useIsMobile } from '@/lib/chartTheme'
import {
  STORY_LANDSCAPE_FOCUS_AREA,
  STORY_PORTRAIT_FOCUS_AREA,
} from '@/lib/storyFocusArea'
import type {
  ResolvedUnit,
  StoryDefaults,
  SubsectionMapOverride,
} from '@/lib/storyConfig.types'
import type { MapOverrideConfig } from '@/lib/storyMapOverrides'
import type MapboxBackgroundType from './charts/MapboxBackground'
import type { MapStep } from './charts/MapboxBackground'

type MapboxBackgroundProps = React.ComponentProps<typeof MapboxBackgroundType>

/**
 * Client-only loader for MapboxBackground.
 *
 * We can't use `next/dynamic({ ssr: false })` here: in Next 16 + Turbopack
 * that throws `BailoutToCSR` during the server render of any client component
 * that references it, and the recovery path inside the affected Suspense
 * boundary can drop sibling DOM at hydration time. Instead, we hold the
 * component in state and import it from a `useEffect` so the module is only
 * ever evaluated in the browser — `mapbox-gl` touches `window` at import
 * time, which would crash a plain server-side import.
 */
function MapboxBackground(props: MapboxBackgroundProps) {
  const [Comp, setComp] = useState<ComponentType<MapboxBackgroundProps> | null>(null)
  useEffect(() => {
    let cancelled = false
    import('./charts/MapboxBackground').then((m) => {
      if (!cancelled) setComp(() => m.default)
    })
    return () => {
      cancelled = true
    }
  }, [])
  if (!Comp) return null
  return <Comp {...props} />
}

interface Props {
  units: ResolvedUnit[]
  /** When present, used instead of `units` on portrait (mobile) viewports. */
  mobileUnits?: ResolvedUnit[]
  accessToken: string
  defaults: StoryDefaults
  /** Story slug — used by data-driven charts to locate their JSON config. */
  slug?: string
  /**
   * Per-(parentIndex, subIndex?) map override applied ONLY when the page
   * is rendered with `?autoplay=1`. Edited via the admin Map tab. Lets the
   * autoplay video have a different framing/zoom/pins than the shared
   * scrollytelling config without forking it. Null = no overrides set.
   */
  mapOverrides?: MapOverrideConfig | null
}

/**
 * Map override entries indexed by `${parentIndex}.${subIndex ?? '_'}`.
 * Built once from `mapOverrides` and consumed in the `mapSteps` loop so
 * each unit's lookup is O(1).
 */
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
 * Page-level orchestrator.
 *
 * Owns:
 *   - The persistent Mapbox background (fixed inset-0, z-0).
 *   - The persistent foreground ChartPanel (fixed, z-10) — keyed by chartId
 *     so it stays mounted across subsections of the same parent, letting
 *     echarts smoothly tween between activeStep values.
 *   - The IntersectionObserver tracking each unit's snap target.
 *   - activeUnit state, derived into:
 *       - activeParent → drives map flyTo
 *       - activeSub    → drives chart activeStep
 *       - currentChart → drives which ChartPanel renders (and its `key`,
 *                        which forces a fresh mount when chartId changes)
 *
 * Critical positioning detail: the scrollable element is the inner snap
 * container (NOT the body). The IntersectionObserver uses
 * `root: containerRef.current` so the fixed map/chart stay stable on iOS
 * Safari and the observer fires reliably as snap settles.
 */
export default function StoryMapShell({
  units: desktopUnits,
  mobileUnits,
  accessToken,
  defaults,
  slug,
  mapOverrides,
}: Props) {
  const [activeUnit, setActiveUnit] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isAutoplay, setIsAutoplay] = useState(false)
  // `?capture=1` is set by Playwright pipelines (video render) to opt out of
  // map flyTo and other timing-sensitive animations so the recorded frames
  // are deterministic. End users on /story/<slug> never set this flag and
  // get the full animated experience.
  const [isCapture, setIsCapture] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setIsAutoplay(params.get('autoplay') === '1')
    setIsCapture(params.get('capture') === '1')
  }, [])
  // `useIsMobile` and "portrait" use the same (max-aspect-ratio: 1/1)
  // breakpoint — treat them as the same signal so both charts and the
  // unit-selector stay consistent when the viewport changes.
  const isPortrait = useIsMobile()

  // Pick the right unit array based on viewport orientation.
  // When mobileUnits is provided and viewport is portrait, use the mobile
  // array which may have more (smaller) units to avoid text overflow.
  const units = isPortrait && mobileUnits ? mobileUnits : desktopUnits

  // Reset active unit AND scroll position when switching between portrait
  // and landscape unit arrays. Without the scroll reset the snap container
  // stays at its old position, which can be past the end of the new array
  // or snapped to a section that no longer matches the desktop content.
  const prevIsPortraitRef = useRef(isPortrait)
  useEffect(() => {
    if (prevIsPortraitRef.current !== isPortrait) {
      prevIsPortraitRef.current = isPortrait
      setActiveUnit(0)
      containerRef.current?.scrollTo({ top: 0 })
    }
  }, [isPortrait])

  // Autoplay-only map override lookup. Indexed once per render — the
  // `mapOverrides` prop is small (one entry per overridden unit) and
  // referentially stable across renders unless the admin Map tab saves a
  // new blob, so the cost is negligible.
  const overrideIndex = useMemo(() => indexOverrides(mapOverrides), [mapOverrides])

  // One MapStep per unit. Subsections with a `map` override merge their
  // fields on top of the parent section's map state, so each unit can have
  // its own camera position and pins while still sharing the parent's chart.
  //
  // Layering, lowest → highest priority:
  //   1. parent section `map`
  //   2. subsection `map` (if any)
  //   3. autoplay parent override   (only when isAutoplay)
  //   4. autoplay subsection override (only when isAutoplay)
  //   5. mobile layer (`.mobile` block from whichever level provided it)
  //   6. autoplay mobile overrides at parent + sub level (only when both
  //      isAutoplay AND isPortrait — i.e. 9:16 autoplay)
  //
  // When the viewport is portrait (mobile), `map.mobile` overrides are
  // layered on top of the resolved desktop values — so you can specify
  // only the fields that differ (e.g. a lower zoom) and everything else
  // falls through from the desktop config.
  const mapSteps: MapStep[] = units.map((unit) => {
    const parentMap = unit.parentConfig.map
    const sub = unit.parentConfig.subsections?.[unit.subIndex]
    const over = sub?.map
    const apParent = isAutoplay
      ? overrideIndex.get(`${unit.parentIndex}._`)
      : undefined
    const apSub = isAutoplay
      ? overrideIndex.get(`${unit.parentIndex}.${unit.subIndex}`)
      : undefined

    // Desktop-resolved values: subsection overrides parent, then autoplay
    // overrides (parent-level then sub-level) layer on top when active.
    let center = apSub?.center ?? apParent?.center ?? over?.center ?? parentMap.center
    let zoom = apSub?.zoom ?? apParent?.zoom ?? over?.zoom ?? parentMap.zoom
    let pitch = apSub?.pitch ?? apParent?.pitch ?? over?.pitch ?? parentMap.pitch
    let bearing = apSub?.bearing ?? apParent?.bearing ?? over?.bearing ?? parentMap.bearing
    let flySpeed =
      apSub?.flySpeed ?? apParent?.flySpeed ?? over?.flySpeed ?? parentMap.flySpeed ?? defaults.flySpeed
    let opacity =
      apSub?.opacity ?? apParent?.opacity ?? over?.opacity ?? parentMap.opacity ?? defaults.mapOpacity
    let pins = apSub?.pins ?? apParent?.pins ?? over?.pins ?? parentMap.pins
    let regions = apSub?.regions ?? apParent?.regions ?? over?.regions ?? parentMap.regions
    let heatmap = apSub?.heatmap ?? apParent?.heatmap ?? over?.heatmap ?? parentMap.heatmap

    // Mobile layer: subsection mobile > parent mobile, then autoplay
    // mobile overrides (parent then sub) on top when both autoplay AND
    // portrait — i.e. the 9:16 video render.
    if (isPortrait) {
      const mob = over?.mobile ?? parentMap.mobile
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
      if (isAutoplay) {
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

    return {
      center,
      zoom,
      pitch,
      bearing,
      flySpeed,
      opacity,
      pins: pins?.map((p) => ({
        coordinates: p.coordinates,
        label: p.label,
        color: p.color ?? defaults.pinColor,
        radius: p.radius ?? defaults.pinRadius,
        pulse: p.pulse,
        labelAnchor: p.labelAnchor,
      })),
      regions,
      heatmap,
    }
  })

  const current = units[activeUnit] ?? units[0]
  const activeSub = current?.subIndex ?? 0
  const currentChartId = current?.parentConfig.chart

  // On portrait, a subsection split into multiple slices via `mobileParagraphs`
  // produces consecutive units that share the same (parentIndex, subIndex).
  // For those multi-slice groups we hide the chart on the first slice — the
  // viewer sees only the map and the first paragraph, then the chart animates
  // in on the second slice alongside the second paragraph.
  const isFirstOfMultiSlice = (() => {
    if (!isPortrait || !current) return false
    const next = units[activeUnit + 1]
    const prev = units[activeUnit - 1]
    const sharesNext =
      !!next &&
      next.parentIndex === current.parentIndex &&
      next.subIndex === current.subIndex
    const sharesPrev =
      !!prev &&
      prev.parentIndex === current.parentIndex &&
      prev.subIndex === current.subIndex
    return sharesNext && !sharesPrev
  })()
  const showChart = !!currentChartId && !isFirstOfMultiSlice

  // Single IntersectionObserver across every unit element.
  useEffect(() => {
    const root = containerRef.current
    if (!root) return

    const els = Array.from(root.querySelectorAll<HTMLElement>('[data-unit-index]'))
    if (els.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (!visible) return
        const idx = Number((visible.target as HTMLElement).dataset.unitIndex)
        if (!Number.isNaN(idx)) setActiveUnit(idx)
      },
      { root, threshold: [0.55] }
    )

    els.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [units.length, isPortrait])

  return (
    <>
      {/* ─── Persistent Mapbox background ───────────────────────────────
          Always full-viewport. In landscape, `landscapeFocusArea` tells
          Mapbox to treat the bottom-left 37%×60% region as the camera
          focal box (via map.setPadding internally), so the YAML `center`
          of each section lands inside that visible card. In portrait,
          the focal area is ignored and the map fills naturally. */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <MapboxBackground
          accessToken={accessToken}
          steps={mapSteps}
          activeStep={activeUnit}
          style={defaults.mapStyle}
          defaultPinColor={defaults.pinColor}
          defaultPinRadius={defaults.pinRadius}
          defaultOpacity={defaults.mapOpacity}
          highlightCountry={defaults.highlightCountry}
          highlightColor={defaults.highlightColor}
          palette={defaults.mapPalette}
          fontstack={defaults.mapFontstack}
          landscapeFocusArea={STORY_LANDSCAPE_FOCUS_AREA}
          portraitFocusArea={STORY_PORTRAIT_FOCUS_AREA}
          staticCapture={isCapture}
        />
      </div>

      {/* ─── Persistent foreground chart panel ──────────────────────────
          Keyed by chartId so the instance persists across subsections of
          the same parent (echarts animations resume from the previous
          activeStep) and re-mounts cleanly when the parent's chart changes.
          Portrait: top-pinned, ~42vh tall, full width.
          Landscape: pinned to the top-right 63% column, top half of viewport
          — text card stacks directly beneath in the bottom half. */}
      {showChart && (
        <div
          className={
            isAutoplay && isPortrait
              ? // 9:16 autoplay only: text card is hidden, so the chart
                // claims the viewport center. Square clamp keeps it inside
                // the safe zone of the 9:16 compose iframe. 16:9 autoplay
                // keeps the regular landscape layout below.
                `
            fixed pointer-events-none z-10
            top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
            w-[min(90vw,80vh)] h-[min(90vw,80vh)]
            flex items-center justify-center backdrop-blur-3xl
          `
              : `
            fixed pointer-events-none z-10
            top-[72px] left-1/2 -translate-x-1/2
            w-[calc(100vw-1rem)] aspect-3/4 max-h-[calc(50svh-88px)]
            [@media(min-aspect-ratio:1/1)]:top-0
            [@media(min-aspect-ratio:1/1)]:translate-x-0
            [@media(min-aspect-ratio:1/1)]:left-auto
            [@media(min-aspect-ratio:1/1)]:right-0
            [@media(min-aspect-ratio:1/1)]:w-[63vw]
            [@media(min-aspect-ratio:1/1)]:aspect-auto
            [@media(min-aspect-ratio:1/1)]:h-[50vh]
            [@media(min-aspect-ratio:1/1)]:max-h-none
            flex items-center justify-center backdrop-blur-3xl
          `
          }
        >
          <div
            className={
              isAutoplay && isPortrait
                ? 'w-full h-full rounded-lg overflow-hidden flex items-center justify-center p-1.5'
                : 'w-full h-full max-w-190 [@media(min-aspect-ratio:1/1)]:max-w-none rounded-lg overflow-hidden flex items-center justify-center p-1.5 [@media(min-aspect-ratio:1/1)]:p-0'
            }
            style={{
              background: 'rgb(var(--color-panel-rgb) / 0.2)',
              border: '0.5px solid var(--color-line)',
            }}
          >
            <ChartPanel
              key={currentChartId}
              chartId={currentChartId}
              activeStep={activeSub}
              slug={slug}
            />
          </div>
        </div>
      )}

      {/* Snap-scroll container — the scrollable element, root of the observer */}
      <div
        ref={containerRef}
        className={`relative z-0 h-svh overflow-y-scroll snap-y snap-mandatory${
          isAutoplay ? ' hide-scrollbar' : ''
        }`}
      >
        {units.map((unit, i) => (
          <MapStorySection
            key={`${unit.parentIndex}-${unit.subIndex}-${i}`}
            unitIndex={i}
            unit={unit}
            // Only hide the text card in 9:16 autoplay. 16:9 autoplay keeps
            // the normal landscape text card so the recorded video has the
            // section copy on screen alongside the map and chart.
            isAutoplay={isAutoplay && isPortrait}
          />
        ))}
      </div>
    </>
  )
}
