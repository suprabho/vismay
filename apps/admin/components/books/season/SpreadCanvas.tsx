'use client'

import { seasonLabel, wordCount } from '@/lib/seasonBooks/plan'
import {
  competitionCode, SERIES_GOLD, SPREAD_MODULES, type BookSpread, type PaletteRole, type PlannedSpread, type SpreadModule,
} from '@/lib/seasonBooks/seasonSpreads'

/**
 * The spread canvas of the season-spreads templates: 1190 × 842 pt, fold at
 * x 595, margins 40, content x 40–555 and 625–1150, footer rule y 790. An RGB
 * design proof, no bleed. (The builder's `SPREAD_CANVAS` export, until
 * system.ts v2 lands.)
 */
export const CANVAS = {
  width: 1190,
  height: 842,
  fold: 595,
  margin: 40,
  pages: [{ x0: 40, x1: 555 }, { x0: 625, x1: 1150 }] as const,
  footerRule: 790,
  /** Nothing meaningful within this of the fold. */
  foldGap: 40,
} as const

/** Stand-in grounds until club and competition palettes are derived from kit colours and marks. */
const DEFAULT_PALETTE: Record<PaletteRole, string> = {
  page1Ground: '#1F2A44',
  page2Ground: '#17203A',
  accent: '#D7372B',
  eliminationCard: '#3A2E3C',
  highlight: SERIES_GOLD,
  text: '#FFFFFF',
  draw: '#9AA3B2',
  grid: '#33405C',
  card: '#273556',
}

export function spreadPalette(row: BookSpread | null): Record<PaletteRole, string> {
  return { ...DEFAULT_PALETTE, ...(row?.palette ?? {}) }
}

/** The modules a template stacks on each page, in order, after the shared page-1 frame. */
function stacked(kind: BookSpread['kind'], page: 1 | 2): SpreadModule[] {
  return SPREAD_MODULES[kind].filter(m => m.page === page && !['identity', 'story-stat', 'season-record'].includes(m.id))
}

function breakLines(text: string, perLine: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    if (!line) line = w
    else if (line.length + 1 + w.length <= perLine) line += ` ${w}`
    else { lines.push(line); line = w }
  }
  if (line) lines.push(line)
  return lines
}

/**
 * A spread as the builder will lay it out: the shared page-1 frame (kicker,
 * two-line headline at 55 pt, mark, story stat at 53 pt, story copy, season
 * record, footer) and each template's modules stacked in their page column.
 * Every module carries `data-module`; clicking one opens the tab that drives
 * it. Until the data packs and the render pipeline land, chart modules are
 * labelled blocks: the editorial fields are real, the charts are not.
 */
export function SpreadCanvas({ spread, row, seasonStart, onModule, className = '', compact = false, activeModule }: {
  spread: PlannedSpread
  row: BookSpread
  seasonStart: number
  onModule?: (module: SpreadModule) => void
  className?: string
  /** Thumbnail: no copy, just the blocks. */
  compact?: boolean
  activeModule?: string | null
}) {
  const p = spreadPalette(row)
  const e = row.editorial
  const code = spread.kind === 'team' ? spread.subjectId.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() : competitionCode(spread.subjectId)
  const headline = breakLines((e.headline || (compact ? '' : 'Headline, two lines at 55 pt')).toUpperCase(), 15).slice(0, 3)
  const story = breakLines(e.story || (compact ? '' : 'Story copy, at most thirty words, set under the stat.'), 58).slice(0, 4)
  const kicker = spread.kind === 'team' ? `${spread.subjectId} · ${seasonLabel(seasonStart)}` : `${spread.subjectId} · ${seasonLabel(seasonStart)}`
  const modules1 = stacked(spread.kind, 1)
  const modules2 = stacked(spread.kind, 2)
  const enabled = (m: SpreadModule) => row.modules[m.id]?.enabled ?? true
  const [pg1, pg2] = CANVAS.pages
  const frameBottom = 420
  const gap = 16
  const block = (modules: SpreadModule[], x0: number, x1: number, y0: number, y1: number) => {
    const on = modules.filter(enabled)
    const h = on.length ? (y1 - y0 - gap * (on.length - 1)) / on.length : 0
    return on.map((m, i) => ({ m, x: x0, y: y0 + i * (h + gap), w: x1 - x0, h }))
  }
  const blocks = [
    ...block(modules1, pg1.x0, pg1.x1, frameBottom, CANVAS.footerRule - 24),
    ...block(modules2, pg2.x0, pg2.x1, CANVAS.margin, CANVAS.footerRule - 24),
  ]
  const nudge = (id: string) => row.modules[id]?.nudge ?? { dx: 0, dy: 0 }

  return (
    <svg viewBox={`0 0 ${CANVAS.width} ${CANVAS.height}`} className={className} role="img" aria-label={`${spread.label} spread`}
      style={{ fontFamily: 'Archivo, "Archivo Variable", system-ui, sans-serif' }}>
      <rect x={0} y={0} width={CANVAS.fold} height={CANVAS.height} fill={p.page1Ground} />
      <rect x={CANVAS.fold} y={0} width={CANVAS.fold} height={CANVAS.height} fill={p.page2Ground} />
      <line x1={CANVAS.fold} y1={0} x2={CANVAS.fold} y2={CANVAS.height} stroke={p.grid} strokeWidth={1} strokeDasharray="4 4" />

      {/* Page-1 frame: kicker, headline, mark, story stat, story copy, season record. */}
      <g data-module="identity" onClick={() => onModule?.(SPREAD_MODULES[spread.kind][0])} style={{ cursor: onModule ? 'pointer' : undefined }}>
        <text x={pg1.x0} y={CANVAS.margin + 12} fontSize={10} fontWeight={700} fill={p.highlight} letterSpacing={1.2}>{kicker.toUpperCase()}</text>
        {headline.map((line, i) => (
          <text key={i} x={pg1.x0} y={CANVAS.margin + 72 + i * 58} fontSize={55} fontWeight={800} fill={p.text} letterSpacing={-0.5}>{line}</text>
        ))}
        {!compact && headline.length > 2 && <text x={pg1.x0} y={CANVAS.margin + 72 + 3 * 58 - 40} fontSize={9} fill={p.accent}>Third line: the headline needs cutting</text>}
        <g transform={`translate(470 ${CANVAS.margin})`}>
          <rect width={64} height={64} rx={spread.kind === 'team' ? 32 : 6} fill={p.card} stroke={p.highlight} strokeWidth={1.5} />
          <text x={32} y={40} fontSize={18} fontWeight={800} fill={p.text} textAnchor="middle">{code}</text>
        </g>
        {activeModule === 'identity' && <rect x={pg1.x0 - 6} y={CANVAS.margin - 6} width={pg1.x1 - pg1.x0 + 12} height={170} fill="none" stroke={p.highlight} strokeWidth={2} strokeDasharray="6 4" />}
      </g>
      <g data-module="story-stat" onClick={() => onModule?.(SPREAD_MODULES[spread.kind].find(m => m.id === 'story-stat') ?? SPREAD_MODULES[spread.kind][0])} style={{ cursor: onModule ? 'pointer' : undefined }}>
        <text x={pg1.x0} y={270} fontSize={53} fontWeight={800} fill={p.highlight}>{e.storyStat.value || (compact ? '' : '00')}</text>
        <text x={pg1.x0} y={292} fontSize={11} fontWeight={700} fill={p.text} opacity={0.9}>{(e.storyStat.label || (compact ? '' : 'Story statistic label')).toUpperCase()}</text>
        {story.map((line, i) => <text key={i} x={pg1.x0} y={318 + i * 17} fontSize={12} fill={p.text} opacity={0.85}>{line}</text>)}
        {activeModule === 'story-stat' && <rect x={pg1.x0 - 6} y={222} width={pg1.x1 - pg1.x0 + 12} height={170} fill="none" stroke={p.highlight} strokeWidth={2} strokeDasharray="6 4" />}
      </g>
      <g data-module="season-record">
        <line x1={pg1.x0} y1={frameBottom - 22} x2={pg1.x1} y2={frameBottom - 22} stroke={p.grid} strokeWidth={1} />
        {['Games', 'Goals', 'W-D-L', 'Finish'].map((k, i) => (
          <g key={k} transform={`translate(${pg1.x0 + i * 128} ${frameBottom - 16})`}>
            <text y={0} fontSize={8} fontWeight={700} fill={p.draw} letterSpacing={1}>{k.toUpperCase()}</text>
            <text y={-26} fontSize={25} fontWeight={800} fill={p.text} opacity={0.35}>—</text>
          </g>
        ))}
      </g>

      {/* The template's modules, stacked in their page column. */}
      {blocks.map(({ m, x, y, w, h }) => {
        const n = nudge(m.id)
        const active = activeModule === m.id
        const note = e.notes[m.id]
        return (
          <g key={m.id} data-module={m.id} transform={`translate(${x + n.dx} ${y + n.dy})`} onClick={() => onModule?.(m)} style={{ cursor: onModule ? 'pointer' : undefined }}>
            <rect width={w} height={h} rx={4} fill={p.card} opacity={0.55} stroke={active ? p.highlight : p.grid} strokeWidth={active ? 2 : 1} strokeDasharray={active ? '6 4' : undefined} />
            <text x={10} y={16} fontSize={8.5} fontWeight={700} fill={p.highlight} letterSpacing={1}>{m.label.toUpperCase()}</text>
            {!compact && <text x={10} y={30} fontSize={8} fill={p.draw}>{m.data} · awaits the data pack</text>}
            {!compact && m.id === 'key-moments' && e.moments.slice(0, 4).map((mo, i) => (
              <text key={i} x={10} y={48 + i * 14} fontSize={9} fill={p.text} opacity={0.9}>{mo.date} · {mo.text.slice(0, 70)}</text>
            ))}
            {!compact && m.id === 'oddities' && (row.competition?.oddities ?? []).slice(0, 6).map((o, i) => (
              <text key={i} x={10} y={48 + i * 14} fontSize={9} fill={p.text} opacity={0.9}>{o.text.slice(0, 80)}</text>
            ))}
            {!compact && m.id === 'coach' && row.team?.coach.name && <text x={10} y={48} fontSize={12} fontWeight={700} fill={p.text}>{row.team.coach.name}</text>}
            {!compact && m.id === 'players' && (row.league?.awards ?? []).slice(0, 6).map((a, i) => (
              <text key={i} x={10} y={48 + i * 14} fontSize={9} fill={p.text} opacity={0.9}>{a.name}</text>
            ))}
            {!compact && note && <text x={10} y={h - 10} fontSize={8} fill={p.text} opacity={0.7}>{note.slice(0, 90)}{wordCount(note) > 14 ? '…' : ''}</text>}
          </g>
        )
      })}

      {/* Footer: running line, sources, marks note. */}
      <line x1={pg1.x0} y1={CANVAS.footerRule} x2={pg1.x1} y2={CANVAS.footerRule} stroke={p.grid} strokeWidth={1} />
      <line x1={pg2.x0} y1={CANVAS.footerRule} x2={pg2.x1} y2={CANVAS.footerRule} stroke={p.grid} strokeWidth={1} />
      <text x={pg1.x0} y={CANVAS.footerRule + 16} fontSize={8} fill={p.draw} letterSpacing={1}>{`${seasonLabel(seasonStart)} · ${spread.partLabel}`.toUpperCase()}</text>
      <text x={pg2.x1} y={CANVAS.footerRule + 16} fontSize={8} fill={p.draw} textAnchor="end">{row.pack ? `pack ${row.pack.hash.slice(0, 8)}` : 'Sources: from the data pack, when built'}</text>
    </svg>
  )
}
