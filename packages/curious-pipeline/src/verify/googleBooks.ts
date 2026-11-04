/**
 * Google Books for bibliographic checks: the ISBN, publisher and date of a
 * cited book, and whether a quoted sentence exists in print (a phrase
 * search). Snippets only; never full text. An API key raises the quota but
 * is not required.
 */

import { assertAllowed } from '../policy'
import { getJsonOrNull, type Limiter } from '../http'
import { titleOverlap } from './shared'
import type { CuriousEnv } from '../types'

export const BOOKS_RULES = {
  api: 'https://www.googleapis.com/books/v1/volumes',
  maxResults: 10,
  minTitleOverlap: 0.6,
  /** Words of a quotation sent as the phrase. */
  phraseWords: 12,
  version: 'curious-books-v1-2026-11',
} as const

export interface BooksVolume {
  id: string
  volumeInfo?: {
    title?: string
    subtitle?: string
    authors?: string[]
    publisher?: string
    publishedDate?: string
    industryIdentifiers?: Array<{ type: string; identifier: string }>
    language?: string
    infoLink?: string
    canonicalVolumeLink?: string
  }
  searchInfo?: { textSnippet?: string }
}

export interface ResolvedBook {
  volumeId: string
  title: string | null
  authors: string[]
  publisher: string | null
  year: number | null
  isbn13: string | null
  isbn10: string | null
  language: string | null
  url: string | null
  snippet: string | null
}

export function bookFromVolume(v: BooksVolume): ResolvedBook {
  const vi = v.volumeInfo ?? {}
  const ids = vi.industryIdentifiers ?? []
  return {
    volumeId: v.id,
    title: [vi.title, vi.subtitle].filter(Boolean).join(': ') || null,
    authors: vi.authors ?? [],
    publisher: vi.publisher ?? null,
    year: vi.publishedDate ? Number(vi.publishedDate.slice(0, 4)) || null : null,
    isbn13: ids.find((i) => i.type === 'ISBN_13')?.identifier ?? null,
    isbn10: ids.find((i) => i.type === 'ISBN_10')?.identifier ?? null,
    language: vi.language ?? null,
    url: vi.canonicalVolumeLink ?? vi.infoLink ?? null,
    snippet: v.searchInfo?.textSnippet?.replace(/<[^>]+>/g, '') ?? null,
  }
}

export interface BooksOptions {
  fetch?: typeof fetch
  env: CuriousEnv
  limiter?: Limiter
  now?: Date
}

function url(q: string, env: CuriousEnv): string {
  const p = new URLSearchParams({ q, maxResults: String(BOOKS_RULES.maxResults), printType: 'books' })
  if (env.googleBooksKey) p.set('key', env.googleBooksKey)
  return `${BOOKS_RULES.api}?${p.toString()}`
}

export async function resolveBook(q: { title: string; author?: string | null }, opts: BooksOptions): Promise<ResolvedBook | null> {
  assertAllowed('google-books', { method: 'api', now: opts.now })
  const query = `intitle:"${q.title.replace(/"/g, '')}"${q.author ? ` inauthor:"${q.author.replace(/"/g, '')}"` : ''}`
  const res = await getJsonOrNull<{ items?: BooksVolume[] }>(url(query, opts.env), { fetch: opts.fetch, limiter: opts.limiter, label: 'Google Books' })
  let best: ResolvedBook | null = null
  let bestScore = 0
  for (const v of res?.items ?? []) {
    const b = bookFromVolume(v)
    if (!b.title) continue
    const s = titleOverlap(q.title, b.title)
    if (s >= BOOKS_RULES.minTitleOverlap && s > bestScore) {
      best = b
      bestScore = s
    }
  }
  return best
}

/** The first books, if any, in which a quotation's opening words appear verbatim. */
export async function phraseInBooks(quote: string, opts: BooksOptions): Promise<ResolvedBook[]> {
  assertAllowed('google-books', { method: 'api', now: opts.now })
  const phrase = quote.replace(/["“”]/g, '').split(/\s+/).slice(0, BOOKS_RULES.phraseWords).join(' ')
  if (phrase.split(' ').length < 5) return []
  const res = await getJsonOrNull<{ items?: BooksVolume[] }>(url(`"${phrase}"`, opts.env), { fetch: opts.fetch, limiter: opts.limiter, label: 'Google Books' })
  return (res?.items ?? []).map(bookFromVolume).slice(0, 5)
}
