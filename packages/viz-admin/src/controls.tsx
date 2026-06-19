'use client'

import { useCallback, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { DEFAULT_GRAPHIC_HEIGHT_PCT, type TransformLike } from './composer/transform'

/**
 * Shared editor control widgets (sliders, color picker, transform panel), hoisted
 * from the vizmaya share-card composer so every surface's config panel uses the
 * same polished controls. Decoupled from vizmaya's layer types via `TransformLike`.
 */

export const labelCls = 'block text-[11px] font-medium text-neutral-400'
export const inputCls =
  'mt-1 w-full rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-neutral-100 outline-none focus:border-white/30'
export const textareaCls = `${inputCls} resize-vertical`
export const selectCls = inputCls

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      {children}
    </label>
  )
}

export function NumberSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  return (
    <label className="block">
      <span className={labelCls}>
        {label} · <span className="text-neutral-300">{format ? format(value) : value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full"
      />
    </label>
  )
}

const FALLBACK_SWATCHES = ['#ffffff', '#0a0e14', '#d85a30', '#e8b13a', '#3a9e8c', '#9aa3ad']

/** Coerce a CSS color to a 6-digit hex for the native color input (which only
 *  accepts #rrggbb): expand 3-digit hex, pass 6-digit through, else white. */
function toHex6(v: string): string {
  const s = v.trim()
  if (/^#[0-9a-f]{6}$/i.test(s)) return s
  const m = /^#([0-9a-f]{3})$/i.exec(s)
  if (m) return `#${m[1].split('').map((c) => c + c).join('')}`
  return '#ffffff'
}

/** Color picker: theme swatches (concrete hex) + a custom color input. Stored as
 *  concrete hex so the html-to-image clone never sees an unresolved var(). */
export function ColorField({
  label,
  value,
  onChange,
  swatches,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
  swatches?: string[]
}) {
  const list = (swatches && swatches.length ? swatches : FALLBACK_SWATCHES).filter(Boolean)
  return (
    <div>
      <span className={labelCls}>{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={toHex6(value)}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 shrink-0 rounded border border-white/10 bg-transparent"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-white/10 bg-neutral-900 px-2 py-1.5 font-mono text-[11px] text-neutral-100 outline-none focus:border-white/30"
        />
      </div>
      {list.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {list.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(c)}
              title={c}
              style={{ background: c }}
              className={`h-5 w-5 rounded border ${toHex6(value).toLowerCase() === toHex6(c).toLowerCase() ? 'border-sky-400' : 'border-white/20'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * A Figma-style scrubbable number field: drag the label left/right to scrub the
 * value, or type into the input. Compact + dense — replaces a bare range slider.
 */
export function ScrubField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  format?: (v: number) => string
}) {
  const [text, setText] = useState<string | null>(null)
  const start = useRef<{ x: number; v: number } | null>(null)

  const clampRound = useCallback(
    (n: number) => {
      const c = Math.min(max, Math.max(min, n))
      return Math.round(Math.round(c / step) * step * 1e6) / 1e6
    },
    [max, min, step],
  )
  const onMove = useCallback(
    (e: PointerEvent) => {
      const s = start.current
      if (!s) return
      onChange(clampRound(s.v + (e.clientX - s.x) * ((max - min) / 220)))
    },
    [clampRound, max, min, onChange],
  )
  const onUp = useCallback(() => {
    start.current = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }, [onMove])
  const startScrub = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault()
      start.current = { x: e.clientX, v: value }
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [onMove, onUp, value],
  )
  const commit = () => {
    if (text == null) return
    const n = parseFloat(text)
    if (Number.isFinite(n)) onChange(clampRound(n))
    setText(null)
  }

  return (
    <div className="flex items-center gap-1 rounded-md border border-white/10 bg-neutral-900 px-1.5 py-1 focus-within:border-white/30">
      <span
        onPointerDown={startScrub}
        title={`${label} — drag to scrub`}
        className="cursor-ew-resize select-none text-[10px] font-semibold uppercase text-neutral-500 hover:text-sky-400"
      >
        {label}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={text ?? (format ? format(value) : String(value))}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
        }}
        className="w-full min-w-0 bg-transparent text-right text-xs text-neutral-100 outline-none"
      />
    </div>
  )
}

/** Position / size / rotation / opacity for a freely-placed layer, as a compact
 *  grid of scrubbable fields (drag the label to scrub, or type). `showHeight`
 *  adds a Height field for box-sized graphics. */
export function TransformControls({
  transform,
  onChange,
  showHeight = false,
}: {
  transform: TransformLike
  onChange: (patch: Partial<TransformLike>) => void
  showHeight?: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      <ScrubField label="X" value={Math.round(transform.xPct)} min={0} max={100} step={1} onChange={(v) => onChange({ xPct: v })} format={(v) => `${v}%`} />
      <ScrubField label="Y" value={Math.round(transform.yPct)} min={0} max={100} step={1} onChange={(v) => onChange({ yPct: v })} format={(v) => `${v}%`} />
      <ScrubField label="W" value={Math.round(transform.widthPct)} min={4} max={100} step={1} onChange={(v) => onChange({ widthPct: v })} format={(v) => `${v}%`} />
      {showHeight ? (
        <ScrubField label="H" value={Math.round(transform.heightPct ?? DEFAULT_GRAPHIC_HEIGHT_PCT)} min={4} max={100} step={1} onChange={(v) => onChange({ heightPct: v })} format={(v) => `${v}%`} />
      ) : (
        <div />
      )}
      <ScrubField label="Rotate" value={Math.round(transform.rotation)} min={-180} max={180} step={1} onChange={(v) => onChange({ rotation: v })} format={(v) => `${v}°`} />
      <ScrubField label="Opacity" value={transform.opacity} min={0} max={1} step={0.05} onChange={(v) => onChange({ opacity: v })} format={(v) => v.toFixed(2)} />
    </div>
  )
}
