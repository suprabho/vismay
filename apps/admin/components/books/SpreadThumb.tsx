'use client'

import { chapterLabel, wordCount, type Spread } from '@/lib/seasonBooks/plan'
import { PAGE, PALETTE, TEMPLATES, type Region, type TemplateId } from '@/lib/seasonBooks/system'
import { ChartGlyph } from './ChartGlyph'
import { DataChart } from './DataChart'
import { SketchView } from './SketchPad'

// Margins as percentages of the spread: the grid's 6 columns per page sit
// inside these, so a thumbnail is the real layout at any size.
const M = PAGE.margins
const TOP = (M.topMm / PAGE.heightMm) * 100
const BOTTOM = (M.bottomMm / PAGE.heightMm) * 100
const OUTER = (M.outerMm / PAGE.spreadWidthMm) * 100
const INNER = (M.innerMm / PAGE.spreadWidthMm) * 100

function xPct(x: number): number {
  const half = PAGE.columns / 2
  if (x <= half) return OUTER + (x / half) * (50 - INNER - OUTER)
  return 50 + INNER + ((x - half) / half) * (50 - INNER - OUTER)
}

function yPct(y: number): number {
  return TOP + (y / PAGE.rows) * (100 - TOP - BOTTOM)
}

function box(r: Region): React.CSSProperties {
  // A full-page image bleeds off the trim.
  if (r.kind === 'image' && r.y === 0 && r.h === PAGE.rows && r.w === PAGE.columns / 2) {
    return { position: 'absolute', left: r.x < PAGE.columns / 2 ? 0 : '50%', width: '50%', top: 0, height: '100%' }
  }
  const left = xPct(r.x)
  // A block ending on the gutter stops at the inner margin; one crossing it runs on.
  const right = xPct(r.x + r.w)
  return { position: 'absolute', left: `${left}%`, width: `${right - left}%`, top: `${yPct(r.y)}%`, height: `${yPct(r.y + r.h) - yPct(r.y)}%` }
}

/** cqw sizes from the type scale: points → mm → % of the 420mm spread. */
const pt = (size: number) => `${((size * 0.3528) / PAGE.spreadWidthMm) * 100}cqw`

export interface ThumbContent {
  spread: Spread | null
  template: TemplateId
  number?: number
  bookTitle?: string
  seasonLabel?: string
}

/**
 * A spread as a low-fidelity layout: the template's blocks on the series grid,
 * filled with the card's words, sketch or data chart. Sized by its container.
 */
export function SpreadThumb({ spread, template, number, bookTitle, seasonLabel, showLabels = false, className = '' }: ThumbContent & { showLabels?: boolean; className?: string }) {
  const t = TEMPLATES[template]
  return (
    <div className={`relative w-full overflow-hidden rounded-[3px] ${className}`}
      style={{ aspectRatio: `${PAGE.spreadWidthMm} / ${PAGE.heightMm}`, background: PALETTE.paper, color: PALETTE.ink, containerType: 'inline-size' }}>
      <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: PALETTE.rule }} />
      <div className="absolute inset-y-0 left-1/2 w-[3%] -translate-x-1/2" style={{ background: 'linear-gradient(90deg, transparent, rgba(0,0,0,0.06), transparent)' }} />
      {t.regions.map((r, i) => (
        <div key={i} style={box(r)} className="overflow-hidden">
          <RegionBlock region={r} spread={spread} template={template} number={number} bookTitle={bookTitle} seasonLabel={seasonLabel} />
          {showLabels && (
            <span className="absolute left-0 top-0 rounded-br px-[0.4cqw] text-white" style={{ background: 'rgba(20,20,20,0.75)', fontSize: 'max(1.1cqw, 8px)' }}>{r.kind}</span>
          )}
        </div>
      ))}
      {number != null && (
        <span className="absolute tabular-nums" style={{ right: `${OUTER}%`, bottom: `${BOTTOM / 3}%`, fontSize: `max(${pt(6.5)}, 6px)`, color: PALETTE.muted }}>{number}</span>
      )}
    </div>
  )
}

function Bars({ lines, className = '' }: { lines: number; className?: string }) {
  return (
    <div className={`flex h-full flex-col gap-[0.45cqw] ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-[0.55cqw] shrink-0 rounded-full" style={{ background: PALETTE.rule, width: i === lines - 1 ? '62%' : '100%' }} />
      ))}
    </div>
  )
}

function RegionBlock({ region, spread, template, number, bookTitle, seasonLabel }: { region: Region } & ThumbContent) {
  const t = TEMPLATES[template]
  switch (region.kind) {
    case 'kicker':
      return (
        <div className="truncate font-semibold uppercase" style={{ fontSize: `max(${pt(6.5)}, 5px)`, letterSpacing: '0.08em', color: PALETTE.accent }}>
          {template === 'cover' ? 'A season in data' : spread ? `${chapterLabel(spread.chapter)}${number ? ` · ${number}` : ''}` : 'Kicker'}
        </div>
      )
    case 'headline': {
      const text = spread?.headline.trim()
      if (!text) return <div className="flex h-full flex-col gap-[0.8cqw]">{[1, 0.7].map((w, i) => <div key={i} className="h-[2.2cqw] rounded-sm" style={{ width: `${w * 100}%`, background: PALETTE.ink, opacity: 0.18 }} />)}</div>
      return <div className="font-bold" style={{ fontSize: pt(34 * t.headlineScale), lineHeight: 1.08, letterSpacing: '-0.01em' }}>{text}</div>
    }
    case 'stat': {
      const value = spread?.stat.value.trim()
      return (
        <div>
          <div className="font-extrabold tabular-nums leading-none" style={{ fontSize: pt(54), color: value ? PALETTE.accent : PALETTE.rule }}>{value || '00'}</div>
          <div className="mt-[0.4cqw] line-clamp-2" style={{ fontSize: `max(${pt(9.5)}, 5px)`, color: PALETTE.muted, lineHeight: 1.25 }}>{spread?.stat.label || ''}</div>
        </div>
      )
    }
    case 'body': {
      const words = spread ? wordCount(spread.body) : 0
      // Body set at 9.5/13.5 on a ~3-column measure runs ~12 words a line.
      const lines = Math.max(words ? Math.ceil(words / 12) : 0, 0)
      if (!lines) return <div className="h-full rounded-sm border border-dashed" style={{ borderColor: PALETTE.rule }} />
      return <Bars lines={Math.min(lines, 18)} />
    }
    case 'caption': {
      const text = spread?.caption.trim()
      if (!text) return <Bars lines={2} className="opacity-70" />
      return <div className="line-clamp-3 italic" style={{ fontSize: `max(${pt(7.5)}, 5px)`, color: PALETTE.muted, lineHeight: 1.3 }}>{text}</div>
    }
    case 'chart': {
      if (!spread) return <ChartGlyph form={t.forms[0]} className="h-full w-full" />
      if (spread.chart.data) return <DataChart binding={spread.chart.data} compact className="h-full w-full" />
      if (spread.chart.sketch.length) return <SketchView strokes={spread.chart.sketch} className="h-full w-full" strokeWidth={3} />
      return <ChartGlyph form={spread.chart.form} className="h-full w-full opacity-60" />
    }
    case 'image':
      return (
        <div className="h-full w-full" style={{ background: `repeating-linear-gradient(135deg, ${PALETTE.rule} 0 1.2cqw, #DCD7CC 1.2cqw 2.4cqw)` }}>
          {spread?.chart.form === 'image' && spread.chart.sketch.length > 0 && <SketchView strokes={spread.chart.sketch} className="h-full w-full" />}
        </div>
      )
    case 'number': {
      const value = spread?.stat.value.trim()
      return (
        <div className="flex h-full flex-col justify-end">
          <div className="font-extrabold tabular-nums leading-[0.85]" style={{ fontSize: pt(96 * 1.6), color: value ? PALETTE.ink : PALETTE.rule }}>{value || '00'}</div>
          {spread?.stat.label && <div className="mt-[0.6cqw] line-clamp-2" style={{ fontSize: pt(16), lineHeight: 1.2 }}>{spread.stat.label}</div>}
        </div>
      )
    }
    case 'title':
      return (
        <div>
          <div className="whitespace-nowrap font-extrabold tabular-nums leading-[0.85]" style={{ fontSize: pt(96), color: PALETTE.ink }}>{seasonLabel ?? '2003–04'}</div>
          <div className="mt-[1cqw] font-bold" style={{ fontSize: pt(20), lineHeight: 1.1 }}>{spread?.headline.trim() || bookTitle || 'Book title'}</div>
        </div>
      )
  }
}
