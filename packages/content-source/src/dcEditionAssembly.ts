/**
 * AI Data Centers daily snapshot — deterministic assembly.
 *
 * Everything numeric on an edition page (mood score and counts, geo pins and
 * region bars, the four per-layer visualisations, the energy figures, the
 * counts, the Sources chapter) is computed here from the tagged rows, never
 * by the model. The composer script and the admin membership route both call
 * these so dropping a story from an edition re-derives the same numbers the
 * cron would have produced.
 *
 * Pure functions only — no DB, no Next — so the same code runs in the Actions
 * worker, the admin API and (for the small formatters) the public page.
 */

import {
  DC_LAYERS,
  DC_LAYER_KEYS,
  DC_PAPER_AREA_KEYS,
  DC_REGION_KEYS,
  DC_THEMES,
  emptyFieldBaseline,
  formatEditionDayLabel,
  MOOD_METHOD,
  type CapacityViz,
  type DcEditionStory,
  type DcLayerKey,
  type DcMood,
  type DcPaper,
  type DcPaperArea,
  type DcPlace,
  type DcRegionKey,
  type DcStoryFigure,
  type DcThemeKey,
  type EditionCounts,
  type EditionEnergy,
  type EditionGeo,
  type EditionGeoRegion,
  type EditionLayerNote,
  type EditionLayerViz,
  type EditionMoodCounts,
  type EditionMoodEvent,
  type EditionNote,
  type EditionSource,
  type EditionTapeTick,
  type EditionText,
  type HorizonViz,
  type MatrixViz,
  type OrdersViz,
} from './dcEditionTypes'

// ---------------------------------------------------------------------------
// Small formatters (also used by the page)

export function shortTitle(title: string, max = 56): string {
  const t = title.trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`
}

/** 'reuters.com' for a story URL; Google News redirect links keep their host. */
export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
  }
}

/** 'HH:MM' UTC for a timestamp. */
export function timeHm(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

/** Compact number for a metric tile: 1200 → '1,200', 4.6 → '4.6', 2027 (year) → '2027'. */
export function formatFigureValue(value: number, unit: string | null): string {
  if (!Number.isFinite(value)) return '—'
  if (isYearUnit(unit)) return String(Math.round(value))
  const abs = Math.abs(value)
  if (abs >= 1000) return Math.round(value).toLocaleString('en-US')
  if (abs >= 100) return value.toFixed(0)
  if (Number.isInteger(value)) return String(value)
  return abs >= 10 ? value.toFixed(1) : String(Math.round(value * 100) / 100)
}

export function isYearUnit(unit: string | null | undefined): boolean {
  if (!unit) return false
  return /^(year|yr|years|fy)$/i.test(unit.trim())
}

/** Normalise a power figure to GW; null when the unit isn't a power unit. */
export function toGw(fig: DcStoryFigure): number | null {
  const u = fig.unit.trim().toLowerCase()
  if (u === 'gw') return fig.value
  if (u === 'mw') return fig.value / 1000
  if (u === 'kw') return fig.value / 1_000_000
  return null
}

/** Normalise a power figure to MW; null when the unit isn't a power unit. */
export function toMw(fig: DcStoryFigure): number | null {
  const gw = toGw(fig)
  return gw == null ? null : gw * 1000
}

// ---------------------------------------------------------------------------
// Horizons ('2027', '2027-Q1', '2027-06', 'FY27', 'H2 2027') → decimal years

const QUARTER_RE = /^(\d{4})\s*[- ]?\s*q([1-4])$/i
const MONTH_RE = /^(\d{4})-(\d{1,2})$/
const HALF_RE = /^(?:h([12])\s*(\d{4})|(\d{4})\s*h([12]))$/i
const FY_RE = /^fy\s*'?(\d{2}|\d{4})$/i
const YEAR_RE = /^(\d{4})$/

function parseHorizonParts(s: string | null | undefined): { year: number; start: number; end: number } | null {
  if (!s) return null
  const t = String(s).trim()
  let m: RegExpMatchArray | null
  if ((m = t.match(YEAR_RE))) return { year: +m[1], start: 0, end: 1 }
  if ((m = t.match(QUARTER_RE))) {
    const q = +m[2]
    return { year: +m[1], start: (q - 1) / 4, end: q / 4 }
  }
  if ((m = t.match(MONTH_RE))) {
    const mo = Math.min(12, Math.max(1, +m[2]))
    return { year: +m[1], start: (mo - 1) / 12, end: mo / 12 }
  }
  if ((m = t.match(HALF_RE))) {
    const h = +(m[1] ?? m[4])
    const y = +(m[2] ?? m[3])
    return { year: y, start: (h - 1) / 2, end: h / 2 }
  }
  if ((m = t.match(FY_RE))) {
    const raw = +m[1]
    return { year: raw < 100 ? 2000 + raw : raw, start: 0, end: 1 }
  }
  // Loose: any four-digit year inside the string ("through 2027", "late 2028").
  const any = t.match(/(20\d{2})/)
  if (any) {
    const late = /late|end|h2|q4/i.test(t)
    const early = /early|start|h1|q1/i.test(t)
    return { year: +any[1], start: early ? 0 : late ? 0.75 : 0, end: early ? 0.25 : 1 }
  }
  return null
}

/** Start of a stated horizon as a decimal year (2027-Q3 → 2027.5). */
export function horizonStart(s: string | null | undefined): number | null {
  const p = parseHorizonParts(s)
  return p ? p.year + p.start : null
}

/** End of a stated horizon as a decimal year ("through 2027" → 2028.0). */
export function horizonEnd(s: string | null | undefined): number | null {
  const p = parseHorizonParts(s)
  return p ? p.year + p.end : null
}

/** Decimal year for a date ('2026-09-22' → 2026.72). */
export function decimalYear(date: string | Date): number {
  const d = typeof date === 'string' ? new Date(`${date.slice(0, 10)}T12:00:00Z`) : date
  const y = d.getUTCFullYear()
  const start = Date.UTC(y, 0, 1)
  const end = Date.UTC(y + 1, 0, 1)
  return y + (d.getTime() - start) / (end - start)
}

// ---------------------------------------------------------------------------
// Mood — Doom v Boom, scored per event
//
// Google News gives one row per outlet, so one development reported three
// times used to be three votes. The reading now groups the window's stories
// into events first (clusterEvents), gives each event one mood and one weight
// (relevance × impact × coverage), and reads the balance of weight:
// (W_boom − W_doom) / (W_boom + W_doom), neutral excluded. With no duplicates
// and equal weights that is exactly the old story count.

/**
 * Clustering constants — starting values, calibrated on the compose
 * --dry-run cluster printout. Precision first: a missed merge only gives back
 * the old behaviour, a wrong merge silently deletes a vote.
 */
export const EVENT_MATCH = {
  /** Merge when the average pair similarity clears this and both stories carry a v4 event line… */
  threshold: 0.5,
  /** …or this when either is title-only (pre-v4). */
  thresholdTitleOnly: 0.55,
  /** Both name tracked companies, none shared: "Nvidia shares rise 3%" vs "AMD shares rise 3%". */
  disjointTickers: -0.5,
  /**
   * Both name organisations (v4 actors) and neither story mentions any word of
   * the other's: "Crusoe signs 1 GW PPA" vs "Lambda signs 1 GW PPA" — private
   * firms carry no tickers. Fuzzy on purpose, so "NJ DEP" and "N.J.'s largest
   * data center" still count as a mention.
   */
  disjointActors: -0.5,
  /** The same power / energy / money figure about the same thing: "$1M fine" from three wires. */
  sharedFigure: 0.12,
  samePlace: 0.05,
  differentPlace: -0.3,
  /** One outlet rarely files the same development twice in a window. */
  sameOutlet: -0.1,
} as const

/** Event weight constants: relevance 0.6–1.0, each impact grade ×1.58 (grade 5 ≈ 6.3×), coverage capped at 1.75×. */
export const MOOD_WEIGHTS = {
  /** Ungraded (pre-v4) stories weigh as this grade on both scales. */
  defaultGrade: 3,
  relevanceBase: 0.5,
  relevanceStep: 0.1,
  impactStep: 10 ** 0.2,
  coverageStep: 0.25,
  coverageCap: 1.75,
} as const

// Words that say nothing about which development a headline reports: grammar,
// headline filler, and this feed's own vocabulary ("AI data center" is in
// half the titles).
const EVENT_STOP = new Set([
  'a', 'an', 'the', 'of', 'in', 'on', 'at', 'to', 'for', 'from', 'by', 'with', 'and', 'or', 'as', 'over', 'into', 'onto',
  'after', 'amid', 'about', 'than', 'this', 'that', 'these', 'those', 'its', 'it', 'is', 'are', 'was', 'were', 'be', 'been',
  'has', 'have', 'had', 'will', 'would', 'could', 'may', 'can', 'says', 'say', 'said', 'new', 'more', 'most', 'up', 'out',
  'how', 'why', 'what', 'who', 'report', 'per', 'via', 'vs', 'amp', 'nbsp',
  'ai', 'artificial', 'intelligence', 'data', 'datacenter', 'center', 'hyperscale', 'chip', 'chipmaker', 'semiconductor',
  'infrastructure', 'tech', 'technology', 'company',
])

const MONEY_SCALE: Record<string, number> = {
  trillion: 1e6, tn: 1e6, t: 1e6,
  billion: 1e3, bn: 1e3, b: 1e3,
  million: 1, mn: 1, m: 1, mln: 1,
  thousand: 1e-3, k: 1e-3,
}
const POWER_SCALE: Record<string, number> = { gigawatt: 1000, gw: 1000, megawatt: 1, mw: 1, kilowatt: 0.001, kw: 0.001 }
const ENERGY_SCALE: Record<string, number> = { twh: 1e6, gwh: 1000, mwh: 1 }

const num = (raw: string): number => Number(raw.replace(/,/g, ''))
const numToken = (v: number): string => String(Number(v.toPrecision(4)))

function stem(t: string): string {
  if (t.includes(':') || /\d/.test(t) || t.length <= 3) return t
  if (t.endsWith('ies') && t.length > 4) return `${t.slice(0, -3)}y`
  if (t.endsWith('s') && !/(ss|us|is)$/.test(t)) return t.slice(0, -1)
  return t
}

/**
 * The tokens that identify a development in a line of text. Money, power and
 * energy become canonical tokens so "$1 million" and "$1M" match (usd:1, in
 * millions) and "2 GW" matches "2,000 MW" (mw:2000); "N.J.'s" reads as "nj".
 */
export function eventTokens(text: string | null | undefined): Set<string> {
  let t = (text ?? '')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/centre/g, 'center')
    // Initialisms: n.j. → nj, u.s. → us.
    .replace(/\b([a-z])\.([a-z])\.(?:([a-z])\.)?/g, (_m, a: string, b: string, c?: string) => `${a}${b}${c ?? ''}`)
    .replace(/'s\b/g, '')
  t = t.replace(
    /(?:\bus)?([$€£])\s?(\d[\d,]*(?:\.\d+)?)\s*-?\s*(trillion|billion|million|thousand|tn|bn|mln|mn|[tbmk])?\b/g,
    (_m, cur: string, n: string, scale?: string) => ` ${cur === '$' ? 'usd' : cur === '€' ? 'eur' : 'gbp'}:${numToken((num(n) * (scale ? MONEY_SCALE[scale] : 1e-6)))} `,
  )
  t = t.replace(
    /(\d[\d,]*(?:\.\d+)?)\s*(trillion|billion|million|tn|bn|mn)\s+(?:us\s+)?(dollars|usd|euros|eur|pounds|gbp)\b/g,
    (_m, n: string, scale: string, cur: string) => ` ${/^(dollars|usd)$/.test(cur) ? 'usd' : /^(euros|eur)$/.test(cur) ? 'eur' : 'gbp'}:${numToken(num(n) * MONEY_SCALE[scale])} `,
  )
  t = t.replace(/(\d[\d,]*(?:\.\d+)?)\s*-?\s*(gigawatts?|megawatts?|kilowatts?|gw|mw|kw)\b/g, (_m, n: string, u: string) => ` mw:${numToken(num(n) * POWER_SCALE[u.replace(/s$/, '')])} `)
  t = t.replace(/(\d[\d,]*(?:\.\d+)?)\s*-?\s*(twh|gwh|mwh)\b/g, (_m, n: string, u: string) => ` mwh:${numToken(num(n) * ENERGY_SCALE[u])} `)
  t = t.replace(/(\d[\d,]*(?:\.\d+)?)\s*(%|percent\b)/g, (_m, n: string) => ` pct:${numToken(num(n))} `)
  const out = new Set<string>()
  for (const raw of t.split(/[^a-z0-9:.]+/)) {
    const tok = stem(raw.replace(/^[.:]+|[.:]+$/g, ''))
    if (tok.length < 2 || EVENT_STOP.has(tok)) continue
    out.add(tok)
  }
  return out
}

/** Title plus the v4 event line — never the summary (Google News fills it with the title's HTML and the outlet). */
function storyEventText(s: Pick<DcEditionStory, 'title' | 'event'>): string {
  return s.event ? `${s.title} \n ${s.event}` : s.title
}

/** Document frequencies over a corpus of stories, for weighting rare tokens ("vineland") over common ones ("fine"). */
export interface EventIdf {
  n: number
  df: Map<string, number>
}

/**
 * IDF over the given stories. The composer passes 30 days of the feed plus
 * the window, so a quiet day's 15 titles still know "shares" is common and
 * "vineland" is not.
 */
export function buildIdf(stories: Pick<DcEditionStory, 'title' | 'event'>[]): EventIdf {
  const df = new Map<string, number>()
  for (const s of stories) for (const t of eventTokens(storyEventText(s))) df.set(t, (df.get(t) ?? 0) + 1)
  return { n: stories.length, df }
}

const idfWeight = (idf: EventIdf, t: string): number => Math.log(1 + idf.n / (1 + (idf.df.get(t) ?? 0)))

const outletKey = (s: DcEditionStory): string => (s.source?.trim() || domainOf(s.url)).toLowerCase()
const exactTitleKey = (title: string): string => title.toLowerCase().replace(/[^a-z0-9]/g, '')
const SCALED_KINDS = new Set(['power', 'energy', 'money'])

function sharesFigure(a: DcEditionStory, b: DcEditionStory): boolean {
  for (const fa of a.facts?.figures ?? []) {
    const ka = figureKind(fa.unit)
    if (!SCALED_KINDS.has(ka)) continue
    const ma = figureMagnitude(fa)
    if (ma == null) continue
    for (const fb of b.facts?.figures ?? []) {
      if (figureKind(fb.unit) !== ka) continue
      const mb = figureMagnitude(fb)
      if (mb == null || Math.abs(ma - mb) > 0.01 * Math.max(Math.abs(ma), Math.abs(mb))) continue
      const sameSubject = !!fa.subject && !!fb.subject && subjectKey(fa.subject) === subjectKey(fb.subject)
      if (sameSubject || labelsOverlap(fa.label, fb.label)) return true
    }
  }
  return false
}

interface EventDoc {
  story: DcEditionStory
  tokens: Map<string, number>
  norm: number
  titleKey: string
  outlet: string
  hasEvent: boolean
  /** Each v4 actor as its tokens ("NJ DEP" → nj, dep). */
  actors: Set<string>[]
}

function eventDoc(s: DcEditionStory, idf: EventIdf): EventDoc {
  const tokens = new Map<string, number>()
  let sq = 0
  for (const t of eventTokens(storyEventText(s))) {
    const w = idfWeight(idf, t)
    tokens.set(t, w)
    sq += w * w
  }
  return {
    story: s,
    tokens,
    norm: Math.sqrt(sq),
    titleKey: exactTitleKey(s.title),
    outlet: outletKey(s),
    hasEvent: !!s.event?.trim(),
    actors: (s.actors ?? []).map((a) => eventTokens(a)).filter((t) => t.size > 0),
  }
}

/** Does `b` mention any of `a`'s actors — in its text or its own actor names? */
function mentionsActorOf(a: EventDoc, b: EventDoc): boolean {
  return a.actors.some((toks) => [...toks].some((t) => b.tokens.has(t) || b.actors.some((bt) => bt.has(t))))
}

/** How far a pair clears its merge threshold: ≥ 0 reads as one development. */
function pairMargin(a: EventDoc, b: EventDoc): number {
  const threshold = a.hasEvent && b.hasEvent ? EVENT_MATCH.threshold : EVENT_MATCH.thresholdTitleOnly
  // Syndicated copy: the same headline word for word is the same story.
  if (a.titleKey.length >= 20 && a.titleKey === b.titleKey) return 1 - threshold
  let dot = 0
  const [small, big] = a.tokens.size <= b.tokens.size ? [a.tokens, b.tokens] : [b.tokens, a.tokens]
  for (const [t, w] of small) if (big.has(t)) dot += w * w
  let sim = a.norm > 0 && b.norm > 0 ? dot / (a.norm * b.norm) : 0
  const sa = a.story
  const sb = b.story
  if (sa.tickers.length > 0 && sb.tickers.length > 0 && !sa.tickers.some((t) => sb.tickers.includes(t))) sim += EVENT_MATCH.disjointTickers
  if (a.actors.length > 0 && b.actors.length > 0 && !mentionsActorOf(a, b) && !mentionsActorOf(b, a)) sim += EVENT_MATCH.disjointActors
  if (sharesFigure(sa, sb)) sim += EVENT_MATCH.sharedFigure
  if (sa.place && sb.place) sim += sa.place === sb.place ? EVENT_MATCH.samePlace : EVENT_MATCH.differentPlace
  if (a.outlet && a.outlet === b.outlet) sim += EVENT_MATCH.sameOutlet
  return sim - threshold
}

/**
 * Group stories that report the same development. Average-link agglomerative
 * clustering over the pair margins: two groups merge while their average pair
 * clears the threshold, so a chain A~B~C never pulls in an A that looks
 * nothing like C. Input order doesn't matter (stories are taken by id, ties
 * go to the lowest ids). Never by URL — outlet home pages and Google News
 * redirects both make URLs useless as an identity here.
 */
export function clusterEvents(stories: DcEditionStory[], opts: { idf?: EventIdf } = {}): DcEditionStory[][] {
  const sorted = [...stories].sort((a, b) => a.id - b.id)
  const n = sorted.length
  if (n === 0) return []
  const idf = opts.idf ?? buildIdf(sorted)
  const docs = sorted.map((s) => eventDoc(s, idf))
  // sum[i][j] = summed pair margin between groups i and j.
  const sum: number[][] = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const m = pairMargin(docs[i], docs[j])
      sum[i][j] = m
      sum[j][i] = m
    }
  }
  const members: number[][] = sorted.map((_, i) => [i])
  const alive = new Array<boolean>(n).fill(true)
  for (;;) {
    let best = -Infinity
    let bi = -1
    let bj = -1
    for (let i = 0; i < n; i++) {
      if (!alive[i]) continue
      for (let j = i + 1; j < n; j++) {
        if (!alive[j]) continue
        const avg = sum[i][j] / (members[i].length * members[j].length)
        if (avg > best + 1e-12) {
          best = avg
          bi = i
          bj = j
        }
      }
    }
    if (bi < 0 || best < 0) break
    members[bi].push(...members[bj])
    alive[bj] = false
    for (let k = 0; k < n; k++) {
      if (!alive[k] || k === bi) continue
      sum[bi][k] += sum[bj][k]
      sum[k][bi] = sum[bi][k]
    }
  }
  const groups: DcEditionStory[][] = []
  for (let i = 0; i < n; i++) if (alive[i]) groups.push(members[i].map((k) => sorted[k]).sort((a, b) => leadOrder(a, b)))
  return groups
}

/** The lead is the member that states most (figures, then named companies), then the first report. */
function leadOrder(a: DcEditionStory, b: DcEditionStory): number {
  const fa = (a.facts?.figures.length ?? 0) * 2 + a.tickers.length
  const fb = (b.facts?.figures.length ?? 0) * 2 + b.tickers.length
  if (fb !== fa) return fb - fa
  const ta = Date.parse(a.publishedAt)
  const tb = Date.parse(b.publishedAt)
  if (ta !== tb) return ta - tb
  return a.id - b.id
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b)
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

function gradeOf(members: DcEditionStory[], key: 'relevance' | 'impact'): number {
  const graded = members.map((s) => s[key]).filter((g): g is number => typeof g === 'number' && Number.isFinite(g))
  return graded.length ? median(graded) : MOOD_WEIGHTS.defaultGrade
}

const round3 = (v: number): number => Math.round(v * 1000) / 1000

/** One event's pull on the reading: relevance × impact × coverage. */
export function eventWeight(relevance: number, impact: number, outlets: number): number {
  const rel = MOOD_WEIGHTS.relevanceBase + MOOD_WEIGHTS.relevanceStep * relevance
  const imp = MOOD_WEIGHTS.impactStep ** (impact - 1)
  const coverage = Math.min(MOOD_WEIGHTS.coverageCap, 1 + MOOD_WEIGHTS.coverageStep * Math.log2(Math.max(1, outlets)))
  return round3(rel * imp * coverage)
}

/** Summarise one group of stories as an event: majority mood, median grades, weight. */
export function toMoodEvent(members: DcEditionStory[]): EditionMoodEvent {
  const net = members.reduce((acc, s) => acc + (s.mood ?? 0), 0)
  const mood: DcMood = net > 0 ? 1 : net < 0 ? -1 : 0
  const r = gradeOf(members, 'relevance')
  const i = gradeOf(members, 'impact')
  const outlets = new Set(members.map(outletKey)).size
  const ev: EditionMoodEvent = { lead: members[0].id, ids: members.map((s) => s.id), mood, w: eventWeight(r, i, outlets), r, i, outlets }
  if (mood === 0 && members.some((s) => s.mood === 1) && members.some((s) => s.mood === -1)) ev.mixed = true
  return ev
}

/**
 * The Doom v Boom reading: cluster, one mood + weight per event, then the
 * balance of weight. `counts` is what `dc_editions.mood_counts` stores —
 * event counts per side, the raw report counts, the side weights and every
 * event (heaviest first), so the page's drivers and panel are frozen with
 * the score.
 */
export function scoreMoodEvents(
  stories: DcEditionStory[],
  opts: { idf?: EventIdf } = {},
): { score: number | null; counts: EditionMoodCounts; events: EditionMoodEvent[] } {
  const events = clusterEvents(stories, opts)
    .map(toMoodEvent)
    .sort((a, b) => b.w - a.w || a.lead - b.lead)
  const counts: EditionMoodCounts = {
    boom: 0,
    doom: 0,
    neutral: 0,
    method: MOOD_METHOD,
    stories: { boom: 0, doom: 0, neutral: 0 },
    weight: { boom: 0, doom: 0 },
    events,
  }
  for (const s of stories) {
    if (s.mood === 1) counts.stories!.boom += 1
    else if (s.mood === -1) counts.stories!.doom += 1
    else counts.stories!.neutral += 1
  }
  let wb = 0
  let wd = 0
  for (const e of events) {
    if (e.mood === 1) {
      counts.boom += 1
      wb += e.w
    } else if (e.mood === -1) {
      counts.doom += 1
      wd += e.w
    } else counts.neutral += 1
  }
  counts.weight = { boom: round3(wb), doom: round3(wd) }
  const score = wb + wd === 0 ? null : round3((wb - wd) / (wb + wd))
  return { score, counts, events }
}

/** An event with its stories resolved: the lead the page shows, the other reports as "also". */
export interface ResolvedMoodEvent {
  event: EditionMoodEvent
  lead: DcEditionStory
  others: DcEditionStory[]
}

/**
 * Resolve stored events against the edition's stories, heaviest first. A
 * member missing from `stories` (deleted from the feed) is skipped; an event
 * with none left is dropped.
 */
export function resolveMoodEvents(
  events: EditionMoodEvent[],
  stories: DcEditionStory[],
  side?: 'boom' | 'doom',
): ResolvedMoodEvent[] {
  const byId = new Map(stories.map((s) => [s.id, s]))
  const want = side === 'boom' ? 1 : side === 'doom' ? -1 : null
  const out: ResolvedMoodEvent[] = []
  for (const event of [...events].sort((a, b) => b.w - a.w || a.lead - b.lead)) {
    if (want != null && event.mood !== want) continue
    const found = event.ids.map((id) => byId.get(id)).filter((s): s is DcEditionStory => !!s)
    if (found.length === 0) continue
    const lead = byId.get(event.lead) ?? found[0]
    out.push({ event, lead, others: found.filter((s) => s.id !== lead.id) })
  }
  return out
}

/** Top events per side, for the meter's driver list. */
export function eventDrivers(events: EditionMoodEvent[], stories: DcEditionStory[], side: 'boom' | 'doom', n = 3): ResolvedMoodEvent[] {
  return resolveMoodEvents(events, stories, side).slice(0, n)
}

/**
 * Top drivers per side for editions composed before events-v1 (no stored
 * events): stories with the most stated facts first, then the latest.
 */
export function moodDrivers(stories: DcEditionStory[], side: 'boom' | 'doom', n = 3): DcEditionStory[] {
  const want = side === 'boom' ? 1 : -1
  return stories
    .filter((s) => s.mood === want)
    .sort((a, b) => {
      const fa = (a.facts?.figures.length ?? 0) * 2 + a.tickers.length
      const fb = (b.facts?.figures.length ?? 0) * 2 + b.tickers.length
      if (fb !== fa) return fb - fa
      return Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
    })
    .slice(0, n)
}

// ---------------------------------------------------------------------------
// Geography

export function buildGeo(stories: DcEditionStory[], places: DcPlace[]): EditionGeo {
  const bySlug = new Map(places.map((p) => [p.slug, p]))
  const placeCounts = new Map<string, { count: number; energy: boolean }>()
  const regionCounts = new Map<DcRegionKey, EditionGeoRegion>()
  for (const s of stories) {
    if (s.place && bySlug.has(s.place)) {
      const cur = placeCounts.get(s.place) ?? { count: 0, energy: false }
      cur.count += 1
      cur.energy = cur.energy || s.energy
      placeCounts.set(s.place, cur)
    }
    const region = s.region ?? (s.place ? bySlug.get(s.place)?.region : null) ?? null
    if (region) {
      const cur = regionCounts.get(region) ?? { key: region, count: 0, byLayer: {} }
      cur.count += 1
      if (s.layer) cur.byLayer[s.layer] = (cur.byLayer[s.layer] ?? 0) + 1
      regionCounts.set(region, cur)
    }
  }
  return {
    places: [...placeCounts]
      .map(([slug, v]) => {
        const p = bySlug.get(slug)!
        return { slug, name: p.name, region: p.region, lat: p.lat, lng: p.lng, count: v.count, energy: v.energy }
      })
      .sort((a, b) => b.count - a.count),
    regions: DC_REGION_KEYS.map((k) => regionCounts.get(k)).filter((r): r is EditionGeoRegion => !!r),
  }
}

// ---------------------------------------------------------------------------
// Market tape

export function buildTape(ticks: EditionTapeTick[]): EditionTapeTick[] {
  return [...ticks].sort((a, b) => b.changePct - a.changePct)
}

// ---------------------------------------------------------------------------
// Per-layer visualisations (all drawn from what the day's stories state)

export interface StockName {
  ticker: string
  name: string
  category: string
}

function companyOf(story: DcEditionStory, stocks: Map<string, StockName>): string | null {
  for (const t of story.tickers) {
    const s = stocks.get(t)
    if (s) return s.name
  }
  return null
}

/**
 * A template visualisation with fewer rows is a sentence, not a chart: two
 * bars invite a comparison the reader makes from the numbers alone, and a
 * two-dot timeline is the kind of card this page used to draw. Below this
 * the layer tile prints its notes and no viz. Same floor as the planned
 * charts (MIN_CHART_ROWS in dcEditionCharts).
 */
export const MIN_VIZ_ROWS = 3

const LABEL_STOP = new Set(['the', 'a', 'an', 'of', 'in', 'for', 'and', 'to', 'on', 'at', 'by', 'ai', 'data', 'center', 'centre', 'centers', 'centres', 'usd', 'us'])
const labelWords = (s: string) => new Set(s.toLowerCase().replace(/centre/g, 'center').split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !LABEL_STOP.has(w)))

/** Two figure labels describe the same thing when they share a meaningful word ("fine" / "pollution fine"). */
export function labelsOverlap(a: string, b: string): boolean {
  const wa = labelWords(a)
  const wb = labelWords(b)
  if (wa.size === 0 || wb.size === 0) return false
  for (const w of wa) if (wb.has(w)) return true
  return false
}

/** A stable key for "the same thing": the v3 subject when the figure carries one, else a normalised label. */
export function subjectKey(text: string | null | undefined): string {
  return (text ?? '')
    .toLowerCase()
    .replace(/centre/g, 'center')
    .replace(/\b(inc|corp|co|ltd|plc|llc)\b\.?/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function largestPowerFigure(story: DcEditionStory): { fig: DcStoryFigure; mw: number } | null {
  let best: { fig: DcStoryFigure; mw: number } | null = null
  for (const fig of story.facts?.figures ?? []) {
    const mw = toMw(fig)
    if (mw == null) continue
    if (!best || mw > best.mw) best = { fig, mw }
  }
  return best
}

function placeName(story: DcEditionStory, places: Map<string, DcPlace>): string | null {
  return story.place ? (places.get(story.place)?.name ?? null) : null
}

/** Data centers — MW added per site vs items paused / frozen. */
export function buildCapacityViz(
  stories: DcEditionStory[],
  places: Map<string, DcPlace>,
  stocks: Map<string, StockName>,
): CapacityViz | null {
  const rows: CapacityViz['rows'] = []
  const seen = new Set<string>()
  for (const s of stories) {
    const action = s.facts?.action
    if (action !== 'add' && action !== 'pause' && action !== 'freeze') continue
    const power = largestPowerFigure(s)
    const who = companyOf(s, stocks)
    const where = placeName(s, places)
    const what = power?.fig.label?.trim() || (action === 'add' ? 'capacity added' : action === 'pause' ? 'paused' : 'frozen')
    const label = [where ?? who ?? s.source ?? 'Site', who && where ? `${what} (${who})` : what]
      .filter(Boolean)
      .join(' · ')
    // Two outlets on the same site are one row: the v3 subject when the
    // figure carries one, else the place / company the row is labelled by.
    const key = `${subjectKey(power?.fig.subject ?? where ?? who ?? s.source)}|${action}|${action === 'add' ? power?.mw ?? '' : ''}`
    if (seen.has(key)) continue
    seen.add(key)
    rows.push({ label: shortTitle(label, 30), mw: action === 'add' ? power?.mw ?? null : null, action, storyId: s.id })
  }
  // Five hatched "MW undisclosed" bars over "Added, as stated: 0 MW" is a
  // chart of nothing. The floor counts rows that state a figure; undisclosed
  // and paused rows trail as context but never carry the card.
  if (rows.filter((r) => r.mw != null).length < MIN_VIZ_ROWS) return null
  const order = { add: 0, pause: 1, freeze: 2 }
  rows.sort((a, b) => order[a.action] - order[b.action] || (b.mw ?? -1) - (a.mw ?? -1))
  const kept = rows.slice(0, 6)
  return {
    kind: 'capacity',
    rows: kept,
    addedMw: Math.round(kept.reduce((acc, r) => acc + (r.action === 'add' ? r.mw ?? 0 : 0), 0)),
    pausedCount: kept.filter((r) => r.action !== 'add').length,
  }
}

const MATRIX_ACTIONS = ['Power deal', 'Capacity', 'Permit', 'Pause', 'Disclosure'] as const

function matrixAction(action: string | null | undefined): (typeof MATRIX_ACTIONS)[number] | null {
  switch (action) {
    case 'power-deal':
      return 'Power deal'
    case 'add':
    case 'capacity':
      return 'Capacity'
    case 'permit':
      return 'Permit'
    case 'pause':
    case 'freeze':
      return 'Pause'
    case 'disclosure':
      return 'Disclosure'
    default:
      return null
  }
}

/** Hyperscalers — who moved on what. */
export function buildMatrixViz(stories: DcEditionStory[], stocks: Map<string, StockName>): MatrixViz | null {
  const cells: MatrixViz['cells'] = []
  const perCompany = new Map<string, number>()
  for (const s of stories) {
    const action = matrixAction(s.facts?.action)
    if (!action) continue
    for (const t of s.tickers) {
      const stock = stocks.get(t)
      if (!stock || stock.category !== 'hyperscalers') continue
      if (cells.some((c) => c.company === stock.name && c.action === action)) continue
      cells.push({ company: stock.name, action, label: shortTitle(s.title, 60), storyId: s.id })
      perCompany.set(stock.name, (perCompany.get(stock.name) ?? 0) + 1)
    }
  }
  // A matrix with one column is a list with extra ink: it needs two kinds of
  // move to have a shape, and enough cells to be worth a grid.
  const distinctActions = new Set(cells.map((c) => c.action))
  if (cells.length < MIN_VIZ_ROWS || distinctActions.size < 2) return null
  const companies = [...perCompany].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([n]) => n)
  const keptCompanies = new Set(companies)
  return {
    kind: 'matrix',
    companies,
    actions: MATRIX_ACTIONS.filter((a) => distinctActions.has(a)),
    cells: cells.filter((c) => keptCompanies.has(c.company)),
  }
}

/** Semiconductors — booked-out horizon per supplier. */
export function buildHorizonViz(
  stories: DcEditionStory[],
  stocks: Map<string, StockName>,
  today: number,
): HorizonViz | null {
  const rows: HorizonViz['rows'] = []
  for (const s of stories) {
    const label = shortTitle(companyOf(s, stocks) ?? s.source ?? 'Story', 18)
    const h = s.facts?.horizon
    const from = horizonStart(h?.from)
    const to = horizonEnd(h?.to)
    if (from != null || to != null) {
      const a = from ?? today
      const b = to ?? Math.max(a, today) + 0.75
      const desc = s.facts?.figures[0]?.label?.trim() || shortTitle(s.title, 40)
      rows.push({
        label,
        desc: shortTitle(desc, 34),
        from: Math.min(a, b),
        to: Math.max(a, b, Math.min(a, b) + 0.1),
        style: a > today + 0.05 ? 'later' : 'solid',
        storyId: s.id,
      })
    } else if ((s.facts?.figures.length ?? 0) > 0) {
      const fig = s.facts!.figures[0]
      const desc = fig.label?.trim() ? `${fig.label.trim()} ${formatFigureValue(fig.value, fig.unit)}${fig.unit && !isYearUnit(fig.unit) ? ` ${fig.unit}` : ''}` : shortTitle(s.title, 40)
      rows.push({ label, desc: shortTitle(desc, 34), from: today, to: today, style: 'mark', storyId: s.id })
    }
  }
  rows.sort((a, b) => (a.style === 'mark' ? 1 : 0) - (b.style === 'mark' ? 1 : 0) || b.to - a.to)
  const kept = onePerLabel(rows).slice(0, 5)
  if (kept.length < MIN_VIZ_ROWS) return null
  const maxTo = Math.max(today + 1.5, ...kept.map((r) => r.to))
  return { kind: 'horizon', t0: today - 0.25, t1: maxTo + 0.25, today, rows: kept }
}

/** Semi equipment — orders moving in time. */
export function buildOrdersViz(
  stories: DcEditionStory[],
  stocks: Map<string, StockName>,
  today: number,
): OrdersViz | null {
  const rows: OrdersViz['rows'] = []
  for (const s of stories) {
    const label = shortTitle(companyOf(s, stocks) ?? s.source ?? 'Story', 18)
    const action = s.facts?.action
    const h = s.facts?.horizon
    const from = horizonStart(h?.from)
    const to = horizonEnd(h?.to)
    const desc = shortTitle(s.facts?.figures[0]?.label?.trim() || s.title, 34)
    if (action === 'pull-forward' && (from != null || to != null)) {
      // from = the original (later) date, to = where the orders moved. Both
      // are points on the timeline, so the target reads as a start too.
      const a = from ?? today + 1.5
      const b = horizonStart(h?.to) ?? today + 0.5
      rows.push({ label, desc, from: a, to: Math.abs(a - b) < 0.1 ? a - 0.5 : b, style: 'pull-forward', storyId: s.id })
    } else if (from != null || to != null) {
      const a = from ?? today
      const b = to ?? a + 0.75
      rows.push({
        label,
        desc,
        from: Math.min(a, b),
        to: Math.max(a, b, Math.min(a, b) + 0.1),
        style: action === 'risk' ? 'risk' : 'window',
        storyId: s.id,
      })
    } else if ((s.facts?.figures.length ?? 0) > 0 || action === 'risk' || action === 'pull-forward') {
      rows.push({ label, desc, from: today, to: today, style: action === 'risk' ? 'risk' : 'mark', storyId: s.id })
    }
  }
  const styleOrder = { 'pull-forward': 0, window: 1, risk: 2, mark: 3 }
  rows.sort((a, b) => styleOrder[a.style] - styleOrder[b.style])
  const kept = onePerLabel(rows).slice(0, 5)
  if (kept.length < MIN_VIZ_ROWS) return null
  const maxT = Math.max(today + 1.5, ...kept.map((r) => Math.max(r.from, r.to)))
  return { kind: 'orders', t0: today - 0.25, t1: maxT + 0.3, today, rows: kept }
}

/**
 * One row per supplier / toolmaker: the rows arrive sorted strongest-first
 * (a stated window before a bare mark), so the first row for a label is the
 * one that says most, and a second outlet on the same company adds nothing.
 */
function onePerLabel<R extends { label: string }>(rows: R[]): R[] {
  const seen = new Set<string>()
  return rows.filter((r) => {
    const k = subjectKey(r.label)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export function buildLayerViz(
  layer: DcLayerKey,
  stories: DcEditionStory[],
  opts: { places: Map<string, DcPlace>; stocks: Map<string, StockName>; today: number },
): EditionLayerViz | null {
  const inLayer = stories.filter((s) => s.layer === layer)
  switch (layer) {
    case 'dc':
      // Capacity moves happen across layers (a hyperscaler pause is still a
      // pause on a site), so the ledger reads every story.
      return buildCapacityViz(stories, opts.places, opts.stocks)
    case 'hyper':
      return buildMatrixViz(stories, opts.stocks)
    case 'semi':
      return buildHorizonViz(inLayer, opts.stocks, opts.today)
    case 'equip':
      return buildOrdersViz(inLayer, opts.stocks, opts.today)
  }
}

// ---------------------------------------------------------------------------
// Energy chapter

/** Country behind a place, for the "read alongside" Energy Profile links. */
export const PLACE_COUNTRY: Record<string, { code: string; name: string }> = {
  abilene: { code: 'US', name: 'United States' },
  'n-virginia': { code: 'US', name: 'United States' },
  columbus: { code: 'US', name: 'United States' },
  boise: { code: 'US', name: 'United States' },
  louisiana: { code: 'US', name: 'United States' },
  phoenix: { code: 'US', name: 'United States' },
  dallas: { code: 'US', name: 'United States' },
  atlanta: { code: 'US', name: 'United States' },
  chicago: { code: 'US', name: 'United States' },
  'santa-clara': { code: 'US', name: 'United States' },
  seattle: { code: 'US', name: 'United States' },
  memphis: { code: 'US', name: 'United States' },
  montreal: { code: 'CA', name: 'Canada' },
  seoul: { code: 'KR', name: 'South Korea' },
  hsinchu: { code: 'TW', name: 'Taiwan' },
  tokyo: { code: 'JP', name: 'Japan' },
  shanghai: { code: 'CN', name: 'China' },
  beijing: { code: 'CN', name: 'China' },
  singapore: { code: 'SG', name: 'Singapore' },
  dublin: { code: 'IE', name: 'Ireland' },
  amsterdam: { code: 'NL', name: 'Netherlands' },
  veldhoven: { code: 'NL', name: 'Netherlands' },
  frankfurt: { code: 'DE', name: 'Germany' },
  london: { code: 'GB', name: 'United Kingdom' },
  paris: { code: 'FR', name: 'France' },
  oslo: { code: 'NO', name: 'Norway' },
  madrid: { code: 'ES', name: 'Spain' },
  jamnagar: { code: 'IN', name: 'India' },
  mumbai: { code: 'IN', name: 'India' },
  bengaluru: { code: 'IN', name: 'India' },
  'abu-dhabi': { code: 'AE', name: 'United Arab Emirates' },
  riyadh: { code: 'SA', name: 'Saudi Arabia' },
  doha: { code: 'QA', name: 'Qatar' },
  sydney: { code: 'AU', name: 'Australia' },
  'sao-paulo': { code: 'BR', name: 'Brazil' },
  johannesburg: { code: 'ZA', name: 'South Africa' },
}

/** Power committed in the window's disclosed deals: one part per story, GW. */
export function powerCommitted(
  stories: DcEditionStory[],
  places: Map<string, DcPlace>,
  stocks: Map<string, StockName>,
): { total: number; parts: EditionEnergy['composition'] } {
  const parts: EditionEnergy['composition'] = []
  for (const s of stories) {
    if (!s.energy) continue
    if (!isCommittedPower(s)) continue
    const power = largestPowerFigure(s)
    if (!power) continue
    const what = power.fig.label?.trim() || 'Power'
    const where = placeName(s, places) ?? companyOf(s, stocks) ?? s.source ?? ''
    parts.push({ label: where ? `${shortTitle(what, 18)} · ${shortTitle(where, 14)}` : shortTitle(what, 30), gw: Math.round((power.mw / 1000) * 100) / 100, storyId: s.id })
  }
  parts.sort((a, b) => b.gw - a.gw)
  const kept = parts.slice(0, 5)
  return { total: Math.round(kept.reduce((a, p) => a + p.gw, 0) * 100) / 100, parts: kept }
}

/**
 * Did this story report power that somebody actually committed — a PPA, a
 * generation block, a tender that was let? Queue reports, pauses and
 * turbine-delivery warnings carry GW figures too, but nobody committed them,
 * so they never belong on a bar of committed capacity. The energy chapter and
 * the composition share this test so the two can't drift apart.
 */
export function isCommittedPower(s: DcEditionStory): boolean {
  const action = s.facts?.action
  return action === 'power-deal' || (s.theme === 'power' && (action === 'add' || action === 'capacity'))
}

export function buildEnergy(
  stories: DcEditionStory[],
  ieaStories: DcEditionStory[],
  opts: {
    places: Map<string, DcPlace>
    stocks: Map<string, StockName>
    /** Previous editions' disclosed power, oldest first (this edition is appended); null = disclosed none. */
    history: { date: string; label: string; gw: number | null }[]
    editionDate: string
  },
): EditionEnergy {
  const energyStories = stories.filter((s) => s.energy)
  const { total, parts } = powerCommitted(stories, opts.places, opts.stocks)
  const usedStories = new Set(parts.map((p) => p.storyId))

  // Figure tiles: the most telling stated number per remaining energy story
  // — power and dates outrank shares and counts — with distinct units first
  // so the row reads as three different things.
  const candidates: { value: string; unit: string | null; label: string; storyId: number; weight: number; raw: number }[] = []
  for (const s of energyStories) {
    if (usedStories.has(s.id)) continue
    const figs = [...(s.facts?.figures ?? [])].sort((a, b) => figureWeight(b.unit) - figureWeight(a.unit) || b.value - a.value)
    const fig = figs[0]
    if (!fig) continue
    const year = isYearUnit(fig.unit)
    candidates.push({
      value: formatFigureValue(fig.value, fig.unit),
      unit: year ? null : fig.unit || null,
      label: shortTitle(fig.label?.trim() || s.title, 70),
      storyId: s.id,
      weight: figureWeight(fig.unit),
      raw: fig.value,
    })
  }
  candidates.sort((a, b) => b.weight - a.weight || b.raw - a.raw)
  const seenUnits = new Set<string>()
  const figures: EditionEnergy['figures'] = []
  for (const c of candidates) {
    const key = c.unit ?? 'year'
    if (seenUnits.has(key)) continue
    seenUnits.add(key)
    figures.push({ value: c.value, unit: c.unit, label: c.label, storyId: c.storyId })
    if (figures.length === 3) break
  }
  for (const c of candidates) {
    if (figures.length >= 3) break
    if (figures.some((f) => f.storyId === c.storyId)) continue
    figures.push({ value: c.value, unit: c.unit, label: c.label, storyId: c.storyId })
  }

  const countryCounts = new Map<string, { name: string; n: number }>()
  for (const s of energyStories) {
    const c = s.place ? PLACE_COUNTRY[s.place] : null
    if (!c) continue
    const cur = countryCounts.get(c.code) ?? { name: c.name, n: 0 }
    cur.n += 1
    countryCounts.set(c.code, cur)
  }
  const links = [...countryCounts]
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 2)
    .map(([code, v]) => ({ label: `Energy Profile → ${v.name}`, href: `/energy-profile?country=${code}` }))

  const label = formatEditionDayLabel(opts.editionDate)
  // An edition where nobody put a number on the record contributes a gap, not
  // a zero: `null` here is what keeps the history chart from drawing silence
  // as "0 GW disclosed".
  const perEdition = [...opts.history.slice(-6), { date: opts.editionDate, label, gw: parts.length > 0 ? total : null }]

  return {
    hero: parts.length > 0 ? { value: total, unit: 'GW', label: "Power committed in today's disclosed deals" } : null,
    composition: parts,
    perEdition,
    figures,
    storyCount: energyStories.length + ieaStories.length,
    links,
  }
}

/**
 * What a stated figure *is*, from the unit the story used. The energy chapter
 * groups by this: power figures can share a bar, a percentage and a year
 * cannot sit on the same scale.
 */
export type DcFigureKind = 'power' | 'energy' | 'share' | 'money' | 'horizon' | 'term' | 'count'

export function figureKind(unit: string): DcFigureKind {
  const u = unit.trim().toLowerCase()
  if (u === 'gw' || u === 'mw' || u === 'kw') return 'power'
  if (u === 'gwh' || u === 'mwh' || u === 'twh') return 'energy'
  if (u === '%') return 'share'
  if (/\btn\b|trillion|\bbn\b|billion|\bmn\b|million|\$|€|£/.test(u)) return 'money'
  if (isYearUnit(u)) return 'horizon'
  if (u === 'years' || u === 'months' || u === 'days') return 'term'
  return 'count'
}

/**
 * A figure's size in its dimension's base unit — MW for power, MWh for
 * energy, millions for money, the bare number for a share — or null when the
 * dimension has no scale (a year, a count, a term). 20 GW and 640 MW are the
 * same kind of quantity written in different units: comparing the numerals
 * would rank 640 above 20, so both convert first. Units outside a dimension
 * never meet — a percentage still never sits on a power scale.
 *
 * Written to `dc_news.facts.figures[].base` at ingest (classifier v3) and
 * recomputed here for rows tagged before that.
 */
export function figureMagnitude(f: { value: number; unit: string; base?: number | null }): number | null {
  if (typeof f.base === 'number' && Number.isFinite(f.base)) return f.base
  const u = f.unit.trim().toLowerCase()
  switch (figureKind(u)) {
    case 'power':
      return u === 'gw' ? f.value * 1000 : u === 'kw' ? f.value / 1000 : f.value
    case 'energy':
      return u === 'twh' ? f.value * 1e6 : u === 'gwh' ? f.value * 1000 : f.value
    case 'share':
      return f.value
    case 'money':
      return /\btn\b|trillion/.test(u) ? f.value * 1e6 : /\bbn\b|billion/.test(u) ? f.value * 1000 : /\bmn\b|million/.test(u) ? f.value : null
    default:
      return null
  }
}

/** How much a stated figure says on its own: power and dates first, bare counts last. */
function figureWeight(unit: string): number {
  const u = unit.trim().toLowerCase()
  if (u === 'gw') return 5
  if (u === 'mw' || isYearUnit(u)) return 4
  if (u === '%' || u === 'gwh' || u === 'mwh' || /bn|billion|\$/.test(u) || u.startsWith('/')) return 3
  if (u === 'years' || u === 'months') return 2
  return 1
}


// ---------------------------------------------------------------------------
// Research

export function fieldBaseline(papers: { area: DcPaperArea | null }[], days: number): Record<DcPaperArea, number> {
  const out = emptyFieldBaseline()
  if (days <= 0) return out
  for (const p of papers) if (p.area) out[p.area] += 1
  for (const k of DC_PAPER_AREA_KEYS) out[k] = Math.round((out[k] / days) * 10) / 10
  return out
}

/** '+7.2 pts' / '2.3×' / '+18%' / '0.74 → 0.91' for a paper's headline result. */
export function paperGainText(p: Pick<DcPaper, 'unit' | 'baseline' | 'result'>): string {
  const { unit, baseline, result } = p
  if (result == null) return '—'
  if (unit === '×' || unit === 'x') return `${result.toFixed(1)}×`
  if (unit === '%') return `${result > 0 ? '+' : ''}${formatFigureValue(result, null)}%`
  if (unit === 'pts' && baseline != null) return `+${(result - baseline).toFixed(1)} pts`
  if (baseline != null) return `${baseline} → ${result}`
  return formatFigureValue(result, null)
}

/** Longer variant for the paper panel ('71.2 → 78.4 (+7.2)'). */
export function paperGainDetail(p: Pick<DcPaper, 'unit' | 'baseline' | 'result'>): string {
  const { unit, baseline, result } = p
  if (result == null) return '—'
  if (unit === '×' || unit === 'x') return `${result.toFixed(1)}×`
  if (unit === '%') return `${result > 0 ? '+' : ''}${formatFigureValue(result, null)}%`
  if (unit === 'pts' && baseline != null) return `${baseline} → ${result} (+${(result - baseline).toFixed(1)})`
  if (baseline != null) return `${baseline} → ${result}`
  return formatFigureValue(result, null)
}

/**
 * One normalised "gain" scale for the results-at-scale scatter. Not clamped:
 * a ceiling pinned every large result to one point and stacked their labels;
 * the plot sizes its axis to the largest gain instead.
 */
export function paperGainNorm(p: Pick<DcPaper, 'unit' | 'baseline' | 'result'>): number {
  const { unit, baseline, result } = p
  if (result == null) return 0
  let v: number
  if (unit === 'pts' && baseline != null) v = result - baseline
  else if (unit === '×' || unit === 'x') v = (result - 1) * 10
  else if (unit === '%') v = Math.abs(result) * 0.6
  else if (baseline != null && baseline !== 0) v = (Math.abs(result - baseline) / Math.abs(baseline)) * 25
  else v = Math.abs(result)
  return Math.max(0, v)
}

// ---------------------------------------------------------------------------
// Sources chapter (derived, never written)

export interface SourceItem {
  n: number
  title: string
  url: string
  domain: string
  /** 'HH:MM' for a story, null for a paper. */
  when: string | null
  kind: 'story' | 'paper'
}

export interface SourceGroup {
  name: string
  items: SourceItem[]
}

export function deriveSources(
  stories: DcEditionStory[],
  ieaStories: DcEditionStory[],
  papers: DcPaper[],
): SourceGroup[] {
  const groups = new Map<string, SourceItem[]>()
  const seen = new Set<string>()
  const all = [...stories, ...ieaStories].sort((a, b) => Date.parse(a.publishedAt) - Date.parse(b.publishedAt))
  for (const s of all) {
    if (seen.has(s.url)) continue
    seen.add(s.url)
    const name = s.source?.trim() || (s.kind === 'iea' ? 'IEA' : domainOf(s.url))
    const arr = groups.get(name) ?? []
    arr.push({ n: 0, title: s.title, url: s.url, domain: domainOf(s.url), when: timeHm(s.publishedAt), kind: 'story' })
    groups.set(name, arr)
  }
  const ordered = [...groups].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
  const out: SourceGroup[] = ordered.map(([name, items]) => ({ name, items }))
  if (papers.length > 0) {
    out.push({
      name: 'Research',
      items: papers.map((p) => ({
        n: 0,
        title: `arXiv:${p.arxivId}`,
        url: arxivUrl(p.arxivId),
        domain: shortTitle(p.title, 48),
        when: null,
        kind: 'paper' as const,
      })),
    })
  }
  let n = 0
  for (const g of out) for (const it of g.items) it.n = ++n
  return out
}

export function arxivUrl(arxivId: string): string {
  return `https://arxiv.org/abs/${arxivId}`
}

// ---------------------------------------------------------------------------
// Counts

export function buildCounts(input: {
  stories: DcEditionStory[]
  ieaStories: DcEditionStory[]
  papers: DcPaper[]
  tape: EditionTapeTick[]
  geo: EditionGeo
}): EditionCounts {
  const urls = new Set<string>()
  const outlets = new Set<string>()
  for (const s of [...input.stories, ...input.ieaStories]) {
    urls.add(s.url)
    outlets.add(s.source?.trim() || domainOf(s.url))
  }
  for (const p of input.papers) urls.add(arxivUrl(p.arxivId))
  if (input.papers.length > 0) outlets.add('arXiv')
  return {
    stories: input.stories.length,
    papers: input.papers.length,
    tickers: input.tape.length,
    places: input.geo.places.length,
    energy: input.stories.filter((s) => s.energy).length + input.ieaStories.length,
    links: urls.size,
    outlets: outlets.size,
  }
}

// ---------------------------------------------------------------------------
// Prose: source resolution, metric grounding, deterministic fallback

export function storySource(s: DcEditionStory): EditionSource {
  return { name: s.source?.trim() || domainOf(s.url), url: s.url }
}

function dedupeSources(sources: EditionSource[]): EditionSource[] {
  const seen = new Set<string>()
  return sources.filter((s) => {
    if (!s.url || seen.has(s.url)) return false
    seen.add(s.url)
    return true
  })
}

/**
 * A note's lead number must come from the stories it cites. If the metric
 * carries digits that none of the cited stories state (title, summary or an
 * extracted figure), it is replaced by the first stated figure among the
 * cited stories — or dropped, so the note renders as prose only.
 */
export function groundNoteMetric(
  note: EditionNote,
  cited: DcEditionStory[],
): Pick<EditionNote, 'metric' | 'unit'> {
  const metric = note.metric?.trim() || null
  if (!metric) return { metric: null, unit: null }
  const digits = metric.match(/\d[\d,.]*/g)
  if (!digits) return { metric, unit: note.unit?.trim() || null }
  const haystack = cited
    .map((s) => [s.title, s.summary ?? '', ...(s.facts?.figures.map((f) => `${f.value} ${f.unit} ${f.label}`) ?? [])].join(' '))
    .join(' \n ')
    .replace(/,/g, '')
  const stated = digits.every((d) => {
    const clean = d.replace(/,/g, '')
    const num = Number(clean)
    if (haystack.includes(clean)) return true
    // '4.6 GW' may be stated as '4,600 MW' or '4600 MW' — accept unit-converted power.
    if (Number.isFinite(num) && /gw/i.test(note.unit ?? '')) {
      return haystack.includes(String(Math.round(num * 1000)))
    }
    return false
  })
  if (stated) return { metric, unit: note.unit?.trim() || null }
  for (const s of cited) {
    const fig = s.facts?.figures[0]
    if (fig) return { metric: formatFigureValue(fig.value, fig.unit), unit: isYearUnit(fig.unit) ? null : fig.unit || null }
  }
  return { metric: null, unit: null }
}

function topThemes(stories: DcEditionStory[]): DcThemeKey[] {
  const counts = new Map<DcThemeKey, number>()
  for (const s of stories) if (s.theme) counts.set(s.theme, (counts.get(s.theme) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1]).map(([k]) => k)
}

function byWeight(a: DcEditionStory, b: DcEditionStory): number {
  const wa = (a.facts?.figures.length ?? 0) * 3 + a.tickers.length * 2 + (a.place ? 1 : 0)
  const wb = (b.facts?.figures.length ?? 0) * 3 + b.tickers.length * 2 + (b.place ? 1 : 0)
  if (wb !== wa) return wb - wa
  return Date.parse(b.publishedAt) - Date.parse(a.publishedAt)
}

/**
 * The deterministic edition: headline from the top theme's lead story, notes
 * from the largest stated figures, layer briefs from each layer's lead
 * stories. Used when the model fails, so the cron never goes dark.
 */
export function deterministicText(input: {
  stories: DcEditionStory[]
  papers: DcPaper[]
  places: Map<string, DcPlace>
}): EditionText {
  const { stories, papers, places } = input
  const themes = topThemes(stories)
  const ranked = [...stories].sort(byWeight)
  const lead = themes[0] ? ranked.find((s) => s.theme === themes[0]) ?? ranked[0] : ranked[0]
  const placeCount = new Set(stories.map((s) => s.place).filter(Boolean)).size
  const themeNames = themes.slice(0, 3).map((t) => DC_THEMES[t].name.toLowerCase())

  const headline = lead ? shortTitle(lead.title, 110) : 'A quiet day in the AI build-out'
  const sub = stories.length
    ? `${stories.length} stor${stories.length === 1 ? 'y' : 'ies'} across ${placeCount} place${placeCount === 1 ? '' : 's'}${
        themeNames.length ? `; ${joinList(themeNames)} led the day` : ''
      }. This edition was assembled deterministically from the tagged feed.`
    : 'No relevant stories were classified in this window. This edition was assembled deterministically.'

  // Notes: the six largest stated figures, one per story.
  const figureNotes: EditionNote[] = []
  for (const s of ranked) {
    const figs = [...(s.facts?.figures ?? [])].sort((a, b) => b.value - a.value)
    const fig = figs[0]
    if (!fig) continue
    figureNotes.push({
      metric: formatFigureValue(fig.value, fig.unit),
      unit: isYearUnit(fig.unit) ? null : fig.unit || null,
      label: shortTitle(fig.label?.trim() || (s.theme ? DC_THEMES[s.theme].name : 'as stated'), 60),
      text: s.title,
      sources: [storySource(s)],
      energy: s.energy,
    })
    if (figureNotes.length === 6) break
  }
  const usedIds = new Set<number>()
  for (const s of ranked) {
    if (figureNotes.length >= 6) break
    if (figureNotes.some((n) => n.sources[0]?.url === s.url)) continue
    if (usedIds.has(s.id)) continue
    usedIds.add(s.id)
    figureNotes.push({
      metric: null,
      unit: null,
      label: s.theme ? DC_THEMES[s.theme].name : s.layer ? DC_LAYERS[s.layer].name : 'Story',
      text: s.title,
      sources: [storySource(s)],
      energy: s.energy,
    })
  }

  const layers = {} as EditionText['layers']
  for (const k of DC_LAYER_KEYS) {
    const inLayer = ranked.filter((s) => s.layer === k)
    const layerThemes = topThemes(inLayer).slice(0, 2).map((t) => DC_THEMES[t].name.toLowerCase())
    const notes: EditionLayerNote[] = inLayer.slice(0, 3).map((s) => ({ text: s.title, sources: [storySource(s)] }))
    layers[k] = {
      headline: inLayer[0] ? shortTitle(inLayer[0].title, 90) : `No ${DC_LAYERS[k].name.toLowerCase()} stories in this window`,
      sub: inLayer.length
        ? `${inLayer.length} stor${inLayer.length === 1 ? 'y' : 'ies'}${layerThemes.length ? ` · ${joinList(layerThemes)}` : ''}${
            placesIn(inLayer, places).length ? ` · ${joinList(placesIn(inLayer, places))}` : ''
          }.`
        : '',
      notes,
    }
  }

  const areas = new Set(papers.map((p) => p.area).filter(Boolean))
  const research = {
    headline: papers.length
      ? `${papers.length} paper${papers.length === 1 ? '' : 's'} across ${areas.size} field${areas.size === 1 ? '' : 's'}`
      : 'No papers passed the gate in this window',
    sub: papers[0]?.why ?? '',
  }

  return { headline, sub, notes: figureNotes, layers, research }
}

function placesIn(stories: DcEditionStory[], places: Map<string, DcPlace>): string[] {
  const names = new Set<string>()
  for (const s of stories) {
    const p = s.place ? places.get(s.place) : null
    if (p) names.add(p.name)
  }
  return [...names].slice(0, 3)
}

export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
}

/** Resolve a model's `sourceIdxs` into sources, keeping only real stories. */
export function sourcesFromIdxs(idxs: unknown, stories: DcEditionStory[]): EditionSource[] {
  if (!Array.isArray(idxs)) return []
  const out: EditionSource[] = []
  for (const i of idxs) {
    if (!Number.isInteger(i) || i < 0 || i >= stories.length) continue
    out.push(storySource(stories[i as number]))
  }
  return dedupeSources(out)
}

// ---------------------------------------------------------------------------
// Editor edits: dot-path helpers over EditionText

export const EDITABLE_PATH_RE =
  /^(headline|sub|notes\.\d+\.(metric|unit|label|text|sources|energy)|layers\.(dc|hyper|semi|equip)\.(headline|sub|notes\.\d+\.(text|sources))|research\.(headline|sub))$/

export function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

export function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    const next = cur[k]
    if (next == null || typeof next !== 'object') {
      cur[k] = /^\d+$/.test(keys[i + 1]) ? [] : {}
    }
    cur = cur[k] as Record<string, unknown>
  }
  cur[keys[keys.length - 1]] = value
}

/** Overlay the editor's kept fields from `current` onto freshly generated `next`. */
export function overlayEditedFields(next: EditionText, current: EditionText, editedFields: string[]): EditionText {
  const out = JSON.parse(JSON.stringify(next)) as EditionText
  for (const path of editedFields) {
    if (!EDITABLE_PATH_RE.test(path)) continue
    const v = getPath(current, path)
    if (v === undefined) continue
    setPath(out as unknown as Record<string, unknown>, path, JSON.parse(JSON.stringify(v)))
  }
  return out
}

/** Flatten an EditionText into dot-path → value for diffing in the admin. */
export function flattenText(text: EditionText): Record<string, string> {
  const out: Record<string, string> = {}
  out.headline = text.headline
  out.sub = text.sub
  text.notes.forEach((n, i) => {
    out[`notes.${i}.metric`] = n.metric ?? ''
    out[`notes.${i}.unit`] = n.unit ?? ''
    out[`notes.${i}.label`] = n.label
    out[`notes.${i}.text`] = n.text
  })
  for (const k of DC_LAYER_KEYS) {
    const l = text.layers[k]
    if (!l) continue
    out[`layers.${k}.headline`] = l.headline
    out[`layers.${k}.sub`] = l.sub
    l.notes.forEach((n, i) => {
      out[`layers.${k}.notes.${i}.text`] = n.text
    })
  }
  out['research.headline'] = text.research.headline
  out['research.sub'] = text.research.sub
  return out
}
