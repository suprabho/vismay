/**
 * The season-book series design system, locked in code.
 *
 * Every book in the series (one season per book, one month per chapter) is set
 * on this grid, type scale, palette and chart style, from these spread
 * templates. That sameness is what makes 20+ books feel collectible and keeps
 * production sane, so it changes through code review, never per book: bump
 * SYSTEM_VERSION when it does and say in the commit what moved.
 *
 * Pure data, imported by the admin planner (Flatplan, Cards, Chapters, System
 * views) on the client and the plan validator on the server.
 */

export const SYSTEM_VERSION = 1

/** Trim and grid, in millimetres. A spread is two pages side by side. */
export const PAGE = {
  widthMm: 210,
  heightMm: 270,
  spreadWidthMm: 420,
  margins: { topMm: 15, bottomMm: 20, outerMm: 15, innerMm: 18 },
  /** Columns across the whole spread (6 per page). */
  columns: 12,
  /** Rows down the page; templates place blocks on this 12 × 8 grid. */
  rows: 8,
  gutterMm: 4,
  baselineMm: 4,
  bleedMm: 3,
} as const

export type TypeRole = 'display' | 'headline' | 'deck' | 'body' | 'stat' | 'caption' | 'label'

export interface TypeStyle {
  role: TypeRole
  label: string
  face: 'Headline' | 'Text' | 'Numerals'
  sizePt: number
  leadingPt: number
  weight: number
  tracking?: string
  caps?: boolean
  use: string
}

/** One modular scale (≈1.25) on a 4mm baseline. Faces are roles, not fonts: the series picks one family per role. */
export const TYPE_SCALE: readonly TypeStyle[] = [
  { role: 'display', label: 'Display', face: 'Numerals', sizePt: 96, leadingPt: 88, weight: 800, use: 'Cover season, breather numbers' },
  { role: 'headline', label: 'Headline', face: 'Headline', sizePt: 34, leadingPt: 38, weight: 700, use: 'The claim: one per spread' },
  { role: 'stat', label: 'Stat', face: 'Numerals', sizePt: 54, leadingPt: 54, weight: 700, use: 'The one supporting number' },
  { role: 'deck', label: 'Deck', face: 'Text', sizePt: 16, leadingPt: 21, weight: 500, use: 'Stat label, intro standfirst' },
  { role: 'body', label: 'Body', face: 'Text', sizePt: 9.5, leadingPt: 13.5, weight: 400, use: '80–150 words, never more' },
  { role: 'caption', label: 'Caption', face: 'Text', sizePt: 7.5, leadingPt: 10, weight: 400, use: 'What the chart shows, how to read it' },
  { role: 'label', label: 'Label', face: 'Text', sizePt: 6.5, leadingPt: 8, weight: 600, tracking: '0.08em', caps: true, use: 'Kickers, axis labels, sources, folios' },
]

export const PALETTE = {
  paper: '#F4F1EA',
  ink: '#141414',
  muted: '#8A8780',
  rule: '#CFCAC0',
  accent: '#D7372B',
  second: '#1F5AA6',
  draw: '#B5B0A6',
} as const

export interface ChartRule {
  label: string
  value: string
}

/** How every chart in the series is drawn. */
export const CHART_STYLE: readonly ChartRule[] = [
  { label: 'Highlight', value: 'At most two coloured series: accent, then second. Everything else is context in muted.' },
  { label: 'Lines', value: 'Highlight 1.5pt, context 0.75pt, round joins. No markers except the last point.' },
  { label: 'Labels', value: 'Direct labels at the line end or on the bar. No legends.' },
  { label: 'Axes', value: 'One 0.5pt baseline in ink. Light 0.25pt rules only where a reader must read a value across.' },
  { label: 'Numbers', value: 'Tabular numerals, Label style on axes; the chart’s key value may be set in Stat.' },
  { label: 'Results', value: 'Win ink, draw draw-grey, loss accent: the same three everywhere a result appears.' },
  { label: 'Annotation', value: 'A 0.5pt leader and a Caption-style note at the moment that proves the headline.' },
  { label: 'Source', value: 'Every chart ends with a Label-style source line. StatsBomb data carries its credit.' },
]

/** The colour a result is drawn in, everywhere. */
export const RESULT_COLOURS = { W: PALETTE.ink, D: PALETTE.draw, L: PALETTE.accent } as const

/**
 * Where a spread sits in the reading rhythm: hero → dense → breather → repeat.
 * `frame` is the book's cover and season intro, outside the rhythm.
 */
export type SpreadRole = 'hero' | 'dense' | 'breather' | 'frame'

export const ROLE_META: Record<SpreadRole, { label: string; letter: string; className: string; colour: string }> = {
  hero: { label: 'Hero', letter: 'H', className: 'bg-amber-400 text-neutral-950', colour: '#fbbf24' },
  dense: { label: 'Dense data', letter: 'D', className: 'bg-sky-400 text-neutral-950', colour: '#38bdf8' },
  breather: { label: 'Breather', letter: 'B', className: 'bg-emerald-400 text-neutral-950', colour: '#34d399' },
  frame: { label: 'Frame', letter: 'F', className: 'bg-neutral-400 text-neutral-950', colour: '#a3a3a3' },
}

export type ChartForm =
  | 'line-race' | 'bar' | 'slope' | 'strip' | 'scatter' | 'small-multiples'
  | 'pitch' | 'timeline' | 'table' | 'heat-table' | 'big-number' | 'image'

export const CHART_FORMS: Record<ChartForm, { label: string; reads: string }> = {
  'line-race': { label: 'Line race', reads: 'who was ahead, and when it changed' },
  bar: { label: 'Bars', reads: 'how much, ranked' },
  slope: { label: 'Slope', reads: 'before and after, for several teams' },
  strip: { label: 'Results strip', reads: 'a run of results, game by game' },
  scatter: { label: 'Scatter', reads: 'two measures, every team or player' },
  'small-multiples': { label: 'Small multiples', reads: 'the same chart for each team, side by side' },
  pitch: { label: 'Pitch map', reads: 'where on the pitch (shots, passes, pressing)' },
  timeline: { label: 'Timeline', reads: 'what happened in what order' },
  table: { label: 'Table', reads: 'the standings, or exact values to look up' },
  'heat-table': { label: 'Heat table', reads: 'a grid of values, coloured by size' },
  'big-number': { label: 'Big number', reads: 'one figure, set very large' },
  image: { label: 'Photo-style', reads: 'a picture or illustration, little text' },
}

export type TemplateId = 'cover' | 'intro' | 'hero' | 'comparison' | 'timeline' | 'table' | 'breather'

export type RegionKind = 'kicker' | 'headline' | 'chart' | 'stat' | 'body' | 'caption' | 'image' | 'number' | 'title'

/** A block on the 12 × 8 spread grid: x/w in columns (page break at 6), y/h in rows. */
export interface Region {
  kind: RegionKind
  x: number
  y: number
  w: number
  h: number
}

export interface SpreadTemplate {
  id: TemplateId
  label: string
  role: SpreadRole
  description: string
  /** When to reach for it. */
  use: string
  regions: readonly Region[]
  /** Body word budget; the card editor warns outside it. */
  words: { min: number; max: number }
  forms: readonly ChartForm[]
  /** Headline size multiplier for thumbnails (1 = Headline). */
  headlineScale: number
}

export const TEMPLATES: Record<TemplateId, SpreadTemplate> = {
  cover: {
    id: 'cover',
    label: 'Cover',
    role: 'frame',
    description: 'Back cover blurb on the left, the season set as a Display number on the front.',
    use: 'Once, first.',
    regions: [
      { kind: 'body', x: 0.5, y: 4.5, w: 4, h: 2.5 },
      { kind: 'image', x: 6, y: 0, w: 6, h: 8 },
      { kind: 'title', x: 6.5, y: 0.5, w: 5, h: 3 },
      { kind: 'kicker', x: 6.5, y: 7, w: 5, h: 0.5 },
    ],
    words: { min: 0, max: 80 },
    forms: ['image', 'big-number'],
    headlineScale: 1,
  },
  intro: {
    id: 'intro',
    label: 'Season intro',
    role: 'frame',
    description: 'The season’s argument on the left; the whole season at a glance on the right.',
    use: 'Once, after the cover: the chart every later spread zooms into.',
    regions: [
      { kind: 'kicker', x: 0, y: 0, w: 5, h: 0.5 },
      { kind: 'headline', x: 0, y: 0.75, w: 5, h: 2.5 },
      { kind: 'body', x: 0, y: 3.75, w: 4, h: 3.5 },
      { kind: 'chart', x: 6.5, y: 0, w: 5.5, h: 6.75 },
      { kind: 'caption', x: 6.5, y: 7, w: 4, h: 1 },
    ],
    words: { min: 80, max: 150 },
    forms: ['line-race', 'table', 'bar', 'strip', 'small-multiples'],
    headlineScale: 1.15,
  },
  hero: {
    id: 'hero',
    label: 'Hero',
    role: 'hero',
    description: 'One big chart across the gutter; the headline makes the claim it proves.',
    use: 'A month’s biggest beat. Opens each month-chapter.',
    regions: [
      { kind: 'kicker', x: 0, y: 0, w: 4, h: 0.5 },
      { kind: 'headline', x: 0, y: 0.75, w: 4.5, h: 2 },
      { kind: 'stat', x: 0, y: 3, w: 3, h: 1.5 },
      { kind: 'body', x: 0, y: 4.75, w: 3, h: 3.25 },
      { kind: 'chart', x: 3.75, y: 1, w: 8.25, h: 6 },
      { kind: 'caption', x: 8, y: 7.25, w: 4, h: 0.75 },
    ],
    words: { min: 80, max: 150 },
    forms: ['line-race', 'bar', 'slope', 'strip', 'scatter', 'pitch'],
    headlineScale: 1.2,
  },
  comparison: {
    id: 'comparison',
    label: 'Comparison',
    role: 'dense',
    description: 'One visual in two halves, one per page: this team against that, this month against last.',
    use: 'A head-to-head or a before/after.',
    regions: [
      { kind: 'kicker', x: 0, y: 0, w: 5, h: 0.5 },
      { kind: 'headline', x: 0, y: 0.75, w: 7, h: 1.25 },
      { kind: 'chart', x: 0, y: 2.25, w: 12, h: 3.75 },
      { kind: 'stat', x: 0, y: 6.25, w: 2.5, h: 1.5 },
      { kind: 'body', x: 2.75, y: 6.25, w: 5.25, h: 1.75 },
      { kind: 'caption', x: 8.5, y: 6.25, w: 3.5, h: 1 },
    ],
    words: { min: 80, max: 150 },
    forms: ['small-multiples', 'bar', 'slope', 'line-race', 'pitch', 'scatter'],
    headlineScale: 1,
  },
  timeline: {
    id: 'timeline',
    label: 'Timeline',
    role: 'dense',
    description: 'A horizontal run across both pages: results, events or a lead that changed hands.',
    use: 'A month told in order, or a streak.',
    regions: [
      { kind: 'kicker', x: 0, y: 0, w: 5, h: 0.5 },
      { kind: 'headline', x: 0, y: 0.75, w: 6.5, h: 1.5 },
      { kind: 'chart', x: 0, y: 2.75, w: 12, h: 2.75 },
      { kind: 'body', x: 0, y: 5.75, w: 4.5, h: 2.25 },
      { kind: 'stat', x: 6.5, y: 5.75, w: 2.5, h: 1.5 },
      { kind: 'caption', x: 9.25, y: 5.75, w: 2.75, h: 1 },
    ],
    words: { min: 80, max: 150 },
    forms: ['timeline', 'strip', 'line-race'],
    headlineScale: 1,
  },
  table: {
    id: 'table',
    label: 'Table',
    role: 'dense',
    description: 'The words on the left page, a full-height table or heat table on the right.',
    use: 'Standings at the month’s end, or a ranking to look things up in.',
    regions: [
      { kind: 'kicker', x: 0, y: 0, w: 5, h: 0.5 },
      { kind: 'headline', x: 0, y: 0.75, w: 5, h: 2 },
      { kind: 'stat', x: 0, y: 3, w: 3, h: 1.5 },
      { kind: 'body', x: 0, y: 4.75, w: 4.5, h: 2.5 },
      { kind: 'chart', x: 6.5, y: 0, w: 5.5, h: 7.25 },
      { kind: 'caption', x: 0, y: 7.4, w: 4.5, h: 0.6 },
    ],
    words: { min: 80, max: 150 },
    forms: ['table', 'heat-table'],
    headlineScale: 1,
  },
  breather: {
    id: 'breather',
    label: 'Breather',
    role: 'breather',
    description: 'A photo-style page and a single number: room to turn the page.',
    use: 'After a dense spread. Never two in a row.',
    regions: [
      { kind: 'image', x: 0, y: 0, w: 6, h: 8 },
      { kind: 'number', x: 6.5, y: 1.5, w: 5.5, h: 3 },
      { kind: 'headline', x: 6.5, y: 4.75, w: 5, h: 1.25 },
      { kind: 'caption', x: 6.5, y: 6.5, w: 4, h: 1 },
    ],
    words: { min: 0, max: 60 },
    forms: ['big-number', 'image'],
    headlineScale: 0.7,
  },
}

export const TEMPLATE_ORDER: readonly TemplateId[] = ['cover', 'intro', 'hero', 'comparison', 'timeline', 'table', 'breather']

export function templateRole(id: TemplateId): SpreadRole {
  return TEMPLATES[id].role
}
