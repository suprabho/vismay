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

export interface CollectOptions {
  query: string
  /** ISO date (YYYY-MM-DD) lower bound on publication, inclusive. */
  since?: string
  /** ISO date upper bound, exclusive. Defaults to now. */
  until?: string
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

export interface Collector {
  id: CollectorId
  collect(opts: CollectOptions): AsyncGenerator<DocumentUpsert>
}

export const COLLECTORS: Record<CollectorId, Collector | null> = {
  gdelt: { id: 'gdelt', collect: collectGdelt },
  loc: { id: 'loc', collect: collectLoc },
  europeana: null,
  gallica: null,
}

export function collectorFor(id: CollectorId): Collector {
  const c = COLLECTORS[id]
  if (!c) throw new Error(`The ${id} collector is not built yet.`)
  return c
}

export { collectGdelt, gdeltDocumentsFromArticles, gdeltWindows, gdeltUrl } from './gdelt'
export { collectLoc, locDocumentsFromResults, locSearchUrl, locPartitions } from './loc'
