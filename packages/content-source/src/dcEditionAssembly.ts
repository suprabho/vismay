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
  type CapacityViz,
  type DcEditionStory,
  type DcLayerKey,
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
// Mood

export function scoreMood(stories: DcEditionStory[]): { score: number | null; counts: EditionMoodCounts } {
  const counts: EditionMoodCounts = { boom: 0, doom: 0, neutral: 0 }
  for (const s of stories) {
    if (s.mood === 1) counts.boom += 1
    else if (s.mood === -1) counts.doom += 1
    else counts.neutral += 1
  }
  const scored = counts.boom + counts.doom
  const score = scored === 0 ? null : Math.round(((counts.boom - counts.doom) / scored) * 1000) / 1000
  return { score, counts }
}

/** Top drivers per side: stories with the most stated facts first, then the latest. */
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
    rows.push({ label: shortTitle(label, 30), mw: action === 'add' ? power?.mw ?? null : null, action, storyId: s.id })
  }
  if (rows.length === 0) return null
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
  if (cells.length === 0) return null
  const companies = [...perCompany].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map(([n]) => n)
  const keptCompanies = new Set(companies)
  return {
    kind: 'matrix',
    companies,
    actions: [...MATRIX_ACTIONS],
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
  if (rows.length === 0) return null
  rows.sort((a, b) => (a.style === 'mark' ? 1 : 0) - (b.style === 'mark' ? 1 : 0) || b.to - a.to)
  const kept = rows.slice(0, 5)
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
  if (rows.length === 0) return null
  const styleOrder = { 'pull-forward': 0, window: 1, risk: 2, mark: 3 }
  rows.sort((a, b) => styleOrder[a.style] - styleOrder[b.style])
  const kept = rows.slice(0, 5)
  const maxT = Math.max(today + 1.5, ...kept.map((r) => Math.max(r.from, r.to)))
  return { kind: 'orders', t0: today - 0.25, t1: maxT + 0.3, today, rows: kept }
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
    // Power committed = deals and procurement the story reports as done
    // (a PPA, a generation block, a tender). Queue reports, pauses and
    // turbine-delivery warnings carry GW figures too, but nobody committed
    // them — they belong in the figure tiles, not the composition.
    const action = s.facts?.action
    const counts = action === 'power-deal' || (s.theme === 'power' && (action === 'add' || action === 'capacity'))
    if (!counts) continue
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

export function buildEnergy(
  stories: DcEditionStory[],
  ieaStories: DcEditionStory[],
  opts: {
    places: Map<string, DcPlace>
    stocks: Map<string, StockName>
    /** Previous editions' disclosed power, oldest first (this edition is appended). */
    history: { date: string; label: string; gw: number }[]
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
  const perEdition = [...opts.history.slice(-6), { date: opts.editionDate, label, gw: total }]

  return {
    hero: parts.length > 0 ? { value: total, unit: 'GW', label: "Power committed in today's disclosed deals" } : null,
    composition: parts,
    perEdition,
    figures,
    storyCount: energyStories.length + ieaStories.length,
    links,
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

/** One normalised "gain" scale for the results-at-scale scatter (0–25). */
export function paperGainNorm(p: Pick<DcPaper, 'unit' | 'baseline' | 'result'>): number {
  const { unit, baseline, result } = p
  if (result == null) return 0
  let v: number
  if (unit === 'pts' && baseline != null) v = result - baseline
  else if (unit === '×' || unit === 'x') v = (result - 1) * 10
  else if (unit === '%') v = Math.abs(result) * 0.6
  else if (baseline != null && baseline !== 0) v = (Math.abs(result - baseline) / Math.abs(baseline)) * 25
  else v = Math.abs(result)
  return Math.max(0, Math.min(25, v))
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
