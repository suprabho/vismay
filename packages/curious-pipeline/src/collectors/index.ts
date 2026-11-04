/**
 * The discovery collectors. Each is an async generator of DocumentUpsert
 * rows that asks the policy registry before its first request, paces itself
 * with a limiter sized from the policy, and maps the source's own fields to
 * curious_documents without losing provenance: the request URL that found
 * the row is kept as raw_uri, the query as query, the source's id as
 * external_id.
 */

import type { CollectorId, CuriousEnv, DocumentUpsert } from '../types'
import type { Clock } from '../http'
import { collectGdelt } from './gdelt'
import { collectLoc } from './loc'
import { collectEuropeana } from './europeana'
import { collectGallica } from './gallica'

export interface CollectOptions {
  query: string
  /** ISO date (YYYY-MM-DD) lower bound on publication, inclusive. */
  since?: string
  /** ISO date upper bound, exclusive. Defaults to now. */
  until?: string
  /** Lower bound in days before `until` when `since` is absent (each collector has its default). */
  days?: number
  /** Counters the collector fills and the CLI reads, to tell a throttled night from a broken one. */
  stats?: CollectStats
  /** Stop after this many documents. */
  limit: number
  /** Source-specific sub-scope: LOC collection slug, Europeana qf, Gallica dc.type. */
  collection?: string
  /** Fetch full text where the policy allows it (LOC newspaper pages). */
  fullText?: boolean
  fetch?: typeof fetch
  env: CuriousEnv
  now?: Date
  clock?: Clock
  log?: (line: string) => void
  /** Stop early (the CLI's soft deadline). */
  stop?: () => boolean
}

export interface CollectStats {
  /** Requests sent to the source. */
  requests: number
  /** Requests that got an answer other than 429. */
  ok: number
  /** The source refused the IP past the retries; the collector stopped and kept what it had. */
  throttled: boolean
  /** Why it stopped early, if it did. */
  note?: string
}

export const emptyStats = (): CollectStats => ({ requests: 0, ok: 0, throttled: false })

export interface Collector {
  id: CollectorId
  collect(opts: CollectOptions): AsyncGenerator<DocumentUpsert>
}

export const COLLECTORS: Record<CollectorId, Collector | null> = {
  gdelt: { id: 'gdelt', collect: collectGdelt },
  loc: { id: 'loc', collect: collectLoc },
  europeana: { id: 'europeana', collect: collectEuropeana },
  gallica: { id: 'gallica', collect: collectGallica },
}

export function collectorFor(id: CollectorId): Collector {
  const c = COLLECTORS[id]
  if (!c) throw new Error(`The ${id} collector is not built yet.`)
  return c
}

export { collectGdelt, gdeltDocumentsFromArticles, gdeltWindows, gdeltUrl } from './gdelt'
export { collectLoc, locDocumentsFromResults, locSearchUrl, locPartitions } from './loc'
export { collectEuropeana, europeanaDocumentsFromItems, europeanaUrl, europeanaIsPublicDomain } from './europeana'
export { collectGallica, parseGallicaSru, parseGallicaContentSearch, gallicaDocumentFromRecord, gallicaSruUrl, gallicaContentSearchUrl, gallicaSnippetText } from './gallica'
