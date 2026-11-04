/**
 * Europeana's Search API as a multilingual discovery layer over Europe's
 * libraries, archives and museums. Needs EUROPEANA_API_KEY. Pages by cursor
 * (rows up to 100) and keeps to text objects. Europeana's metadata is CC0,
 * so titles and descriptions are always kept; an item's own text would
 * follow the item's rights statement (kept as meta for a later full-text
 * pass, not fetched in the pilot). Queries are words and native-language
 * phrases: the catalogue is mostly not in English, and an exact English
 * phrase under TYPE:TEXT matches almost nothing.
 *
 *   https://api.europeana.eu/record/v2/search.json?wskey=KEY&query=...&rows=100
 *     &cursor=*&profile=rich&qf=TYPE:TEXT
 */

import { assertAllowed } from '../policy'
import { createLimiter, getJson } from '../http'
import { canonicalUrl, normalizeText, parseDate, sha256 } from '../text'
import type { DocumentUpsert } from '../types'
import type { CollectOptions } from './index'

export const EUROPEANA_RULES = {
  api: 'https://api.europeana.eu/record/v2/search.json',
  rows: 100,
  textCap: 40_000,
  version: 'curious-europeana-v1-2026-11',
  /** Rights URIs under which an item's own text could be stored in full. */
  publicDomainRights: [/creativecommons\.org\/publicdomain\/mark/, /creativecommons\.org\/publicdomain\/zero/, /rightsstatements\.org\/vocab\/NoC-/],
} as const

export interface EuropeanaItem {
  id: string
  guid?: string
  title?: string[]
  dcDescription?: string[]
  dcCreator?: string[]
  dataProvider?: string[]
  provider?: string[]
  year?: string[]
  language?: string[]
  dcLanguage?: string[]
  rights?: string[]
  edmIsShownAt?: string[]
  edmIsShownBy?: string[]
  edmPreview?: string[]
  country?: string[]
  type?: string
  timestamp_update?: string
}

export interface EuropeanaResponse {
  success: boolean
  itemsCount: number
  totalResults: number
  nextCursor?: string
  items?: EuropeanaItem[]
  error?: string
}

/**
 * The search URL. No `reusability` filter by default: Europeana's metadata
 * (titles, descriptions) is CC0 whatever the item's rights, and the item's
 * own rights URI decides full-text storage per document, so filtering
 * discovery to open items only halves the hits for nothing.
 */
export function europeanaUrl(key: string, query: string, cursor: string, opts: { rows?: number; qf?: string; reusability?: string } = {}): string {
  const p = new URLSearchParams({
    wskey: key,
    query,
    rows: String(opts.rows ?? EUROPEANA_RULES.rows),
    cursor,
    profile: 'rich',
    qf: opts.qf ?? 'TYPE:TEXT',
  })
  if (opts.reusability) p.set('reusability', opts.reusability)
  return `${EUROPEANA_RULES.api}?${p.toString()}`
}

export const europeanaIsPublicDomain = (rights: string | null): boolean => !!rights && EUROPEANA_RULES.publicDomainRights.some((re) => re.test(rights))

export function europeanaDocumentsFromItems(items: EuropeanaItem[], ctx: { query: string; requestUrl: string; retrievedAt: string }): DocumentUpsert[] {
  const out: DocumentUpsert[] = []
  const seen = new Set<string>()
  for (const it of items) {
    if (!it?.id) continue
    const canonical = canonicalUrl(it.guid ?? `https://www.europeana.eu/item${it.id}`)
    if (seen.has(canonical)) continue
    seen.add(canonical)
    const rights = it.rights?.[0] ?? null
    const pd = europeanaIsPublicDomain(rights)
    const description = (it.dcDescription ?? []).map((d) => d.trim()).filter(Boolean).join('\n\n')
    const text = description ? description.slice(0, EUROPEANA_RULES.textCap) : null
    const date = parseDate(it.year?.[0])
    const lang = it.language?.[0] ?? it.dcLanguage?.[0] ?? null
    out.push({
      source_id: 'europeana',
      external_id: it.id,
      canonical_url: canonical,
      title: it.title?.[0]?.trim() || null,
      publisher: it.dataProvider?.[0] ?? null,
      author: it.dcCreator?.[0] ?? null,
      language: lang && lang !== 'mul' ? lang : null,
      published_at: date.iso,
      published_precision: date.iso ? date.precision : 'unknown',
      retrieved_at: ctx.retrievedAt,
      rights_uri: rights,
      content_hash: sha256(text ? normalizeText(text) : `${canonical}\n${it.title?.[0] ?? ''}\n${it.year?.[0] ?? ''}`),
      raw_uri: ctx.requestUrl,
      extraction_method: 'api-json',
      text,
      text_hash: text ? sha256(normalizeText(text)) : null,
      text_chars: text ? text.length : null,
      query: ctx.query,
      collector_version: EUROPEANA_RULES.version,
      lineage_hint: it.provider?.[0] ?? it.dataProvider?.[0] ?? null,
      meta: {
        type: it.type ?? null,
        country: it.country?.[0] ?? null,
        shown_at: it.edmIsShownAt?.[0] ?? null,
        shown_by: it.edmIsShownBy?.[0] ?? null,
        preview: it.edmPreview?.[0] ?? null,
        public_domain: pd,
        // Descriptions are CC0 metadata and always kept; the item's own text would be 'full' only when public domain.
        text_storage: pd ? 'full' : 'snippet',
        languages: it.language ?? [],
      },
    })
  }
  return out
}

export async function* collectEuropeana(opts: CollectOptions): AsyncGenerator<DocumentUpsert> {
  const policy = assertAllowed('europeana', { method: 'api', now: opts.now , policies: opts.policies })
  const key = opts.env.europeanaKey
  if (!key) throw new Error('Europeana needs EUROPEANA_API_KEY (a personal key from https://pro.europeana.eu/page/get-api). The source stays idle until it is set.')
  const limiter = createLimiter({ minGapMs: policy.crawlDelayMs, baseCooldownMs: 10_000, clock: opts.clock })
  const log = opts.log ?? (() => {})
  let cursor = '*'
  let yielded = 0
  const seen = new Set<string>()
  const query = opts.since || opts.until ? `${opts.query} AND YEAR:[${opts.since?.slice(0, 4) ?? '*'} TO ${opts.until?.slice(0, 4) ?? '*'}]` : opts.query
  while (cursor) {
    if (yielded >= opts.limit || opts.stop?.()) return
    const url = europeanaUrl(key, query, cursor, { qf: opts.collection })
    const retrievedAt = new Date(opts.clock ? opts.clock.now() : Date.now()).toISOString()
    const res = await getJson<EuropeanaResponse>(url, { fetch: opts.fetch, limiter, label: 'Europeana', clock: opts.clock })
    if (!res.success) throw new Error(`Europeana: ${res.error ?? 'request not successful'}`)
    log(`  europeana cursor ${cursor === '*' ? 'start' : cursor.slice(0, 8)}: ${res.itemsCount} of ${res.totalResults}`)
    for (const doc of europeanaDocumentsFromItems(res.items ?? [], { query: opts.query, requestUrl: url.replace(/wskey=[^&]+/, 'wskey=***'), retrievedAt })) {
      if (seen.has(doc.canonical_url)) continue
      seen.add(doc.canonical_url)
      yield doc
      if (++yielded >= opts.limit) return
    }
    cursor = res.nextCursor && res.itemsCount > 0 ? res.nextCursor : ''
  }
}
