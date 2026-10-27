/**
 * The 100 Desk's live profile of the person a spin drew, read after the draw
 * from three open sources (docs/hundred-randomizer-plan.md section 1):
 *
 *   - Wikidata's SPARQL endpoint: the one-line description, birth and death
 *     at the precision Wikidata records them (day, year, century), the
 *     places with their coordinates, the portrait (P18, withheld for anyone
 *     the dataset flags `no-portrait`) and the number of Wikipedia editions
 *     with an article (CC0);
 *   - the English Wikipedia REST summary: the first paragraph and the
 *     article URL (CC BY-SA, so it is context for the agent, never pasted
 *     onto a page);
 *   - Wikimedia's pageviews API: twelve full months of English Wikipedia
 *     views by user agents (CC0), the one live series every lens can chart.
 *
 * Pure apart from fetch (no Supabase), so spins.ts, the pool API and the
 * tests can all use it. It never throws: each source's state is recorded in
 * HundredProfile.sources and the brief says what to look up by hand.
 */

import type { HundredLifeEvent, HundredPerson, HundredProfile } from './types'

export const HUNDRED_RULES = {
  sparql: 'https://query.wikidata.org/sparql',
  wikipediaApi: 'https://en.wikipedia.org/api/rest_v1',
  pageviewsApi: 'https://wikimedia.org/api/rest_v1/metrics/pageviews',
  timeoutMs: 12_000,
  /** Full months of pageviews kept. */
  pageviewMonths: 12,
  userAgent: 'vismay-randomizer/0.1 (the 100 desk; https://vizmaya.fyi)',
} as const

type Fetch = typeof fetch

export interface HundredLoadOptions {
  now?: Date
  fetch?: Fetch
}

async function getJson<T>(url: string, fetchImpl: Fetch, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetchImpl(url, {
    headers: { accept: 'application/json', 'user-agent': HUNDRED_RULES.userAgent, ...headers },
    signal: AbortSignal.timeout(HUNDRED_RULES.timeoutMs),
  })
  if (!res.ok) throw new Error(`${new URL(url).host}: HTTP ${res.status}`)
  return (await res.json()) as T
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** The English Wikipedia URL of a title. */
export function wikipediaUrl(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}

/* ---------- Wikidata ---------- */

type SparqlBinding = Record<string, { value: string } | undefined>

export function hundredProfileQuery(item: string): string {
  return `SELECT ?desc ?birth ?birthPrec ?death ?deathPrec ?bpLabel ?bpCoord ?dpLabel ?dpCoord ?image ?sitelinks WHERE {
  VALUES ?p { wd:${item} }
  OPTIONAL { ?p schema:description ?desc . FILTER(LANG(?desc) = "en") }
  OPTIONAL { ?p p:P569/psv:P569 [ wikibase:timeValue ?birth ; wikibase:timePrecision ?birthPrec ] }
  OPTIONAL { ?p p:P570/psv:P570 [ wikibase:timeValue ?death ; wikibase:timePrecision ?deathPrec ] }
  OPTIONAL { ?p wdt:P19 ?bp . OPTIONAL { ?bp wdt:P625 ?bpCoord } }
  OPTIONAL { ?p wdt:P20 ?dp . OPTIONAL { ?dp wdt:P625 ?dpCoord } }
  OPTIONAL { ?p wdt:P18 ?image }
  OPTIONAL { ?p wikibase:sitelinks ?sitelinks }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const ordinal = (n: number) => {
  const tail = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${tail}`
}

/**
 * A Wikidata time value ("-0383-01-01T00:00:00Z", astronomical years) at
 * its precision (11 day, 10 month, 9 year, 8 decade, 7 century, 6
 * millennium) as a reader writes it.
 */
export function formatWikidataTime(value: string, precision: number): { date: string; year: number } | null {
  const m = /^([+-]?\d+)-(\d\d)-(\d\d)/.exec(value)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const bce = year <= 0
  const y = bce ? 1 - year : year
  const era = bce ? ' BCE' : ''
  let date: string
  if (precision >= 11 && month && day) date = `${day} ${MONTHS[month - 1]} ${y}${era}`
  else if (precision === 10 && month) date = `${MONTHS[month - 1]} ${y}${era}`
  else if (precision === 9) date = `${y}${era}`
  else if (precision === 8) date = `${Math.floor(y / 10) * 10}s${era}`
  else if (precision === 7) date = `${ordinal(Math.floor((y - 1) / 100) + 1)} century${era}`
  else if (precision <= 6) date = `${ordinal(Math.floor((y - 1) / 1000) + 1)} millennium${era}`
  else date = `${y}${era}`
  return { date: precision < 9 ? `c. ${date}` : date, year }
}

/** "Point(-0.1275 51.5072)" as lat, lon. */
export function parsePoint(value: string | undefined): { lat: number; lon: number } | null {
  const m = value ? /^Point\(([-\d.eE]+) ([-\d.eE]+)\)$/.exec(value.trim()) : null
  if (!m) return null
  const lon = Number(m[1])
  const lat = Number(m[2])
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null
}

/** A Commons Special:FilePath URL as its file page, for the licence. */
export function commonsFilePage(image: string): string | null {
  const m = /Special:FilePath\/(.+)$/.exec(image)
  return m ? `https://commons.wikimedia.org/wiki/File:${m[1]}` : null
}

export interface WikidataProfile {
  description: string | null
  born: HundredLifeEvent | null
  died: HundredLifeEvent | null
  image: string | null
  sitelinks: number | null
}

/**
 * The query's rows as one profile: the first value of each field. Wikidata
 * keeps disputed dates side by side (the Buddha's birth in 623 or 563 BCE),
 * so when a person has several the date names each year once (at its most
 * precise), earliest first, rather than picking one; an unknown place (a
 * blank node) or an item with no English label is left out.
 */
export function profileFromSparql(rows: SparqlBinding[]): WikidataProfile {
  const first = (key: string) => rows.map((r) => r[key]?.value).find((v) => !!v) ?? null
  const event = (dateKey: string, precKey: string, labelKey: string, coordKey: string): HundredLifeEvent | null => {
    // One value per year, the most precise; coarser than a year only when nothing finer is on record.
    const byYear = new Map<number, { date: string; year: number; p: number }>()
    for (const r of rows) {
      const v = r[dateKey]?.value
      const p = Number(r[precKey]?.value ?? 9)
      const t = v ? formatWikidataTime(v, p) : null
      if (t && (byYear.get(t.year)?.p ?? -1) < p) byYear.set(t.year, { ...t, p })
    }
    let times = [...byYear.values()].sort((a, b) => a.year - b.year)
    if (times.some((t) => t.p >= 9)) times = times.filter((t) => t.p >= 9)
    const dates = times.map((t) => t.date)
    const place = first(labelKey)
    const point = parsePoint(rows.map((r) => r[coordKey]?.value).find((v) => !!v))
    const named = place && !/^(Q\d+|https?:)/.test(place) ? place : null
    if (!times.length && !named) return null
    return {
      date: dates.length > 1 ? `${dates.join(' or ')} (sources differ)` : (dates[0] ?? null),
      year: times[0]?.year ?? null,
      place: named,
      lat: point?.lat ?? null,
      lon: point?.lon ?? null,
    }
  }
  const sitelinks = first('sitelinks')
  return {
    description: first('desc'),
    born: event('birth', 'birthPrec', 'bpLabel', 'bpCoord'),
    died: event('death', 'deathPrec', 'dpLabel', 'dpCoord'),
    image: first('image')?.replace(/^http:/, 'https:') ?? null,
    sitelinks: sitelinks !== null && Number.isFinite(Number(sitelinks)) ? Number(sitelinks) : null,
  }
}

/* ---------- Wikipedia and pageviews ---------- */

export interface WikipediaSummary {
  extract?: string | null
  content_urls?: { desktop?: { page?: string } }
}

export interface PageviewsBody {
  items?: Array<{ timestamp?: string; views?: number }>
}

/** The pageviews window: the twelve full months before `now`, as the API's YYYYMMDDHH bounds. */
export function pageviewWindow(now: Date, months: number = HUNDRED_RULES.pageviewMonths): { start: string; end: string } {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - months, 1))
  const stamp = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}0100`
  // The end bound is inclusive; the last full month starts the month before `end`.
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 1, 1))
  return { start: stamp(start), end: stamp(last) }
}

export function pageviewsFromBody(body: PageviewsBody): Array<{ month: string; views: number }> {
  return (body.items ?? [])
    .flatMap((i) => (i.timestamp && typeof i.views === 'number' ? [{ month: `${i.timestamp.slice(0, 4)}-${i.timestamp.slice(4, 6)}`, views: i.views }] : []))
    .sort((a, b) => a.month.localeCompare(b.month))
}

/**
 * The API sometimes answers the newest month before it is fully counted (a
 * month at a few percent of the others): drop a last month below a quarter
 * of the median of the rest, so a chart never shows a collapse that did not
 * happen. Returns the series and the month dropped, if any.
 */
export function completeMonths(series: Array<{ month: string; views: number }>): { series: Array<{ month: string; views: number }>; dropped: string | null } {
  if (series.length < 4) return { series, dropped: null }
  const rest = series.slice(0, -1).map((v) => v.views).sort((a, b) => a - b)
  const median = rest[Math.floor(rest.length / 2)]!
  const last = series[series.length - 1]!
  return last.views < median / 4 ? { series: series.slice(0, -1), dropped: last.month } : { series, dropped: null }
}

/* ---------- The profile ---------- */

/**
 * Everything the brief reads about one person, from the three sources in
 * parallel. Never throws: a failed source leaves its fields empty, records
 * the error and is marked `failed`.
 */
export async function loadHundredProfile(person: Pick<HundredPerson, 'name' | 'wiki' | 'wikidata' | 'flags'>, opts: HundredLoadOptions = {}): Promise<HundredProfile> {
  const fetchImpl = opts.fetch ?? fetch
  const now = opts.now ?? new Date()
  const title = encodeURIComponent(person.wiki.replace(/ /g, '_'))
  const span = pageviewWindow(now)
  const errors: string[] = []
  const notes: string[] = []

  const [wd, wp, pv] = await Promise.allSettled([
    getJson<{ results?: { bindings?: SparqlBinding[] } }>(
      `${HUNDRED_RULES.sparql}?query=${encodeURIComponent(hundredProfileQuery(person.wikidata))}`,
      fetchImpl,
      { accept: 'application/sparql-results+json' },
    ).then((b) => profileFromSparql(b.results?.bindings ?? [])),
    getJson<WikipediaSummary>(`${HUNDRED_RULES.wikipediaApi}/page/summary/${title}`, fetchImpl),
    getJson<PageviewsBody>(`${HUNDRED_RULES.pageviewsApi}/per-article/en.wikipedia.org/all-access/user/${title}/monthly/${span.start}/${span.end}`, fetchImpl).then(pageviewsFromBody),
  ])

  const profile = wd.status === 'fulfilled' ? wd.value : null
  if (wd.status === 'rejected') errors.push(`Wikidata: ${errorText(wd.reason)}`)
  const summary = wp.status === 'fulfilled' ? wp.value : null
  if (wp.status === 'rejected') errors.push(`Wikipedia: ${errorText(wp.reason)}`)
  if (pv.status === 'rejected') errors.push(`Pageviews: ${errorText(pv.reason)}`)

  const views = pv.status === 'fulfilled' ? completeMonths(pv.value) : { series: [], dropped: null }
  if (views.dropped) notes.push(`Pageviews for ${views.dropped} were left out: the API's count for it is far below every other month, so it is incomplete.`)

  let image = profile?.image ?? null
  if (image && person.flags.includes('no-portrait')) {
    image = null
    notes.push(`The portrait on Wikidata is withheld: ${person.name} is not depicted on the page.`)
  }

  return {
    asOf: now.toISOString(),
    wikidataUrl: `https://www.wikidata.org/wiki/${person.wikidata}`,
    wikipediaUrl: summary?.content_urls?.desktop?.page ?? wikipediaUrl(person.wiki),
    description: profile?.description ?? null,
    extract: summary?.extract?.trim() || null,
    born: profile?.born ?? null,
    died: profile?.died ?? null,
    image,
    imagePage: image ? commonsFilePage(image) : null,
    sitelinks: profile?.sitelinks ?? null,
    pageviews: views.series,
    sources: {
      wikidata: wd.status === 'fulfilled' ? 'ok' : 'failed',
      wikipedia: wp.status === 'fulfilled' ? 'ok' : 'failed',
      pageviews: pv.status === 'fulfilled' ? 'ok' : 'failed',
      errors,
      notes,
    },
  }
}
