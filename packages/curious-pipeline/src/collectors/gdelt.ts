/**
 * GDELT DOC 2.0 as a candidate queue for current affairs. The DOC API has no
 * cursor: a request returns at most 250 articles for a time window, so the
 * collector partitions the date range into one-day windows and splits a
 * window that fills up into six-hour ones. GDELT asks for one request every
 * five seconds; the limiter enforces the gap and the run-wide cooldown. Only
 * the article list is read here: the publisher page is fetched at detect
 * time under the web policy and never stored.
 *
 *   https://api.gdeltproject.org/api/v2/doc/doc?query=...&mode=ArtList&format=json
 *     &maxrecords=250&sort=DateDesc&startdatetime=YYYYMMDDHHMMSS&enddatetime=...
 */

import { assertAllowed } from '../policy'
import { createLimiter, getText, HttpError } from '../http'
import { canonicalUrl, domainOf, parseDate, sha1, sha256 } from '../text'
import type { DocumentUpsert } from '../types'
import type { CollectOptions } from './index'

export const GDELT_RULES = {
  api: 'https://api.gdeltproject.org/api/v2/doc/doc',
  maxRecords: 250,
  /** A window that returns this many is assumed truncated and is split. */
  splitAt: 250,
  windowHours: 24,
  splitHours: 6,
  /** The DOC API's archive starts here. */
  earliest: '2017-01-01',
  version: 'curious-gdelt-v1-2026-11',
} as const

export interface GdeltArticle {
  url: string
  url_mobile?: string
  title: string
  seendate: string
  socialimage?: string
  domain: string
  language: string
  sourcecountry: string
}

const stamp = (d: Date): string => d.toISOString().replace(/[-:]/g, '').slice(0, 15).replace('T', '') // YYYYMMDDHHMMSS

export function gdeltUrl(query: string, start: Date, end: Date, opts: { maxRecords?: number; lang?: string | null } = {}): string {
  const q = opts.lang === undefined ? `${query} sourcelang:english` : opts.lang ? `${query} sourcelang:${opts.lang}` : query
  const p = new URLSearchParams({
    query: q,
    mode: 'ArtList',
    format: 'json',
    maxrecords: String(opts.maxRecords ?? GDELT_RULES.maxRecords),
    sort: 'DateDesc',
    startdatetime: stamp(start),
    enddatetime: stamp(end),
  })
  return `${GDELT_RULES.api}?${p.toString()}`
}

/** The [start, end) windows that cover since..until, newest first. */
export function gdeltWindows(since: Date, until: Date, hours: number = GDELT_RULES.windowHours): Array<[Date, Date]> {
  const out: Array<[Date, Date]> = []
  const step = hours * 3_600_000
  for (let end = until.getTime(); end > since.getTime(); end -= step) {
    out.push([new Date(Math.max(since.getTime(), end - step)), new Date(end)])
  }
  return out
}

/** Pure mapping of one response's articles to document rows (deduped by canonical URL within the batch). */
export function gdeltDocumentsFromArticles(
  articles: GdeltArticle[],
  ctx: { query: string; requestUrl: string; retrievedAt: string },
): DocumentUpsert[] {
  const seen = new Set<string>()
  const out: DocumentUpsert[] = []
  for (const a of articles) {
    if (!a?.url || !/^https?:\/\//i.test(a.url)) continue
    const url = canonicalUrl(a.url)
    if (seen.has(url)) continue
    seen.add(url)
    const { iso, precision } = parseDate(a.seendate)
    const domain = (a.domain || domainOf(url)).toLowerCase()
    out.push({
      source_id: 'gdelt',
      external_id: sha1(url),
      canonical_url: url,
      title: (a.title ?? '').trim() || null,
      publisher: domain || null,
      author: null,
      language: a.language ? a.language.toLowerCase() : null,
      published_at: iso,
      published_precision: iso ? precision : 'unknown',
      retrieved_at: ctx.retrievedAt,
      rights_uri: null,
      content_hash: sha256(`${url}\n${(a.title ?? '').trim()}\n${a.seendate ?? ''}`),
      raw_uri: ctx.requestUrl,
      extraction_method: 'api-json',
      text: null,
      text_hash: null,
      text_chars: null,
      query: ctx.query,
      collector_version: GDELT_RULES.version,
      lineage_hint: domain || null,
      meta: {
        country: a.sourcecountry || null,
        url_mobile: a.url_mobile || null,
        original_url: a.url !== url ? a.url : undefined,
      },
    })
  }
  return out
}

/** Parse a DOC API body: JSON with `articles`, or GDELT's plain-text error line. */
export function parseGdeltBody(body: string): GdeltArticle[] {
  const trimmed = body.trim()
  if (!trimmed) return []
  if (!trimmed.startsWith('{')) throw new HttpError(`GDELT: ${trimmed.slice(0, 160)}`, 200, GDELT_RULES.api, trimmed.slice(0, 200))
  const parsed = JSON.parse(trimmed) as { articles?: GdeltArticle[] }
  return parsed.articles ?? []
}

export async function* collectGdelt(opts: CollectOptions): AsyncGenerator<DocumentUpsert> {
  const policy = assertAllowed('gdelt', { method: 'api', now: opts.now })
  const limiter = createLimiter({ minGapMs: policy.crawlDelayMs, baseCooldownMs: 15_000, clock: opts.clock })
  const now = opts.now ?? new Date()
  const until = opts.until ? new Date(`${opts.until}T00:00:00Z`) : now
  const since = new Date(`${opts.since ?? new Date(until.getTime() - 7 * 86_400_000).toISOString().slice(0, 10)}T00:00:00Z`)
  if (since < new Date(`${GDELT_RULES.earliest}T00:00:00Z`)) throw new Error(`GDELT's DOC archive starts on ${GDELT_RULES.earliest}.`)
  const log = opts.log ?? (() => {})
  let yielded = 0
  const seen = new Set<string>()

  const run = async function* (windows: Array<[Date, Date]>, hours: number): AsyncGenerator<DocumentUpsert> {
    for (const [start, end] of windows) {
      if (yielded >= opts.limit || opts.stop?.()) return
      const url = gdeltUrl(opts.query, start, end)
      const retrievedAt = new Date(opts.clock ? opts.clock.now() : Date.now()).toISOString()
      const { text } = await getText(url, { fetch: opts.fetch, limiter, label: 'GDELT', clock: opts.clock, timeoutMs: 30_000 })
      const articles = parseGdeltBody(text)
      log(`  gdelt ${start.toISOString().slice(0, 13)}..${end.toISOString().slice(0, 13)}: ${articles.length} articles`)
      if (articles.length >= GDELT_RULES.splitAt && hours > GDELT_RULES.splitHours) {
        yield* run(gdeltWindows(start, end, GDELT_RULES.splitHours), GDELT_RULES.splitHours)
        continue
      }
      for (const doc of gdeltDocumentsFromArticles(articles, { query: opts.query, requestUrl: url, retrievedAt })) {
        if (seen.has(doc.canonical_url)) continue
        seen.add(doc.canonical_url)
        yield doc
        if (++yielded >= opts.limit) return
      }
    }
  }
  yield* run(gdeltWindows(since, until), GDELT_RULES.windowHours)
}
