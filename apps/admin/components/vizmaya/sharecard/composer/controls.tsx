'use client'

import type { ReactNode } from 'react'
import { ScrubField } from '@vismay/viz-admin'
import type { Transform } from '../layers/types'
import { DEFAULT_GRAPHIC_HEIGHT_PCT } from '../layers/types'

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

/** Color picker: theme swatches (concrete hex) + a custom color input. Stored
 *  as concrete hex so the html-to-image clone never sees an unresolved var(). */
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

/** Position / size / rotation / opacity for a freely-placed layer, as the same
 *  compact grid of scrubbable fields the footshorts composer uses (drag a label
 *  to scrub, or type). Position is drag-on-canvas primarily; these cover fine
 *  control + keyboard a11y. `showHeight` adds a Height field for box-sized
 *  graphics (chart / map / box image). */
export function TransformControls({
  transform,
  onChange,
  showHeight = false,
}: {
  transform: Transform
  onChange: (patch: Partial<Transform>) => void
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

/** Titled, divider-separated inspector section (Figma-style dense grouping),
 *  matching the footshorts composer's right-hand ConfigPanel. */
export function InspectorSection({ title, children, last }: { title: string; children: ReactNode; last?: boolean }) {
  return (
    <section className={`px-1 py-2.5 ${last ? '' : 'border-b border-white/10'}`}>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{title}</p>
      {children}
    </section>
  )
}
