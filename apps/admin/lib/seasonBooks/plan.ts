/**
 * A season book's plan: the season's story beats and the flatplan of spreads.
 *
 * Spreads, not pages: each spread is one claim with one visual. A spread's
 * card holds the headline (the claim), the chart that proves it (form, rough
 * sketch, data binding), one supporting stat, 80–150 words and a caption.
 * The flatplan order is the `spreads` array order, kept grouped by chapter
 * (cover, intro, the season's months, outro); a spread's number is its
 * position in the book.
 *
 * Shared by the admin planner (client) and the books API (server validation).
 */
import { z } from 'zod'
import { CHART_FORMS, TEMPLATES, TEMPLATE_ORDER, type ChartForm, type SpreadRole, type TemplateId } from './system'

export const BEAT_KINDS = {
  'title-race': 'Title race swing',
  record: 'Record',
  collapse: 'Collapse',
  streak: 'Streak',
  'turning-point': 'Turning point',
  survival: 'Relegation / survival',
  europe: 'Europe',
  international: 'International',
  people: 'Manager / transfer',
  other: 'Other',
} as const
export type BeatKind = keyof typeof BEAT_KINDS

export const SPREAD_STATUSES = {
  beat: 'Beat only',
  card: 'Card written',
  thumb: 'Thumbnailed',
  data: 'On real data',
  final: 'Polished',
} as const
export type SpreadStatus = keyof typeof SPREAD_STATUSES

export const DATA_PRESETS = {
  'points-race': { label: 'Points race', form: 'line-race' as ChartForm, needs: 'competition, up to 6 teams (default: the final top four)' },
  'month-table': { label: 'Table at month end', form: 'table' as ChartForm, needs: 'competition and month' },
  'results-strip': { label: 'Results strip', form: 'strip' as ChartForm, needs: 'competition and one team' },
  'goals-by-month': { label: 'Goals per game by month', form: 'bar' as ChartForm, needs: 'competition' },
} as const
export type DataPreset = keyof typeof DATA_PRESETS

/** Competitions the series covers, as `admin_historical_matches.competition` spells them. */
export const BOOK_COMPETITIONS = [
  'Premier League', 'LaLiga', 'Serie A', 'Bundesliga', 'Ligue 1',
  'Champions League', 'Championship', 'Eredivisie', 'Primeira Liga', 'Scottish Premiership',
  'FIFA World Cup', 'UEFA Euro',
] as const

/** Leagues: competitions with a table. */
export const LEAGUE_COMPETITIONS = new Set<string>(BOOK_COMPETITIONS.slice(0, 10).filter(c => c !== 'Champions League'))

const id = z.string().min(1).max(40).regex(/^[\w-]+$/)
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
const text = (max: number) => z.string().max(max)

export const beatSchema = z.object({
  id,
  text: text(400),
  month: month.nullable(),
  kind: z.enum(Object.keys(BEAT_KINDS) as [BeatKind, ...BeatKind[]]),
  /** 3 = could open a chapter, 1 = a supporting note. */
  strength: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  teams: text(200),
  evidence: text(1000),
})
export type Beat = z.infer<typeof beatSchema>

export const dataBindingSchema = z.object({
  preset: z.enum(Object.keys(DATA_PRESETS) as [DataPreset, ...DataPreset[]]),
  competition: text(80),
  teams: z.array(text(80)).max(6),
  month: month.nullable(),
})
export type DataBinding = z.infer<typeof dataBindingSchema>

/** A stroke of the rough sketch: an SVG path in a 0–300 × 0–180 box. */
const stroke = z.string().max(6000).regex(/^[MLml0-9 .,-]*$/)

export const spreadSchema = z.object({
  id,
  chapter: z.string().regex(/^(cover|intro|outro|\d{4}-(0[1-9]|1[0-2]))$/),
  template: z.enum(TEMPLATE_ORDER as [TemplateId, ...TemplateId[]]),
  beatId: id.nullable(),
  headline: text(200),
  chart: z.object({
    form: z.enum(Object.keys(CHART_FORMS) as [ChartForm, ...ChartForm[]]),
    sketch: z.array(stroke).max(80),
    notes: text(1000),
    data: dataBindingSchema.nullable(),
  }),
  stat: z.object({ value: text(24), label: text(160) }),
  body: text(2000),
  caption: text(400),
  status: z.enum(Object.keys(SPREAD_STATUSES) as [SpreadStatus, ...SpreadStatus[]]),
  notes: text(2000),
})
export type Spread = z.infer<typeof spreadSchema>

export const planSchema = z.object({
  beats: z.array(beatSchema).max(80),
  spreads: z.array(spreadSchema).max(120),
})
export type Plan = z.infer<typeof planSchema>

/** A book as the API returns it. `plan` is a v1 claim-spreads plan or a v2 season-spreads plan (seasonSpreads.ts); `format` says which. */
export interface SeasonBook {
  slug: string
  seasonStart: number
  title: string
  plan: Plan | import('./seasonSpreads').PlanV2
  format: 'claim-spreads' | 'season-spreads'
  revision: number
  updatedAt: string
  updatedBy: string | null
}

export interface SeasonBookSummary {
  slug: string
  seasonStart: number
  title: string
  format: 'claim-spreads' | 'season-spreads'
  beatCount: number
  spreadCount: number
  cardedCount: number
  updatedAt: string
  updatedBy: string | null
}

/** The claim-spreads planner's views, in workflow order (`?view=`). The season-spreads views are in seasonSpreads.ts. */
export const BOOK_VIEWS = ['beats', 'flatplan', 'cards', 'chapters', 'system'] as const
export type BookView = (typeof BOOK_VIEWS)[number]
export const isBookView = (v: unknown): v is BookView => (BOOK_VIEWS as readonly unknown[]).includes(v)

// ---------------------------------------------------------------------------
// Seasons and chapters

export function seasonSlug(start: number): string {
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`
}

export function seasonLabel(start: number): string {
  return `${start}–${String((start + 1) % 100).padStart(2, '0')}`
}

export function parseSeasonSlug(slug: string): number | null {
  const m = /^(\d{4})-(\d{2})$/.exec(slug)
  if (!m) return null
  const start = Number(m[1])
  return (start + 1) % 100 === Number(m[2]) ? start : null
}

/** The month-chapters of a season: August to the next July (summer tournaments close the book). */
export function seasonMonths(start: number): string[] {
  const months: string[] = []
  for (let i = 0; i < 12; i++) {
    const m = 8 + i
    const year = m > 12 ? start + 1 : start
    months.push(`${year}-${String(((m - 1) % 12) + 1).padStart(2, '0')}`)
  }
  return months
}

/** Every chapter of the book in reading order. */
export function bookChapters(start: number): string[] {
  return ['cover', 'intro', ...seasonMonths(start), 'outro']
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function chapterLabel(chapter: string, short = false): string {
  if (chapter === 'cover') return 'Cover'
  if (chapter === 'intro') return 'Season intro'
  if (chapter === 'outro') return 'Season in numbers'
  const [y, m] = chapter.split('-').map(Number)
  const name = MONTH_NAMES[m - 1] ?? chapter
  return short ? `${name.slice(0, 3)} ${String(y).slice(2)}` : `${name} ${y}`
}

/** Clamp a match month into the book's months (July before the season opens folds into August). */
export function chapterForMonth(start: number, monthKey: string): string {
  const months = seasonMonths(start)
  if (months.includes(monthKey)) return monthKey
  return monthKey < months[0] ? months[0] : months[months.length - 1]
}

/** Stable-sort spreads into chapter order, keeping their order within each chapter. */
export function sortSpreads(start: number, spreads: Spread[]): Spread[] {
  const order = new Map(bookChapters(start).map((c, i) => [c, i]))
  return spreads
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (order.get(a.s.chapter) ?? 99) - (order.get(b.s.chapter) ?? 99) || a.i - b.i)
    .map(x => x.s)
}

export function newId(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)
  return `${prefix}-${rand}`
}

export function emptyBeat(monthKey: string | null): Beat {
  return { id: newId('b'), text: '', month: monthKey, kind: 'other', strength: 2, teams: '', evidence: '' }
}

export function emptySpread(chapter: string, template: TemplateId, beat?: Beat | null): Spread {
  return {
    id: newId('s'),
    chapter,
    template,
    beatId: beat?.id ?? null,
    headline: '',
    chart: { form: TEMPLATES[template].forms[0], sketch: [], notes: '', data: null },
    stat: { value: '', label: '' },
    body: '',
    caption: '',
    status: 'beat',
    notes: '',
  }
}

/** A new book: cover and season intro in place, everything else waits for the beats. */
export function starterPlan(): Plan {
  return { beats: [], spreads: [emptySpread('cover', 'cover'), emptySpread('intro', 'intro')] }
}

// ---------------------------------------------------------------------------
// Checks

export type Severity = 'warn' | 'info'
export interface Issue {
  severity: Severity
  message: string
  /** Spread ids the issue is about, for highlighting. */
  spreads?: string[]
}

export const BEAT_TARGET = { min: 15, max: 25 }

export function wordCount(s: string): number {
  return s.trim() ? s.trim().split(/\s+/).length : 0
}

function sentenceCount(s: string): number {
  return s.split(/[.!?]+(?:\s|$)/).filter(part => part.trim().length > 0).length
}

/** Beats first: 15–25 one-sentence moments, each placed in a month. */
export function beatIssues(plan: Plan): Issue[] {
  const issues: Issue[] = []
  const n = plan.beats.filter(b => b.text.trim()).length
  if (n < BEAT_TARGET.min) issues.push({ severity: 'warn', message: `${n} beat${n === 1 ? '' : 's'} so far. Find ${BEAT_TARGET.min - n} more before laying anything out (aim for ${BEAT_TARGET.min}–${BEAT_TARGET.max}).` })
  if (n > BEAT_TARGET.max) issues.push({ severity: 'warn', message: `${n} beats is more than one book can carry well. Merge or cut to ${BEAT_TARGET.max}.` })
  for (const b of plan.beats) {
    if (!b.text.trim()) continue
    const label = `"${b.text.slice(0, 48)}${b.text.length > 48 ? '…' : ''}"`
    if (sentenceCount(b.text) > 1) issues.push({ severity: 'warn', message: `${label} is more than one sentence. A beat that won’t fit in one isn’t one beat.` })
    else if (wordCount(b.text) > 28) issues.push({ severity: 'info', message: `${label} runs to ${wordCount(b.text)} words. Tighten it.` })
    if (!b.month) issues.push({ severity: 'info', message: `${label} has no month yet.` })
  }
  const used = new Set(plan.spreads.map(s => s.beatId).filter(Boolean))
  const unused = plan.beats.filter(b => b.text.trim() && !used.has(b.id))
  if (unused.length && plan.spreads.length > 2) issues.push({ severity: 'info', message: `${unused.length} beat${unused.length === 1 ? ' has' : 's have'} no spread yet.` })
  return issues
}

/** The card is the "hand in hand" check: headline and chart sketch are written together. */
export function cardIssues(spread: Spread): Issue[] {
  const t = TEMPLATES[spread.template]
  const issues: Issue[] = []
  const hasHeadline = spread.headline.trim().length > 0
  const hasSketch = spread.chart.sketch.length > 0 || spread.chart.notes.trim().length > 0 || spread.chart.data != null
  const frame = t.role === 'frame'
  if (!hasHeadline && hasSketch) issues.push({ severity: 'warn', message: 'There’s a chart but no headline: if you can’t write the claim, the chart has no point.' })
  if (hasHeadline && !hasSketch && !frame) issues.push({ severity: 'warn', message: 'There’s a headline but no chart sketch: if you can’t sketch the chart, the claim is too vague.' })
  if (!hasHeadline && !hasSketch && !frame) issues.push({ severity: 'info', message: 'Write the headline and sketch the chart together.' })
  if (!t.forms.includes(spread.chart.form)) issues.push({ severity: 'warn', message: `${t.label} spreads don’t take a ${CHART_FORMS[spread.chart.form].label.toLowerCase()} chart. Use ${t.forms.map(f => CHART_FORMS[f].label.toLowerCase()).join(', ')}.` })
  if (!frame && t.role !== 'breather' && !spread.stat.value.trim()) issues.push({ severity: 'info', message: 'Add the one supporting stat.' })
  if (t.role === 'breather' && !spread.stat.value.trim() && spread.chart.form === 'big-number') issues.push({ severity: 'warn', message: 'A big-number breather needs its number.' })
  const words = wordCount(spread.body)
  if (words < t.words.min) issues.push({ severity: words === 0 ? 'info' : 'warn', message: `Body is ${words} words; ${t.label.toLowerCase()} spreads take ${t.words.min}–${t.words.max}.` })
  if (words > t.words.max) issues.push({ severity: 'warn', message: `Body is ${words} words; cut to ${t.words.max} or fewer.` })
  if (!frame && !spread.caption.trim()) issues.push({ severity: 'info', message: 'Add a chart caption: what it shows and how to read it.' })
  if (!frame && !spread.beatId) issues.push({ severity: 'info', message: 'Link this spread to a beat.' })
  return issues
}

export interface RoleRun {
  role: SpreadRole
  spreads: Spread[]
}

/** Pacing: hero → dense → breather → repeat. Readers who flip need rhythm more than continuity. */
export function pacingIssues(start: number, spreads: Spread[]): Issue[] {
  const issues: Issue[] = []
  const ordered = sortSpreads(start, spreads)
  const num = new Map(ordered.map((s, i) => [s.id, i + 1]))
  const role = (s: Spread) => TEMPLATES[s.template].role
  const range = (ss: Spread[]) => ss.length === 1 ? `Spread ${num.get(ss[0].id)}` : `Spreads ${num.get(ss[0].id)}–${num.get(ss[ss.length - 1].id)}`

  if (ordered.length && ordered[0].template !== 'cover') issues.push({ severity: 'warn', message: 'The book should open on the cover.', spreads: [ordered[0].id] })
  if (ordered.length > 1 && ordered[1].template !== 'intro') issues.push({ severity: 'info', message: 'The season intro usually comes straight after the cover.', spreads: [ordered[1].id] })

  const body = ordered.filter(s => role(s) !== 'frame')
  for (let i = 0; i < body.length;) {
    let j = i
    while (j + 1 < body.length && role(body[j + 1]) === role(body[i])) j++
    const run = body.slice(i, j + 1)
    const r = role(body[i])
    if (r === 'dense' && run.length >= 3) issues.push({ severity: 'warn', message: `${range(run)}: ${run.length} dense spreads in a row. Put a breather in.`, spreads: run.map(s => s.id) })
    if (r === 'breather' && run.length >= 2) issues.push({ severity: 'warn', message: `${range(run)}: breathers back to back lose the rhythm.`, spreads: run.map(s => s.id) })
    if (r === 'hero' && run.length >= 2) issues.push({ severity: 'warn', message: `${range(run)}: heroes back to back flatten both. Follow a hero with a dense spread.`, spreads: run.map(s => s.id) })
    i = j + 1
  }

  for (const m of seasonMonths(start)) {
    const ch = ordered.filter(s => s.chapter === m)
    if (!ch.length) continue
    if (role(ch[0]) !== 'hero') issues.push({ severity: 'info', message: `${chapterLabel(m)} opens on a ${TEMPLATES[ch[0].template].label.toLowerCase()} spread. Month-chapters open on a hero.`, spreads: [ch[0].id] })
    if (ch.length >= 4 && !ch.some(s => role(s) === 'breather')) issues.push({ severity: 'info', message: `${chapterLabel(m)} has ${ch.length} spreads and no breather.`, spreads: ch.map(s => s.id) })
  }
  return issues
}

/** Spread number (1-based position in the book) by id. */
export function spreadNumbers(start: number, spreads: Spread[]): Map<string, number> {
  return new Map(sortSpreads(start, spreads).map((s, i) => [s.id, i + 1]))
}

export function planSummary(plan: Plan) {
  return {
    beatCount: plan.beats.filter(b => b.text.trim()).length,
    spreadCount: plan.spreads.length,
    cardedCount: plan.spreads.filter(s => s.status !== 'beat').length,
  }
}

const STATUS_ORDER = Object.keys(SPREAD_STATUSES) as SpreadStatus[]

/**
 * The status a spread has earned by its content, never moving it back: a
 * headline with a chart sketch makes it a card, a data binding puts it on real
 * data. Thumbnailed and polished are the editor's calls.
 */
export function advanceStatus(s: Spread): SpreadStatus {
  const carded = s.headline.trim() !== '' && (s.chart.sketch.length > 0 || s.chart.notes.trim() !== '' || s.chart.data != null)
  const earned = carded ? (s.chart.data ? 'data' : 'card') : 'beat'
  return STATUS_ORDER[Math.max(STATUS_ORDER.indexOf(s.status), STATUS_ORDER.indexOf(earned))]
}

/** The template that keeps the rhythm going after `previous`: hero → dense → breather → hero. */
export function nextTemplate(previous: Spread | undefined): TemplateId {
  if (!previous) return 'hero'
  const role = TEMPLATES[previous.template].role
  return role === 'hero' ? 'comparison' : role === 'dense' ? 'breather' : 'hero'
}

/** Default template for a beat dropped into the flatplan. */
export function templateForBeat(beat: Beat): TemplateId {
  if (beat.strength === 3) return 'hero'
  if (beat.kind === 'streak' || beat.kind === 'turning-point') return 'timeline'
  if (beat.kind === 'record') return 'breather'
  return 'comparison'
}
