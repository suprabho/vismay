'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import MapStorySection from './MapStorySection'
import { DeckProgress } from './DeckProgress'
import {
  ForegroundVizSlot,
  ForegroundLayoutSlot,
  BackgroundVizSlot,
  StoryShellProvider,
} from '@vismay/viz-engine'
import { resolveSlots, resolveSlotsFlat } from '@vismay/viz-engine'
import { useIsMobile } from '@vismay/viz-engine'
import type { ResolvedUnit, StoryDefaults, StoryFormat, LogoPalette, VizLayer } from '@vismay/viz-engine'
import type { MapOverrideConfig } from '@vismay/viz-engine'

/** Props for the home-link wrapper the shell renders around the logo. */
type HomeLinkProps = {
  href: string
  className?: string
  'aria-label'?: string
  children: ReactNode
}

/**
 * Default home link — a plain anchor (full navigation). Hosts that want
 * client-side nav (e.g. Next's `<Link>`) inject their own via `LinkComponent`.
 * Kept as a prop so this shell carries no `next/*` import and can live in
 * @vismay/story-reader.
 */
function DefaultHomeLink({ href, children, ...rest }: HomeLinkProps) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  )
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
  /**
   * Story format. Defaults to `'map'`. When `'deck'`, every section routes
   * through `<ForegroundLayoutSlot>` even if no `layout:` is declared — the
   * legacy chart panel positioning (right-column, 63vw × 50vh) assumes a
   * map left-half and would jam deck slots into the wrong third of the
   * viewport.
   */
  format?: StoryFormat
  /**
   * One resolved Vizmaya-logo color palette per section (index === section
   * `parentIndex`), produced by `resolveSectionLogoPalettes`. When provided,
   * the shell renders the persistent top-left logo and re-tints it to the
   * active section's palette as the reader scrolls. Omitted by headless
   * consumers (e.g. the canvas-frame route) so they stay logo-free.
   */
  logoPalettes?: LogoPalette[]
  /**
   * Renders the persistent brand logo inside the home link, re-tinted per
   * active section. Omitted by brand-agnostic / headless consumers; the host
   * injects its own (vizmaya passes VizmayaLogo) so this shell ships no app
   * branding.
   */
  LogoComponent?: ComponentType<{ className?: string; palette: LogoPalette }>
  /**
   * Renders the persistent home link that wraps the logo. Defaults to a plain
   * anchor; inject a framework link (e.g. `next/link`) for client-side nav.
   */
  LinkComponent?: ComponentType<HomeLinkProps>
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
export default function StoryShell({
  units: desktopUnits,
  mobileUnits,
  accessToken,
  defaults,
  slug,
  mapOverrides,
  format = 'map',
  logoPalettes,
  LogoComponent,
  LinkComponent = DefaultHomeLink,
}: Props) {
  const isDeckFormat = format === 'deck'
  const [activeUnit, setActiveUnit] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isAutoplay, setIsAutoplay] = useState(false)
  // `?capture=1` is set by Playwright pipelines (video render) to opt out of
  // map flyTo and other timing-sensitive animations so the recorded frames
  // are deterministic. End users on /story/<slug> never set this flag and
  // get the full animated experience.
  const [isCapture, setIsCapture] = useState(false)
  // `?embed=1` is set by @vismay/story-embed when a consumer app (footshorts,
  // vizf1) loads this story in an <iframe>/WebView. It opts the story into
  // vizmaya's chrome-less embed mode: the persistent brand logo / home-link
  // below is suppressed so the host overlays its own chrome. Direct vizmaya.fyi
  // readers never set this flag and keep the logo.
  const [isEmbed, setIsEmbed] = useState(false)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    setIsAutoplay(params.get('autoplay') === '1')
    setIsCapture(params.get('capture') === '1')
    setIsEmbed(params.get('embed') === '1')
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

  // Capture pipelines (video / PDF) need to know up-front whether this story
  // will ever construct a Mapbox instance. A map-less deck story otherwise
  // makes the video renderer's map-load probe burn its full timeout waiting
  // for a map that never comes (see lib/storyVideoRender.ts). We expose the
  // resolved count here, derived from the SAME `resolveSlots` the background /
  // foreground dispatchers consume — so it can't disagree with what actually
  // mounts (no false zero that would skip a needed tile-load wait). Both unit
  // arrays are checked, so the signal stays correct regardless of which one
  // the capture viewport ends up rendering.
  const expectedMapCount = useMemo(() => {
    const referencesMap = (unit: (typeof desktopUnits)[number]) => {
      const resolved = resolveSlots(unit.parentConfig)
      const fg =
        resolved.foreground.kind === 'flat'
          ? resolved.foreground.layers
          : Object.values(resolved.foreground.regions).flat()
      return [...resolved.background, ...fg].some((layer) => layer.type === 'map')
    }
    const allUnits = mobileUnits ? [...desktopUnits, ...mobileUnits] : desktopUnits
    return allUnits.filter(referencesMap).length
  }, [desktopUnits, mobileUnits])
  useEffect(() => {
    ;(window as unknown as { __expectedMapCount__?: number }).__expectedMapCount__ =
      expectedMapCount
  }, [expectedMapCount])

  const current = units[activeUnit] ?? units[0]
  const activeSub = current?.subIndex ?? 0
  // Full resolved shape so we can dispatch between the legacy flat chart-panel
  // path and the region-aware ForegroundLayoutSlot. Legacy stories stay on the
  // flat path (zero-visible-change); stories that opt in to
  // `foreground: { layout, regions }` go through the layout slot. Deck stories
  // ALWAYS go through the layout slot — flat foregrounds get synthesized into
  // a single-region `free` layout so slots inherit the deck safe-area inset.
  const currentResolvedForeground = useMemo<
    ReturnType<typeof resolveSlots>['foreground']
  >(() => {
    if (!current) return { kind: 'flat', layers: [] }
    const resolved = resolveSlots(current.parentConfig).foreground
    if (isDeckFormat && resolved.kind === 'flat') {
      return {
        kind: 'regions',
        layout: 'free',
        regions: { default: resolved.layers },
      }
    }
    return resolved
  }, [current, isDeckFormat])
  const currentForeground = useMemo(
    () => (current ? resolveSlotsFlat(current.parentConfig).foreground : []),
    [current]
  )
  const usesRegions = currentResolvedForeground.kind === 'regions'

  // 9:16 autoplay (the vertical video render) hides deck `bodyText` prose so the
  // portrait frame shows only the visual (chart / bigStat / image / map) — the
  // same default the map format applies to its text card (see MapStorySection's
  // `isAutoplay`). Gated on the `?autoplay=1` PARAM, NOT `mode`: the video
  // pipeline loads `?autoplay=1&capture=1`, so `mode` is 'capture' during the
  // real render (apps/vizmaya-fyi/lib/storyVideoRender.ts). 16:9 autoplay stays
  // landscape (isPortrait false) and keeps the prose; the snap target still
  // mounts either way, so section cue timing is unchanged.
  const overlayForeground = useMemo<ReturnType<typeof resolveSlots>['foreground']>(() => {
    if (
      !(isDeckFormat && isAutoplay && isPortrait) ||
      currentResolvedForeground.kind !== 'regions'
    ) {
      return currentResolvedForeground
    }
    const regions: Record<string, VizLayer[]> = {}
    for (const [name, layers] of Object.entries(currentResolvedForeground.regions)) {
      regions[name] = layers.filter((layer) => layer.type !== 'bodyText')
    }
    return { ...currentResolvedForeground, regions }
  }, [currentResolvedForeground, isDeckFormat, isAutoplay, isPortrait])

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
  // Legacy chart panel renders only for flat-mode units in map-format stories.
  // Deck stories ALWAYS route through `<ForegroundLayoutSlot>` (regions path)
  // because the legacy panel positioning (right-column 63vw × 50vh) is
  // designed around the map left-half and would jam deck slots into the
  // wrong viewport region. For a deck section without an explicit
  // `section.layout:`, the layout slot still works — the foreground falls
  // back to the `single-fill` / `free` layout and self-positioning slots
  // sit inside the deck safe-area inset.
  const showChart =
    !isDeckFormat && !usesRegions && currentForeground.length > 0 && !isFirstOfMultiSlice
  // Deck stories carry their section text INSIDE the foreground (the `bodyText`
  // slot) rather than in a separate text card, so — unlike the map-format chart
  // panel — the foreground must render on every slice, including the first slice
  // of a `mobileParagraphs` split. Suppressing it there (the map-format "reveal
  // the chart on slice 2" behaviour) would blank the slice entirely. So honour
  // isFirstOfMultiSlice only off-deck.
  const showRegions =
    current != null &&
    (usesRegions || (isDeckFormat && currentForeground.length > 0)) &&
    (isDeckFormat || !isFirstOfMultiSlice)

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

  // Host-driven scroll sync (`?embed=1`).
  // On mount the story advertises its section count so the host can size its
  // scroll wrapper. Thereafter the host drives a single message:
  //   viz-story-progress { value: 0..1 } — its scroll progress through the
  //     pinned wrapper. Mapped onto this container's full scroll range and
  //     assigned directly to scrollTop (no animation) so the story tracks the
  //     page pixel-for-pixel with zero added latency. Normalising to 0..1 keeps
  //     the sync independent of section count and of the (different) pixel
  //     heights on each side of the iframe boundary.
  // CSS snap is disabled in embed mode (see the container className below) so
  // these direct scrollTop writes aren't fought by the snap engine.
  useEffect(() => {
    if (!isEmbed) return
    window.parent.postMessage(
      { type: 'viz-story-ready', sectionCount: units.length },
      '*'
    )
    const onMessage = (e: MessageEvent) => {
      const root = containerRef.current
      if (!root || e.data?.type !== 'viz-story-progress') return
      const value = Number(e.data.value)
      if (Number.isNaN(value)) return
      const max = root.scrollHeight - root.clientHeight
      root.scrollTop = Math.max(0, Math.min(1, value)) * max
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [isEmbed, units.length])

  const mode: 'scroll' | 'autoplay' | 'capture' | 'print' = isCapture
    ? 'capture'
    : isAutoplay
      ? 'autoplay'
      : 'scroll'

  // Deck sections render their foreground INSIDE each snap target (in the
  // scroll container) — rather than in a single fixed overlay that hard-swaps
  // the active unit — so the content scrolls with the page like the map
  // format's text cards: smooth section-to-section transitions, and wheel/touch
  // over any slot (including the 3D starship canvas) reaches the scroller.
  // Scoped to the live `scroll` experience; autoplay/capture/print keep the
  // deterministic fixed-overlay path the video/PDF pipelines depend on.
  const deckInFlow = isDeckFormat && mode === 'scroll'

  // Story-scoped opt-in via `defaults.progress: true` in the .config.yaml.
  // Hidden during autoplay/capture so the indicator doesn't appear in
  // rendered video frames.
  const showProgress =
    isDeckFormat && defaults.progress === true && !isAutoplay && !isCapture

  const handleProgressJump = useCallback((targetIndex: number) => {
    const root = containerRef.current
    if (!root) return
    const target = root.querySelector<HTMLElement>(
      `[data-unit-index="${targetIndex}"]`
    )
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

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
        format,
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

      {/* ─── Region-aware foreground (opt-in via `foreground: { layout, regions }`)
          Renders the active unit's layout — each region's CSS box is sized
          against this fixed wrapper so viewport-unit coords (37vw, 50vh)
          resolve consistently with the rest of the shell. Layers inside each
          region inherit the region's pointer-events default; layer-level
          style can re-enable interaction (matching the legacy chart panel's
          `[@media(min-aspect-ratio:1/1)]:pointer-events-auto` trick). */}
      {showRegions && current && !deckInFlow && (
        <div className="fixed inset-0 z-10 pointer-events-none">
          <ForegroundLayoutSlot
            slug={slug ?? ''}
            foreground={overlayForeground}
            unit={current}
            activeStep={activeSub}
            mode={mode}
            isPortrait={isPortrait}
          />
        </div>
      )}

      {/* Snap-scroll container — the scrollable element, root of the observer.
          No explicit z-index: a `z-0` here would create a stacking context
          that traps the hero-full-bleed section's inline `zIndex: 20` below
          the foreground image (rendered at z-10 in a sibling fixed wrapper).
          Other sections have no inline z and behave identically either way. */}
      <div
        ref={containerRef}
        className={`relative h-svh overflow-y-scroll overscroll-contain hide-scrollbar${
          isEmbed ? '' : ' snap-y snap-mandatory'
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
            // Deck (live scroll): render this section's foreground in-flow so
            // it scrolls with the page. Off-deck and autoplay/capture keep the
            // empty snap target + fixed overlay above.
            renderForegroundInline={deckInFlow}
            slug={slug ?? ''}
            mode={mode}
            isPortrait={isPortrait}
          />
        ))}
      </div>

      {showProgress && (
        <DeckProgress
          current={activeUnit}
          total={units.length}
          onJump={handleProgressJump}
        />
      )}

      {/* ─── Persistent Vizmaya logo (home link) ─────────────────────────
          Re-tints to the active section's resolved palette as the reader
          scrolls. Indexed by `parentIndex` (not `activeUnit`) so sections
          with multiple subsections share one palette. Rendered here rather
          than at the page level because this is the only component that
          knows the active section; gated on `logoPalettes` so headless
          consumers (canvas-frame) stay logo-free. Also hidden in chrome-less
          embed mode (`?embed=1`) so consumer-app embeds (footshorts, vizf1)
          show only their own overlaid chrome, not vizmaya's brand. */}
      {logoPalettes && LogoComponent && !isEmbed && (
        <LinkComponent
          href="/"
          aria-label="Home"
          className="fixed top-4 left-4 z-50 w-80 h-16 bg-white/2 rounded-full backdrop-blur-3xl cursor-pointer"
        >
          <LogoComponent
            className="w-full h-full"
            palette={logoPalettes[current?.parentIndex ?? 0] ?? logoPalettes[0]}
          />
        </LinkComponent>
      )}
    </StoryShellProvider>
  )
}
