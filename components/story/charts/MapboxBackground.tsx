'use client'

import { useEffect, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type {
  MapStep,
  MapPin,
  MapRegionLayer,
  HeatmapLayer,
} from '@/types/story'
import type { MapPalette } from '@/lib/storyConfig.types'
import { applyMapPalette, applyMapFontstack } from '@/lib/applyMapPalette'
import { applyAdminWorldview, buildCountryFilter } from '@/lib/mapboxWorldview'

export type { MapStep, MapPin }

interface MapboxBackgroundProps {
  accessToken: string
  steps: MapStep[]
  activeStep: number
  style?: string
  defaultPinColor?: string
  defaultPinRadius?: number
  defaultOpacity?: number
  interactive?: boolean
  /** Optional ISO 3166-1 alpha-2 code to highlight as a filled country region. */
  highlightCountry?: string
  /** Color for the highlight fill/outline. Falls back to defaultPinColor. */
  highlightColor?: string
  /**
   * Optional sub-rectangle (fractions of the container, 0..1) where the
   * camera focal point should land in landscape orientation. Implemented
   * via Mapbox's `padding` option, so the YAML `center` of each step still
   * corresponds to a real geographic point — the framework just shifts
   * where on screen that point appears.
   *
   * Example: `{ top: 0.4, left: 0, width: 0.37, height: 0.6 }` puts the
   * focal point in the bottom-left 37%×60% region of the viewport.
   */
  landscapeFocusArea?: {
    top: number
    left: number
    width: number
    height: number
  }
  /**
   * Same as landscapeFocusArea but applied in portrait (mobile) orientation.
   * Shifts the map center upward so pins aren't hidden behind the text card
   * at the bottom of the viewport.
   */
  portraitFocusArea?: {
    top: number
    left: number
    width: number
    height: number
  }
  /**
   * When true, enables WebGL `preserveDrawingBuffer` so the canvas can be
   * snapshotted by html-to-image / toDataURL. Costs a bit of memory, so only
   * opt in where capture is needed (share mode). Also skips the fly animation
   * on step changes — captures should render at the final pose immediately.
   */
  staticCapture?: boolean
  /**
   * Fires once the map is idle AND the initial step's regions/pins/heatmap
   * have been applied. Share mode waits on this before toPng so captures
   * don't rasterize a half-built map.
   */
  onReady?: () => void
  /**
   * Optional per-story color overrides applied to the base style on load.
   * See `lib/applyMapPalette.ts` for the supported keys.
   */
  palette?: MapPalette
  /** Optional fontstack applied to every text layer (must exist on the style's glyphs). */
  fontstack?: string[]
  /**
   * When true, hide every basemap symbol layer that has a `text-field` on
   * load — kills place/road/transit/poi labels plus water/nature/airport
   * labels that aren't covered by the `MapPalette` categories. Pin labels
   * (added as Marker DOM elements, not symbol layers) are unaffected.
   * Used by share-card maps where labels crowd the small frame.
   */
  hideAllLabels?: boolean
}

const DEFAULT_STYLE = 'mapbox://styles/mapbox/dark-v11'
const DEFAULT_PIN_COLOR = 'var(--color-accent, #D85A30)'
const DEFAULT_PIN_RADIUS = 12
const DEFAULT_OPACITY = 1

function pinKey(pin: MapPin): string {
  return `${pin.coordinates[0]},${pin.coordinates[1]},${pin.label ?? ''}`
}

/**
 * Mapbox paint properties don't accept CSS variables — extract the hex
 * fallback from `var(--name, #hex)` strings, otherwise return as-is.
 */
function resolvePaintColor(color: string, fallback = '#D85A30'): string {
  if (color.startsWith('var(')) {
    const match = color.match(/var\([^,]+,\s*([^)]+)\)/)
    return match?.[1]?.trim() ?? fallback
  }
  return color
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/* ─── Region (choropleth) + heatmap layer helpers ───────────────── */

const STORY_REGION_FILL_ID = 'story-regions-fill'
const STORY_REGION_LINE_ID = 'story-regions-line'
const STORY_CUSTOM_REGION_SRC_ID = 'story-regions-custom-src'
const STORY_HEATMAP_LAYER_ID = 'story-heatmap'
const STORY_HEATMAP_SRC_ID = 'story-heatmap-src'

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '').trim()
  const full = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h.padEnd(6, '0').slice(0, 6)
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ]
}

function toHex(r: number, g: number, b: number): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function interpolateColor(hex0: string, hex1: string, t: number): string {
  const [r0, g0, b0] = parseHex(hex0)
  const [r1, g1, b1] = parseHex(hex1)
  return toHex(lerp(r0, r1, t), lerp(g0, g1, t), lerp(b0, b1, t))
}

/**
 * Resolve a theme token (e.g. "$accent") or hex string to a concrete hex
 * by reading CSS variables published by ThemeProvider. ThemeProvider sets
 * its vars on a wrapper div (not documentElement), so we look them up
 * relative to an element that sits inside the theme tree — typically the
 * map container. Non-tokens pass through unchanged.
 */
function resolveThemeToken(input: string, scope?: HTMLElement | null): string {
  if (!input.startsWith('$')) return input
  if (typeof window === 'undefined') return '#888888'
  const name = input.slice(1)
  const el = scope ?? document.documentElement
  const cssVar = getComputedStyle(el).getPropertyValue(`--color-${name}`).trim()
  return cssVar || '#888888'
}

/**
 * Compute a { code → color } map for a region layer. Items with an explicit
 * `color` win; items with only a `value` get interpolated through the color
 * stops. Items with neither fall back to the accent color.
 *
 * Supports any number of color stops ≥ 2 — each adjacent pair defines a
 * segment of the overall ramp. Domain (layer.ramp) defaults to
 * [min, max] of items[].value evenly spaced across the stops.
 */
function buildRegionColorMap(
  layer: MapRegionLayer,
  fallback: string,
  scope: HTMLElement | null
): Record<string, { color: string; opacity: number }> {
  const out: Record<string, { color: string; opacity: number }> = {}
  const rawColors = layer.colors ?? []
  const colors = rawColors.map((c) => resolveThemeToken(c, scope))
  const haveRamp = colors.length >= 2

  // Build the domain. If caller provided one, use it; otherwise derive
  // from items[].value evenly spaced across the N stops.
  let domain: number[] = []
  if (haveRamp) {
    if (layer.ramp && layer.ramp.length === colors.length) {
      domain = layer.ramp
    } else {
      let min = Infinity
      let max = -Infinity
      for (const it of layer.items) {
        if (typeof it.value === 'number') {
          if (it.value < min) min = it.value
          if (it.value > max) max = it.value
        }
      }
      if (min === Infinity) {
        min = 0
        max = 1
      } else if (min === max) {
        max = min + 1
      }
      const n = colors.length
      domain = Array.from({ length: n }, (_, i) => min + ((max - min) * i) / (n - 1))
    }
  }

  function colorFor(value: number): string {
    if (!haveRamp) return fallback
    if (value <= domain[0]) return colors[0]
    if (value >= domain[domain.length - 1]) return colors[colors.length - 1]
    for (let i = 0; i < domain.length - 1; i++) {
      const a = domain[i]
      const b = domain[i + 1]
      if (value >= a && value <= b) {
        const t = b === a ? 0 : (value - a) / (b - a)
        return interpolateColor(colors[i], colors[i + 1], t)
      }
    }
    return fallback
  }

  for (const it of layer.items) {
    const opacity = it.opacity ?? 0.55
    if (it.color) {
      out[it.code] = { color: resolveThemeToken(it.color, scope), opacity }
    } else if (typeof it.value === 'number' && haveRamp) {
      out[it.code] = { color: colorFor(it.value), opacity }
    } else {
      out[it.code] = { color: fallback, opacity }
    }
  }
  return out
}

function removeStoryLayers(map: mapboxgl.Map) {
  for (const id of [STORY_REGION_FILL_ID, STORY_REGION_LINE_ID, STORY_HEATMAP_LAYER_ID]) {
    if (map.getLayer(id)) map.removeLayer(id)
  }
  for (const id of [STORY_CUSTOM_REGION_SRC_ID, STORY_HEATMAP_SRC_ID]) {
    if (map.getSource(id)) map.removeSource(id)
  }
}

function firstLabelLayerId(map: mapboxgl.Map): string | undefined {
  const styleLayers = map.getStyle()?.layers ?? []
  const first = styleLayers.find(
    (l) => l.type === 'symbol' && (l.layout as { 'text-field'?: unknown } | undefined)?.['text-field'] != null
  )
  return first?.id
}

async function applyRegionLayer(
  map: mapboxgl.Map,
  layer: MapRegionLayer,
  accent: string,
  isStale: () => boolean,
  scope: HTMLElement | null
) {
  const colorMap = buildRegionColorMap(layer, accent, scope)
  const codes = Object.keys(colorMap)
  if (codes.length === 0) return

  // Flat [code, color, ...] for Mapbox's `match` expression.
  const matchColorPairs: (string | number)[] = []
  const matchOpacityPairs: (string | number)[] = []
  for (const code of codes) {
    matchColorPairs.push(code, colorMap[code].color)
    matchOpacityPairs.push(code, colorMap[code].opacity)
  }

  const beforeId = firstLabelLayerId(map)
  const rawLineColor = layer.lineColor ?? (layer.colors?.[layer.colors.length - 1] ?? accent)
  const lineColor = resolveThemeToken(rawLineColor, scope)
  const lineWidth = layer.lineWidth ?? 0.6

  if (layer.level === 'country') {
    // Reuses the country-boundaries source that highlightCountry also uses.
    if (!map.getSource('country-boundaries')) {
      map.addSource('country-boundaries', {
        type: 'vector',
        url: 'mapbox://mapbox.country-boundaries-v1',
      })
    }
    // When a single supported worldview is in play (e.g. only "IN"), pick the
    // matching polygon. Mixed selections fall back to the plain ISO match.
    const worldview = codes.length === 1 ? codes[0] : undefined
    const fillFilter =
      worldview
        ? (buildCountryFilter(worldview) as unknown as mapboxgl.FilterSpecification)
        : (['in', ['get', 'iso_3166_1'], ['literal', codes]] as unknown as mapboxgl.FilterSpecification)
    map.addLayer(
      {
        id: STORY_REGION_FILL_ID,
        type: 'fill',
        source: 'country-boundaries',
        'source-layer': 'country_boundaries',
        filter: fillFilter,
        paint: {
          'fill-color': ['match', ['get', 'iso_3166_1'], ...matchColorPairs, '#000000'],
          'fill-opacity': ['match', ['get', 'iso_3166_1'], ...matchOpacityPairs, 0],
        },
      },
      beforeId
    )
    map.addLayer(
      {
        id: STORY_REGION_LINE_ID,
        type: 'line',
        source: 'country-boundaries',
        'source-layer': 'country_boundaries',
        filter: fillFilter,
        paint: {
          'line-color': lineColor,
          'line-width': lineWidth,
          'line-opacity': 0.85,
        },
      },
      beforeId
    )
    return
  }

  // level: 'custom' — fetch user-provided GeoJSON and style by idProperty.
  if (!layer.geojsonUrl || !layer.idProperty) {
    console.warn('[MapboxBackground] custom regions require geojsonUrl + idProperty')
    return
  }

  try {
    const res = await fetch(layer.geojsonUrl)
    if (isStale()) return
    const geojson = await res.json()
    if (isStale()) return
    // Another step's apply may have re-added the source while this was in
    // flight — bail instead of throwing "already exists". removeStoryLayers
    // runs synchronously on every step change, so a source still present
    // here means a newer step already owns it.
    if (map.getSource(STORY_CUSTOM_REGION_SRC_ID)) return
    map.addSource(STORY_CUSTOM_REGION_SRC_ID, {
      type: 'geojson',
      data: geojson,
    })
    const idProp = layer.idProperty
    // Coerce the property to a string so numeric GeoJSON ids (e.g. ID_1: 30)
    // still match user-supplied string codes (e.g. "30"). Without this the
    // match falls through to the default and no fill is drawn.
    const idExpr = ['to-string', ['get', idProp]]
    map.addLayer(
      {
        id: STORY_REGION_FILL_ID,
        type: 'fill',
        source: STORY_CUSTOM_REGION_SRC_ID,
        filter: ['in', idExpr, ['literal', codes]],
        paint: {
          'fill-color': ['match', idExpr, ...matchColorPairs, '#000000'],
          'fill-opacity': ['match', idExpr, ...matchOpacityPairs, 0],
        },
      },
      beforeId
    )
    map.addLayer(
      {
        id: STORY_REGION_LINE_ID,
        type: 'line',
        source: STORY_CUSTOM_REGION_SRC_ID,
        filter: ['in', idExpr, ['literal', codes]],
        paint: {
          'line-color': lineColor,
          'line-width': lineWidth,
          'line-opacity': 0.85,
        },
      },
      beforeId
    )
  } catch (err) {
    console.warn('[MapboxBackground] failed to load custom GeoJSON', layer.geojsonUrl, err)
  }
}

function applyHeatmapLayer(map: mapboxgl.Map, layer: HeatmapLayer) {
  if (layer.points.length === 0) return
  const features = layer.points.map((p) => ({
    type: 'Feature' as const,
    properties: { weight: p.weight ?? 1 },
    geometry: { type: 'Point' as const, coordinates: p.coordinates },
  }))
  map.addSource(STORY_HEATMAP_SRC_ID, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features },
  })

  const ramp = layer.ramp ?? [
    'rgba(33,102,172,0)',
    '#2166ac',
    '#4393c3',
    '#f4a582',
    '#b2182b',
  ]
  // Mapbox expects interpolate stops at 0..1 for heatmap-color.
  const stops = ramp.map((color, i) => [i / (ramp.length - 1), color]).flat()
  const maxW = layer.maxIntensity ?? Math.max(...layer.points.map((p) => p.weight ?? 1))

  map.addLayer(
    {
      id: STORY_HEATMAP_LAYER_ID,
      type: 'heatmap',
      source: STORY_HEATMAP_SRC_ID,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'weight'], 0, 0, maxW, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 15, 3],
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], ...stops],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, layer.radius ?? 30, 15, (layer.radius ?? 30) * 2],
        'heatmap-opacity': layer.opacity ?? 0.75,
      },
    },
    firstLabelLayerId(map)
  )
}

/**
 * Convert a fractional focus area into Mapbox `padding` (in px). Mapbox
 * treats padding as the area NOT used by the camera — so to put the focal
 * point in the bottom-left 37%×60% box, we pad away the top 40% and the
 * right 63%, leaving an active area whose centroid is the desired spot.
 *
 * Returns all-zeros in portrait (aspect ratio < 1) so the map fills naturally.
 */
function computeFocusPadding(
  container: HTMLDivElement | null,
  landscapeArea?: { top: number; left: number; width: number; height: number },
  portraitArea?: { top: number; left: number; width: number; height: number }
): { top: number; right: number; bottom: number; left: number } {
  const zero = { top: 0, right: 0, bottom: 0, left: 0 }
  if (!container) return zero
  const w = container.clientWidth
  const h = container.clientHeight
  if (w === 0 || h === 0) return zero
  const area = w / h < 1 ? portraitArea : landscapeArea
  if (!area) return zero
  return {
    left: Math.max(0, area.left * w),
    right: Math.max(0, (1 - area.left - area.width) * w),
    top: Math.max(0, area.top * h),
    bottom: Math.max(0, (1 - area.top - area.height) * h),
  }
}

export default function MapboxBackground({
  accessToken,
  steps,
  activeStep,
  style = DEFAULT_STYLE,
  defaultPinColor = DEFAULT_PIN_COLOR,
  defaultPinRadius = DEFAULT_PIN_RADIUS,
  defaultOpacity = DEFAULT_OPACITY,
  interactive = false,
  highlightCountry,
  highlightColor,
  landscapeFocusArea,
  portraitFocusArea,
  staticCapture = false,
  onReady,
  palette,
  fontstack,
  hideAllLabels = false,
}: MapboxBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map())
  /** Bumped on every step change; async layer appliers compare against it
   * to abort stale writes that would otherwise collide with newer ones. */
  const layerGenRef = useRef(0)
  const [loaded, setLoaded] = useState(false)

  // Initialize map (once)
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    if (!accessToken) return

    mapboxgl.accessToken = accessToken

    const initial = steps[0] ?? {
      center: [0, 20] as [number, number],
      zoom: 2,
      pitch: 0,
      bearing: 0,
    }

    const initialPadding = computeFocusPadding(containerRef.current, landscapeFocusArea, portraitFocusArea)

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style,
      center: initial.center,
      zoom: initial.zoom,
      pitch: initial.pitch ?? 0,
      bearing: initial.bearing ?? 0,
      interactive,
      attributionControl: false,
      fadeDuration: 0,
      preserveDrawingBuffer: staticCapture,
    })

    // Apply focal padding immediately so the first paint already has the
    // camera off-center (Mapbox accepts padding via setPadding after construction).
    if (initialPadding.top || initialPadding.right || initialPadding.bottom || initialPadding.left) {
      map.setPadding(initialPadding)
    }

    map.on('load', () => {
      // Per-story palette + fontstack overrides. Run BEFORE the highlight
      // block so the highlight fill color wins on top of any new label color.
      if (palette) applyMapPalette(map, palette)
      if (fontstack && fontstack.length > 0) applyMapFontstack(map, fontstack)

      // Strip every basemap text label (covers categories that MapPalette
      // doesn't classify, like water/nature labels). Pin labels live on
      // marker DOM, not style layers, so they survive.
      if (hideAllLabels) {
        const labelLayers = map.getStyle()?.layers ?? []
        for (const layer of labelLayers) {
          if (layer.type !== 'symbol') continue
          const layout = (layer.layout ?? {}) as { 'text-field'?: unknown }
          if (layout['text-field'] == null) continue
          map.setLayoutProperty(layer.id, 'visibility', 'none')
        }
      }

      // Highlight a single country (e.g. South Korea) using Mapbox's
      // country-boundaries-v1 vector tileset. Inserted beneath the first
      // label layer so country/place labels stay readable on top.
      if (highlightCountry) {
        const iso = highlightCountry.toUpperCase()
        const color = resolvePaintColor(highlightColor ?? defaultPinColor)
        // Render basemap admin lines from the highlighted country's worldview
        // (e.g. for IN, this puts PoK + Aksai Chin inside India's outline).
        applyAdminWorldview(map, iso)
        const highlightFilter = buildCountryFilter(iso) as unknown as mapboxgl.FilterSpecification

        if (!map.getSource('country-boundaries')) {
          map.addSource('country-boundaries', {
            type: 'vector',
            url: 'mapbox://mapbox.country-boundaries-v1',
          })
        }

        const styleLayers = map.getStyle()?.layers ?? []
        const firstLabelLayer = styleLayers.find(
          (l) => l.type === 'symbol' && (l.layout as { 'text-field'?: unknown } | undefined)?.['text-field'] != null
        )
        const beforeId = firstLabelLayer?.id

        if (!map.getLayer('highlight-country-fill')) {
          map.addLayer(
            {
              id: 'highlight-country-fill',
              type: 'fill',
              source: 'country-boundaries',
              'source-layer': 'country_boundaries',
              filter: highlightFilter,
              paint: {
                'fill-color': color,
                'fill-opacity': 0.22,
              },
            },
            beforeId
          )
        }

        if (!map.getLayer('highlight-country-line')) {
          map.addLayer(
            {
              id: 'highlight-country-line',
              type: 'line',
              source: 'country-boundaries',
              'source-layer': 'country_boundaries',
              filter: highlightFilter,
              paint: {
                'line-color': color,
                'line-width': 1.4,
                'line-opacity': 0.85,
              },
            },
            beforeId
          )
        }
      }

      setLoaded(true)
    })
    mapRef.current = map

    const markers = markersRef.current
    return () => {
      markers.forEach((m) => m.remove())
      markers.clear()
      map.remove()
      mapRef.current = null
      setLoaded(false)
    }
  }, [accessToken, style, interactive]) // eslint-disable-line react-hooks/exhaustive-deps

  // Animate to active step
  useEffect(() => {
    const map = mapRef.current
    if (!map || !loaded) return

    const step = steps[activeStep]
    if (!step) return

    const reduceMotion = prefersReducedMotion()
    const padding = computeFocusPadding(containerRef.current, landscapeFocusArea, portraitFocusArea)
    const camera = {
      center: step.center,
      zoom: step.zoom,
      pitch: step.pitch ?? 0,
      bearing: step.bearing ?? 0,
      padding,
    }

    if (reduceMotion || staticCapture) {
      map.jumpTo(camera)
    } else {
      map.flyTo({
        ...camera,
        speed: step.flySpeed ?? 1.2,
        curve: 1.42,
        essential: true,
      })
    }

    // Rebuild per-step region + heatmap layers. Simple teardown/rebuild —
    // Mapbox handles this cheaply, and story beats are rare enough that
    // diffing isn't worth the complexity. We bump a generation counter
    // each time so async region fetches (custom GeoJSON) can bail if the
    // user has already scrolled to a different step by the time the fetch
    // resolves — without this, late resolutions race with their successors
    // and throw "source already exists".
    removeStoryLayers(map)
    const myGen = ++layerGenRef.current
    const isStale = () => layerGenRef.current !== myGen
    const regionPromise = step.regions
      ? applyRegionLayer(map, step.regions, resolvePaintColor(defaultPinColor), isStale, containerRef.current)
      : Promise.resolve()
    if (step.heatmap) {
      applyHeatmapLayer(map, step.heatmap)
    }

    // Share mode waits on this to know when to rasterize. Fire once the
    // region layer has been applied (or skipped) AND the map reports idle.
    if (onReady && staticCapture) {
      void regionPromise.then(() => {
        if (layerGenRef.current !== myGen) return
        map.once('idle', () => {
          if (layerGenRef.current !== myGen) return
          onReady()
        })
      })
    }

    // Diff pins: keep shared markers, remove vanished ones, add new ones.
    const desiredPins = step.pins ?? []
    const desiredKeys = new Set(desiredPins.map(pinKey))

    for (const [key, marker] of markersRef.current) {
      if (!desiredKeys.has(key)) {
        marker.remove()
        markersRef.current.delete(key)
      }
    }

    for (const pin of desiredPins) {
      const key = pinKey(pin)
      if (markersRef.current.has(key)) continue

      const color = pin.color ?? defaultPinColor
      const radius = pin.radius ?? defaultPinRadius
      const pulse = pin.pulse !== false

      const el = document.createElement('div')
      el.className = 'mapbox-highlight-marker'
      el.style.cssText = `
        width: ${radius * 2}px;
        height: ${radius * 2}px;
        border-radius: 50%;
        background: ${color};
        opacity: 0.85;
        ${pulse ? `box-shadow: 0 0 0 0 ${color}; animation: mapbox-pulse 2s ease-out infinite;` : ''}
      `

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(pin.coordinates)
        .addTo(map)

      if (pin.label) {
        // labelAnchor describes where the label appears relative to the pin.
        // Mapbox anchor describes where the popup tip points FROM, so invert.
        const anchorMap = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const
        const anchor = pin.labelAnchor ? anchorMap[pin.labelAnchor] : undefined

        const popup = new mapboxgl.Popup({
          offset: radius + 8,
          closeButton: false,
          closeOnClick: false,
          className: 'mapbox-highlight-popup',
          ...(anchor ? { anchor } : {}),
        }).setHTML(
          `<div style="
            font-family: var(--font-mono);
            font-size: 0.8rem;
            font-weight: 600;
            color: var(--color-text);
            background: rgb(var(--color-panel-rgb) / 0.9);
            padding: 4px 10px;
            border-radius: 4px;
            border: 0.5px solid var(--color-line);
            ${staticCapture
              ? 'white-space: normal; max-width: 140px; text-align: left;'
              : 'white-space: nowrap;'}
          ">${pin.label}</div>`
        )
        marker.setPopup(popup).togglePopup()
      }

      markersRef.current.set(key, marker)
    }
  }, [activeStep, steps, loaded, defaultPinColor, defaultPinRadius, landscapeFocusArea, portraitFocusArea, staticCapture, onReady])

  // Re-evaluate focal padding when the viewport flips between portrait and
  // landscape — without this, rotating the device leaves the camera padded
  // for the previous orientation.
  useEffect(() => {
    if (!loaded) return
    function onResize() {
      const map = mapRef.current
      if (!map) return
      map.setPadding(computeFocusPadding(containerRef.current, landscapeFocusArea, portraitFocusArea))
      // setPadding by itself doesn't redraw at the new focal point — nudge
      // the camera back to the active step so it re-projects with the new pad.
      const step = steps[activeStep]
      if (step) {
        map.jumpTo({
          center: step.center,
          zoom: step.zoom,
          pitch: step.pitch ?? 0,
          bearing: step.bearing ?? 0,
        })
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [loaded, landscapeFocusArea, portraitFocusArea, activeStep, steps])

  const currentOpacity = (steps[activeStep]?.opacity ?? defaultOpacity)
  const reduceMotion = typeof window !== 'undefined' && prefersReducedMotion()

  return (
    <>
      <style jsx global>{`
        @keyframes mapbox-pulse {
          0% {
            box-shadow: 0 0 0 0 rgba(216, 90, 48, 0.6);
          }
          70% {
            box-shadow: 0 0 0 20px rgba(216, 90, 48, 0);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(216, 90, 48, 0);
          }
        }
        .mapbox-highlight-popup .mapboxgl-popup-content {
          background: transparent !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
        .mapbox-highlight-popup .mapboxgl-popup-tip {
          display: none !important;
        }
        .mapbox-fade-root .mapboxgl-canvas-container {
          opacity: var(--map-fade, 1);
          transition: var(--map-fade-transition, opacity 800ms ease);
        }
      `}</style>
      <div
        ref={containerRef}
        className="w-full h-full mapbox-fade-root"
        style={{
          ['--map-fade' as string]: loaded ? String(currentOpacity) : '0',
          ['--map-fade-transition' as string]: reduceMotion ? 'none' : 'opacity 800ms ease',
        } as React.CSSProperties}
      />
    </>
  )
}
