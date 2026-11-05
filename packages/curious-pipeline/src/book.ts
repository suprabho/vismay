/**
 * Source books as Curious Desk claims. A book in vizmaya-data/<book>/ (the
 * first is Seriously Curious: The Economist, ed. Tom Standage, Profile Books
 * 2018) is scraped into self-contained articles, each with up to four
 * numeric fact sentences. This module turns them into what the claim store
 * holds: one curious_documents row per article (source 'book', no text: the
 * body stays in book_articles), and one claim per standalone fact sentence,
 * the sentence itself as the verbatim evidence quote and the book's ISBN as
 * its one lineage.
 *
 * Pure: no network, no database. scripts/curious/seed-book.ts writes the
 * plan; the grader grades it like any other claim (one secondary lineage, so
 * the grades come out low until the research finds the primary source,
 * which is the honest reading of a fact quoted from a book).
 */

import { eraOf, REGION_IDS, THEME_IDS } from './taxonomy'
import { normalizeText, sha256 } from './text'
import type { ClaimKind, EntityKind } from './types'

export const BOOK_VERSION = 'curious-book-v1-2026-11'

export interface BookMeta {
  /** The book's epic slug (book_articles.epic_slug). */
  slug: string
  title: string
  isbn: string
  publisher: string
  author: string
  year: number
  /** Institutional quality the grader reads off each claim source (0..1). */
  quality: number
}

export const SERIOUSLY_CURIOUS: BookMeta = {
  slug: 'seriously-curious',
  title: 'Seriously Curious: The Facts and Figures That Turn Our World Upside Down',
  isbn: '9781788161367',
  publisher: 'Profile Books, under licence from The Economist',
  author: 'The Economist (ed. Tom Standage)',
  year: 2018,
  quality: 0.8,
}

/** One row of vizmaya-data/<book>/articles.json (the fields this module reads). */
export interface BookArticle {
  slug: string
  section: string
  title: string
  page_start: number | null
  entities: string[]
  facts: string[]
  body: string
}

/** The desk taxonomy per article: [theme, region, ISO country code or null] (curious-desk.json). */
export type BookTaxonomy = Record<string, [string, string, string | null]>

export interface BookDocumentPlan {
  external_id: string
  canonical_url: string
  title: string
  content_hash: string
  raw_uri: string
  meta: Record<string, unknown>
}

export interface BookClaimPlan {
  document: string
  text: string
  text_norm: string
  claim_hash: string
  kind: ClaimKind
  subject: string
  era: string
  region: string
  theme: string
  year_from: number | null
  year_to: number | null
  country_code: string | null
  evidence_quote: string
  evidence_page: number | null
  is_hearsay: boolean
  entities: Array<{ name: string; kind: EntityKind }>
}

export interface BookPlan {
  documents: BookDocumentPlan[]
  claims: BookClaimPlan[]
  /** Fact sentences left out, with why. */
  skipped: Array<{ article: string; fact: string; why: string }>
}

/**
 * A sentence that leans on the one before it ("But most of that water...",
 * "It had more than 182m citizens...") is not a claim on its own.
 */
const LEANS_ON_CONTEXT = /^(And|But|So|Or|Yet|Then|Now|This|That|These|Those|Such|It|Its|They|Their|He|She|His|Her)\b/

const HEARSAY = /\b(reportedly|it is said|legend has it|allegedly|supposedly|rumou?red)\b/i

/** Organisations among the scrape's gazetteer; everything else it tags is a place. */
const ORGS = new Set(['UN', 'United Nations', 'UNEP', 'WHO', 'World Bank', 'IMF', 'OECD', 'EU', 'European Union', 'Boko Haram', 'Google', 'Microsoft', 'Apple', 'Facebook', 'Amazon', 'Deloitte', 'Unicode'])

/** Years a fact names (1000 to 2099, or "300BC"), as astronomical years, smallest first. */
export function yearsIn(text: string): number[] {
  const out = new Set<number>()
  for (const m of text.matchAll(/(?<![\d.,/$£€])(\d{3,4})\s?(BC|BCE)\b/g)) out.add(1 - Number(m[1]))
  for (const m of text.matchAll(/(?<![\d.,/$£€])\b(1\d{3}|20\d{2})\b(?![\d%]|[.,]\d|\s?(?:BC|BCE|m|bn|km|kg)\b)/g)) out.add(Number(m[1]))
  return [...out].sort((a, b) => a - b)
}

export function whyNotAClaim(fact: string): string | null {
  const t = fact.trim()
  if (!t) return 'empty'
  if (t.length > 300) return 'longer than the 300-character evidence limit'
  if (LEANS_ON_CONTEXT.test(t)) return 'leans on the sentence before it'
  if (/\bSources?:/.test(t)) return 'a chart caption the scrape ran into the text'
  return null
}

const wordIn = (name: string, text: string) => new RegExp(`(^|[^\\p{L}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'u').test(text)

export function bookPlan(articles: BookArticle[], taxonomy: BookTaxonomy, book: BookMeta = SERIOUSLY_CURIOUS): BookPlan {
  const plan: BookPlan = { documents: [], claims: [], skipped: [] }
  const themes = new Set<string>(THEME_IDS)
  const regions = new Set<string>(REGION_IDS)
  const seen = new Set<string>()
  for (const a of articles) {
    const tax = taxonomy[a.slug]
    if (!tax) throw new Error(`${book.slug}: no desk taxonomy for article ${a.slug}`)
    const [theme, region, country] = tax
    if (!themes.has(theme)) throw new Error(`${a.slug}: unknown theme ${theme}`)
    if (!regions.has(region)) throw new Error(`${a.slug}: unknown region ${region}`)
    const external_id = `${book.slug}:${a.slug}`
    plan.documents.push({
      external_id,
      canonical_url: `https://books.google.com/books?vid=ISBN${book.isbn}#${a.slug}`,
      title: a.title,
      content_hash: sha256(normalizeText(a.body)),
      raw_uri: `vizmaya-data/${book.slug}/articles.json#${a.slug}`,
      meta: { book: book.slug, book_title: book.title, isbn: book.isbn, section: a.section, article: a.slug, page_start: a.page_start },
    })
    for (const raw of a.facts) {
      const fact = raw.trim()
      const why = whyNotAClaim(fact)
      if (why) {
        plan.skipped.push({ article: a.slug, fact, why })
        continue
      }
      const text_norm = normalizeText(fact)
      const claim_hash = sha256(text_norm)
      if (seen.has(claim_hash)) {
        plan.skipped.push({ article: a.slug, fact, why: 'the same sentence is already a claim' })
        continue
      }
      seen.add(claim_hash)
      const years = yearsIn(fact)
      const yearFrom = years[0] ?? null
      const yearTo = years.length > 1 ? years[years.length - 1]! : null
      plan.claims.push({
        document: external_id,
        text: fact,
        text_norm,
        claim_hash,
        kind: /\d/.test(fact) ? 'number' : 'fact',
        subject: a.title,
        era: eraOf(yearFrom) ?? 'undated',
        region,
        theme,
        year_from: yearFrom,
        year_to: yearTo,
        country_code: country,
        evidence_quote: fact,
        evidence_page: a.page_start,
        is_hearsay: HEARSAY.test(fact),
        entities: a.entities.filter((e) => wordIn(e, fact)).map((name) => ({ name, kind: ORGS.has(name) ? 'org' : 'place' })),
      })
    }
  }
  return plan
}
