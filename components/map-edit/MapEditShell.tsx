'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import type {
  StoryConfig,
  MapPinConfig,
  MapPalette,
  ShareConfig,
  ResolvedUnit,
  StoryDefaults,
  StatColor,
} from '@/lib/storyConfig.types'
import ShareMapBg from '@/components/share/ShareMapBg'
import { formatInlineMarkdown } from '@/lib/formatInlineMarkdown'
import { applyMapPalette, applyMapFontstack } from '@/lib/applyMapPalette'
import { applyAdminWorldview, buildCountryFilter } from '@/lib/mapboxWorldview'
import { STORY_LANDSCAPE_FOCUS_AREA } from '@/lib/storyFocusArea'

/* ─── Types ─────────────────────────────────────────────────────── */

type ViewMode = 'desktop' | 'mobile' | 'share'

interface StoryData {
  slug: string
  config: StoryConfig
  shareConfig: ShareConfig | null
  units: ResolvedUnit[]
  mobileUnits: ResolvedUnit[]
  shareUnits: ResolvedUnit[]
}

interface MapState {
  center: [number, number]
  zoom: number
  pitch: number
  bearing: number
  opacity: number
  flySpeed: number
  pins: MapPinConfig[]
  highlightCountry: string
  highlightColor: string
  mapStyle: string
  /** Palette applied to the base Mapbox style at runtime. Unset fields keep the base colors. */
  palette: MapPalette
  /** Fontstack applied to every text layer. Must exist on the style's glyphs URL. */
  fontstack: string[]
}

/* ─── Defaults ──────────────────────────────────────────────────── */

const DEFAULT_MAP: MapState = {
  center: [0, 20],
  zoom: 2,
  pitch: 0,
  bearing: 0,
  opacity: 0.55,
  flySpeed: 1.2,
  pins: [],
  highlightCountry: '',
  highlightColor: '',
  mapStyle: 'mapbox://styles/mapbox/dark-v11',
  palette: {},
  fontstack: [],
}

/**
 * Palette color-swatch roles exposed by the editor. The other MapPalette
 * fields (placeLabels / roadLabels / ... / motorways / ...) are show/hide
 * toggles rather than plain color strings — they're edited in yaml directly
 * for now, not through this swatch UI.
 */
type PaletteColorKey = 'land' | 'water' | 'border' | 'labelText' | 'labelHalo' | 'building'
const PALETTE_FIELDS: Array<{ key: PaletteColorKey; label: string }> = [
  { key: 'land', label: 'Land' },
  { key: 'water', label: 'Water' },
  { key: 'border', label: 'Borders' },
  { key: 'labelText', label: 'Label text' },
  { key: 'labelHalo', label: 'Label halo' },
  { key: 'building', label: 'Buildings' },
]

const MOBILE_SIZE = { width: 390, height: 844 }

/* ─── Helpers ───────────────────────────────────────────────────── */

function resolvePaintColor(color: string, fallback = '#D85A30'): string {
  if (color.startsWith('var(')) {
    const match = color.match(/var\([^,]+,\s*([^)]+)\)/)
    return match?.[1]?.trim() ?? fallback
  }
  return color
}

/**
 * Resolve the map state for a unit, merging subsection overrides on top of
 * the parent section's map config — exactly matching StoryMapShell's logic.
 */
function resolveMapStateFromUnit(
  unit: ResolvedUnit,
  defaults: StoryDefaults,
  isMobile: boolean
): MapState {
  const parentMap = unit.parentConfig.map
  const sub = unit.parentConfig.subsections?.[unit.subIndex]
  const over = sub?.map

  // Desktop-resolved values (subsection overrides parent)
  let center = over?.center ?? parentMap.center
  let zoom = over?.zoom ?? parentMap.zoom
  let pitch = over?.pitch ?? parentMap.pitch ?? 0
  let bearing = over?.bearing ?? parentMap.bearing ?? 0
  let flySpeed = over?.flySpeed ?? parentMap.flySpeed ?? defaults.flySpeed
  let opacity = over?.opacity ?? parentMap.opacity ?? defaults.mapOpacity
  let pins: MapPinConfig[] = over?.pins ?? parentMap.pins ?? []

  // Mobile layer: subsection mobile > parent mobile
  if (isMobile) {
    const mob = over?.mobile ?? parentMap.mobile
    if (mob) {
      center = mob.center ?? center
      zoom = mob.zoom ?? zoom
      pitch = mob.pitch ?? pitch
      bearing = mob.bearing ?? bearing
      flySpeed = mob.flySpeed ?? flySpeed
      opacity = mob.opacity ?? opacity
      pins = mob.pins ?? pins
    }
  }

  return {
    center,
    zoom,
    pitch,
    bearing,
    flySpeed,
    opacity,
    pins: pins.map((p) => ({
      ...p,
      color: p.color ?? defaults.pinColor,
      radius: p.radius ?? defaults.pinRadius,
    })),
    highlightCountry: defaults.highlightCountry ?? '',
    highlightColor: defaults.highlightColor ?? defaults.pinColor,
    mapStyle: defaults.mapStyle,
    palette: { ...(defaults.mapPalette ?? {}) },
    fontstack: defaults.mapFontstack ? [...defaults.mapFontstack] : [],
  }
}

function toYaml(state: MapState): string {
  const lines: string[] = []
  lines.push('map:')
  lines.push(`  center: [${state.center[0].toFixed(3)}, ${state.center[1].toFixed(3)}]`)
  lines.push(`  zoom: ${state.zoom.toFixed(1)}`)
  if (state.pitch) lines.push(`  pitch: ${state.pitch}`)
  if (state.bearing) lines.push(`  bearing: ${state.bearing}`)
  if (state.opacity !== 0.55) lines.push(`  opacity: ${state.opacity.toFixed(2)}`)
  if (state.flySpeed !== 1.2) lines.push(`  flySpeed: ${state.flySpeed}`)
  if (state.pins.length > 0) {
    lines.push('  pins:')
    for (const pin of state.pins) {
      lines.push(`    - coordinates: [${pin.coordinates[0].toFixed(4)}, ${pin.coordinates[1].toFixed(4)}]`)
      if (pin.label) lines.push(`      label: "${pin.label}"`)
      if (pin.color) lines.push(`      color: "${pin.color}"`)
      if (pin.radius) lines.push(`      radius: ${pin.radius}`)
      if (pin.pulse === false) lines.push(`      pulse: false`)
      if (pin.labelAnchor) lines.push(`      labelAnchor: ${pin.labelAnchor}`)
    }
  }
  return lines.join('\n')
}

/**
 * YAML for the `defaults.mapPalette` + `defaults.mapFontstack` blocks.
 * These live under `defaults:` in the story config, not under `map:`, so the
 * editor surfaces them as a separate copyable snippet from the per-unit YAML.
 * Returns an empty string when there's nothing to emit.
 */
function paletteYaml(state: MapState): string {
  const paletteEntries = PALETTE_FIELDS.filter(({ key }) => {
    const v = state.palette[key]
    return typeof v === 'string' && v.trim().length > 0
  })
  const hasFontstack = state.fontstack.length > 0
  if (paletteEntries.length === 0 && !hasFontstack) return ''

  const lines: string[] = []
  lines.push('defaults:')
  if (paletteEntries.length > 0) {
    lines.push('  mapPalette:')
    for (const { key } of paletteEntries) {
      lines.push(`    ${key}: "${state.palette[key]}"`)
    }
  }
  if (hasFontstack) {
    const quoted = state.fontstack.map((f) => `"${f}"`).join(', ')
    lines.push(`  mapFontstack: [${quoted}]`)
  }
  return lines.join('\n')
}

/** Build a display label for a unit in the selector dropdown. */
function unitLabel(unit: ResolvedUnit, idx: number): string {
  const section = unit.parentConfig
  const id = section.id ?? ''
  const kind = section.kind ?? 'text'
  const hasSubs = (section.subsections?.length ?? 0) > 0

  const kindTag = kind !== 'text' ? `[${kind}] ` : ''
  const subTag = hasSubs ? ` (sub ${unit.subIndex + 1})` : ''
  const heading = unit.heading ?? section.text ?? `Section ${idx}`
  const truncated = heading.length > 40 ? heading.slice(0, 40) + '...' : heading

  return `${idx}. ${kindTag}${id ? id + ': ' : ''}${truncated}${subTag}`
}

/* ─── Palette Editor ────────────────────────────────────────────── */

/**
 * Sidebar panel for editing the per-story `mapPalette` + `mapFontstack`.
 * Each palette role gets a native color-picker swatch plus a text input so
 * the user can paste hex/rgb/hsl without fighting the picker. Clearing a
 * field via the ✕ button removes it from the palette; the live map effect
 * does NOT revert the paint to the stylesheet default, so the sidebar shows
 * a small hint nudging the user to reload for a clean slate.
 */
function PaletteEditor({
  palette,
  onChange,
  fontstack,
  onFontstackChange,
}: {
  palette: MapPalette
  onChange: (palette: MapPalette) => void
  fontstack: string[]
  onFontstackChange: (fontstack: string[]) => void
}) {
  const setField = (key: PaletteColorKey, value: string) => {
    const next = { ...palette }
    if (value.trim() === '') delete next[key]
    else next[key] = value
    onChange(next)
  }

  const anySet = PALETTE_FIELDS.some(({ key }) => {
    const v = palette[key]
    return typeof v === 'string' && v.length > 0
  })

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
          Palette
        </span>
        {anySet && (
          <button
            onClick={() => onChange({})}
            className="text-[0.6rem] px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-500 hover:bg-neutral-700 hover:text-neutral-300"
          >
            Clear all
          </button>
        )}
      </div>

      {PALETTE_FIELDS.map(({ key, label }) => {
        const value = palette[key] ?? ''
        // A blank value means "not overridden" — render a muted placeholder swatch
        // so the user can still click it to open a picker.
        const swatch = value || '#000000'
        return (
          <div key={key} className="flex items-center gap-1.5">
            <input
              type="color"
              value={swatch}
              onChange={(e) => setField(key, e.target.value)}
              className="w-7 h-7 rounded border border-neutral-700 bg-neutral-900 cursor-pointer shrink-0"
              title={`${label} color`}
              style={{ opacity: value ? 1 : 0.4 }}
            />
            <label className="flex-1 text-xs flex flex-col">
              <span className="text-neutral-500 text-[0.65rem]">{label}</span>
              <input
                type="text"
                value={value}
                onChange={(e) => setField(key, e.target.value)}
                placeholder="inherit"
                className="w-full bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-neutral-200 font-mono"
              />
            </label>
            {value && (
              <button
                onClick={() => setField(key, '')}
                className="text-neutral-500 hover:text-neutral-300 text-sm leading-none shrink-0"
                title="Clear — revert to base style on next reload"
                aria-label={`Clear ${label}`}
              >
                ✕
              </button>
            )}
          </div>
        )
      })}

      {/* Fontstack — single comma-separated string, round-tripped through an array */}
      <div className="pt-1">
        <label className="text-xs flex flex-col">
          <span className="text-neutral-500 text-[0.65rem] uppercase tracking-wider">
            Fontstack
          </span>
          <input
            type="text"
            value={fontstack.join(', ')}
            onChange={(e) => {
              const parts = e.target.value
                .split(',')
                .map((p) => p.trim())
                .filter(Boolean)
              onFontstackChange(parts)
            }}
            placeholder='e.g. "Vizmaya Serif Regular"'
            className="w-full bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-neutral-200 font-mono text-xs"
          />
          <span className="text-[0.6rem] text-neutral-600 mt-0.5">
            Comma-separated. Fonts must exist on the style&apos;s glyphs URL.
          </span>
        </label>
      </div>

      {anySet && (
        <p className="text-[0.6rem] text-neutral-600 leading-snug">
          Clearing a field doesn&apos;t revert the map to its base color —
          reload to reset.
        </p>
      )}
    </div>
  )
}

/* ─── Pin Editor ────────────────────────────────────────────────── */

function PinEditor({
  pins,
  onChange,
  defaultColor,
}: {
  pins: MapPinConfig[]
  onChange: (pins: MapPinConfig[]) => void
  defaultColor: string
}) {
  const updatePin = (i: number, patch: Partial<MapPinConfig>) => {
    const next = pins.map((p, j) => (j === i ? { ...p, ...patch } : p))
    onChange(next)
  }

  const removePin = (i: number) => onChange(pins.filter((_, j) => j !== i))

  const addPin = () => {
    onChange([
      ...pins,
      { coordinates: [0, 0], label: '', color: defaultColor, pulse: true },
    ])
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
          Pins ({pins.length})
        </span>
        <button
          onClick={addPin}
          className="text-xs px-2 py-0.5 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30"
        >
          + Add
        </button>
      </div>
      {pins.map((pin, i) => (
        <div key={i} className="bg-neutral-800/60 rounded p-2 space-y-1.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">Pin {i + 1}</span>
            <button
              onClick={() => removePin(i)}
              className="text-red-400/60 hover:text-red-400 text-xs"
            >
              Remove
            </button>
          </div>
          <div className="flex gap-1.5">
            <label className="flex-1">
              <span className="text-neutral-500">Lng</span>
              <input
                type="number"
                step="0.1"
                value={pin.coordinates[0]}
                onChange={(e) =>
                  updatePin(i, {
                    coordinates: [parseFloat(e.target.value) || 0, pin.coordinates[1]],
                  })
                }
                className="w-full bg-neutral-900 border border-neutral-700 rounded px-1.5 py-0.5 text-neutral-200"
              />
            </label>
            <label className="flex-1">
              <span className="text-neutral-500">Lat</span>
              <input
                type="number"
                step="0.1"
                value={pin.coordinates[1]}
                onChange={(e) =>
                  updatePin(i, {
                    coordinates: [pin.coordinates[0], parseFloat(e.target.value) || 0],
                  })
                }
                className="w-full bg-neutral-900 border border-neutral-700 rounded px-1.5 py-0.5 text-neutral-200"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-neutral-500">Label</span>
            <input
              type="text"
              value={pin.label ?? ''}
              onChange={(e) => updatePin(i, { label: e.target.value })}
              className="w-full bg-neutral-900 border border-neutral-700 rounded px-1.5 py-0.5 text-neutral-200"
            />
          </label>
          <div className="flex gap-1.5">
            <label className="flex-1">
              <span className="text-neutral-500">Color</span>
              <input
                type="text"
                value={pin.color ?? ''}
                onChange={(e) => updatePin(i, { color: e.target.value })}
                className="w-full bg-neutral-900 border border-neutral-700 rounded px-1.5 py-0.5 text-neutral-200"
              />
            </label>
            <label className="w-20">
              <span className="text-neutral-500">Anchor</span>
              <select
                value={pin.labelAnchor ?? ''}
                onChange={(e) =>
                  updatePin(i, {
                    labelAnchor: (e.target.value || undefined) as MapPinConfig['labelAnchor'],
                  })
                }
                className="w-full bg-neutral-900 border border-neutral-700 rounded px-1 py-0.5 text-neutral-200"
              >
                <option value="">auto</option>
                <option value="top">top</option>
                <option value="bottom">bottom</option>
                <option value="left">left</option>
                <option value="right">right</option>
              </select>
            </label>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ─── Slider Control ────────────────────────────────────────────── */

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between text-xs text-neutral-400 mb-0.5">
        <span>{label}</span>
        <input
          type="number"
          value={value}
          step={step}
          min={min}
          max={max}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="w-20 text-right bg-transparent border-none text-neutral-300 text-xs p-0 focus:outline-none"
        />
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-1 accent-blue-500"
      />
    </label>
  )
}

/* ─── Content Preview ───────────────────────────────────────────── */

/**
 * Admin-palette hex values keyed by stat color token. The admin shell isn't
 * wrapped in a ThemeProvider, so we can't resolve `var(--color-*)` here —
 * this static map keeps the preview legible without dragging the per-story
 * theme into the admin chrome. Story render fidelity is handled by the live
 * preview iframe alongside it.
 */
const ADMIN_STAT_HEX: Record<StatColor, string> = {
  accent: '#d8a14a',
  accent2: '#00d5be',
  red: '#E24B4A',
  positive: '#8ab56f',
  amber: '#d9a84a',
  teal: '#3a7a6a',
  muted: '#7f8a7d',
}

function ContentPreview({ unit }: { unit: ResolvedUnit }) {
  const kind = unit.parentConfig.kind ?? 'text'

  return (
    <div
      className="rounded-lg p-4 backdrop-blur-sm overflow-y-auto max-h-[40vh]"
      style={{
        background: 'rgba(10, 14, 20, 0.75)',
        border: '0.5px solid rgba(26, 40, 48, 0.6)',
      }}
    >
      {kind === 'hero' && unit.heading && (
        <div className="text-center">
          {unit.parentConfig.eyebrow && (
            <div className="font-mono text-[0.6rem] uppercase tracking-[0.2em] text-blue-400/80 mb-2">
              {unit.parentConfig.eyebrow}
            </div>
          )}
          <h2 className="font-serif text-xl font-bold text-neutral-100 leading-tight">
            {unit.heading}
          </h2>
          {unit.paragraphs.length > 0 && (
            <p className="text-sm text-neutral-400 mt-2 italic">
              {unit.paragraphs[0]?.replace(/^\*+|\*+$/g, '')}
            </p>
          )}
        </div>
      )}

      {kind === 'stat' && unit.heading && (
        <div className="text-center">
          <div
            className="font-serif text-4xl font-bold leading-none mb-2"
            style={{
              color: ADMIN_STAT_HEX[unit.parentConfig.color ?? 'accent2'],
            }}
          >
            {unit.heading}
          </div>
          {unit.subheading && (
            <div className="font-mono text-[0.6rem] uppercase tracking-[0.15em] text-blue-400/80 mb-2">
              {unit.subheading}
            </div>
          )}
          {unit.paragraphs.length > 0 && (
            <p className="text-xs text-neutral-400 leading-relaxed">
              {unit.paragraphs.join(' ')}
            </p>
          )}
        </div>
      )}

      {kind === 'text' && (
        <>
          {unit.heading && (
            <div className="font-mono text-[0.6rem] uppercase tracking-[0.15em] text-blue-400/80 mb-2">
              {unit.heading}
            </div>
          )}
          {unit.paragraphs.map((p, i) => (
            <p
              key={i}
              className="text-sm leading-relaxed text-neutral-300 mb-2 last:mb-0"
            >
              {formatInlineMarkdown(p)}
            </p>
          ))}
          {unit.paragraphs.length === 0 && (
            <p className="text-xs text-neutral-500 italic">
              [no content resolved for this unit]
            </p>
          )}
        </>
      )}
    </div>
  )
}

/* ─── Focus Area Padding (matches MapboxBackground) ─────────────── */

const LANDSCAPE_FOCUS_AREA = STORY_LANDSCAPE_FOCUS_AREA

function computeFocusPadding(
  container: HTMLDivElement | null,
  area?: { top: number; left: number; width: number; height: number }
): { top: number; right: number; bottom: number; left: number } {
  const zero = { top: 0, right: 0, bottom: 0, left: 0 }
  if (!container || !area) return zero
  const w = container.clientWidth
  const h = container.clientHeight
  if (w === 0 || h === 0 || w / h < 1) return zero
  return {
    left: Math.max(0, area.left * w),
    right: Math.max(0, (1 - area.left - area.width) * w),
    top: Math.max(0, area.top * h),
    bottom: Math.max(0, (1 - area.top - area.height) * h),
  }
}

/* ─── Interactive Map ───────────────────────────────────────────── */

function InteractiveMap({
  state,
  onMove,
  containerStyle,
  applyFocusArea,
}: {
  state: MapState
  onMove: (center: [number, number], zoom: number, pitch: number, bearing: number) => void
  containerStyle?: React.CSSProperties
  /** When true, apply the landscape focus area padding (same as the real story). */
  applyFocusArea?: boolean
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<mapboxgl.Marker[]>([])
  const suppressMoveRef = useRef(false)

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    if (!token) return

    mapboxgl.accessToken = token

    const initialPadding = applyFocusArea
      ? computeFocusPadding(containerRef.current, LANDSCAPE_FOCUS_AREA)
      : undefined

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: state.mapStyle,
      center: state.center,
      zoom: state.zoom,
      pitch: state.pitch,
      bearing: state.bearing,
      interactive: true,
      keyboard: false,
      attributionControl: false,
    })

    if (initialPadding && (initialPadding.top || initialPadding.right || initialPadding.bottom || initialPadding.left)) {
      map.setPadding(initialPadding)
    }

    map.addControl(new mapboxgl.NavigationControl(), 'top-right')

    map.on('load', () => {
      // Apply palette + fontstack before the country highlight so the highlight
      // fill color wins on top of any label recolor — same ordering as
      // MapboxBackground.
      if (Object.keys(state.palette).length > 0) applyMapPalette(map, state.palette)
      if (state.fontstack.length > 0) applyMapFontstack(map, state.fontstack)
      if (state.highlightCountry) {
        addCountryHighlight(map, state.highlightCountry, state.highlightColor || '#155dfc')
      }
    })

    map.on('moveend', () => {
      if (suppressMoveRef.current) {
        suppressMoveRef.current = false
        return
      }
      const c = map.getCenter()
      onMove(
        [parseFloat(c.lng.toFixed(3)), parseFloat(c.lat.toFixed(3))],
        parseFloat(map.getZoom().toFixed(1)),
        Math.round(map.getPitch()),
        Math.round(map.getBearing())
      )
    })

    mapRef.current = map
    return () => {
      markersRef.current.forEach((m) => m.remove())
      markersRef.current = []
      map.remove()
      mapRef.current = null
    }
  }, [state.mapStyle, applyFocusArea]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fly to when state changes programmatically
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const c = map.getCenter()
    const currentCenter: [number, number] = [
      parseFloat(c.lng.toFixed(3)),
      parseFloat(c.lat.toFixed(3)),
    ]
    const currentZoom = parseFloat(map.getZoom().toFixed(1))
    const currentPitch = Math.round(map.getPitch())
    const currentBearing = Math.round(map.getBearing())

    if (
      currentCenter[0] === state.center[0] &&
      currentCenter[1] === state.center[1] &&
      currentZoom === state.zoom &&
      currentPitch === state.pitch &&
      currentBearing === state.bearing
    )
      return

    const padding = applyFocusArea
      ? computeFocusPadding(containerRef.current, LANDSCAPE_FOCUS_AREA)
      : undefined

    suppressMoveRef.current = true
    map.flyTo({
      center: state.center,
      zoom: state.zoom,
      pitch: state.pitch,
      bearing: state.bearing,
      ...(padding ? { padding } : {}),
      speed: 1.5,
      essential: true,
    })
  }, [state.center[0], state.center[1], state.zoom, state.pitch, state.bearing, applyFocusArea]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync pins
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    markersRef.current.forEach((m) => m.remove())
    markersRef.current = []

    for (const pin of state.pins) {
      const color = resolvePaintColor(pin.color ?? '#D85A30')
      const radius = pin.radius ?? 12

      const el = document.createElement('div')
      el.style.cssText = `
        width: ${radius * 2}px;
        height: ${radius * 2}px;
        border-radius: 50%;
        background: ${color};
        opacity: 0.85;
        cursor: pointer;
        ${pin.pulse !== false ? `box-shadow: 0 0 0 0 ${color}; animation: mapbox-pulse 2s ease-out infinite;` : ''}
      `

      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(pin.coordinates)
        .addTo(map)

      if (pin.label) {
        const anchorMap = {
          top: 'bottom',
          bottom: 'top',
          left: 'right',
          right: 'left',
        } as const
        const anchor = pin.labelAnchor ? anchorMap[pin.labelAnchor] : undefined

        const popup = new mapboxgl.Popup({
          offset: radius + 8,
          closeButton: false,
          closeOnClick: false,
          className: 'mapbox-highlight-popup',
          ...(anchor ? { anchor } : {}),
        }).setHTML(
          `<div style="
            font-family: monospace;
            font-size: 0.7rem;
            color: #e0ddd5;
            background: rgba(10, 14, 20, 0.9);
            padding: 4px 10px;
            border-radius: 4px;
            border: 0.5px solid #1a2830;
            white-space: nowrap;
          ">${pin.label}</div>`
        )
        marker.setPopup(popup).togglePopup()
      }

      markersRef.current.push(marker)
    }
  }, [state.pins])

  // Re-evaluate focal padding on resize (matches MapboxBackground)
  useEffect(() => {
    if (!applyFocusArea) return
    function onResize() {
      const map = mapRef.current
      if (!map) return
      const padding = computeFocusPadding(containerRef.current, LANDSCAPE_FOCUS_AREA)
      map.setPadding(padding)
      map.jumpTo({
        center: state.center,
        zoom: state.zoom,
        pitch: state.pitch,
        bearing: state.bearing,
      })
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [applyFocusArea, state.center, state.zoom, state.pitch, state.bearing])

  // Sync opacity
  useEffect(() => {
    const container = containerRef.current
    if (container) {
      container.style.opacity = String(state.opacity)
    }
  }, [state.opacity])

  // Sync country highlight
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return

    if (map.getLayer('highlight-country-fill')) map.removeLayer('highlight-country-fill')
    if (map.getLayer('highlight-country-line')) map.removeLayer('highlight-country-line')

    if (state.highlightCountry) {
      addCountryHighlight(map, state.highlightCountry, state.highlightColor || '#155dfc')
    }
  }, [state.highlightCountry, state.highlightColor])

  // Live re-apply palette + fontstack whenever the sidebar edits them.
  // Note: clearing a palette key does NOT reset the layer to its stylesheet
  // default — the previous override stays. Reload the page for a clean slate.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    if (Object.keys(state.palette).length > 0) applyMapPalette(map, state.palette)
    if (state.fontstack.length > 0) applyMapFontstack(map, state.fontstack)
  }, [state.palette, state.fontstack])

  return (
    <div style={containerStyle} className="relative bg-neutral-950 rounded-lg overflow-hidden">
      <style jsx global>{`
        @keyframes mapbox-pulse {
          0% { box-shadow: 0 0 0 0 rgba(216, 90, 48, 0.6); }
          70% { box-shadow: 0 0 0 20px rgba(216, 90, 48, 0); }
          100% { box-shadow: 0 0 0 0 rgba(216, 90, 48, 0); }
        }
        .mapbox-highlight-popup .mapboxgl-popup-content {
          background: transparent !important;
          padding: 0 !important;
          box-shadow: none !important;
        }
        .mapbox-highlight-popup .mapboxgl-popup-tip {
          display: none !important;
        }
      `}</style>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  )
}

function addCountryHighlight(map: mapboxgl.Map, iso: string, color: string) {
  const resolvedColor = resolvePaintColor(color)
  const code = iso.toUpperCase()
  applyAdminWorldview(map, code)
  const highlightFilter = buildCountryFilter(code) as unknown as mapboxgl.FilterSpecification

  if (!map.getSource('country-boundaries')) {
    map.addSource('country-boundaries', {
      type: 'vector',
      url: 'mapbox://mapbox.country-boundaries-v1',
    })
  }

  const styleLayers = map.getStyle()?.layers ?? []
  const firstLabelLayer = styleLayers.find(
    (l) =>
      l.type === 'symbol' &&
      (l.layout as { 'text-field'?: unknown } | undefined)?.['text-field'] != null
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
        paint: { 'fill-color': resolvedColor, 'fill-opacity': 0.22 },
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
        paint: { 'line-color': resolvedColor, 'line-width': 1.4, 'line-opacity': 0.85 },
      },
      beforeId
    )
  }
}

/* ─── Share Preview ─────────────────────────────────────────────── */

function SharePreview({
  state,
  accessToken,
  aspect,
}: {
  state: MapState
  accessToken: string
  aspect: '1:1' | '3:4' | '4:3'
}) {
  const dims =
    aspect === '1:1'
      ? { width: 1080, height: 1080 }
      : aspect === '3:4'
        ? { width: 1080, height: 1440 }
        : { width: 1080, height: 810 }

  const scale = 480 / dims.width

  return (
    <div
      className="relative rounded-lg overflow-hidden bg-neutral-950 border border-neutral-800"
      style={{
        width: dims.width * scale,
        height: dims.height * scale,
      }}
    >
      <ShareMapBg
        center={state.center}
        zoom={state.zoom}
        pitch={state.pitch}
        bearing={state.bearing}
        style={state.mapStyle}
        accessToken={accessToken}
        pins={state.pins.length > 0 ? state.pins : undefined}
        palette={Object.keys(state.palette).length > 0 ? state.palette : undefined}
        fontstack={state.fontstack.length > 0 ? state.fontstack : undefined}
      />
    </div>
  )
}

/* ─── Main Shell ────────────────────────────────────────────────── */

export default function MapEditShell({ accessToken }: { accessToken: string }) {
  const [stories, setStories] = useState<StoryData[]>([])
  const [selectedSlug, setSelectedSlug] = useState('')
  const [selectedUnitIdx, setSelectedUnitIdx] = useState(0)
  const [viewMode, setViewMode] = useState<ViewMode>('desktop')
  const [shareAspect, setShareAspect] = useState<'1:1' | '3:4' | '4:3'>('1:1')
  const [mapState, setMapState] = useState<MapState>(DEFAULT_MAP)
  const [showContent, setShowContent] = useState(true)
  const [copied, setCopied] = useState(false)

  // Fetch stories on mount
  useEffect(() => {
    fetch('/api/stories/configs')
      .then((r) => r.json())
      .then((data: StoryData[]) => {
        setStories(data)
        if (data.length > 0) {
          setSelectedSlug(data[0].slug)
          loadUnit(data[0], 0, 'desktop')
        }
      })
      .catch(console.error)
  }, [])

  const selectedStory = stories.find((s) => s.slug === selectedSlug)

  /** Pick the correct unit array based on view mode. */
  const getUnits = useCallback(
    (story: StoryData | undefined, mode: ViewMode): ResolvedUnit[] => {
      if (!story) return []
      if (mode === 'mobile') return story.mobileUnits
      if (mode === 'share') return story.shareUnits
      return story.units
    },
    []
  )

  const currentUnits = getUnits(selectedStory, viewMode)
  const currentUnit = currentUnits[selectedUnitIdx]

  const loadUnit = useCallback(
    (story: StoryData, unitIdx: number, mode: ViewMode) => {
      const units = mode === 'mobile'
        ? story.mobileUnits
        : mode === 'share'
          ? story.shareUnits
          : story.units
      const unit = units[unitIdx]
      if (!unit) return
      setMapState(resolveMapStateFromUnit(unit, story.config.defaults, mode === 'mobile'))
    },
    []
  )

  const handleStoryChange = (slug: string) => {
    setSelectedSlug(slug)
    setSelectedUnitIdx(0)
    const story = stories.find((s) => s.slug === slug)
    if (story) loadUnit(story, 0, viewMode)
  }

  const handleUnitChange = (idx: number) => {
    setSelectedUnitIdx(idx)
    if (selectedStory) loadUnit(selectedStory, idx, viewMode)
  }

  const handleViewModeChange = (mode: ViewMode) => {
    setViewMode(mode)
    // Clamp unit index to new array length and reload map state
    if (selectedStory) {
      const units = getUnits(selectedStory, mode)
      const clamped = Math.min(selectedUnitIdx, units.length - 1)
      setSelectedUnitIdx(clamped)
      loadUnit(selectedStory, clamped, mode)
    }
  }

  const handleMapMove = useCallback(
    (center: [number, number], zoom: number, pitch: number, bearing: number) => {
      setMapState((prev) => ({ ...prev, center, zoom, pitch, bearing }))
    },
    []
  )

  const patch = useCallback((p: Partial<MapState>) => {
    setMapState((prev) => ({ ...prev, ...p }))
  }, [])

  // Step through units with keyboard — use refs to avoid stale closures
  const selectedUnitIdxRef = useRef(selectedUnitIdx)
  selectedUnitIdxRef.current = selectedUnitIdx
  const currentUnitsRef = useRef(currentUnits)
  currentUnitsRef.current = currentUnits
  const handleUnitChangeRef = useRef(handleUnitChange)
  handleUnitChangeRef.current = handleUnitChange

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault()
        const next = Math.min(selectedUnitIdxRef.current + 1, currentUnitsRef.current.length - 1)
        handleUnitChangeRef.current(next)
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault()
        const prev = Math.max(selectedUnitIdxRef.current - 1, 0)
        handleUnitChangeRef.current(prev)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const yaml = toYaml(mapState)
  const paletteYamlText = paletteYaml(mapState)

  const handleCopy = () => {
    navigator.clipboard.writeText(yaml)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const [palCopied, setPalCopied] = useState(false)
  const handleCopyPalette = () => {
    if (!paletteYamlText) return
    navigator.clipboard.writeText(paletteYamlText)
    setPalCopied(true)
    setTimeout(() => setPalCopied(false), 1500)
  }

  return (
    <div className="fixed inset-0 flex bg-neutral-950 text-neutral-200">
      {/* ─── Left Sidebar: Controls ─────────────────────────── */}
      <div className="w-80 shrink-0 border-r border-neutral-800 flex flex-col overflow-hidden">
        <div className="p-3 border-b border-neutral-800">
          <h1 className="text-sm font-semibold text-neutral-300 mb-2">Map Editor</h1>

          {/* Story selector */}
          <select
            value={selectedSlug}
            onChange={(e) => handleStoryChange(e.target.value)}
            className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-neutral-200 mb-2"
          >
            <option value="">Select story...</option>
            {stories.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.slug}
              </option>
            ))}
          </select>

          {/* Unit selector */}
          <select
            value={selectedUnitIdx}
            onChange={(e) => handleUnitChange(parseInt(e.target.value))}
            className="w-full bg-neutral-900 border border-neutral-700 rounded px-2 py-1.5 text-xs text-neutral-200"
          >
            {currentUnits.map((u, i) => (
              <option key={i} value={i}>
                {unitLabel(u, i)}
              </option>
            ))}
          </select>

          {/* Unit count + keyboard hint */}
          <div className="flex items-center justify-between mt-1.5 text-[0.6rem] text-neutral-500">
            <span>
              {currentUnits.length} units ({viewMode})
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-neutral-800 text-neutral-400">j</kbd>
              {' / '}
              <kbd className="px-1 py-0.5 rounded bg-neutral-800 text-neutral-400">k</kbd>
              {' to step'}
            </span>
          </div>
        </div>

        {/* Scrollable controls area */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {/* View mode */}
          <div>
            <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider block mb-1">
              View Mode
            </span>
            <div className="flex gap-1">
              {(['desktop', 'mobile', 'share'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => handleViewModeChange(mode)}
                  className={`flex-1 text-xs py-1.5 rounded transition-colors ${
                    viewMode === mode
                      ? 'bg-blue-600 text-white'
                      : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                  }`}
                >
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  <span className="ml-1 opacity-60">
                    ({getUnits(selectedStory, mode).length})
                  </span>
                </button>
              ))}
            </div>
            {viewMode === 'share' && (
              <div className="flex gap-1 mt-1">
                {(['1:1', '3:4', '4:3'] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => setShareAspect(a)}
                    className={`flex-1 text-xs py-1 rounded transition-colors ${
                      shareAspect === a
                        ? 'bg-neutral-600 text-white'
                        : 'bg-neutral-800/50 text-neutral-500 hover:bg-neutral-700'
                    }`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Map properties */}
          <div>
            <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider block mb-1">
              Camera
            </span>
            <div className="flex gap-1.5 mb-2">
              <label className="flex-1 text-xs">
                <span className="text-neutral-500">Lng</span>
                <input
                  type="number"
                  step="0.1"
                  value={mapState.center[0]}
                  onChange={(e) =>
                    patch({
                      center: [parseFloat(e.target.value) || 0, mapState.center[1]],
                    })
                  }
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-neutral-200"
                />
              </label>
              <label className="flex-1 text-xs">
                <span className="text-neutral-500">Lat</span>
                <input
                  type="number"
                  step="0.1"
                  value={mapState.center[1]}
                  onChange={(e) =>
                    patch({
                      center: [mapState.center[0], parseFloat(e.target.value) || 0],
                    })
                  }
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-neutral-200"
                />
              </label>
            </div>
            <div className="space-y-2">
              <SliderControl
                label="Zoom"
                value={mapState.zoom}
                min={0}
                max={22}
                step={0.1}
                onChange={(v) => patch({ zoom: v })}
              />
              <SliderControl
                label="Pitch"
                value={mapState.pitch}
                min={0}
                max={85}
                step={1}
                onChange={(v) => patch({ pitch: v })}
              />
              <SliderControl
                label="Bearing"
                value={mapState.bearing}
                min={-180}
                max={180}
                step={1}
                onChange={(v) => patch({ bearing: v })}
              />
              <SliderControl
                label="Opacity"
                value={mapState.opacity}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => patch({ opacity: v })}
              />
              <SliderControl
                label="Fly Speed"
                value={mapState.flySpeed}
                min={0.1}
                max={5}
                step={0.1}
                onChange={(v) => patch({ flySpeed: v })}
              />
            </div>
          </div>

          {/* Country highlight */}
          <div>
            <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider block mb-1">
              Country Highlight
            </span>
            <div className="flex gap-1.5">
              <label className="flex-1 text-xs">
                <span className="text-neutral-500">ISO Code</span>
                <input
                  type="text"
                  value={mapState.highlightCountry}
                  onChange={(e) => patch({ highlightCountry: e.target.value.toUpperCase() })}
                  placeholder="e.g. KR"
                  maxLength={2}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-neutral-200"
                />
              </label>
              <label className="flex-1 text-xs">
                <span className="text-neutral-500">Color</span>
                <input
                  type="text"
                  value={mapState.highlightColor}
                  onChange={(e) => patch({ highlightColor: e.target.value })}
                  placeholder="#155dfc"
                  className="w-full bg-neutral-900 border border-neutral-700 rounded px-1.5 py-1 text-neutral-200"
                />
              </label>
            </div>
          </div>

          {/* Palette */}
          <PaletteEditor
            palette={mapState.palette}
            onChange={(palette) => patch({ palette })}
            fontstack={mapState.fontstack}
            onFontstackChange={(fontstack) => patch({ fontstack })}
          />

          {/* Pins */}
          <PinEditor
            pins={mapState.pins}
            onChange={(pins) => patch({ pins })}
            defaultColor={selectedStory?.config.defaults.pinColor ?? '#D85A30'}
          />

          {/* YAML output */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                YAML Output
              </span>
              <button
                onClick={handleCopy}
                className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-300 font-mono whitespace-pre overflow-x-auto max-h-48">
              {yaml}
            </pre>
          </div>

          {/* Palette YAML — rendered only when there's something to emit, so it
              doesn't clutter the sidebar for stories using base colors. */}
          {paletteYamlText && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                  defaults YAML
                </span>
                <button
                  onClick={handleCopyPalette}
                  className="text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 hover:bg-neutral-700 hover:text-neutral-200 transition-colors"
                >
                  {palCopied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="bg-neutral-900 border border-neutral-800 rounded p-2 text-xs text-neutral-300 font-mono whitespace-pre overflow-x-auto max-h-48">
                {paletteYamlText}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* ─── Main Map Area ──────────────────────────────────── */}
      <div className="flex-1 relative overflow-hidden">
        {/* ── Desktop: full-story layout replica ── */}
        {viewMode === 'desktop' && (
          <>
            {/* Map fills the entire area with landscape focal padding */}
            <div className="absolute inset-0 z-0">
              <InteractiveMap
                state={mapState}
                onMove={handleMapMove}
                containerStyle={{ width: '100%', height: '100%' }}
                applyFocusArea
              />
            </div>

            {/* Chart panel placeholder — top-right 63% × 50% */}
            {showContent && currentUnit?.parentConfig.chart && (
              <div
                className="absolute top-0 right-0 z-10 pointer-events-none flex items-center justify-center backdrop-blur-xl"
                style={{
                  width: '63%',
                  height: '50%',
                  background: 'rgba(10, 14, 20, 0.2)',
                  border: '0.5px solid rgba(26, 40, 48, 0.4)',
                }}
              >
                <div className="text-center">
                  <div className="font-mono text-xs text-green-400/60 uppercase tracking-widest mb-1">
                    Chart
                  </div>
                  <div className="font-mono text-sm text-neutral-400">
                    {currentUnit.parentConfig.chart}
                  </div>
                  <div className="font-mono text-[0.6rem] text-neutral-600 mt-1">
                    step {currentUnit.subIndex}
                  </div>
                </div>
              </div>
            )}

            {/* Content card — right 63% column, matching MapStorySection
                Without chart: full height.  With chart: bottom 50%. */}
            {showContent && currentUnit && (
              <div
                className="absolute right-0 z-10 flex items-center overflow-y-auto"
                style={{
                  width: '63%',
                  top: currentUnit.parentConfig.chart ? '50%' : '0',
                  height: currentUnit.parentConfig.chart ? '50%' : '100%',
                  padding: '2.5rem',
                }}
              >
                <div className="w-full max-w-[820px] mx-auto">
                  <ContentPreview unit={currentUnit} />
                </div>
              </div>
            )}

            {/* Subtle guide line showing the 37% / 63% column split */}
            <div
              className="absolute top-0 bottom-0 z-5 pointer-events-none"
              style={{
                left: '37%',
                width: '1px',
                background: 'rgba(255,255,255,0.06)',
              }}
            />
          </>
        )}

        {/* ── Mobile ── */}
        {viewMode === 'mobile' && (
          <div className="w-full h-full flex items-center justify-center bg-neutral-900/50">
            <div
              className="rounded-[2.5rem] border-4 border-neutral-700 overflow-hidden shadow-2xl relative"
              style={{
                width: MOBILE_SIZE.width * 0.85,
                height: MOBILE_SIZE.height * 0.85,
              }}
            >
              <InteractiveMap
                state={mapState}
                onMove={handleMapMove}
                containerStyle={{ width: '100%', height: '100%' }}
              />
              {/* Mobile content overlay — bottom-center like the real story */}
              {showContent && currentUnit && (
                <div className="absolute bottom-4 left-3 right-3 z-10">
                  <ContentPreview unit={currentUnit} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Share ── */}
        {viewMode === 'share' && (
          <div className="w-full h-full flex items-center justify-center bg-neutral-900/50">
            <div className="relative">
              <SharePreview
                state={mapState}
                accessToken={accessToken}
                aspect={shareAspect}
              />
              {showContent && currentUnit && (
                <div className="absolute bottom-4 left-4 right-4 z-10">
                  <ContentPreview unit={currentUnit} />
                </div>
              )}
            </div>
          </div>
        )}

        {/* Content toggle + unit info bar */}
        <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
          <div className="flex items-center gap-2 pointer-events-auto">
            <button
              onClick={() => setShowContent(!showContent)}
              className={`text-xs px-3 py-1.5 rounded transition-colors ${
                showContent
                  ? 'bg-blue-600/80 text-white'
                  : 'bg-neutral-800/80 text-neutral-400 hover:bg-neutral-700/80'
              }`}
            >
              {showContent ? 'Hide Content' : 'Show Content'}
            </button>
            {currentUnit && (
              <span className="text-xs text-neutral-500 bg-neutral-900/60 px-2 py-1 rounded">
                {currentUnit.parentConfig.kind !== 'text' && (
                  <span className="text-blue-400/80 mr-1">
                    [{currentUnit.parentConfig.kind}]
                  </span>
                )}
                {currentUnit.parentConfig.chart && (
                  <span className="text-green-400/80 mr-1">
                    chart:{currentUnit.parentConfig.chart}
                  </span>
                )}
                {currentUnit.parentConfig.id && (
                  <span className="text-neutral-400">
                    id:{currentUnit.parentConfig.id}
                  </span>
                )}
              </span>
            )}
          </div>
          <span className="text-xs text-neutral-500 bg-neutral-900/60 px-2 py-1 rounded">
            {selectedUnitIdx + 1} / {currentUnits.length}
          </span>
        </div>
      </div>
    </div>
  )
}
