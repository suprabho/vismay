'use client'

import type { ComposeFormat } from '@vismay/content-source/composeState'

/**
 * A schematic wireframe of a planned deck layout — the "what will this section
 * look like" demo shown BEFORE materialising. Region rectangles mirror the real
 * `foregroundLayouts` arrangement (percent-of-frame), tinted by slot type. A map
 * section or an unknown layout falls back to a single full/centred box.
 */
type PreviewRegion = { label: string; type: string; x: number; y: number; w: number; h: number }

const LAYOUT_REGIONS: Record<string, PreviewRegion[]> = {
  'stat-left-chart-right': [
    { label: 'stat', type: 'stat', x: 4, y: 8, w: 34, h: 84 },
    { label: 'chart', type: 'chart', x: 42, y: 8, w: 54, h: 84 },
  ],
  'text-left-chart-right': [
    { label: 'text', type: 'text', x: 4, y: 8, w: 38, h: 84 },
    { label: 'chart', type: 'chart', x: 46, y: 8, w: 50, h: 84 },
  ],
  'text-left-quote-right': [
    { label: 'text', type: 'text', x: 4, y: 8, w: 42, h: 84 },
    { label: 'quote', type: 'quote', x: 50, y: 8, w: 46, h: 84 },
  ],
  'image-left-text-right': [
    { label: 'image', type: 'image', x: 4, y: 8, w: 46, h: 84 },
    { label: 'text', type: 'text', x: 54, y: 8, w: 42, h: 84 },
  ],
  'stat-top-chart-below': [
    { label: 'stat', type: 'stat', x: 6, y: 8, w: 88, h: 28 },
    { label: 'chart', type: 'chart', x: 6, y: 40, w: 88, h: 52 },
  ],
  'chart-top-text-below': [
    { label: 'chart', type: 'chart', x: 6, y: 8, w: 88, h: 46 },
    { label: 'text', type: 'text', x: 6, y: 58, w: 88, h: 34 },
  ],
  centered: [{ label: 'content', type: 'text', x: 20, y: 22, w: 60, h: 56 }],
  'hero-full-bleed': [{ label: 'hero', type: 'hero', x: 4, y: 8, w: 92, h: 84 }],
}

const REGION_TINT: Record<string, string> = {
  stat: 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300',
  chart: 'border-sky-400/40 bg-sky-400/10 text-sky-300',
  text: 'border-neutral-400/30 bg-white/5 text-neutral-300',
  quote: 'border-amber-400/40 bg-amber-400/10 text-amber-300',
  image: 'border-violet-400/40 bg-violet-400/10 text-violet-300',
  hero: 'border-fuchsia-400/40 bg-fuchsia-400/10 text-fuchsia-200',
  map: 'border-teal-400/40 bg-teal-400/10 text-teal-200',
}

const FALLBACK_REGION: PreviewRegion = { label: 'content', type: 'text', x: 8, y: 12, w: 84, h: 76 }

function regionsFor(layout: string | undefined, format: ComposeFormat): PreviewRegion[] {
  if (format === 'map') return [{ label: 'map', type: 'map', x: 2, y: 2, w: 96, h: 96 }]
  return (layout ? LAYOUT_REGIONS[layout] : undefined) ?? [FALLBACK_REGION]
}

export function LayoutPreview({ layout, format }: { layout?: string; format: ComposeFormat }) {
  const regions = regionsFor(layout, format)
  return (
    <div
      className="relative w-full overflow-hidden rounded-md border border-white/10 bg-neutral-950"
      style={{ paddingTop: '56.25%' }}
      title={layout ? `Layout: ${layout}` : 'Planned layout'}
    >
      {regions.map((r, i) => (
        <div
          key={i}
          className={`absolute flex items-center justify-center rounded-sm border ${
            REGION_TINT[r.type] ?? REGION_TINT.text
          }`}
          style={{ left: `${r.x}%`, top: `${r.y}%`, width: `${r.w}%`, height: `${r.h}%` }}
        >
          <span className="rounded-sm bg-neutral-950/60 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide">
            {r.label}
          </span>
        </div>
      ))}
    </div>
  )
}

/**
 * A one-line key for the wireframe tints — built from the slot types the given
 * layouts actually use, so a deck draft only legends its own regions.
 */
export function LayoutLegend({
  layouts,
  format,
}: {
  layouts: Array<string | undefined>
  format: ComposeFormat
}) {
  const types =
    format === 'map'
      ? ['map']
      : [...new Set(layouts.flatMap((l) => regionsFor(l, format).map((r) => r.type)))]
  if (types.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {types.map((t) => (
        <span
          key={t}
          className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wide text-neutral-500"
        >
          <span className={`h-2 w-2 rounded-[3px] border ${REGION_TINT[t] ?? REGION_TINT.text}`} />
          {t}
        </span>
      ))}
    </div>
  )
}

/**
 * A live thumbnail of a MATERIALISED section — the signed canvas-frame render
 * the canvas itself uses, scaled down (rendered at 4× the box then scaled to
 * fit, so the section sees a desktop-ish viewport). Static (pointer-events off);
 * the corner link opens the full render.
 */
export function SectionFrame({ src, title }: { src: string; title: string }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-md border border-white/10 bg-neutral-950"
      style={{ paddingTop: '56.25%' }}
    >
      <iframe
        src={src}
        title={title}
        loading="lazy"
        className="absolute left-0 top-0 origin-top-left"
        style={{ width: '400%', height: '400%', transform: 'scale(0.25)', border: 0, pointerEvents: 'none' }}
      />
      <a
        href={src}
        target="_blank"
        rel="noreferrer"
        className="absolute right-1 top-1 rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-neutral-200 hover:bg-black/80"
        title="Open the full render"
      >
        open ↗
      </a>
    </div>
  )
}
