'use client'

import { useCallback, useEffect, useRef, useState, type ComponentType } from 'react'
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
} from '@/lib/storyConfig.types'
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
}: Props) {
  const [activeUnit, setActiveUnit] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
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

  // One MapStep per unit. Subsections with a `map` override merge their
  // fields on top of the parent section's map state, so each unit can have
  // its own camera position and pins while still sharing the parent's chart.
  //
  // When the viewport is portrait (mobile), `map.mobile` overrides are
  // layered on top of the resolved desktop values — so you can specify
  // only the fields that differ (e.g. a lower zoom) and everything else
  // falls through from the desktop config.
  const mapSteps: MapStep[] = units.map((unit) => {
    const parentMap = unit.parentConfig.map
    const sub = unit.parentConfig.subsections?.[unit.subIndex]
    const over = sub?.map

    // Desktop-resolved values (subsection overrides parent)
    let center = over?.center ?? parentMap.center
    let zoom = over?.zoom ?? parentMap.zoom
    let pitch = over?.pitch ?? parentMap.pitch
    let bearing = over?.bearing ?? parentMap.bearing
    let flySpeed = over?.flySpeed ?? parentMap.flySpeed ?? defaults.flySpeed
    let opacity = over?.opacity ?? parentMap.opacity ?? defaults.mapOpacity
    let pins = over?.pins ?? parentMap.pins
    let regions = over?.regions ?? parentMap.regions
    let heatmap = over?.heatmap ?? parentMap.heatmap

    // Mobile layer: subsection mobile > parent mobile
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
          className="
            fixed pointer-events-none z-10
            top-1/2 -translate-y-2/3 left-1/2 -translate-x-1/2
            w-[calc(100vw-2.25rem)] aspect-3/4
            [@media(min-aspect-ratio:1/1)]:top-0
            [@media(min-aspect-ratio:1/1)]:translate-y-0
            [@media(min-aspect-ratio:1/1)]:translate-x-0
            [@media(min-aspect-ratio:1/1)]:left-auto
            [@media(min-aspect-ratio:1/1)]:right-0
            [@media(min-aspect-ratio:1/1)]:w-[63vw]
            [@media(min-aspect-ratio:1/1)]:aspect-auto
            [@media(min-aspect-ratio:1/1)]:h-[50vh]
            [@media(max-aspect-ratio:1/1)_and_(max-height:700px)]:top-[72px]
            [@media(max-aspect-ratio:1/1)_and_(max-height:700px)]:translate-y-0
            [@media(max-aspect-ratio:1/1)_and_(max-height:700px)]:max-h-[calc(50svh-88px)]
            flex items-center justify-center backdrop-blur-3xl
          "
        >
          <div
            className="w-full h-full max-w-[760px] [@media(min-aspect-ratio:1/1)]:max-w-none rounded-lg overflow-hidden flex items-center justify-center p-3 [@media(min-aspect-ratio:1/1)]:p-0"
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
        className="relative z-0 h-svh overflow-y-scroll snap-y snap-mandatory"
      >
        {units.map((unit, i) => (
          <MapStorySection
            key={`${unit.parentIndex}-${unit.subIndex}-${i}`}
            unitIndex={i}
            unit={unit}
          />
        ))}
      </div>
    </>
  )
}
