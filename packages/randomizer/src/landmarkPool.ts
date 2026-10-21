/**
 * The Landmark Desk's live pool: the awards of one prize in one era, and the
 * works of the laureate the plan picks from them, read from the open
 * scholarly infrastructure the plan names (docs/landmark-randomizer-plan.md):
 *
 *   - awards: the Nobel Prize API (api.nobelprize.org, CC0, no key; the
 *     laureates with the official motivation) for the Nobels, Wikidata's
 *     SPARQL endpoint (P166 "award received" on the laureate with P585 for
 *     the year, and P1686 "for work" when the award names the work) for the
 *     other prizes;
 *   - works: Wikidata for the laureate's record (the work the award names,
 *     notable publications, ORCID, OpenAlex and Open Library ids); OpenAlex
 *     for the work metadata (citations, FWCI, open access, retraction) by
 *     DOI, free, and for the laureate's most-cited works before the prize
 *     (a list call, which needs OPENALEX_API_KEY since February 2026); Open
 *     Library for the book prizes (the laureate's books from around the
 *     prize year); Unpaywall for the best free-to-read copy (needs the
 *     UNPAYWALL_EMAIL contact it asks for).
 *
 * Pure apart from fetch (no Supabase), so spins.ts, the pool API and a
 * smoke script can all use it, and the mappings are unit-tested on recorded
 * responses. The awards read throws on failure (spins.ts answers 503); the
 * works read never throws: each source's state is recorded in
 * LandmarkSources and the draw says what was missing.
 */

import type {
  LandmarkAward,
  LandmarkEra,
  LandmarkNamedWork,
  LandmarkPlan,
  LandmarkPool,
  LandmarkPrize,
  LandmarkSources,
  LandmarkWork,
  LandmarkWorkBasis,
} from './types'

export const LANDMARK_RULES = {
  nobelApi: 'https://api.nobelprize.org/2.1',
  nobelSite: 'https://www.nobelprize.org',
  sparql: 'https://query.wikidata.org/sparql',
  openalexApi: 'https://api.openalex.org',
  openLibraryApi: 'https://openlibrary.org',
  unpaywallApi: 'https://api.unpaywall.org/v2',
  timeoutMs: 12_000,
  /** Works kept per laureate. */
  maxWorks: 8,
  /** DOI lookups made for the works the award record names. */
  maxNamedLookups: 4,
  /** Top-cited works asked of OpenAlex. */
  topCited: 6,
  /** Books kept from Open Library. */
  maxBooks: 4,
  /** Unpaywall calls per spin. */
  maxUnpaywall: 4,
  userAgent: 'vismay-randomizer/0.1 (landmark desk; https://vizmaya.fyi)',
} as const

/** The two optional credentials, from the server's env. */
export interface LandmarkEnv {
  /** OPENALEX_API_KEY: without it OpenAlex list calls (the author search, the top-cited works) are skipped; DOI lookups still run. */
  openalexKey: string | null
  /** UNPAYWALL_EMAIL (or OPENALEX_MAILTO): the contact Unpaywall requires, also sent to OpenAlex as mailto. Without it Unpaywall is skipped. */
  email: string | null
}

export function landmarkEnv(env: Record<string, string | undefined> = typeof process === 'undefined' ? {} : process.env): LandmarkEnv {
  return {
    openalexKey: env.OPENALEX_API_KEY?.trim() || null,
    email: env.UNPAYWALL_EMAIL?.trim() || env.OPENALEX_MAILTO?.trim() || null,
  }
}

type Fetch = typeof fetch

export interface LandmarkLoadOptions {
  now?: Date
  fetch?: Fetch
  env?: LandmarkEnv
}

async function getJson<T>(url: string, fetchImpl: Fetch, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetchImpl(url, {
    headers: { accept: 'application/json', 'user-agent': LANDMARK_RULES.userAgent, ...headers },
    signal: AbortSignal.timeout(LANDMARK_RULES.timeoutMs),
  })
  if (!res.ok) throw new Error(`${new URL(url).host}: HTTP ${res.status}`)
  return (await res.json()) as T
}

/** A lookup that may legitimately find nothing: 404 is null, anything else fails. */
async function getJsonOrNull<T>(url: string, fetchImpl: Fetch, headers: Record<string, string> = {}): Promise<T | null> {
  const res = await fetchImpl(url, {
    headers: { accept: 'application/json', 'user-agent': LANDMARK_RULES.userAgent, ...headers },
    signal: AbortSignal.timeout(LANDMARK_RULES.timeoutMs),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${new URL(url).host}: HTTP ${res.status}`)
  return (await res.json()) as T
}

const q = (o: Record<string, string | number>) =>
  Object.entries(o)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&')

/* ---------- Nobel Prize API ---------- */

/** One prize of one year as /nobelPrizes returns it, the parts the pool keeps. */
export interface NobelPrizeRow {
  awardYear: string
  topMotivation?: { en?: string | null } | null
  laureates?: NobelLaureateRow[] | null
}

export interface NobelLaureateRow {
  id?: string | number | null
  knownName?: { en?: string | null } | null
  fullName?: { en?: string | null } | null
  orgName?: { en?: string | null } | null
  portion?: string | null
  motivation?: { en?: string | null } | null
}

/** The laureate record (/laureate/{id}), the parts the enrichment reads. */
export interface NobelLaureateRecord {
  id?: string | number | null
  fileName?: string | null
  wikidata?: { id?: string | null } | null
  wikipedia?: { english?: string | null } | null
}

function nobelLinks(prize: LandmarkPrize, year: number): LandmarkAward['links'] {
  if (prize.source.kind !== 'nobel') return {}
  const base = `${LANDMARK_RULES.nobelSite}/prizes/${prize.source.slug}/${year}`
  return { summary: `${base}/summary/`, background: `${base}/advanced-information/` }
}

/** The awards of a Nobel category in an era, one row per laureate, from the prizes the API lists. Oldest first. */
export function awardsFromNobel(rows: NobelPrizeRow[], prize: LandmarkPrize, era: Pick<LandmarkEra, 'from' | 'to'>): LandmarkAward[] {
  const out: LandmarkAward[] = []
  for (const row of rows) {
    const year = Number(row.awardYear)
    if (!Number.isFinite(year) || year < era.from || year > era.to) continue
    const laureates = (row.laureates ?? []).filter((l) => l.id !== null && l.id !== undefined && l.id !== '')
    const names = laureates.map((l) => (l.knownName?.en || l.fullName?.en || l.orgName?.en || '').trim())
    laureates.forEach((l, i) => {
      const name = names[i]!
      if (!name) return
      out.push({
        prize: prize.id,
        year,
        laureateId: `nobel:${l.id}`,
        name,
        wikidata: null,
        nobelId: String(l.id),
        motivation: (l.motivation?.en || row.topMotivation?.en || '').trim() || null,
        share: l.portion?.trim() || null,
        coLaureates: names.filter((n, j) => j !== i && n),
        namedWorks: [],
        url: `${LANDMARK_RULES.nobelSite}/laureate/${l.id}`,
        links: nobelLinks(prize, year),
        orcid: null,
        openalexId: null,
        openLibraryId: null,
      })
    })
  }
  return out.sort((a, b) => a.year - b.year || a.name.localeCompare(b.name))
}

/** The laureate record's Wikidata item, Wikipedia article and lecture page, added to a Nobel award. */
export function enrichedNobelAward(award: LandmarkAward, prize: LandmarkPrize, r: NobelLaureateRecord): LandmarkAward {
  const links = { ...award.links }
  if (r.wikipedia?.english) links.wikipedia = r.wikipedia.english
  if (r.fileName && prize.source.kind === 'nobel') links.lecture = `${LANDMARK_RULES.nobelSite}/prizes/${prize.source.slug}/${award.year}/${r.fileName}/lecture/`
  const wikidata = r.wikidata?.id && /^Q\d+$/.test(r.wikidata.id) ? r.wikidata.id : award.wikidata
  return { ...award, wikidata, links }
}

/* ---------- Wikidata ---------- */

interface SparqlValue {
  value: string
}

type SparqlBinding = Record<string, SparqlValue | undefined>

const WD_ENTITY = 'http://www.wikidata.org/entity/'

const qid = (v: SparqlValue | undefined): string | null => {
  const id = v?.value.startsWith(WD_ENTITY) ? v.value.slice(WD_ENTITY.length) : null
  return id && /^Q\d+$/.test(id) ? id : null
}
const year = (v: SparqlValue | undefined): number | null => {
  const y = v?.value ? Number(v.value.slice(0, 4)) : NaN
  return Number.isFinite(y) ? y : null
}
const text = (v: SparqlValue | undefined): string | null => v?.value.trim() || null

/** The awards of a Wikidata prize in an era, from the SPARQL rows (one per person, year and named work or id value). Oldest first. */
export function awardsFromSparql(rows: SparqlBinding[], prize: LandmarkPrize, era: Pick<LandmarkEra, 'from' | 'to'>): LandmarkAward[] {
  const byKey = new Map<string, LandmarkAward>()
  for (const row of rows) {
    const person = qid(row.person)
    const y = year(row.date)
    if (!person || y === null || y < era.from || y > era.to) continue
    const key = `${person}|${y}`
    let award = byKey.get(key)
    if (!award) {
      award = {
        prize: prize.id,
        year: y,
        laureateId: `wd:${person}`,
        name: text(row.personLabel) ?? person,
        wikidata: person,
        nobelId: null,
        motivation: null,
        share: null,
        coLaureates: [],
        namedWorks: [],
        url: `https://www.wikidata.org/wiki/${person}`,
        links: {},
        orcid: null,
        openalexId: null,
        openLibraryId: null,
      }
      byKey.set(key, award)
    }
    const wikipedia = text(row.article)
    if (wikipedia && !award.links.wikipedia) award.links.wikipedia = wikipedia
    const orcid = text(row.orcid)
    if (orcid && !award.orcid) award.orcid = orcid
    const openalex = text(row.openalex)
    if (openalex && /^A\d+$/.test(openalex) && !award.openalexId) award.openalexId = openalex
    const ol = text(row.ol)
    if (ol && /^OL\d+A$/.test(ol) && !award.openLibraryId) award.openLibraryId = ol
    const work = qid(row.work)
    if (work && !award.namedWorks.some((w) => w.id === `wd:${work}`)) {
      award.namedWorks.push({
        id: `wd:${work}`,
        title: text(row.workLabel) ?? work,
        doi: normalizeDoi(text(row.doi)),
        isbn: text(row.isbn),
        year: year(row.pub),
        basis: 'citation',
      })
    }
  }
  const awards = [...byKey.values()].sort((a, b) => a.year - b.year || a.name.localeCompare(b.name))
  for (const a of awards) a.coLaureates = awards.filter((b) => b.year === a.year && b.laureateId !== a.laureateId).map((b) => b.name)
  return awards
}

function awardsQuery(item: string, era: Pick<LandmarkEra, 'from' | 'to'>): string {
  return `SELECT ?person ?personLabel ?date ?work ?workLabel ?doi ?isbn ?pub ?orcid ?openalex ?ol ?article WHERE {
  ?person p:P166 ?st . ?st ps:P166 wd:${item} . ?person wdt:P31 wd:Q5 .
  ?st pq:P585 ?date . FILTER(YEAR(?date) >= ${era.from} && YEAR(?date) <= ${era.to})
  OPTIONAL { ?st pq:P1686 ?work . OPTIONAL { ?work wdt:P356 ?doi } OPTIONAL { ?work wdt:P212 ?isbn } OPTIONAL { ?work wdt:P577 ?pub } }
  OPTIONAL { ?person wdt:P496 ?orcid }
  OPTIONAL { ?person wdt:P10283 ?openalex }
  OPTIONAL { ?person wdt:P648 ?ol }
  OPTIONAL { ?article schema:about ?person ; schema:isPartOf <https://en.wikipedia.org/> }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`
}

/** What the laureate's own Wikidata record adds: the ids, the work the award names, the notable publications. */
export interface WikidataLaureate {
  orcid: string | null
  openalexId: string | null
  openLibraryId: string | null
  named: LandmarkNamedWork[]
}

/** Publication-like items a notable work (P800) may be: scholarly article, book, literary work, written work, thesis, article, doctoral thesis, monograph, publication. */
const PUBLICATION_TYPES = ['Q13442814', 'Q571', 'Q7725634', 'Q47461344', 'Q1266946', 'Q191067', 'Q187685', 'Q193934', 'Q732577']

function laureateQuery(person: string, prizeItem: string): string {
  return `SELECT ?orcid ?openalex ?ol ?forWork ?forWorkLabel ?forDoi ?forIsbn ?forPub ?notable ?notableLabel ?notableDoi ?notableIsbn ?notablePub WHERE {
  VALUES ?person { wd:${person} }
  OPTIONAL { ?person wdt:P496 ?orcid }
  OPTIONAL { ?person wdt:P10283 ?openalex }
  OPTIONAL { ?person wdt:P648 ?ol }
  OPTIONAL { ?person p:P166 ?st . ?st ps:P166 wd:${prizeItem} . ?st pq:P1686 ?forWork .
    OPTIONAL { ?forWork wdt:P356 ?forDoi } OPTIONAL { ?forWork wdt:P212 ?forIsbn } OPTIONAL { ?forWork wdt:P577 ?forPub } }
  OPTIONAL { ?person wdt:P800 ?notable . ?notable wdt:P31 ?ntype . FILTER(?ntype IN (${PUBLICATION_TYPES.map((t) => `wd:${t}`).join(', ')}))
    OPTIONAL { ?notable wdt:P356 ?notableDoi } OPTIONAL { ?notable wdt:P212 ?notableIsbn } OPTIONAL { ?notable wdt:P577 ?notablePub } }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}`
}

export function laureateFromSparql(rows: SparqlBinding[]): WikidataLaureate {
  const out: WikidataLaureate = { orcid: null, openalexId: null, openLibraryId: null, named: [] }
  const add = (id: string | null, title: string | null, doi: string | null, isbn: string | null, pub: number | null, basis: 'citation' | 'notable') => {
    if (!id || out.named.some((w) => w.id === `wd:${id}`)) return
    out.named.push({ id: `wd:${id}`, title: title ?? id, doi: normalizeDoi(doi), isbn, year: pub, basis })
  }
  for (const row of rows) {
    const orcid = text(row.orcid)
    if (orcid && !out.orcid) out.orcid = orcid
    const openalex = text(row.openalex)
    if (openalex && /^A\d+$/.test(openalex) && !out.openalexId) out.openalexId = openalex
    const ol = text(row.ol)
    if (ol && /^OL\d+A$/.test(ol) && !out.openLibraryId) out.openLibraryId = ol
    add(qid(row.forWork), text(row.forWorkLabel), text(row.forDoi), text(row.forIsbn), year(row.forPub), 'citation')
  }
  // Notable works after the named ones, so a work in both keeps its citation basis.
  for (const row of rows) add(qid(row.notable), text(row.notableLabel), text(row.notableDoi), text(row.notableIsbn), year(row.notablePub), 'notable')
  return out
}

async function sparql(query: string, fetchImpl: Fetch): Promise<SparqlBinding[]> {
  const body = await getJson<{ results?: { bindings?: SparqlBinding[] } }>(`${LANDMARK_RULES.sparql}?${q({ query })}`, fetchImpl, {
    accept: 'application/sparql-results+json',
  })
  return body.results?.bindings ?? []
}

/* ---------- OpenAlex ---------- */

/** An OpenAlex work, the fields the pool selects. */
export interface OpenAlexWork {
  id?: string | null
  doi?: string | null
  title?: string | null
  display_name?: string | null
  publication_year?: number | null
  cited_by_count?: number | null
  fwci?: number | null
  citation_normalized_percentile?: { is_in_top_1_percent?: boolean | null } | null
  open_access?: { is_oa?: boolean | null; oa_status?: string | null; oa_url?: string | null } | null
  is_retracted?: boolean | null
  type?: string | null
  primary_location?: { landing_page_url?: string | null; pdf_url?: string | null; source?: { display_name?: string | null } | null; raw_source_name?: string | null } | null
  authorships?: Array<{ author?: { display_name?: string | null } | null; raw_author_name?: string | null }> | null
  counts_by_year?: Array<{ year: number; cited_by_count: number }> | null
}

export interface OpenAlexAuthor {
  id?: string | null
  display_name?: string | null
  cited_by_count?: number | null
  works_count?: number | null
}

const WORK_SELECT =
  'id,doi,title,display_name,publication_year,cited_by_count,fwci,citation_normalized_percentile,open_access,is_retracted,type,primary_location,authorships,counts_by_year'

/** "10.1103/physrevlett.116.061102" from a DOI, a doi.org URL, or "doi:…"; null when it is not a DOI. */
export function normalizeDoi(value: string | null | undefined): string | null {
  if (!value) return null
  const s = value
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
    .replace(/^doi:/i, '')
    .toLowerCase()
  return /^10\.\d{4,9}\/\S+$/.test(s) ? s : null
}

export function workFromOpenAlex(o: OpenAlexWork, basis: LandmarkWorkBasis): LandmarkWork | null {
  const id = o.id?.split('/').pop()
  const title = (o.title || o.display_name || '').trim()
  if (!id || !title) return null
  const doi = normalizeDoi(o.doi)
  const authors = (o.authorships ?? []).map((a) => (a.author?.display_name || a.raw_author_name || '').trim()).filter(Boolean)
  const url = doi ? `https://doi.org/${doi}` : o.primary_location?.landing_page_url || `https://openalex.org/${id}`
  return {
    id: `openalex:${id}`,
    title: title.slice(0, 300),
    year: o.publication_year ?? null,
    doi,
    url,
    oaUrl: o.open_access?.oa_url || o.primary_location?.pdf_url || null,
    oaStatus: o.open_access?.oa_status ?? null,
    venue: o.primary_location?.source?.display_name || o.primary_location?.raw_source_name || null,
    authors: authors.length > 4 ? [...authors.slice(0, 4), 'et al.'] : authors,
    citedBy: o.cited_by_count ?? null,
    fwci: o.fwci === null || o.fwci === undefined ? null : Math.round(o.fwci * 100) / 100,
    topOnePercent: o.citation_normalized_percentile?.is_in_top_1_percent ?? null,
    countsByYear: [...(o.counts_by_year ?? [])].map((c) => ({ year: c.year, citations: c.cited_by_count })).sort((a, b) => a.year - b.year),
    type: o.type ?? null,
    retracted: !!o.is_retracted,
    basis,
    representative: basis !== 'citation',
  }
}

/**
 * A work the award record names, as the pool keeps it when OpenAlex has no
 * record of it. A named item with no DOI, ISBN or publication date is a
 * subject (Wikidata often names a theory or a theorem as the "work"), kept
 * with type `subject` so the draw asks for the paper that established it.
 */
export function workFromNamed(n: LandmarkNamedWork): LandmarkWork {
  const subject = !n.doi && !n.isbn && n.year === null
  return {
    id: n.id,
    title: n.title,
    year: n.year,
    doi: n.doi,
    url: n.doi ? `https://doi.org/${n.doi}` : `https://www.wikidata.org/wiki/${n.id.replace(/^wd:/, '')}`,
    oaUrl: null,
    oaStatus: null,
    venue: null,
    authors: [],
    citedBy: null,
    fwci: null,
    topOnePercent: null,
    countsByYear: [],
    type: n.isbn ? 'book' : subject ? 'subject' : null,
    retracted: false,
    basis: n.basis,
    representative: n.basis !== 'citation',
  }
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** The author search result that is the laureate: an exact name first, else the most-cited candidate. */
export function pickOpenAlexAuthor(results: OpenAlexAuthor[], name: string): { id: string; exact: boolean } | null {
  const target = fold(name)
  const withId = results.filter((a): a is OpenAlexAuthor & { id: string } => !!a.id)
  const exact = withId.find((a) => fold(a.display_name ?? '') === target)
  const best = exact ?? [...withId].sort((a, b) => (b.cited_by_count ?? 0) - (a.cited_by_count ?? 0))[0]
  return best ? { id: best.id.split('/').pop()!, exact: !!exact } : null
}

/* ---------- Open Library ---------- */

export interface OpenLibraryDoc {
  key?: string | null
  title?: string | null
  first_publish_year?: number | null
  author_name?: string[] | null
  author_key?: string[] | null
  publisher?: string[] | null
  isbn?: string[] | null
}

/**
 * The laureate's books from around the prize year, as Open Library lists
 * them: first published in the four years to the prize, nearest the year
 * before the prize first, then the newest earlier book. A book whose title
 * matches a work the award names keeps that basis.
 */
export function booksFromOpenLibrary(docs: OpenLibraryDoc[], award: Pick<LandmarkAward, 'name' | 'year' | 'openLibraryId' | 'namedWorks'>): LandmarkWork[] {
  const tokens = fold(award.name).split(' ').filter((t) => t.length > 1)
  const mine = docs.filter((d) => {
    if (!d.key || !d.title) return false
    if (award.openLibraryId && d.author_key?.length) return d.author_key.includes(award.openLibraryId)
    // Every part of the laureate's name in one author name ("Roper, Lyndal" matches "Lyndal Roper"; a festschrift about them does not).
    return (d.author_name ?? []).some((n) => {
      const parts = fold(n).split(' ')
      return tokens.every((t) => parts.includes(t))
    })
  })
  const dated = mine.filter((d) => typeof d.first_publish_year === 'number' && d.first_publish_year <= award.year)
  const near = dated.filter((d) => d.first_publish_year! >= award.year - 3).sort((a, b) => Math.abs(a.first_publish_year! - (award.year - 1)) - Math.abs(b.first_publish_year! - (award.year - 1)))
  const chosen = near.length ? near : [...dated].sort((a, b) => b.first_publish_year! - a.first_publish_year!).slice(0, 1)
  const named = award.namedWorks.map((w) => fold(w.title))
  return chosen.slice(0, LANDMARK_RULES.maxBooks).map((d) => {
    const key = d.key!.replace(/^\/works\//, '')
    const title = d.title!.trim()
    const isNamed = named.includes(fold(title))
    return {
      id: `ol:${key}`,
      title: title.slice(0, 300),
      year: d.first_publish_year ?? null,
      doi: null,
      url: `${LANDMARK_RULES.openLibraryApi}/works/${key}`,
      oaUrl: null,
      oaStatus: null,
      venue: d.publisher?.[0] ?? null,
      authors: (d.author_name ?? []).slice(0, 4),
      citedBy: null,
      fwci: null,
      topOnePercent: null,
      countsByYear: [],
      type: 'book',
      retracted: false,
      basis: isNamed ? 'citation' : 'book',
      representative: !isNamed,
    }
  })
}

/* ---------- Unpaywall ---------- */

export interface UnpaywallRecord {
  is_oa?: boolean | null
  oa_status?: string | null
  best_oa_location?: { url?: string | null; url_for_pdf?: string | null } | null
}

/** Unpaywall's verdict on a DOI, over OpenAlex's: its best_oa_location is the link to show. */
export function withUnpaywall(work: LandmarkWork, u: UnpaywallRecord | null): LandmarkWork {
  if (!u) return work
  const url = u.best_oa_location?.url_for_pdf || u.best_oa_location?.url || null
  return { ...work, oaUrl: url ?? (u.is_oa ? work.oaUrl : null), oaStatus: u.oa_status ?? work.oaStatus }
}

/* ---------- The loaders ---------- */

/**
 * The awards a plan asks for: every laureate of the prize in the era, from
 * the Nobel Prize API or Wikidata. Throws on an API failure (spins.ts
 * answers 503); an empty list is returned, not thrown, so the caller can
 * re-plan.
 */
export async function loadLandmarkAwards(plan: Pick<LandmarkPlan, 'prize' | 'era' | 'query'>, opts: LandmarkLoadOptions = {}): Promise<LandmarkPool> {
  const fetchImpl = opts.fetch ?? fetch
  const now = opts.now ?? new Date()
  const { prize, era } = plan
  let awards: LandmarkAward[]
  if (prize.source.kind === 'nobel') {
    const to = Math.min(era.to, now.getUTCFullYear())
    const body = await getJson<{ nobelPrizes?: NobelPrizeRow[] }>(
      `${LANDMARK_RULES.nobelApi}/nobelPrizes?${q({ nobelPrizeCategory: prize.source.category, nobelPrizeYear: era.from, yearTo: to, limit: 200 })}`,
      fetchImpl,
    )
    awards = awardsFromNobel(body.nobelPrizes ?? [], prize, era)
  } else {
    awards = awardsFromSparql(await sparql(awardsQuery(prize.source.item, era), fetchImpl), prize, era)
  }
  return { asOf: now.toISOString(), query: plan.query, awards, works: null }
}

/**
 * What the laureate record adds to a Nobel award (its Wikidata item, the
 * Wikipedia article, the lecture page), so the works stage has an item to
 * read. Never throws: a Wikidata award already carries its item, and a
 * Nobel award without one is drawn from OpenAlex and the award pages alone.
 */
export async function enrichLandmarkAward(award: LandmarkAward, prize: LandmarkPrize, opts: LandmarkLoadOptions = {}): Promise<LandmarkAward> {
  if (prize.source.kind !== 'nobel' || !award.nobelId) return award
  try {
    const body = await getJson<NobelLaureateRecord[] | NobelLaureateRecord>(`${LANDMARK_RULES.nobelApi}/laureate/${award.nobelId}`, opts.fetch ?? fetch)
    const r = Array.isArray(body) ? body[0] : body
    return r ? enrichedNobelAward(award, prize, r) : award
  } catch (e) {
    console.warn(`[randomizer] landmark laureate ${award.nobelId} not enriched: ${e instanceof Error ? e.message : String(e)}`)
    return award
  }
}

function dedupe(works: LandmarkWork[]): LandmarkWork[] {
  const seen = new Set<string>()
  const out: LandmarkWork[] = []
  for (const w of works) {
    const key = w.doi ?? fold(w.title)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(w)
  }
  return out
}

const TIER_ORDER: Record<LandmarkWorkBasis, number> = { citation: 0, notable: 1, 'top-cited': 2, book: 3 }

/**
 * The works of one laureate, for the draw to pick from: what the award
 * record names (Wikidata), with OpenAlex's record of each by DOI; the
 * laureate's most-cited works before the prize (OpenAlex, with a key); the
 * laureate's books from around the prize year (Open Library, for the book
 * prizes or when nothing else was found); the best free-to-read copy
 * (Unpaywall, with a contact email). Each source's state is recorded; a
 * failure never throws.
 */
export async function loadLandmarkWorks(
  award: LandmarkAward,
  prize: LandmarkPrize,
  opts: LandmarkLoadOptions = {},
): Promise<NonNullable<LandmarkPool['works']>> {
  const fetchImpl = opts.fetch ?? fetch
  const env = opts.env ?? landmarkEnv()
  const sources: LandmarkSources = { wikidata: 'skipped', openalex: 'skipped', openlibrary: 'skipped', unpaywall: 'skipped', errors: [], notes: [] }
  const fail = (source: keyof Omit<LandmarkSources, 'errors' | 'notes'>, e: unknown) => {
    sources[source] = 'failed'
    sources.errors.push(`${source}: ${e instanceof Error ? e.message : String(e)}`)
  }
  let named: LandmarkNamedWork[] = [...award.namedWorks]
  let orcid = award.orcid
  let openalexId = award.openalexId
  let openLibraryId = award.openLibraryId

  // 1. The laureate's Wikidata record.
  if (award.wikidata) {
    try {
      const r = laureateFromSparql(await sparql(laureateQuery(award.wikidata, prize.source.item), fetchImpl))
      orcid = orcid ?? r.orcid
      openalexId = openalexId ?? r.openalexId
      openLibraryId = openLibraryId ?? r.openLibraryId
      for (const n of r.named) if (!named.some((w) => w.id === n.id)) named.push(n)
      sources.wikidata = 'ok'
    } catch (e) {
      fail('wikidata', e)
    }
  }
  // Only works from before the award count; a notable work dated after it is not what the prize rewarded.
  named = named.filter((n) => n.year === null || n.year <= award.year)

  // 2. OpenAlex: the named works by DOI (free), then the top-cited works before the prize (a list call: key needed).
  const works: LandmarkWork[] = []
  const oa = (path: string) => {
    const sep = path.includes('?') ? '&' : '?'
    const extra = [env.openalexKey ? `api_key=${encodeURIComponent(env.openalexKey)}` : '', env.email ? `mailto=${encodeURIComponent(env.email)}` : ''].filter(Boolean).join('&')
    return `${LANDMARK_RULES.openalexApi}${path}${extra ? `${sep}${extra}` : ''}`
  }
  try {
    let looked = 0
    for (const n of named) {
      if (n.doi && looked < LANDMARK_RULES.maxNamedLookups) {
        looked++
        const o = await getJsonOrNull<OpenAlexWork>(oa(`/works/doi:${encodeURIComponent(n.doi)}?select=${WORK_SELECT}`), fetchImpl)
        const w = o && workFromOpenAlex(o, n.basis)
        works.push(w ?? workFromNamed(n))
      } else {
        works.push(workFromNamed(n))
      }
    }
    if (looked) sources.openalex = 'ok'
    if (env.openalexKey) {
      let authorId = openalexId
      if (!authorId && orcid) {
        const a = await getJsonOrNull<OpenAlexAuthor>(oa(`/authors/orcid:${encodeURIComponent(orcid)}?select=id,display_name,cited_by_count,works_count`), fetchImpl)
        authorId = a?.id?.split('/').pop() ?? null
      }
      if (!authorId) {
        const found = await getJson<{ results?: OpenAlexAuthor[] }>(oa(`/authors?${q({ search: award.name, 'per-page': 5, select: 'id,display_name,cited_by_count,works_count' })}`), fetchImpl)
        const picked = pickOpenAlexAuthor(found.results ?? [], award.name)
        authorId = picked?.id ?? null
        if (picked && !picked.exact) sources.notes.push(`OpenAlex matched ${award.name} by name search, not by an exact name or an id: check the top-cited works are theirs.`)
      }
      if (authorId) {
        const list = await getJson<{ results?: OpenAlexWork[] }>(
          oa(`/works?${q({ filter: `authorships.author.id:${authorId},to_publication_date:${award.year}-12-31`, sort: 'cited_by_count:desc', 'per-page': LANDMARK_RULES.topCited, select: WORK_SELECT })}`),
          fetchImpl,
        )
        for (const o of list.results ?? []) {
          const w = workFromOpenAlex(o, 'top-cited')
          if (w) works.push(w)
        }
      } else {
        sources.notes.push(`OpenAlex has no author record for ${award.name} that the loader could match.`)
      }
      sources.openalex = 'ok'
    } else {
      sources.openalex = looked ? 'ok' : 'no key'
      if (looked) sources.notes.push('OpenAlex list calls were skipped (no OPENALEX_API_KEY), so there are no top-cited works.')
    }
  } catch (e) {
    fail('openalex', e)
  }

  // 3. Open Library: the book prizes, or a laureate nothing else found a work for.
  if (prize.works === 'book' || !works.length) {
    try {
      const found = await getJson<{ docs?: OpenLibraryDoc[] }>(
        `${LANDMARK_RULES.openLibraryApi}/search.json?${q({ author: award.name, fields: 'key,title,first_publish_year,author_name,author_key,publisher,isbn', limit: 40 })}`,
        fetchImpl,
      )
      const books = booksFromOpenLibrary(found.docs ?? [], { ...award, openLibraryId })
      works.push(...books)
      sources.openlibrary = 'ok'
      if (books.length && prize.works === 'book') sources.notes.push('The books come from Open Library by author and year, not from the prize\'s own list: check the title against it.')
    } catch (e) {
      fail('openlibrary', e)
    }
  }

  // 4. Unpaywall: the best free-to-read copy, for the works with a DOI.
  let items = dedupe(works)
  const withDoi = items.filter((w) => w.doi).slice(0, LANDMARK_RULES.maxUnpaywall)
  if (withDoi.length) {
    if (env.email) {
      const email = env.email
      const verdicts = await Promise.all(
        withDoi.map(async (w) => {
          try {
            return await getJsonOrNull<UnpaywallRecord>(`${LANDMARK_RULES.unpaywallApi}/${encodeURIComponent(w.doi!)}?${q({ email })}`, fetchImpl)
          } catch (e) {
            fail('unpaywall', e)
            return null
          }
        }),
      )
      if (sources.unpaywall !== 'failed') sources.unpaywall = 'ok'
      const byDoi = new Map(withDoi.map((w, i) => [w.doi!, verdicts[i] ?? null]))
      items = items.map((w) => (w.doi && byDoi.has(w.doi) ? withUnpaywall(w, byDoi.get(w.doi)!) : w))
    } else {
      sources.unpaywall = 'no email'
    }
  }

  items.sort((a, b) => TIER_ORDER[a.basis] - TIER_ORDER[b.basis] || (b.citedBy ?? -1) - (a.citedBy ?? -1) || a.title.localeCompare(b.title))
  return { laureateId: award.laureateId, items: items.slice(0, LANDMARK_RULES.maxWorks), sources }
}
