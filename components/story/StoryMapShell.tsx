'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import MapStorySection from './MapStorySection'
import ForegroundVizSlot from './viz/ForegroundVizSlot'
import BackgroundVizSlot from './viz/BackgroundVizSlot'
import { StoryShellProvider } from './viz/StoryShellContext'
import { resolveSlots } from '@/lib/resolveSlots'
import { useIsMobile } from '@/lib/chartTheme'
import type { ResolvedUnit, StoryDefaults } from '@/lib/storyConfig.types'
import type { MapOverrideConfig } from '@/lib/storyMapOverrides'

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
 * Page-level orchestrator.
 *
 * Owns:
 *   - The IntersectionObserver tracking each unit's snap target.
 *   - `activeUnit` state, fed into both slot dispatchers below.
 *   - `<BackgroundVizSlot>`: routes every unit's `background:` layer stack
 *     through the registry. The map module mounts persistent-aggregated,
 *     keeping one WebGL context alive across all scroll snaps.
 *   - `<ForegroundVizSlot>`: routes the active unit's `foreground:` layer
 *     stack through the registry. The chart module persists across
 *     subsections of the same parent via stableIdentity keying so ECharts
 *     animations tween smoothly.
 *
 * Critical positioning detail: the scrollable element is the inner snap
 * container (NOT the body). The IntersectionObserver uses
 * `root: containerRef.current` so the fixed background/foreground stay
 * stable on iOS Safari and the observer fires reliably as snap settles.
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

  // The map-step layering (parent/sub/autoplay/mobile) now lives inside the
  // map module's PersistentComponent — it reads `units`, `mapOverrides`,
  // `isAutoplay`, and `isPortrait` off `<StoryShellProvider>`.

  const current = units[activeUnit] ?? units[0]
  const activeSub = current?.subIndex ?? 0
  const currentForeground = useMemo(
    () => (current ? resolveSlots(current.parentConfig).foreground : []),
    [current]
  )

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
  const showChart = currentForeground.length > 0 && !isFirstOfMultiSlice

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

  const mode: 'scroll' | 'autoplay' | 'capture' | 'print' = isCapture
    ? 'capture'
    : isAutoplay
      ? 'autoplay'
      : 'scroll'

  return (
    <StoryShellProvider
      value={{
        accessToken,
        defaults,
        mapOverrides,
        isAutoplay,
        isPortrait,
        isCapture,
        units,
      }}
    >
      {/* ─── Persistent background slot ──────────────────────────────────
          Dispatches every unit's `background:` layer stack through the
          registry. The map module's persistent-aggregated mount keeps a
          single Mapbox WebGL context alive across all scroll snaps. */}
      <BackgroundVizSlot
        slug={slug ?? ''}
        units={units}
        activeUnit={activeUnit}
        mode={mode}
      />

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
                : // `[@media(min-aspect-ratio:1/1)]:pointer-events-auto` re-enables
                  // hover on the chart in landscape — the surrounding wrapper sets
                  // `pointer-events-none` so wheel events on the map/text-card
                  // regions still fall through to the snap-scroll container. The
                  // chart area itself captures mouse hover for ECharts tooltips;
                  // users scroll by moving the cursor off the chart card. Skipped
                  // in portrait so vertical swipes through the chart strip still
                  // pass through to the scroll container.
                  'w-full h-full max-w-190 [@media(min-aspect-ratio:1/1)]:max-w-none rounded-lg overflow-hidden flex items-center justify-center p-1.5 [@media(min-aspect-ratio:1/1)]:p-0 [@media(min-aspect-ratio:1/1)]:pointer-events-auto'
            }
            style={{
              background: 'rgb(var(--color-panel-rgb) / 0.2)',
              border: '0.5px solid var(--color-line)',
            }}
          >
            <ForegroundVizSlot
              slug={slug ?? ''}
              layers={currentForeground}
              unitKey={`${current?.parentIndex ?? 0}-${current?.subIndex ?? 0}`}
              activeStep={activeSub}
              mode={mode}
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
    </StoryShellProvider>
  )
}
