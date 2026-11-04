/**
 * BnF Gallica: discovery by SRU (Dublin Core XML), OCR snippets with page
 * numbers by the ContentSearch service, never a whole texteBrut in a run.
 * Gallica allows five calls a minute, so the limiter is sequential with a
 * twelve-second gap and a run is budgeted to eighty requests. Everything
 * Gallica serves under "domaine public" may be kept in full.
 *
 *   https://gallica.bnf.fr/SRU?operation=searchRetrieve&version=1.2&query=(gallica all "...")&maximumRecords=50&startRecord=N
 *   https://gallica.bnf.fr/services/ContentSearch?ark=bpt6k...&query=...
 *   https://gallica.bnf.fr/iiif/ark:/12148/bpt6k.../manifest.json
 */

import { assertAllowed } from '../policy'
import { createLimiter, getText } from '../http'
import { normalizeText, parseDate, sha256 } from '../text'
import type { DocumentUpsert } from '../types'
import type { CollectOptions } from './index'

export const GALLICA_RULES = {
  sru: 'https://gallica.bnf.fr/SRU',
  contentSearch: 'https://gallica.bnf.fr/services/ContentSearch',
  base: 'https://gallica.bnf.fr/ark:/12148/',
  perPage: 50,
  /** Requests per run: SRU pages plus one ContentSearch per kept record. */
  requestBudget: 80,
  textCap: 40_000,
  version: 'curious-gallica-v1-2026-11',
} as const

/** Decode the few entities OCR XML uses. */
export function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/** Inner texts of every <name> element (namespace prefix included in `name`), tags inside stripped. */
export function xmlTexts(xml: string, name: string): string[] {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'g')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) out.push(decodeXml(m[1].replace(/<[^>]+>/g, '')).trim())
  return out
}

/** Each <name>…</name> block, raw. */
export function xmlBlocks(xml: string, name: string): string[] {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'g')
  const out: string[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(xml))) out.push(m[1])
  return out
}

export interface GallicaRecord {
  ark: string
  identifier: string
  title: string | null
  publisher: string | null
  creator: string | null
  date: string | null
  language: string | null
  rights: string | null
  types: string[]
  description: string | null
  ocrQuality: number | null
}

export function gallicaSruUrl(query: string, startRecord = 1, opts: { docType?: string; maximumRecords?: number } = {}): string {
  const cql = `(gallica all "${query.replace(/"/g, '')}")${opts.docType ? ` and (dc.type all "${opts.docType}")` : ''}`
  const p = new URLSearchParams({ operation: 'searchRetrieve', version: '1.2', query: cql, maximumRecords: String(opts.maximumRecords ?? GALLICA_RULES.perPage), startRecord: String(startRecord) })
  return `${GALLICA_RULES.sru}?${p.toString()}`
}

export const gallicaContentSearchUrl = (ark: string, query: string): string => `${GALLICA_RULES.contentSearch}?ark=${encodeURIComponent(ark)}&query=${encodeURIComponent(query.replace(/"/g, ''))}`

export function parseGallicaSru(xml: string): { total: number; next: number | null; records: GallicaRecord[] } {
  const total = Number(xmlTexts(xml, 'srw:numberOfRecords')[0] ?? 0)
  const nextRaw = xmlTexts(xml, 'srw:nextRecordPosition')[0]
  const next = nextRaw ? Number(nextRaw) : null
  const records: GallicaRecord[] = []
  for (const block of xmlBlocks(xml, 'srw:record')) {
    const identifier = xmlTexts(block, 'dc:identifier').find((s) => /ark:\/12148\//.test(s)) ?? xmlTexts(block, 'dc:identifier')[0]
    if (!identifier) continue
    const ark = identifier.match(/ark:\/12148\/([^/?#\s]+)/)?.[1] ?? identifier
    const quality = xmlTexts(block, 'nqamoyen')[0]
    records.push({
      ark,
      identifier,
      title: xmlTexts(block, 'dc:title')[0] ?? null,
      publisher: xmlTexts(block, 'dc:publisher')[0] ?? null,
      creator: xmlTexts(block, 'dc:creator')[0] ?? null,
      date: xmlTexts(block, 'dc:date')[0] ?? null,
      language: xmlTexts(block, 'dc:language')[0] ?? null,
      rights: xmlTexts(block, 'dc:rights')[0] ?? null,
      types: xmlTexts(block, 'dc:type'),
      description: xmlTexts(block, 'dc:description')[0] ?? null,
      ocrQuality: quality ? Math.round(Number(quality) * 10) / 1000 : null,
    })
  }
  return { total, next: Number.isFinite(next) && next ? next : null, records }
}

/** ContentSearch hits as (page, text) pairs, the <mark> tags stripped. */
export function parseGallicaContentSearch(xml: string): Array<{ page: number; text: string }> {
  const out: Array<{ page: number; text: string }> = []
  for (const item of xmlBlocks(xml, 'item')) {
    const pid = xmlTexts(item, 'p_id')[0] ?? ''
    const page = Number(pid.replace(/^PAG_/, '')) || 0
    const text = xmlTexts(item, 'content')[0] ?? ''
    if (text) out.push({ page, text })
  }
  return out
}

/** Snippets joined with page markers, so a claim's offsets map back to a page. */
export function gallicaSnippetText(hits: Array<{ page: number; text: string }>): string {
  return hits.map((h) => `[p.${h.page}]\n${h.text}`).join('\n\n')
}

export function gallicaDocumentFromRecord(
  r: GallicaRecord,
  hits: Array<{ page: number; text: string }>,
  ctx: { query: string; requestUrl: string; retrievedAt: string },
): DocumentUpsert {
  const canonical = `${GALLICA_RULES.base}${r.ark}`
  const publicDomain = !r.rights || /domaine public|public domain/i.test(r.rights)
  const snippet = gallicaSnippetText(hits)
  const text = publicDomain ? [r.description, snippet].filter(Boolean).join('\n\n').slice(0, GALLICA_RULES.textCap) || null : r.description
  const date = parseDate(r.date)
  return {
    source_id: 'gallica',
    external_id: r.ark,
    canonical_url: canonical,
    title: r.title,
    publisher: r.publisher,
    author: r.creator,
    language: r.language,
    published_at: date.iso,
    published_precision: date.iso ? date.precision : 'unknown',
    retrieved_at: ctx.retrievedAt,
    rights_uri: r.rights ?? (publicDomain ? 'public-domain' : null),
    content_hash: sha256(text ? normalizeText(text) : `${canonical}\n${r.title ?? ''}\n${r.date ?? ''}`),
    raw_uri: ctx.requestUrl,
    extraction_method: hits.length ? 'iiif-ocr' : 'sru-xml',
    text,
    text_hash: text ? sha256(normalizeText(text)) : null,
    text_chars: text ? text.length : null,
    ocr_confidence: r.ocrQuality,
    query: ctx.query,
    collector_version: GALLICA_RULES.version,
    lineage_hint: r.publisher ?? null,
    meta: {
      types: r.types,
      pages_hit: hits.map((h) => h.page),
      public_domain: publicDomain,
      text_storage: publicDomain ? 'full' : 'snippet',
      manifest: `https://gallica.bnf.fr/iiif/ark:/12148/${r.ark}/manifest.json`,
    },
  }
}

export async function* collectGallica(opts: CollectOptions): AsyncGenerator<DocumentUpsert> {
  const policy = assertAllowed('gallica', { method: 'sru', now: opts.now })
  const limiter = createLimiter({ minGapMs: policy.crawlDelayMs, baseCooldownMs: 60_000, clock: opts.clock })
  const log = opts.log ?? (() => {})
  let requests = 0
  let start = 1
  let yielded = 0
  const docType = opts.collection ?? 'fascicule'
  while (start) {
    if (yielded >= opts.limit || opts.stop?.() || requests >= GALLICA_RULES.requestBudget) return
    const sruUrl = gallicaSruUrl(opts.query, start, { docType })
    const retrievedAt = new Date(opts.clock ? opts.clock.now() : Date.now()).toISOString()
    const { text: xml } = await getText(sruUrl, { fetch: opts.fetch, limiter, label: 'Gallica SRU', clock: opts.clock, timeoutMs: 40_000 })
    requests++
    const page = parseGallicaSru(xml)
    log(`  gallica SRU from ${start}: ${page.records.length} of ${page.total}`)
    for (const r of page.records) {
      if (yielded >= opts.limit || opts.stop?.()) return
      let hits: Array<{ page: number; text: string }> = []
      if (requests < GALLICA_RULES.requestBudget) {
        try {
          const { text: cs } = await getText(gallicaContentSearchUrl(r.ark, opts.query), { fetch: opts.fetch, limiter, label: 'Gallica ContentSearch', clock: opts.clock, timeoutMs: 40_000 })
          requests++
          hits = parseGallicaContentSearch(cs)
        } catch (e) {
          log(`  gallica ContentSearch failed for ${r.ark}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      yield gallicaDocumentFromRecord(r, hits, { query: opts.query, requestUrl: sruUrl, retrievedAt })
      yielded++
    }
    start = page.next && page.records.length ? page.next : 0
  }
  if (requests >= GALLICA_RULES.requestBudget) log(`  gallica: request budget of ${GALLICA_RULES.requestBudget} reached; the rest waits for the next run`)
}
