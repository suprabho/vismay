'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import {
  extractMapView,
  extractMobileMapView,
  applyMapView,
  applyMobileMapView,
  removeMobileMapView,
  type MapView,
} from '@/lib/yamlMapPatch'
import {
  STORY_LANDSCAPE_FOCUS_AREA,
  STORY_PORTRAIT_FOCUS_AREA,
  computeStoryFocusPadding,
  type StoryFocusArea,
} from '@/lib/storyFocusArea'

/**
 * Section-scoped visual map editor. Reads center/zoom/pitch/bearing from the
 * section's raw YAML, opens a full-screen Mapbox canvas, lets the user drag /
 * zoom / pitch / rotate, then splices the new values back into the YAML
 * (preserving comments and all other map keys — pins, regions, heatmap).
 *
 * Two targets:
 *   - desktop → patches `map.{center,zoom,pitch,bearing}` (the section default)
 *   - mobile  → patches `map.mobile.{center,zoom,pitch,bearing}` (portrait override)
 *
 * Switching targets jumps the camera to that target's saved values; when the
 * mobile override doesn't yet exist, the mobile target starts at the desktop
 * values so the user has a sensible starting point. Apply writes back only the
 * targets that the user actually changed.
 *
 * Intentionally narrower than /map-edit: we don't touch pins, palette, or
 * fontstack here. The broader editor still owns those.
 */

/**
 * Optional frame reference. When provided, the map canvas is rendered at this
 * aspect ratio so the user previews the camera against the actual output
 * frame (e.g. the report PDF's map div, or a slide's map area). The focal-area
 * overlay is replaced by a labelled border tracing the frame, and Mapbox
 * padding is dropped to 0 since the entire frame is map (no overlay text).
 */
export interface PickerFrame {
  width: number
  height: number
  /** Short label shown in the frame overlay, e.g. "Report map · 682×336". */
  label: string
}

interface Props {
  sectionRaw: string
  sectionLabel: string
  style?: string
  onApply: (nextRaw: string) => void
  onClose: () => void
  /** Hide the desktop/mobile target toggle and force the desktop target.
   *  Use for surfaces (e.g. the report builder) that don't render a mobile
   *  story view and only need the single landscape camera. */
  hideMobileTarget?: boolean
  /** Constrain the map canvas to the given frame's aspect ratio and label it
   *  as a reference rectangle. Implies `hideMobileTarget` semantics for the
   *  focal padding (no story-style focal subarea is applied). */
  frame?: PickerFrame
}

type Target = 'desktop' | 'mobile'

const DEFAULT_STYLE = 'mapbox://styles/mapbox/dark-v11'

export default function MapPickerModal({
  sectionRaw,
  sectionLabel,
  style,
  onApply,
  onClose,
  hideMobileTarget = false,
  frame,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)

  const initialDesktop = useMemo(
    () => extractMapView(sectionRaw) ?? fallbackView(),
    [sectionRaw]
  )
  const initialMobile = useMemo(() => extractMobileMapView(sectionRaw), [sectionRaw])
  const hadMobileOverride = initialMobile !== null

  const [target, setTarget] = useState<Target>('desktop')
  const [desktopView, setDesktopView] = useState<MapView>(initialDesktop)
  const [mobileView, setMobileView] = useState<MapView>(initialMobile ?? initialDesktop)
  const [desktopDirty, setDesktopDirty] = useState(false)
  const [mobileDirty, setMobileDirty] = useState(false)
  const [noMapBlock] = useState(() => extractMapView(sectionRaw) === null)

  // Read target inside the moveend listener via ref — the listener captures
  // its closure once at mount, so a state read would always return 'desktop'.
  const targetRef = useRef<Target>('desktop')
  useEffect(() => {
    targetRef.current = target
  }, [target])

  // Latest views, mirrored into refs so the ResizeObserver callback (captured
  // at mount) can re-project to whichever target is active without going stale.
  const desktopViewRef = useRef(desktopView)
  const mobileViewRef = useRef(mobileView)
  useEffect(() => {
    desktopViewRef.current = desktopView
  }, [desktopView])
  useEffect(() => {
    mobileViewRef.current = mobileView
  }, [mobileView])

  const view = target === 'desktop' ? desktopView : mobileView

  useEffect(() => {
    if (!containerRef.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return
    mapboxgl.accessToken = token

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: style ?? DEFAULT_STYLE,
      center: initialDesktop.center,
      zoom: initialDesktop.zoom,
      pitch: initialDesktop.pitch,
      bearing: initialDesktop.bearing,
      attributionControl: false,
    })
    mapRef.current = map

    const update = () => {
      const c = map.getCenter()
      const next: MapView = {
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        pitch: map.getPitch(),
        bearing: map.getBearing(),
      }
      if (targetRef.current === 'desktop') {
        setDesktopView(next)
        setDesktopDirty(true)
      } else {
        setMobileView(next)
        setMobileDirty(true)
      }
    }
    map.on('moveend', update)
    map.on('zoomend', update)
    map.on('pitchend', update)
    map.on('rotateend', update)

    // The modal flexbox needs a frame to settle its final size. Without this
    // resize, Mapbox locks in the container's initial (too-small) dimensions
    // and the canvas renders as a narrow strip.
    //
    // Also re-applies the story's focal padding so the picker is WYSIWYG with
    // the live story render. The initial mount needs a jumpTo because padding
    // alone does not re-center the camera, but ResizeObserver fires every
    // time the container resizes — on mobile, that includes URL-bar
    // showing/hiding on every scroll. Calling jumpTo there aborted each
    // in-flight tile load before it finished, leaving the canvas black. So
    // resize-only events skip the jumpTo and let Mapbox preserve the geo
    // center across the new padding.
    function applyFocusPadding() {
      const m = mapRef.current
      const c = containerRef.current
      if (!m || !c) return
      m.resize()
      // When a frame reference is set the map fills the frame entirely (no
      // focal subarea), so padding is 0 — the camera frames against the same
      // dimensions the user sees in the rendered PDF page.
      if (frame) {
        m.setPadding({ top: 0, bottom: 0, left: 0, right: 0 })
      } else {
        m.setPadding(
          computeStoryFocusPadding(c, STORY_LANDSCAPE_FOCUS_AREA, STORY_PORTRAIT_FOCUS_AREA)
        )
      }
    }
    function applyInitialFocus() {
      const m = mapRef.current
      if (!m) return
      applyFocusPadding()
      const v = targetRef.current === 'desktop' ? desktopViewRef.current : mobileViewRef.current
      m.jumpTo({
        center: v.center,
        zoom: v.zoom,
        pitch: v.pitch,
        bearing: v.bearing,
      })
    }
    const ro = new ResizeObserver(() => applyFocusPadding())
    ro.observe(containerRef.current)
    requestAnimationFrame(() => applyInitialFocus())

    return () => {
      ro.disconnect()
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Lock body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  function switchTarget(next: Target) {
    if (next === target) return
    // Sync the ref before scheduling the camera update so the rAF (and any
    // ResizeObserver firing as the container resizes) sees the new target.
    targetRef.current = next
    setTarget(next)
    // Defer the camera reproject until after React commits the new container
    // aspect ratio — otherwise setPadding/jumpTo run against the old layout.
    requestAnimationFrame(() => {
      const map = mapRef.current
      const c = containerRef.current
      if (!map || !c) return
      map.resize()
      map.setPadding(
        computeStoryFocusPadding(c, STORY_LANDSCAPE_FOCUS_AREA, STORY_PORTRAIT_FOCUS_AREA)
      )
      const v = next === 'desktop' ? desktopView : mobileView
      map.jumpTo({
        center: v.center,
        zoom: v.zoom,
        pitch: v.pitch,
        bearing: v.bearing,
      })
    })
  }

  function apply() {
    let next = sectionRaw
    if (extractMapView(next) === null) next = ensureMapBlock(next)
    if (desktopDirty) next = applyMapView(next, desktopView)
    if (mobileDirty) next = applyMobileMapView(next, mobileView)
    onApply(next)
  }

  function clearMobile() {
    let next = sectionRaw
    if (extractMapView(next) === null) next = ensureMapBlock(next)
    if (desktopDirty) next = applyMapView(next, desktopView)
    next = removeMobileMapView(next)
    onApply(next)
  }

  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const dirty = desktopDirty || mobileDirty
  const showClearMobile = target === 'mobile' && (hadMobileOverride || mobileDirty)

  return (
    <div className="fixed inset-0 z-[100] bg-neutral-950 flex flex-col">
      <header
        className="flex items-center gap-3 px-4 py-3 border-b border-white/10 pt-[max(env(safe-area-inset-top),0.75rem)]"
      >
        <button
          type="button"
          onClick={onClose}
          className="text-neutral-400 hover:text-white text-xl leading-none w-8 h-8 flex items-center justify-center"
          aria-label="Close"
        >
          ×
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wider text-neutral-500">Map</div>
          <div className="text-sm truncate">{sectionLabel}</div>
        </div>
        <button
          type="button"
          onClick={apply}
          disabled={!dirty}
          className="bg-white text-neutral-950 rounded-lg px-4 py-2 text-sm font-medium active:bg-neutral-200 disabled:opacity-40 disabled:pointer-events-none"
        >
          Apply
          {dirty && (
            <span className="ml-1 text-[11px] font-normal text-neutral-500">
              ({applyTargetLabel(desktopDirty, mobileDirty)})
            </span>
          )}
        </button>
      </header>

      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-white/10 bg-black/30">
        {hideMobileTarget ? <span /> : <TargetToggle target={target} onChange={switchTarget} />}
        {!hideMobileTarget && showClearMobile && (
          <button
            type="button"
            onClick={() => {
              if (confirm('Remove the mobile-only map override for this section?')) clearMobile()
            }}
            className="text-[11px] text-neutral-400 hover:text-red-300 underline-offset-2 hover:underline"
          >
            Clear mobile override
          </button>
        )}
      </div>

      <div className="relative flex-1 min-h-0 bg-neutral-950 flex items-center justify-center p-4">
        {token ? (
          <div
            className={
              frame
                ? 'relative max-w-full max-h-full overflow-hidden'
                : target === 'mobile'
                  ? 'relative h-full overflow-hidden'
                  : 'relative w-full h-full overflow-hidden'
            }
            style={
              frame
                ? {
                    aspectRatio: `${frame.width} / ${frame.height}`,
                    width: '100%',
                    maxWidth: '100%',
                    maxHeight: '100%',
                  }
                : target === 'mobile'
                  ? { aspectRatio: '9 / 19.5', maxWidth: '100%' }
                  : undefined
            }
          >
            {/* Mapbox sets `.mapboxgl-map { position: relative }` on its
                container, which beats `.absolute` at the same specificity and
                later in the cascade — so `inset-0` becomes positional offsets
                instead of sizing, and the container collapses to 0×0. Use
                explicit width/height like MapboxBackground does. */}
            <div ref={containerRef} className="w-full h-full" />
            {frame ? (
              <FrameOverlay frame={frame} />
            ) : (
              <FocusAreaOverlay
                area={target === 'mobile' ? STORY_PORTRAIT_FOCUS_AREA : STORY_LANDSCAPE_FOCUS_AREA}
              />
            )}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-neutral-400">
            Missing <code className="bg-white/10 px-1 rounded ml-1 mr-1">NEXT_PUBLIC_MAPBOX_TOKEN</code>.
          </div>
        )}
        {noMapBlock && (
          <div className="absolute top-3 left-3 right-3 text-xs bg-amber-500/15 border border-amber-500/30 text-amber-200 rounded-lg px-3 py-2">
            This section has no <code>map:</code> block. Apply will insert one.
          </div>
        )}
        {target === 'mobile' && !hadMobileOverride && !mobileDirty && (
          <div className="absolute top-3 left-3 right-3 text-xs bg-sky-500/10 border border-sky-500/30 text-sky-200 rounded-lg px-3 py-2 pointer-events-none">
            No mobile override yet — drag/zoom to set one. Desktop values shown as a starting point.
          </div>
        )}
      </div>

      <footer className="border-t border-white/10 px-4 py-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] grid grid-cols-4 gap-2 text-center font-mono text-[11px]">
        <Stat label="lng" value={fmt(view.center[0], 4)} />
        <Stat label="lat" value={fmt(view.center[1], 4)} />
        <Stat label="zoom" value={fmt(view.zoom, 2)} />
        <Stat label="pitch/bear" value={`${fmt(view.pitch, 0)} / ${fmt(view.bearing, 0)}`} />
      </footer>
    </div>
  )
}

function TargetToggle({
  target,
  onChange,
}: {
  target: Target
  onChange: (t: Target) => void
}) {
  return (
    <div className="flex bg-white/5 rounded-lg p-0.5 text-xs">
      {(['desktop', 'mobile'] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={`px-3 py-1 rounded-md transition-colors capitalize ${
            target === t ? 'bg-white/15 text-white' : 'text-neutral-400 hover:text-white'
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

function applyTargetLabel(desktopDirty: boolean, mobileDirty: boolean): string {
  if (desktopDirty && mobileDirty) return 'both'
  if (mobileDirty) return 'mobile'
  return 'desktop'
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-neutral-500 uppercase tracking-wider text-[9px]">{label}</div>
      <div className="text-neutral-200">{value}</div>
    </div>
  )
}

function fmt(n: number, places: number): string {
  const p = Math.pow(10, places)
  return (Math.round(n * p) / p).toString()
}

function fallbackView(): MapView {
  return { center: [0, 20], zoom: 2, pitch: 0, bearing: 0 }
}

/** Dashed rectangle overlay marking where the camera focal point is anchored
 *  in the live story — i.e. where the map content sits while overlay text/
 *  charts cover the rest. Clamped to the container so an over-spec'd area
 *  (top + height > 1) doesn't render outside its bounds; Mapbox's setPadding
 *  also clamps to non-negative px, so the visible result already matches.  */
function FocusAreaOverlay({ area }: { area: StoryFocusArea }) {
  const top = Math.max(0, Math.min(1, area.top))
  const left = Math.max(0, Math.min(1, area.left))
  const width = Math.max(0, Math.min(1 - left, area.width))
  const height = Math.max(0, Math.min(1 - top, area.height))
  return (
    <div
      className="absolute pointer-events-none border border-dashed border-white/40 rounded-sm"
      style={{
        top: `${top * 100}%`,
        left: `${left * 100}%`,
        width: `${width * 100}%`,
        height: `${height * 100}%`,
      }}
    >
      <span className="absolute top-1 left-1 text-[10px] uppercase tracking-wider text-white/60 font-mono bg-black/50 px-1.5 py-0.5 rounded">
        focal area
      </span>
    </div>
  )
}

/** Outline the entire canvas as the frame reference, with a label corner.
 *  Used in the report builder where the map fills the actual output frame
 *  rather than sitting under overlay text — so there's no focal subarea, just
 *  a labelled border that matches the rendered map div's bounds. */
function FrameOverlay({ frame }: { frame: PickerFrame }) {
  return (
    <div className="absolute inset-0 pointer-events-none border border-dashed border-white/40 rounded-sm">
      <span className="absolute top-1 left-1 text-[10px] uppercase tracking-wider text-white/60 font-mono bg-black/50 px-1.5 py-0.5 rounded">
        {frame.label}
      </span>
    </div>
  )
}

/** Insert a minimal `map:` block at the end of the section's YAML so
 *  applyMapView has something to patch. */
function ensureMapBlock(sectionRaw: string): string {
  if (/^\s*map:\s*$/m.test(sectionRaw)) return sectionRaw
  const lines = sectionRaw.split('\n')
  // Match the section item's indent (lines like `    kind:` have 4 spaces).
  const childIndent = lines
    .map((l) => l.match(/^(\s+)\S/)?.[1].length ?? 0)
    .filter((n) => n > 2)
    .sort((a, b) => a - b)[0] ?? 4
  const pad = ' '.repeat(childIndent)
  lines.push(`${pad}map:`)
  return lines.join('\n')
}
