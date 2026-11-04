/**
 * The Curious Desk's pool mapping and live record.
 *
 * The pool: every approved claim of the claim pipeline, read from the
 * curious_claim_pool view (migration 101) by spins.ts loadCuriousPool;
 * `curiousPoolFromRows` is the pure half, so the API, the tests and the
 * loader share one mapping. Sorted by approval, newest first, with the id
 * as tie-break so a seed replays.
 *
 * The record, read after the draw and never thrown: the cited work on
 * Crossref (by the claim's first doi: reference), the cited book on Google
 * Books (by its first isbn: reference), up to three of the claim's entities
 * on Wikidata (life dates, a work's date), and the Wayback Machine's nearest
 * snapshot of the evidence document when the pool has none. Each source's
 * state is kept in CuriousRecord.sources and the brief says what to look up
 * by hand.
 */

import type { CuriousClaim, CuriousDocumentRef, CuriousPool, CuriousRecord, CuriousSourceState } from './types'

export const CURIOUS_RULES = {
  crossrefApi: 'https://api.crossref.org/works',
  booksApi: 'https://www.googleapis.com/books/v1/volumes',
  wikidataApi: 'https://www.wikidata.org/w/api.php',
  waybackApi: 'https://archive.org/wayback/available',
  timeoutMs: 12_000,
  userAgent: 'vismay-randomizer/0.1 (curious desk; https://vizmaya.fyi)',
  /** Entities looked up on Wikidata per spin. */
  maxEntities: 3,
} as const

export interface CuriousEnv {
  crossrefMailto: string | null
  googleBooksKey: string | null
}

export function curiousEnv(env: NodeJS.ProcessEnv = process.env): CuriousEnv {
  return {
    crossrefMailto: env.CROSSREF_MAILTO?.trim() || env.UNPAYWALL_EMAIL?.trim() || null,
    googleBooksKey: env.GOOGLE_BOOKS_API_KEY?.trim() || null,
  }
}

/** One row of curious_claim_pool as PostgREST returns it. */
export interface CuriousPoolRow {
  id: string
  text: string
  kind: string
  subject?: string | null
  era?: string | null
  region?: string | null
  theme?: string | null
  year_from?: number | null
  year_to?: number | null
  place?: string | null
  country_code?: string | null
  grade?: string | null
  score?: number | string | null
  score_features?: Record<string, unknown> | null
  flags?: string[] | null
  evidence_quote: string
  evidence_page?: number | null
  is_quotation?: boolean | null
  is_anonymous?: boolean | null
  is_hearsay?: boolean | null
  speaker?: string | null
  approved_at?: string | null
  document_id: string
  source_id: string
  document_title?: string | null
  publisher?: string | null
  author?: string | null
  canonical_url: string
  archive_url?: string | null
  published_at?: string | null
  published_precision?: string | null
  language?: string | null
  n_sources?: number | string | null
  n_groups?: number | string | null
  n_primary?: number | string | null
  n_derived?: number | string | null
  n_contradicts?: number | string | null
  entities?: string[] | null
}

const num = (v: number | string | null | undefined): number => (v == null ? 0 : Number(v) || 0)
const GRADES = new Set(['A', 'B', 'C', 'D', 'E'])

export function curiousClaimFromRow(r: CuriousPoolRow, refs: string[] = []): CuriousClaim | null {
  if (!r?.id || !r.text?.trim() || !r.evidence_quote || !r.canonical_url) return null
  const document: CuriousDocumentRef = {
    id: r.document_id,
    sourceId: r.source_id,
    title: r.document_title ?? null,
    publisher: r.publisher ?? null,
    author: r.author ?? null,
    canonicalUrl: r.canonical_url,
    archiveUrl: r.archive_url ?? null,
    publishedAt: r.published_at ?? null,
    publishedPrecision: r.published_precision ?? null,
    language: r.language ?? null,
  }
  return {
    id: r.id,
    text: r.text.trim(),
    kind: (['fact', 'anecdote', 'number', 'quote'] as const).includes(r.kind as never) ? (r.kind as CuriousClaim['kind']) : 'fact',
    subject: r.subject ?? null,
    era: r.era ?? 'undated',
    region: r.region ?? null,
    theme: r.theme ?? null,
    yearFrom: r.year_from ?? null,
    yearTo: r.year_to ?? null,
    place: r.place ?? null,
    countryCode: r.country_code ?? null,
    grade: r.grade && GRADES.has(r.grade) ? (r.grade as CuriousClaim['grade']) : null,
    score: r.score == null ? null : Number(r.score),
    scoreFeatures: r.score_features ?? null,
    flags: r.flags ?? [],
    evidenceQuote: r.evidence_quote.slice(0, 300),
    evidencePage: r.evidence_page ?? null,
    isQuotation: !!r.is_quotation,
    isAnonymous: !!r.is_anonymous,
    isHearsay: !!r.is_hearsay,
    speaker: r.speaker ?? null,
    document,
    nSources: num(r.n_sources),
    nGroups: num(r.n_groups),
    nPrimary: num(r.n_primary),
    nDerived: num(r.n_derived),
    nContradicts: num(r.n_contradicts),
    entities: r.entities ?? [],
    refs: [...new Set(refs)].sort(),
    approvedAt: r.approved_at ?? null,
  }
}

/** The pool from view rows (and each claim's external references), newest approval first, the id as tie-break. */
export function curiousPoolFromRows(rows: CuriousPoolRow[], refs: Map<string, string[]> = new Map(), opts: { asOf: string }): CuriousPool {
  const claims = rows
    .map((r) => curiousClaimFromRow(r, refs.get(r.id) ?? []))
    .filter((c): c is CuriousClaim => !!c)
    .sort((a, b) => (b.approvedAt ?? '').localeCompare(a.approvedAt ?? '') || a.id.localeCompare(b.id))
  return { asOf: opts.asOf, claims }
}

type Fetch = typeof fetch

export interface CuriousLoadOptions {
  now?: Date
  fetch?: Fetch
  env?: CuriousEnv
}

async function getJsonOrNull<T>(url: string, fetchImpl: Fetch): Promise<T | null> {
  const res = await fetchImpl(url, {
    headers: { accept: 'application/json', 'user-agent': CURIOUS_RULES.userAgent },
    signal: AbortSignal.timeout(CURIOUS_RULES.timeoutMs),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${new URL(url).host}: HTTP ${res.status}`)
  return (await res.json()) as T
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

const timeYear = (v: unknown): number | null => {
  const t = (v as { time?: string } | undefined)?.time
  if (!t) return null
  const m = /^([+-])(\d+)-/.exec(t)
  return m ? Number(m[2]) * (m[1] === '-' ? -1 : 1) : null
}

function emptyRecord(asOf: string): CuriousRecord {
  return { asOf, crossref: null, book: null, wikidata: [], archiveUrl: null, sources: { crossref: 'skipped', books: 'skipped', wikidata: 'skipped', wayback: 'skipped', errors: [], notes: [] } }
}

/**
 * The drawn claim's live record. Never throws; a source that fails is
 * `failed` with its error, a source with nothing to look up is `skipped`
 * with a note.
 */
export async function loadCuriousRecord(claim: CuriousClaim, opts: CuriousLoadOptions = {}): Promise<CuriousRecord> {
  const fetchImpl = opts.fetch ?? fetch
  const env = opts.env ?? curiousEnv()
  const now = opts.now ?? new Date()
  const rec = emptyRecord(now.toISOString())
  const set = (k: keyof Omit<CuriousRecord['sources'], 'errors' | 'notes'>, s: CuriousSourceState) => {
    rec.sources[k] = s
  }

  const doi = claim.refs.find((r) => r.startsWith('doi:'))?.slice(4)
  if (doi) {
    try {
      const q = env.crossrefMailto ? `?mailto=${encodeURIComponent(env.crossrefMailto)}` : ''
      const body = await getJsonOrNull<{ message?: { DOI?: string; title?: string[]; 'container-title'?: string[]; issued?: { 'date-parts'?: number[][] }; type?: string; 'is-referenced-by-count'?: number; URL?: string } }>(`${CURIOUS_RULES.crossrefApi}/${encodeURIComponent(doi)}${q}`, fetchImpl)
      if (body?.message) {
        const m = body.message
        rec.crossref = { doi: (m.DOI ?? doi).toLowerCase(), title: m.title?.[0] ?? null, container: m['container-title']?.[0] ?? null, year: m.issued?.['date-parts']?.[0]?.[0] ?? null, type: m.type ?? null, citedBy: m['is-referenced-by-count'] ?? null, url: m.URL ?? `https://doi.org/${doi}` }
        set('crossref', 'ok')
      } else {
        set('crossref', 'skipped')
        rec.sources.notes.push(`Crossref has no record for doi:${doi}.`)
      }
    } catch (e) {
      set('crossref', 'failed')
      rec.sources.errors.push(`Crossref: ${errorText(e)}`)
    }
  } else rec.sources.notes.push('No DOI among the claim\'s sources: nothing to read on Crossref.')

  const isbn = claim.refs.find((r) => r.startsWith('isbn:'))?.slice(5)
  if (isbn) {
    try {
      const key = env.googleBooksKey ? `&key=${encodeURIComponent(env.googleBooksKey)}` : ''
      const body = await getJsonOrNull<{ items?: Array<{ volumeInfo?: { title?: string; subtitle?: string; publisher?: string; publishedDate?: string; canonicalVolumeLink?: string; infoLink?: string } }> }>(`${CURIOUS_RULES.booksApi}?q=isbn:${encodeURIComponent(isbn)}&maxResults=1${key}`, fetchImpl)
      const v = body?.items?.[0]?.volumeInfo
      if (v) {
        rec.book = { isbn, title: [v.title, v.subtitle].filter(Boolean).join(': ') || null, publisher: v.publisher ?? null, year: v.publishedDate ? Number(v.publishedDate.slice(0, 4)) || null : null, url: v.canonicalVolumeLink ?? v.infoLink ?? null }
        set('books', 'ok')
      } else {
        set('books', 'skipped')
        rec.sources.notes.push(`Google Books has no volume for isbn:${isbn}.`)
      }
    } catch (e) {
      set('books', 'failed')
      rec.sources.errors.push(`Google Books: ${errorText(e)}`)
    }
  } else rec.sources.notes.push('No ISBN among the claim\'s sources: nothing to read on Google Books.')

  const names = claim.entities.slice(0, CURIOUS_RULES.maxEntities)
  if (names.length) {
    try {
      const found: Array<{ name: string; qid: string; label: string | null; description: string | null }> = []
      for (const name of names) {
        const p = new URLSearchParams({ action: 'wbsearchentities', search: name, language: 'en', format: 'json', limit: '1', type: 'item' })
        const body = await getJsonOrNull<{ search?: Array<{ id: string; label?: string; description?: string }> }>(`${CURIOUS_RULES.wikidataApi}?${p}`, fetchImpl)
        const hit = body?.search?.[0]
        if (hit) found.push({ name, qid: hit.id, label: hit.label ?? null, description: hit.description ?? null })
      }
      if (found.length) {
        const p = new URLSearchParams({ action: 'wbgetentities', ids: found.map((f) => f.qid).join('|'), props: 'claims', format: 'json' })
        const body = await getJsonOrNull<{ entities?: Record<string, { claims?: Record<string, Array<{ mainsnak?: { datavalue?: { value?: unknown } } }>> }> }>(`${CURIOUS_RULES.wikidataApi}?${p}`, fetchImpl)
        for (const f of found) {
          const claims = body?.entities?.[f.qid]?.claims ?? {}
          const val = (prop: string) => claims[prop]?.[0]?.mainsnak?.datavalue?.value
          const years = [timeYear(val('P571')), timeYear(val('P577')), timeYear(val('P585'))].filter((y): y is number => y != null)
          rec.wikidata.push({ ...f, birthYear: timeYear(val('P569')), deathYear: timeYear(val('P570')), year: years.length ? Math.min(...years) : null })
        }
        set('wikidata', 'ok')
      } else {
        set('wikidata', 'skipped')
        rec.sources.notes.push(`Wikidata has no item for ${names.join(', ')}.`)
      }
    } catch (e) {
      set('wikidata', 'failed')
      rec.sources.errors.push(`Wikidata: ${errorText(e)}`)
    }
  } else rec.sources.notes.push('The claim names no entity: nothing to read on Wikidata.')

  if (claim.document.archiveUrl) {
    rec.archiveUrl = claim.document.archiveUrl
    set('wayback', 'ok')
  } else {
    try {
      const body = await getJsonOrNull<{ archived_snapshots?: { closest?: { available?: boolean; url?: string } } }>(`${CURIOUS_RULES.waybackApi}?url=${encodeURIComponent(claim.document.canonicalUrl)}`, fetchImpl)
      const c = body?.archived_snapshots?.closest
      if (c?.available && c.url) {
        rec.archiveUrl = c.url.replace(/^http:/, 'https:')
        set('wayback', 'ok')
      } else {
        set('wayback', 'skipped')
        rec.sources.notes.push('The Wayback Machine has no snapshot of the evidence document: save one (web.archive.org/save) before linking it.')
      }
    } catch (e) {
      set('wayback', 'failed')
      rec.sources.errors.push(`Wayback: ${errorText(e)}`)
    }
  }
  return rec
}
