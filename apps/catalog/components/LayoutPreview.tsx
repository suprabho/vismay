import type { CSSProperties } from 'react'

/**
 * Schematic preview of a foreground layout's regions. Each region's CSS box
 * (`vw`/`vh`/`px`/`%`/`inset`) is converted to a percentage of a nominal
 * viewport and drawn as a labeled, colored box inside an aspect-ratio frame.
 * Pure presentational — no live story render, so it works as a static page.
 */

type RegionMap = Record<string, { style: CSSProperties; accepts?: readonly string[] }>

const COLORS = ['#818cf8', '#34d399', '#fbbf24', '#f472b6', '#38bdf8', '#fb7185', '#a78bfa']

// Per-unit conversion: vw → % of width, vh → % of height, px → % of that axis,
// % → as-is. `w`/`h` are the nominal viewport px dimensions.
function conv(val: CSSProperties['top'], wOrH: 'w' | 'h', w: number, h: number): string | undefined {
  if (val == null) return undefined
  if (typeof val === 'number') return `${(val / (wOrH === 'w' ? w : h)) * 100}%`
  const s = String(val).trim()
  const n = parseFloat(s)
  if (Number.isNaN(n)) return undefined
  if (s.endsWith('%')) return `${n}%`
  if (s.endsWith('vw')) return `${(n * w) / (wOrH === 'w' ? w : h)}%`
  if (s.endsWith('vh')) return `${(n * h) / (wOrH === 'w' ? w : h)}%`
  if (s.endsWith('px')) return `${(n / (wOrH === 'w' ? w : h)) * 100}%`
  return `${n}%`
}

function toBox(style: CSSProperties, w: number, h: number): CSSProperties {
  if (style.inset != null) return { position: 'absolute', inset: 0 }
  return {
    position: 'absolute',
    top: conv(style.top, 'h', w, h),
    bottom: conv(style.bottom, 'h', w, h),
    height: conv(style.height, 'h', w, h),
    left: conv(style.left, 'w', w, h),
    right: conv(style.right, 'w', w, h),
    width: conv(style.width, 'w', w, h),
  }
}

export default function LayoutPreview({
  regions,
  hideDefault = true,
  portrait = false,
}: {
  regions: RegionMap
  hideDefault?: boolean
  portrait?: boolean
}) {
  const w = portrait ? 390 : 1280
  const h = portrait ? 844 : 720
  const all = Object.entries(regions)
  const named = all.filter(([k]) => k !== 'default')
  // Show named regions when present; otherwise fall back to the single `default`.
  const shown = hideDefault && named.length ? named : all

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: portrait ? '9 / 16' : '16 / 9',
        background: 'var(--color-bg, #0b0d12)',
        border: '1px solid var(--color-line, #1f2330)',
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {shown.map(([name, def], i) => {
        const c = COLORS[i % COLORS.length]
        return (
          <div
            key={name}
            style={{
              ...toBox(def.style, w, h),
              border: `1px solid ${c}`,
              background: `${c}1f`,
              borderRadius: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: 2,
            }}
          >
            <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10, lineHeight: 1.2, color: c }}>
              {name}
            </span>
          </div>
        )
      })}
    </div>
  )
}
