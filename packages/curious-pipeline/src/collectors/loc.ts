/**
 * The Library of Congress JSON API: books, manuscripts, maps, photographs,
 * newspapers (Chronicling America), oral histories. No key; rate limited
 * per endpoint; a query that matches more than about 100,000 items cannot
 * be paged to the end, so the collector partitions by decade (dates=) and
 * then by original format when a partition is still too deep. Full page
 * text is kept only for public-domain items (published before 1930), as
 * the loc policy row says.
 *
 *   https://www.loc.gov/search/?q=...&fo=json&c=100&sp=N&at=results,pagination
 *   https://www.loc.gov/collections/chronicling-america/?q=...&dates=1900/1925&fo=json
 *   https://www.loc.gov/resource/<lccn>/<date>/ed-1/?sp=N&st=text&fo=json  (full_text)
 */

import { assertAllowed, textStorageFor } from '../policy'
import { createLimiter, getJson } from '../http'
import { clip, normalizeText, parseDate, sha256, yearOf } from '../text'
import type { DocumentUpsert, ExtractionMethod } from '../types'
import type { CollectOptions } from './index'

export const LOC_RULES = {
  api: 'https://www.loc.gov',
  perPage: 100,
  /** loc.gov refuses pages past this many results. */
  deepPagingCap: 100_000,
  /** Before this year an item is treated as public domain in the US. */
  publicDomainBefore: 1930,
  textCap: 40_000,
  version: 'curious-loc-v1-2026-11',
  formats: ['newspaper', 'book', 'manuscript/mixed material', 'periodical', 'photo, print, drawing', 'map', 'sound recording', 'film, video', 'web page'],
} as const

export interface LocResult {
  id: string
  url?: string
  title?: string
  date?: string
  dates?: string[]
  contributor?: string[]
  partof?: string[]
  language?: string[]
  original_format?: string[]
  online_format?: string[]
  access_restricted?: boolean
  description?: string[]
  subject?: string[]
  location?: string[]
  number_lccn?: string[]
  site?: string[]
  type?: string[]
  mime_type?: string[]
  item?: { rights?: string | string[]; rights_advisory?: string | string[]; created_published?: string[]; notes?: string[]; date?: string }
  /** Present on newspaper page results read with st=text. */
  full_text?: string
}

export interface LocSearchResponse {
  results: LocResult[]
  pagination?: { current: number; next: string | null; of: number; total: number; perpage: number }
}

export interface LocSearchParams {
  query: string
  collection?: string
  page?: number
  perPage?: number
  /** "1900/1925" */
  dates?: string
  originalFormat?: string
}

export function locSearchUrl(p: LocSearchParams): string {
  const base = p.collection ? `${LOC_RULES.api}/collections/${p.collection}/` : `${LOC_RULES.api}/search/`
  const q = new URLSearchParams({ q: p.query, fo: 'json', c: String(p.perPage ?? LOC_RULES.perPage), at: 'results,pagination' })
  if (p.page && p.page > 1) q.set('sp', String(p.page))
  if (p.dates) q.set('dates', p.dates)
  if (p.originalFormat) q.set('fa', `original-format:${p.originalFormat}`)
  return `${base}?${q.toString()}`
}

/** Decade partitions over [fromYear, toYear] for a query too deep to page whole. */
export function locPartitions(fromYear: number, toYear: number): string[] {
  const out: string[] = []
  for (let y = Math.floor(fromYear / 10) * 10; y <= toYear; y += 10) out.push(`${Math.max(y, fromYear)}/${Math.min(y + 9, toYear)}`)
  return out
}

const first = (v: string[] | string | undefined): string | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)

const rightsOf = (r: LocResult): string | null => {
  const raw = r.item?.rights ?? r.item?.rights_advisory
  const s = Array.isArray(raw) ? raw.join(' ') : raw
  if (s) return s.length > 500 ? clip(s, 500) : s
  return r.access_restricted ? 'restricted' : null
}

/** Pure mapping of a search page's results to document rows. */
export function locDocumentsFromResults(
  results: LocResult[],
  ctx: { query: string; requestUrl: string; retrievedAt: string; collection?: string },
): DocumentUpsert[] {
  const out: DocumentUpsert[] = []
  const seen = new Set<string>()
  for (const r of results) {
    if (!r?.id) continue
    const canonical = (r.url ?? r.id).replace(/^http:/, 'https:').replace(/^https:\/\/loc\.gov/, 'https://www.loc.gov')
    if (seen.has(canonical)) continue
    seen.add(canonical)
    const date = parseDate(r.date ?? first(r.dates) ?? r.item?.date)
    const year = yearOf(date.iso)
    const publicDomain = year != null && year < LOC_RULES.publicDomainBefore && !r.access_restricted
    const storage = textStorageFor('loc', { publicDomain })
    const description = (r.description ?? []).map((d) => d.trim()).filter(Boolean).join('\n\n')
    const fullText = typeof r.full_text === 'string' ? r.full_text.trim() : ''
    // Catalogue descriptions are the Library's own metadata and always kept;
    // page OCR only when the item is public domain.
    const text = storage === 'full' && fullText ? [description, fullText].filter(Boolean).join('\n\n') : description
    const stored = text ? text.slice(0, LOC_RULES.textCap) : null
    const isPage = /\/resource\//.test(canonical) && /\/ed-\d+\//.test(canonical)
    const method: ExtractionMethod = fullText && storage === 'full' ? 'ocr-alto' : 'api-json'
    const partof = (r.partof ?? []).filter((p) => !/^(catalog|general collections)$/i.test(p))
    const lccn = first(r.number_lccn)
    out.push({
      source_id: 'loc',
      external_id: r.id.replace(/^https?:\/\/(www\.)?loc\.gov/, ''),
      canonical_url: canonical,
      title: (r.title ?? '').trim() || null,
      publisher: partof[0] ?? (ctx.collection ? ctx.collection.replace(/-/g, ' ') : null),
      author: first(r.contributor),
      language: first(r.language),
      published_at: date.iso,
      published_precision: date.iso ? date.precision : 'unknown',
      retrieved_at: ctx.retrievedAt,
      rights_uri: rightsOf(r) ?? (publicDomain ? 'public-domain' : null),
      content_hash: sha256(stored ? normalizeText(stored) : `${canonical}\n${r.title ?? ''}\n${r.date ?? ''}`),
      raw_uri: ctx.requestUrl,
      extraction_method: method,
      text: stored,
      text_hash: stored ? sha256(normalizeText(stored)) : null,
      text_chars: stored ? stored.length : null,
      query: ctx.query,
      collector_version: LOC_RULES.version,
      lineage_hint: partof[0] ?? lccn ?? null,
      meta: {
        lccn,
        original_format: r.original_format ?? [],
        online_format: r.online_format ?? [],
        subject: (r.subject ?? []).slice(0, 12),
        location: (r.location ?? []).slice(0, 8),
        partof: partof.slice(0, 6),
        is_page: isPage,
        public_domain: publicDomain,
        text_storage: storage,
        access_restricted: !!r.access_restricted,
      },
    })
  }
  return out
}

/** A newspaper page's OCR text (public domain only), read with st=text. */
export async function locPageText(pageUrl: string, opts: { fetch?: typeof fetch; limiter: ReturnType<typeof createLimiter>; clock?: CollectOptions['clock'] }): Promise<string | null> {
  const u = new URL(pageUrl)
  u.searchParams.set('st', 'text')
  u.searchParams.set('fo', 'json')
  const body = await getJson<{ full_text?: string }>(u.toString(), { fetch: opts.fetch, limiter: opts.limiter, label: 'LOC page', clock: opts.clock })
  return typeof body.full_text === 'string' && body.full_text.trim() ? body.full_text.trim() : null
}

export async function* collectLoc(opts: CollectOptions): AsyncGenerator<DocumentUpsert> {
  const policy = assertAllowed('loc', { method: 'api', now: opts.now })
  const limiter = createLimiter({ minGapMs: policy.crawlDelayMs, baseCooldownMs: 20_000, clock: opts.clock })
  const log = opts.log ?? (() => {})
  const now = opts.now ?? new Date()
  const fromYear = opts.since ? Number(opts.since.slice(0, 4)) : opts.collection === 'chronicling-america' ? 1770 : 1500
  const toYear = opts.until ? Number(opts.until.slice(0, 4)) : now.getUTCFullYear()
  const datesArg = opts.since || opts.until ? `${fromYear}/${toYear}` : undefined
  let yielded = 0
  const seen = new Set<string>()

  const page = async function* (params: LocSearchParams): AsyncGenerator<DocumentUpsert> {
    let url: string | null = locSearchUrl(params)
    let pages = 0
    while (url) {
      if (yielded >= opts.limit || opts.stop?.()) return
      const retrievedAt = new Date(opts.clock ? opts.clock.now() : Date.now()).toISOString()
      const res: LocSearchResponse = await getJson<LocSearchResponse>(url, { fetch: opts.fetch, limiter, label: 'LOC', clock: opts.clock })
      pages++
      const of = res.pagination?.of ?? res.results?.length ?? 0
      log(`  loc ${params.dates ?? 'all dates'}${params.originalFormat ? ` ${params.originalFormat}` : ''} page ${res.pagination?.current ?? pages}: ${res.results?.length ?? 0} of ${of}`)
      // Too deep to page: split by decade, then by format, before reading on.
      if (pages === 1 && of > LOC_RULES.deepPagingCap) {
        if (!params.dates) {
          for (const d of locPartitions(fromYear, toYear)) yield* page({ ...params, dates: d })
          return
        }
        if (!params.originalFormat) {
          for (const f of LOC_RULES.formats) yield* page({ ...params, originalFormat: f })
          return
        }
        log(`  loc: ${params.dates} ${params.originalFormat} still has ${of} results; reading the first ${LOC_RULES.deepPagingCap}.`)
      }
      const docs = locDocumentsFromResults(res.results ?? [], { query: opts.query, requestUrl: url, retrievedAt, collection: params.collection })
      for (const doc of docs) {
        if (seen.has(doc.canonical_url)) continue
        seen.add(doc.canonical_url)
        if (opts.fullText && doc.meta.is_page && doc.meta.text_storage === 'full' && doc.extraction_method !== 'ocr-alto') {
          try {
            const full = await locPageText(doc.canonical_url, { fetch: opts.fetch, limiter, clock: opts.clock })
            if (full) {
              const text = [doc.text, full].filter(Boolean).join('\n\n').slice(0, LOC_RULES.textCap)
              doc.text = text
              doc.text_hash = sha256(normalizeText(text))
              doc.text_chars = text.length
              doc.content_hash = doc.text_hash
              doc.extraction_method = 'ocr-alto'
            }
          } catch (e) {
            log(`  loc page text failed for ${doc.canonical_url}: ${e instanceof Error ? e.message : String(e)}`)
          }
        }
        yield doc
        if (++yielded >= opts.limit) return
      }
      url = res.pagination?.next ?? null
    }
  }
  yield* page({ query: opts.query, collection: opts.collection, dates: datesArg })
}
