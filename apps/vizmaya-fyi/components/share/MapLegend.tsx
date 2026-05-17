'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { MapPinConfig } from '@vismay/viz-engine'
import type { MapRegionLayer, MapLegendConfig } from '@vismay/viz-engine'

interface Props {
  regions?: MapRegionLayer
  pins?: MapPinConfig[]
  /** Per-card override; takes precedence over `regions.legend`. */
  config?: MapLegendConfig
  /** When true, the legend strip is squeezed into the left ~1/3 of the
   *  card instead of spanning full width. Used at 4:3 map-title to share a
   *  column with the caption panel. */
  leftColumn?: boolean
}

/**
 * Every position is a full-width strip — `position` only chooses the vertical
 * edge. Side gutters are uniform (12px); `bottom` sits above the branding row
 * (~12px tall at bottom: 12). The four corner names are retained as aliases
 * so existing yaml keeps working; horizontal alignment is handled inside the
 * legend (text-align on the title and label rows) for those.
 */
const POSITION_STYLES: Record<
  NonNullable<MapLegendConfig['position']>,
  React.CSSProperties
> = {
  'top-left': { top: 12, left: 12, right: 12 },
  'top-right': { top: 12, left: 12, right: 12 },
  'bottom-left': { bottom: 24, left: 12, right: 12 },
  'bottom-right': { bottom: 24, left: 12, right: 12 },
  top: { top: 12, left: 12, right: 12 },
  bottom: { bottom: 24, left: 12, right: 12 },
}

/** Pill ramp for corner placements. Full-width placements stretch via 100% width. */
const RAMP_WIDTH = 156
const RAMP_HEIGHT = 10

/**
 * Small overlay legend rendered on share cards above the map. Auto-picks
 * between a continuous color ramp (when a regions layer is present) and a
 * discrete category swatch row (when only pins are present, with distinct
 * colors).
 *
 * Colors are resolved at runtime against the legend's own DOM ancestor so
 * theme tokens ($teal etc.) become concrete hex values before render — this
 * is what html-to-image captures when the card is exported, and CSS gradients
 * containing unresolved `var()` references serialize unreliably in clones.
 */
export default function MapLegend({ regions, pins, config, leftColumn = false }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const rawColors = useMemo(() => {
    if (regions?.colors && regions.colors.length >= 2) return regions.colors
    return null
  }, [regions])
  const rawPinColors = useMemo(() => pins?.map((p) => p.color ?? '$accent') ?? [], [pins])
  const resolvedRegionColors = useResolvedColors(rootRef, rawColors)
  const resolvedPinColors = useResolvedColors(rootRef, rawPinColors)

  const ramp = useRegionRamp(regions, resolvedRegionColors)
  const categories = usePinCategories(pins, resolvedPinColors)

  const merged: MapLegendConfig = {
    show: true,
    position: 'bottom-left',
    ...(regions?.legend ?? {}),
    ...(config ?? {}),
  }

  if (!merged.show) return null
  if (!ramp && !categories) return null

  const position = merged.position ?? 'bottom-left'
  const pos = leftColumn
    ? { ...POSITION_STYLES[position], left: 8, right: '66.67%' }
    : POSITION_STYLES[position]
  // Every position spans the card horizontally now — the SVG ramp and label
  // rows stretch to fill, regardless of which vertical edge was chosen.
  const fullWidth = true

  return (
    <div
      ref={rootRef}
      className="absolute z-5 rounded-md"
      style={{
        ...pos,
        background: 'rgb(var(--color-panel-rgb) / 0.94)',
        border: '0.5px solid var(--color-line)',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.2)',
        backdropFilter: 'blur(2px)',
        padding: '8px 10px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--color-text)',
        ...(fullWidth ? {} : { maxWidth: 220 }),
      }}
    >
      {merged.title && (
        <div
          className="uppercase tracking-[0.12em]"
          style={{
            fontSize: 8.5,
            lineHeight: 1.3,
            marginBottom: 5,
            color: 'var(--color-muted)',
            fontWeight: 600,
          }}
        >
          {merged.title}
        </div>
      )}

      {ramp ? (
        <RampLegend ramp={ramp} config={merged} fullWidth={fullWidth} />
      ) : categories ? (
        <CategoryLegend items={categories} />
      ) : null}
    </div>
  )
}

/* ─── Region ramp ───────────────────────────────────────────────── */

interface ResolvedRamp {
  colors: string[]
  stops: number[]
}

function useRegionRamp(
  regions: MapRegionLayer | undefined,
  resolvedColors: string[] | null
): ResolvedRamp | null {
  return useMemo(() => {
    if (!regions || !resolvedColors || resolvedColors.length < 2) return null

    let stops: number[]
    if (regions.ramp && regions.ramp.length === resolvedColors.length) {
      stops = regions.ramp
    } else {
      let min = Infinity
      let max = -Infinity
      for (const item of regions.items) {
        if (typeof item.value === 'number') {
          if (item.value < min) min = item.value
          if (item.value > max) max = item.value
        }
      }
      if (!isFinite(min)) return { colors: resolvedColors, stops: [] }
      if (min === max) max = min + 1
      const n = resolvedColors.length
      stops = Array.from(
        { length: n },
        (_, i) => min + ((max - min) * i) / (n - 1)
      )
    }
    return { colors: resolvedColors, stops }
  }, [regions, resolvedColors])
}

function RampLegend({
  ramp,
  config,
  fullWidth,
}: {
  ramp: ResolvedRamp
  config: MapLegendConfig
  fullWidth: boolean
}) {
  const { colors, stops } = ramp
  const tickCount = config.ticks ?? colors.length
  const decimals = config.valueDecimals ?? 0
  const prefix = config.valuePrefix ?? ''
  const suffix = config.valueSuffix ?? ''
  const gradientId = useMemo(
    () => `mlg-${Math.random().toString(36).slice(2, 9)}`,
    []
  )

  const ticks = useMemo(() => {
    if (stops.length === 0) return []
    if (tickCount <= 1) return [stops[0]]
    const min = stops[0]
    const max = stops[stops.length - 1]
    return Array.from(
      { length: tickCount },
      (_, i) => min + ((max - min) * i) / (tickCount - 1)
    )
  }, [stops, tickCount])

  // Full-width: SVG stretches via percentage with preserveAspectRatio="none",
  // and label rows fill their parent. Corner pill: fixed RAMP_WIDTH.
  const rowWidth: React.CSSProperties = fullWidth ? { width: '100%' } : { width: RAMP_WIDTH }
  const svgWidth = fullWidth ? '100%' : RAMP_WIDTH

  return (
    <div style={fullWidth ? { width: '100%' } : undefined}>
      {(config.lowLabel || config.highLabel) && (
        <div
          className="flex items-center justify-between"
          style={{
            fontSize: 8.5,
            color: 'var(--color-muted)',
            marginBottom: 3,
            fontWeight: 500,
            ...rowWidth,
          }}
        >
          <span>{config.lowLabel ?? ''}</span>
          <span>{config.highLabel ?? ''}</span>
        </div>
      )}
      {/* Wrap the SVG in a div with the border-radius. Inside the SVG, the
          rect fills the full viewBox without rx/ry — preserveAspectRatio=none
          would otherwise stretch rx horizontally and ovalize the corners.
          The wrapper's CSS radius stays a true circle at any width. */}
      <div
        style={{
          width: svgWidth,
          height: RAMP_HEIGHT,
          borderRadius: RAMP_HEIGHT / 2,
          overflow: 'hidden',
          border: '0.5px solid rgba(255, 255, 255, 0.18)',
        }}
      >
        <svg
          width="100%"
          height={RAMP_HEIGHT}
          viewBox={`0 0 ${RAMP_WIDTH} ${RAMP_HEIGHT}`}
          preserveAspectRatio="none"
          style={{ display: 'block' }}
        >
          <defs>
            <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="0%">
              {colors.map((color, i) => (
                <stop
                  key={i}
                  offset={`${(i / (colors.length - 1)) * 100}%`}
                  stopColor={color}
                />
              ))}
            </linearGradient>
          </defs>
          <rect
            x={0}
            y={0}
            width={RAMP_WIDTH}
            height={RAMP_HEIGHT}
            fill={`url(#${gradientId})`}
          />
        </svg>
      </div>
      {ticks.length > 0 && (
        <div
          className="flex justify-between"
          style={{
            fontSize: 8.5,
            color: 'var(--color-text)',
            marginTop: 4,
            lineHeight: 1.1,
            fontWeight: 600,
            ...rowWidth,
          }}
        >
          {ticks.map((t, i) => (
            <span key={i}>
              {prefix}
              {t.toFixed(decimals)}
              {suffix}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ─── Pin categories ────────────────────────────────────────────── */

interface PinCategory {
  color: string
  label: string
}

function usePinCategories(
  pins: MapPinConfig[] | undefined,
  resolvedColors: string[]
): PinCategory[] | null {
  return useMemo(() => {
    if (!pins || pins.length === 0) return null
    const seen = new Map<string, PinCategory>()
    pins.forEach((pin, i) => {
      const color = resolvedColors[i] ?? '#888888'
      const existing = seen.get(color)
      if (!existing) {
        seen.set(color, { color, label: pin.label ?? '' })
      } else if (!existing.label && pin.label) {
        existing.label = pin.label
      }
    })
    const categories = Array.from(seen.values()).filter((c) => c.label)
    if (categories.length < 2) return null
    return categories
  }, [pins, resolvedColors])
}

function CategoryLegend({ items }: { items: PinCategory[] }) {
  return (
    <div className="flex flex-col gap-1">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-1.5" style={{ fontSize: 9 }}>
          <svg width={9} height={9} style={{ display: 'block', flexShrink: 0 }}>
            <circle
              cx={4.5}
              cy={4.5}
              r={4}
              fill={item.color}
              stroke="rgba(255, 255, 255, 0.2)"
              strokeWidth={0.5}
            />
          </svg>
          <span style={{ color: 'var(--color-text)', fontWeight: 500 }}>{item.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ─── Theme-token resolution ────────────────────────────────────── */

/**
 * Resolve theme tokens ("$teal") + raw colors to concrete strings by reading
 * computed CSS vars off the legend's own ref. Done after mount so values come
 * from the ThemeProvider scope (not documentElement, where Tailwind's @theme
 * may store the var as a self-referential `var(...)`). Falls back to the raw
 * token until the ref resolves — html-to-image then captures hex values.
 */
function useResolvedColors(
  ref: React.RefObject<HTMLElement | null>,
  raw: string[] | null
): string[] {
  const [resolved, setResolved] = useState<string[]>(() =>
    raw?.map((v) => (v.startsWith('$') ? `var(--color-${v.slice(1)})` : v)) ?? []
  )
  useEffect(() => {
    if (!raw) {
      setResolved([])
      return
    }
    const el = ref.current
    if (!el) return
    const cs = getComputedStyle(el)
    const out = raw.map((value) => {
      if (!value.startsWith('$')) return value
      const v = cs.getPropertyValue(`--color-${value.slice(1)}`).trim()
      return resolveVarChain(v, cs) || '#888888'
    })
    setResolved(out)
    // raw is recomputed via useMemo so identity-stable as long as content is.
  }, [raw, ref])
  return resolved
}

/**
 * Drill through one level of `var(--name, fallback)` indirection. Tailwind's
 * @theme inline registers `--color-teal: var(--color-teal, #hex)` on :root,
 * but at our element ThemeProvider has overridden `--color-teal` with the
 * concrete hex — so getComputedStyle normally returns the hex directly. The
 * recursive form only surfaces if our element is somehow outside the theme
 * tree; in that case extract the fallback so we still get a real color.
 */
function resolveVarChain(value: string, cs: CSSStyleDeclaration): string {
  if (!value.startsWith('var(')) return value
  // Capture either `var(--name)` or `var(--name, fallback)`.
  const m = value.match(/^var\(\s*(--[\w-]+)(?:\s*,\s*(.+))?\s*\)$/)
  if (!m) return value
  const name = m[1]
  const fallback = m[2]?.trim()
  const next = cs.getPropertyValue(name).trim()
  if (next && next !== value) return resolveVarChain(next, cs)
  return fallback ?? value
}
