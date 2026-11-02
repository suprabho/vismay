/**
 * The Evidence Desk's live citation record of the study a spin drew, read
 * after the draw (docs/evidence-randomizer-plan.md section 4):
 *
 *   - OpenAlex, one free singleton lookup (by the work id the taxonomy
 *     script resolved, else by DOI): the title OpenAlex has, the venue, the
 *     total citations and citations by year, the field-weighted citation
 *     impact, the top-1% flag, whether the work is retracted, and a
 *     free-to-read link (CC0);
 *   - Unpaywall, when UNPAYWALL_EMAIL is set: its verdict on the free copy.
 *
 * A study without a DOI (a few reports and the one entry the collection lists
 * without one) gets a record with both sources `skipped`. Pure apart from
 * fetch (no Supabase), so spins.ts, the pool API and the tests can all use it.
 * It never throws: each source's state is recorded in EvidenceRecord.sources
 * and the brief says what to look up by hand.
 */

import { landmarkEnv, normalizeDoi, type LandmarkEnv, type OpenAlexWork, type UnpaywallRecord } from './landmarkPool'
import type { EvidenceRecord, EvidenceStudy } from './types'

export const EVIDENCE_RULES = {
  openalexApi: 'https://api.openalex.org',
  unpaywallApi: 'https://api.unpaywall.org/v2',
  timeoutMs: 12_000,
  userAgent: 'vismay-randomizer/0.1 (evidence desk; https://vizmaya.fyi)',
  /** Below this share of shared words, the title OpenAlex has for the DOI is flagged for a check. */
  titleOverlap: 0.5,
} as const

const SELECT = 'id,doi,title,display_name,publication_year,cited_by_count,fwci,citation_normalized_percentile,open_access,is_retracted,type,primary_location,counts_by_year'

type Fetch = typeof fetch

export interface EvidenceLoadOptions {
  now?: Date
  fetch?: Fetch
  env?: LandmarkEnv
}

async function getJsonOrNull<T>(url: string, fetchImpl: Fetch): Promise<T | null> {
  const res = await fetchImpl(url, {
    headers: { accept: 'application/json', 'user-agent': EVIDENCE_RULES.userAgent },
    signal: AbortSignal.timeout(EVIDENCE_RULES.timeoutMs),
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`${new URL(url).host}: HTTP ${res.status}`)
  return (await res.json()) as T
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))

const words = (s: string) =>
  new Set(
    s
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 3),
  )

/** Share of the collection title's longer words that the other title also has (1 when it has none). */
export function titleOverlap(collection: string, other: string): number {
  const a = words(collection)
  const b = words(other)
  if (!a.size) return 1
  let hit = 0
  for (const w of a) if (b.has(w)) hit++
  return hit / a.size
}

/** The OpenAlex work as the record keeps it; citation years sorted oldest first. */
export function recordFromOpenAlex(o: OpenAlexWork, asOf: string, doi: string | null): EvidenceRecord {
  const id = o.id?.split('/').pop() ?? null
  return {
    asOf,
    doi: normalizeDoi(o.doi) ?? doi,
    openalexId: id,
    openalexUrl: id ? `https://openalex.org/${id}` : null,
    title: (o.title || o.display_name || '').trim() || null,
    venue: o.primary_location?.source?.display_name || o.primary_location?.raw_source_name || null,
    year: o.publication_year ?? null,
    type: o.type ?? null,
    citedBy: o.cited_by_count ?? null,
    fwci: o.fwci === null || o.fwci === undefined ? null : Math.round(o.fwci * 100) / 100,
    topOnePercent: o.citation_normalized_percentile?.is_in_top_1_percent ?? null,
    countsByYear: [...(o.counts_by_year ?? [])].map((c) => ({ year: c.year, citations: c.cited_by_count })).sort((a, b) => a.year - b.year),
    oaUrl: o.open_access?.oa_url || o.primary_location?.pdf_url || null,
    oaStatus: o.open_access?.oa_status ?? null,
    retracted: !!o.is_retracted,
    sources: { openalex: 'ok', unpaywall: 'skipped', errors: [], notes: [] },
  }
}

function emptyRecord(asOf: string, doi: string | null): EvidenceRecord {
  return {
    asOf,
    doi,
    openalexId: null,
    openalexUrl: null,
    title: null,
    venue: null,
    year: null,
    type: null,
    citedBy: null,
    fwci: null,
    topOnePercent: null,
    countsByYear: [],
    oaUrl: null,
    oaStatus: null,
    retracted: false,
    sources: { openalex: 'skipped', unpaywall: 'skipped', errors: [], notes: [] },
  }
}

/**
 * The drawn study's live citation record. Never throws; a source that fails
 * is `failed` with its error, a source with nothing to look up is `skipped`
 * with a note.
 */
export async function loadEvidenceRecord(
  study: Pick<EvidenceStudy, 'n' | 'label' | 'title' | 'year' | 'doi' | 'openalex'>,
  opts: EvidenceLoadOptions = {},
): Promise<EvidenceRecord> {
  const fetchImpl = opts.fetch ?? fetch
  const env = opts.env ?? landmarkEnv()
  const asOf = (opts.now ?? new Date()).toISOString()
  const doi = normalizeDoi(study.doi)
  let record = emptyRecord(asOf, doi)

  if (!doi && !study.openalex) {
    record.sources.notes.push(`#${study.n} has no DOI, so there is no live citation record: find the citation count on Google Scholar or the publisher's page, and say where it came from.`)
    return record
  }

  const extra = [env.openalexKey ? `api_key=${encodeURIComponent(env.openalexKey)}` : '', env.email ? `mailto=${encodeURIComponent(env.email)}` : ''].filter(Boolean).join('&')
  const path = study.openalex ? `/works/${study.openalex}` : `/works/doi:${encodeURIComponent(doi!)}`
  try {
    const o = await getJsonOrNull<OpenAlexWork>(`${EVIDENCE_RULES.openalexApi}${path}?select=${SELECT}${extra ? `&${extra}` : ''}`, fetchImpl)
    if (o) {
      record = recordFromOpenAlex(o, asOf, doi)
      if (record.title && titleOverlap(study.title, record.title) < EVIDENCE_RULES.titleOverlap) {
        record.sources.notes.push(`OpenAlex's title for this DOI is "${record.title}", not the collection's "${study.title}": check the DOI before citing it.`)
      }
      if (record.retracted) record.sources.notes.push('OpenAlex marks this work as retracted: the page leads with that, or the spin is re-spun.')
      if (record.year !== null && record.year !== study.year) {
        record.sources.notes.push(`OpenAlex dates it ${record.year}, the collection ${study.year} (online-first and print years often differ): use the year on the publisher's page.`)
      }
      const thisYear = Number(asOf.slice(0, 4))
      if (record.countsByYear.at(-1)?.year === thisYear) record.sources.notes.push(`Citations for ${thisYear} are a partial year.`)
    } else {
      record.sources.openalex = 'failed'
      record.sources.errors.push(`OpenAlex has no work for ${study.openalex ?? `DOI ${doi}`}`)
    }
  } catch (e) {
    record.sources.openalex = 'failed'
    record.sources.errors.push(`OpenAlex: ${errorText(e)}`)
  }

  const oaDoi = record.doi ?? doi
  if (!oaDoi || /^10\.48550\//.test(oaDoi)) {
    // arXiv is free to read already; Unpaywall has nothing to add.
    record.sources.unpaywall = 'skipped'
  } else if (!env.email) {
    record.sources.unpaywall = 'skipped'
    record.sources.notes.push('Unpaywall was skipped (no UNPAYWALL_EMAIL): the free-to-read link is OpenAlex\'s alone.')
  } else {
    try {
      const u = await getJsonOrNull<UnpaywallRecord>(`${EVIDENCE_RULES.unpaywallApi}/${encodeURIComponent(oaDoi)}?email=${encodeURIComponent(env.email)}`, fetchImpl)
      if (u) {
        const url = u.best_oa_location?.url_for_pdf || u.best_oa_location?.url || null
        record.oaUrl = url ?? (u.is_oa ? record.oaUrl : null)
        record.oaStatus = u.oa_status ?? record.oaStatus
      }
      record.sources.unpaywall = 'ok'
    } catch (e) {
      record.sources.unpaywall = 'failed'
      record.sources.errors.push(`Unpaywall: ${errorText(e)}`)
    }
  }
  return record
}
