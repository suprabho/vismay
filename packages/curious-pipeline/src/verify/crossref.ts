/**
 * Crossref as the verification layer for cited scholarship and books with
 * DOIs: resolve a work by title and author, read a DOI's record and its
 * references (for the circular-citation check). Polite pool: a mailto and
 * the user agent. Never used for discovery.
 */

import { assertAllowed } from '../policy'
import { getJsonOrNull, type Limiter } from '../http'
import { titleOverlap } from './shared'
import type { CuriousEnv } from '../types'

export const CROSSREF_RULES = {
  api: 'https://api.crossref.org/works',
  select: 'DOI,title,author,issued,container-title,publisher,type,is-referenced-by-count,URL,reference',
  /** Below this share of shared title words a match is refused. */
  minTitleOverlap: 0.6,
  version: 'curious-crossref-v1-2026-11',
} as const

export interface CrossrefWork {
  DOI: string
  title?: string[]
  author?: Array<{ given?: string; family?: string; name?: string }>
  issued?: { 'date-parts'?: number[][] }
  'container-title'?: string[]
  publisher?: string
  type?: string
  'is-referenced-by-count'?: number
  URL?: string
  reference?: Array<{ DOI?: string; unstructured?: string; 'article-title'?: string }>
}

export interface ResolvedWork {
  doi: string
  title: string | null
  authors: string[]
  year: number | null
  container: string | null
  publisher: string | null
  type: string | null
  citedBy: number | null
  url: string
  referenceDois: string[]
  referenceTitles: string[]
}

export function workFromCrossref(w: CrossrefWork): ResolvedWork {
  return {
    doi: w.DOI.toLowerCase(),
    title: w.title?.[0]?.trim() || null,
    authors: (w.author ?? []).map((a) => a.name ?? [a.given, a.family].filter(Boolean).join(' ')).filter(Boolean),
    year: w.issued?.['date-parts']?.[0]?.[0] ?? null,
    container: w['container-title']?.[0] ?? null,
    publisher: w.publisher ?? null,
    type: w.type ?? null,
    citedBy: w['is-referenced-by-count'] ?? null,
    url: w.URL ?? `https://doi.org/${w.DOI}`,
    referenceDois: (w.reference ?? []).map((r) => r.DOI?.toLowerCase()).filter((d): d is string => !!d),
    referenceTitles: (w.reference ?? []).map((r) => r['article-title'] ?? r.unstructured ?? '').filter(Boolean),
  }
}

export interface CrossrefOptions {
  fetch?: typeof fetch
  env: CuriousEnv
  limiter?: Limiter
  now?: Date
}

const headers = (env: CuriousEnv): Record<string, string> => (env.crossrefMailto ? { 'user-agent': `vizmaya-curious/1.0 (+https://vizmaya.fyi; mailto:${env.crossrefMailto})` } : {})

/** The best bibliographic match for a title (and author), or null when nothing overlaps enough. */
export async function resolveWork(q: { title: string; author?: string | null; year?: number | null }, opts: CrossrefOptions): Promise<ResolvedWork | null> {
  assertAllowed('crossref', { method: 'api', now: opts.now })
  const p = new URLSearchParams({ 'query.bibliographic': [q.title, q.author ?? ''].filter(Boolean).join(' '), rows: '5', select: CROSSREF_RULES.select })
  if (opts.env.crossrefMailto) p.set('mailto', opts.env.crossrefMailto)
  const res = await getJsonOrNull<{ message?: { items?: CrossrefWork[] } }>(`${CROSSREF_RULES.api}?${p.toString()}`, { fetch: opts.fetch, limiter: opts.limiter, headers: headers(opts.env), label: 'Crossref' })
  const items = res?.message?.items ?? []
  let best: ResolvedWork | null = null
  let bestScore = 0
  for (const it of items) {
    const w = workFromCrossref(it)
    if (!w.title) continue
    let s = titleOverlap(q.title, w.title)
    if (q.year && w.year && Math.abs(q.year - w.year) > 2) s -= 0.2
    if (s >= CROSSREF_RULES.minTitleOverlap && s > bestScore) {
      best = w
      bestScore = s
    }
  }
  return best
}

export async function workByDoi(doi: string, opts: CrossrefOptions): Promise<ResolvedWork | null> {
  assertAllowed('crossref', { method: 'api', now: opts.now })
  const clean = doi.replace(/^doi:/i, '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '')
  const p = new URLSearchParams()
  if (opts.env.crossrefMailto) p.set('mailto', opts.env.crossrefMailto)
  const res = await getJsonOrNull<{ message?: CrossrefWork }>(`${CROSSREF_RULES.api}/${encodeURIComponent(clean)}${p.size ? `?${p}` : ''}`, { fetch: opts.fetch, limiter: opts.limiter, headers: headers(opts.env), label: 'Crossref' })
  return res?.message ? workFromCrossref(res.message) : null
}
