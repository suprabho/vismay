/**
 * The Frontier Desk's pool helpers and the live record of the paper a spin
 * drew:
 *
 *   - frontierPaperFromRow / frontierPoolFromRows: dc_papers rows (AI Daily's
 *     kept arXiv papers, migration 078) and the published editions'
 *     paper_ids mapped to the pool the draw reads. spins.ts
 *     (loadFrontierPool) does the Supabase reads and hands the rows here, so
 *     this file stays free of Supabase and the tests can use it.
 *   - loadFrontierRecord, read after the draw: arXiv's own record (one
 *     id_list call: the newest version, when it was updated, a journal
 *     reference or DOI once published, the authors' comment) and OpenAlex's
 *     citations through the arXiv DOI (10.48550/arXiv.<id>, a free singleton
 *     lookup; CC0).
 *
 * Pure apart from fetch. The record never throws: each source's state is
 * recorded in FrontierRecord.sources and the brief says what to look up by
 * hand.
 */

import { recordFromOpenAlex } from './evidencePool'
import { landmarkEnv, type LandmarkEnv, type OpenAlexWork } from './landmarkPool'
import type { FrontierPaper, FrontierPool, FrontierRecord } from './types'

export const FRONTIER_RULES = {
  arxivApi: 'https://export.arxiv.org/api/query',
  openalexApi: 'https://api.openalex.org',
  timeoutMs: 12_000,
  userAgent: 'vismay-randomizer/0.1 (frontier desk; https://vizmaya.fyi)',
} as const

type Fetch = typeof fetch

export interface FrontierLoadOptions {
  now?: Date
  fetch?: Fetch
  env?: LandmarkEnv
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** One dc_papers row as the pool keeps it; `editions` are the dates of published editions that featured it. */
export function frontierPaperFromRow(r: Record<string, unknown>, editions: string[] = []): FrontierPaper {
  const kind = r.kind === 'lab' || r.kind === 'academic' || r.kind === 'mixed' ? r.kind : null
  return {
    arxivId: String(r.arxiv_id),
    title: String(r.title ?? '').replace(/\s+/g, ' ').trim(),
    abstract: str(r.abstract),
    authors: str(r.authors),
    affiliations: str(r.affiliations),
    kind,
    category: str(r.category),
    area: str(r.area),
    bench: str(r.bench),
    baseline: num(r.baseline),
    result: num(r.result),
    unit: str(r.unit),
    computeBucket: num(r.compute_bucket),
    scale: str(r.scale),
    weightsReleased: r.weights_released === true,
    codeReleased: r.code_released === true,
    why: str(r.why),
    tags: Array.isArray(r.tags) ? r.tags.filter((t): t is string => typeof t === 'string' && !!t.trim()) : [],
    importance: num(r.importance),
    publishedAt: new Date(String(r.published_at)).toISOString(),
    editions: [...editions].sort(),
  }
}

/**
 * The pool from dc_papers rows and published editions ({ edition_date,
 * paper_ids }): newest first, arXiv id as the tie-break, so the same rows
 * always give the same pool (the draw is deterministic per seed).
 */
export function frontierPoolFromRows(
  rows: Record<string, unknown>[],
  editions: Array<{ edition_date: string; paper_ids: string[] | null }>,
  opts: { asOf: string; windowDays: number },
): FrontierPool {
  const featured = new Map<string, string[]>()
  for (const e of editions) {
    for (const id of e.paper_ids ?? []) featured.set(id, [...(featured.get(id) ?? []), String(e.edition_date).slice(0, 10)])
  }
  const papers = rows
    .filter((r) => r.arxiv_id && r.title && r.published_at)
    .map((r) => frontierPaperFromRow(r, featured.get(String(r.arxiv_id)) ?? []))
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.arxivId.localeCompare(b.arxivId))
  return { asOf: opts.asOf, windowDays: opts.windowDays, papers, editionsRead: editions.length }
}

const decodeXml = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`))
  return m ? decodeXml(m[1]!) || null : null
}

/** The fields the record keeps from arXiv's Atom answer for one id; null when the feed has no entry for it. */
export function arxivEntryFromAtom(xml: string, arxivId: string): Pick<FrontierRecord, 'version' | 'updated' | 'journalRef' | 'doi' | 'comment'> | null {
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const entry = m[1]!
    const id = tag(entry, 'id') ?? ''
    const hit = id.match(/abs\/(.+?)(?:v(\d+))?$/)
    if (!hit || hit[1] !== arxivId) continue
    const doi = tag(entry, 'arxiv:doi')
    return {
      version: hit[2] ? Number(hit[2]) : null,
      updated: tag(entry, 'updated'),
      journalRef: tag(entry, 'arxiv:journal_ref'),
      doi: doi && !/^10\.48550\//i.test(doi) ? doi : null,
      comment: tag(entry, 'arxiv:comment'),
    }
  }
  return null
}

function emptyRecord(asOf: string, arxivId: string): FrontierRecord {
  return {
    asOf,
    absUrl: `https://arxiv.org/abs/${arxivId}`,
    pdfUrl: `https://arxiv.org/pdf/${arxivId}`,
    version: null,
    updated: null,
    journalRef: null,
    doi: null,
    comment: null,
    citedBy: null,
    countsByYear: [],
    openalexUrl: null,
    sources: { arxiv: 'skipped', openalex: 'skipped', errors: [], notes: [] },
  }
}

/**
 * The drawn paper's live record. Never throws; a source that fails is
 * `failed` with its error.
 */
export async function loadFrontierRecord(paper: Pick<FrontierPaper, 'arxivId' | 'title'>, opts: FrontierLoadOptions = {}): Promise<FrontierRecord> {
  const fetchImpl = opts.fetch ?? fetch
  const env = opts.env ?? landmarkEnv()
  const asOf = (opts.now ?? new Date()).toISOString()
  const record = emptyRecord(asOf, paper.arxivId)
  const headers = { 'user-agent': FRONTIER_RULES.userAgent }

  try {
    const res = await fetchImpl(`${FRONTIER_RULES.arxivApi}?id_list=${encodeURIComponent(paper.arxivId)}&max_results=1`, {
      headers: { ...headers, accept: 'application/atom+xml' },
      signal: AbortSignal.timeout(FRONTIER_RULES.timeoutMs),
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const entry = arxivEntryFromAtom(await res.text(), paper.arxivId)
    if (entry) {
      Object.assign(record, entry)
      record.sources.arxiv = 'ok'
      if (entry.version && entry.version > 1) record.sources.notes.push(`arXiv has v${entry.version}: read the latest version, and note what changed from v1 if the numbers moved.`)
    } else {
      record.sources.arxiv = 'failed'
      record.sources.errors.push(`arXiv returned no entry for ${paper.arxivId}`)
    }
  } catch (e) {
    record.sources.arxiv = 'failed'
    record.sources.errors.push(`arXiv: ${errorText(e)}`)
  }

  const extra = [env.openalexKey ? `api_key=${encodeURIComponent(env.openalexKey)}` : '', env.email ? `mailto=${encodeURIComponent(env.email)}` : ''].filter(Boolean).join('&')
  const doi = `10.48550/arxiv.${paper.arxivId}`
  try {
    const res = await fetchImpl(`${FRONTIER_RULES.openalexApi}/works/doi:${encodeURIComponent(doi)}?select=id,doi,title,display_name,publication_year,cited_by_count,counts_by_year${extra ? `&${extra}` : ''}`, {
      headers: { ...headers, accept: 'application/json' },
      signal: AbortSignal.timeout(FRONTIER_RULES.timeoutMs),
    })
    if (res.status === 404) {
      record.sources.openalex = 'skipped'
      record.sources.notes.push('OpenAlex has no record for the arXiv DOI yet (new preprints take days to weeks to appear): no citation count.')
    } else if (!res.ok) {
      throw new Error(`HTTP ${res.status}`)
    } else {
      const o = recordFromOpenAlex((await res.json()) as OpenAlexWork, asOf, doi)
      record.citedBy = o.citedBy
      record.countsByYear = o.countsByYear
      record.openalexUrl = o.openalexUrl
      record.sources.openalex = 'ok'
    }
  } catch (e) {
    record.sources.openalex = 'failed'
    record.sources.errors.push(`OpenAlex: ${errorText(e)}`)
  }
  return record
}
