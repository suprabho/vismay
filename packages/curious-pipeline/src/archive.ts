/**
 * The Wayback Machine's availability lookup: the nearest snapshot of a URL,
 * so a claim's canonical link survives the publisher taking the page down.
 * Read-only, one request per document, run at grade time.
 */

import { getJsonOrNull, type Limiter } from './http'

export const ARCHIVE_RULES = { api: 'https://archive.org/wayback/available', version: 'curious-archive-v1-2026-11' } as const

export interface WaybackResponse {
  archived_snapshots?: { closest?: { available?: boolean; url?: string; timestamp?: string; status?: string } }
}

export async function waybackSnapshot(url: string, opts: { fetch?: typeof fetch; limiter?: Limiter } = {}): Promise<string | null> {
  const res = await getJsonOrNull<WaybackResponse>(`${ARCHIVE_RULES.api}?url=${encodeURIComponent(url)}`, { fetch: opts.fetch, limiter: opts.limiter, label: 'Wayback', attempts: 2 })
  const c = res?.archived_snapshots?.closest
  return c?.available && c.url ? c.url.replace(/^http:/, 'https:') : null
}
