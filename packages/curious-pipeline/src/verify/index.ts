/**
 * Citation chasing for one claim: the cited work or book is resolved, the
 * quotation is looked for in print, the entities are reconciled, and
 * everything becomes claim-source rows and entity facts for the grader.
 * Every lookup takes the injected fetch and never throws past here: a
 * source that fails is noted and the claim is graded on what was found.
 */

import { createLimiter, type Clock, type Limiter } from '../http'
import { independenceGroup } from '../dedupe'
import type { EntityFacts } from '../grade'
import { SOURCE_POLICIES } from '../policy'
import type { ClaimSourceUpsert, CuriousEnv, EntityKind } from '../types'
import { resolveWork, workByDoi, type ResolvedWork } from './crossref'
import { phraseInBooks, resolveBook, type ResolvedBook } from './googleBooks'
import { resolveEntities, type WikidataEntity } from './wikidata'

export { resolveWork, workByDoi, workFromCrossref, type ResolvedWork } from './crossref'
export { resolveBook, phraseInBooks, bookFromVolume, type ResolvedBook } from './googleBooks'
export { resolveEntities, entityFromWikidata, type WikidataEntity } from './wikidata'
export { titleOverlap } from './shared'

export interface VerifyInput {
  claimId: string
  text: string
  isQuotation: boolean
  evidenceQuote: string
  entities: Array<{ name: string; kind: EntityKind }>
  /** DOIs already attached (from the document or an earlier pass). */
  dois?: string[]
  /** Other claim ids in the same cluster, to spot citations that loop back. */
  clusterDois?: string[]
}

export interface VerifyResult {
  sources: ClaimSourceUpsert[]
  entities: EntityFacts[]
  wikidata: Map<string, WikidataEntity>
  works: ResolvedWork[]
  books: ResolvedBook[]
  notes: string[]
  errors: string[]
}

export interface VerifyOptions {
  fetch?: typeof fetch
  env: CuriousEnv
  clock?: Clock
  now?: Date
  limiters?: Partial<Record<'crossref' | 'books' | 'wikidata', Limiter>>
}

export function verifyLimiters(clock?: Clock): Record<'crossref' | 'books' | 'wikidata', Limiter> {
  return {
    crossref: createLimiter({ minGapMs: SOURCE_POLICIES.crossref.crawlDelayMs, clock }),
    books: createLimiter({ minGapMs: SOURCE_POLICIES['google-books'].crawlDelayMs, clock }),
    wikidata: createLimiter({ minGapMs: SOURCE_POLICIES.wikidata.crawlDelayMs, clock }),
  }
}

/** Chase the claim's citations. */
export async function verifyClaim(input: VerifyInput, opts: VerifyOptions): Promise<VerifyResult> {
  const lim = { ...verifyLimiters(opts.clock), ...opts.limiters }
  const result: VerifyResult = { sources: [], entities: [], wikidata: new Map(), works: [], books: [], notes: [], errors: [] }
  const common = { fetch: opts.fetch, env: opts.env, now: opts.now }
  const works = input.entities.filter((e) => e.kind === 'work')

  // 1. DOIs already known: read the record for its type and references.
  for (const doi of input.dois ?? []) {
    try {
      const w = await workByDoi(doi, { ...common, limiter: lim.crossref })
      if (w) {
        result.works.push(w)
        result.sources.push(workSource(input.claimId, w, input.clusterDois ?? []))
      }
    } catch (e) {
      result.errors.push(`crossref ${doi}: ${msg(e)}`)
    }
  }
  // 2. Works named in the claim: a scholarly match on Crossref, a book on Google Books.
  for (const w of works.slice(0, 2)) {
    try {
      const found = await resolveWork({ title: w.name }, { ...common, limiter: lim.crossref })
      if (found && !result.works.some((x) => x.doi === found.doi)) {
        result.works.push(found)
        result.sources.push(workSource(input.claimId, found, input.clusterDois ?? []))
        result.notes.push(`Crossref: "${found.title}" (${found.year ?? 'n.d.'}, ${found.type ?? 'work'})`)
      }
    } catch (e) {
      result.errors.push(`crossref "${w.name}": ${msg(e)}`)
    }
    try {
      const book = await resolveBook({ title: w.name }, { ...common, limiter: lim.books })
      if (book) {
        result.books.push(book)
        result.sources.push({
          claim_id: input.claimId,
          document_id: null,
          relation: 'cites',
          independence_group: independenceGroup({ isbn: book.isbn13 ?? book.isbn10, publisher: book.publisher }),
          is_primary: false,
          is_contemporaneous: false,
          institutional_quality: SOURCE_POLICIES['google-books'].institutionalQuality,
          quote: book.snippet ? book.snippet.slice(0, 300) : null,
          span_start: null,
          span_end: null,
          page: null,
          external_ref: book.isbn13 ? `isbn:${book.isbn13}` : book.isbn10 ? `isbn:${book.isbn10}` : `url:${book.url ?? `https://books.google.com/books?id=${book.volumeId}`}`,
          source_year: book.year,
          work_type: 'book',
          verified_by: 'verify-books',
        })
        result.notes.push(`Google Books: "${book.title}" (${book.publisher ?? 'publisher unknown'}, ${book.year ?? 'n.d.'})`)
      }
    } catch (e) {
      result.errors.push(`books "${w.name}": ${msg(e)}`)
    }
  }
  // 3. A quotation: does it exist in print, in a lineage other than the document's?
  if (input.isQuotation) {
    try {
      const hits = await phraseInBooks(input.evidenceQuote, { ...common, limiter: lim.books })
      for (const b of hits.slice(0, 2)) {
        result.books.push(b)
        result.sources.push({
          claim_id: input.claimId,
          document_id: null,
          relation: 'supports',
          independence_group: independenceGroup({ isbn: b.isbn13 ?? b.isbn10, publisher: b.publisher }),
          is_primary: false,
          is_contemporaneous: false,
          institutional_quality: SOURCE_POLICIES['google-books'].institutionalQuality,
          quote: b.snippet ? b.snippet.slice(0, 300) : null,
          span_start: null,
          span_end: null,
          page: null,
          external_ref: b.isbn13 ? `isbn:${b.isbn13}` : `url:${b.url ?? `https://books.google.com/books?id=${b.volumeId}`}`,
          source_year: b.year,
          work_type: 'book',
          quote_found: true,
          verified_by: 'verify-books',
        })
      }
      result.notes.push(hits.length ? `the quotation appears in ${hits.length} book${hits.length === 1 ? '' : 's'}` : 'the quotation is not found in Google Books')
    } catch (e) {
      result.errors.push(`books phrase: ${msg(e)}`)
    }
  }
  // 4. Entities: life dates, work dates, countries, the private-person signal.
  try {
    result.wikidata = await resolveEntities(input.entities, { ...common, limiter: lim.wikidata })
    for (const [name, e] of result.wikidata) {
      const kind = input.entities.find((x) => x.name === name)?.kind ?? 'other'
      result.entities.push({ name, kind, birthYear: e.birthYear, deathYear: e.deathYear, year: e.year, countryCode: e.countryCode, isLivingPrivate: e.isLivingPrivate })
    }
  } catch (e) {
    result.errors.push(`wikidata: ${msg(e)}`)
  }
  return result
}

function workSource(claimId: string, w: ResolvedWork, clusterDois: string[]): ClaimSourceUpsert {
  const citesCluster = clusterDois.length > 0 && w.referenceDois.some((d) => clusterDois.includes(d))
  return {
    claim_id: claimId,
    document_id: null,
    relation: 'cites',
    independence_group: independenceGroup({ doi: w.doi }),
    is_primary: false,
    is_contemporaneous: false,
    institutional_quality: /journal-article|book|monograph|proceedings/.test(w.type ?? '') ? 0.9 : 0.7,
    quote: null,
    span_start: null,
    span_end: null,
    page: null,
    external_ref: `doi:${w.doi}`,
    verified_by: 'verify-crossref',
    work_type: w.type,
    cites_cluster: citesCluster,
    source_year: w.year,
  }
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))
