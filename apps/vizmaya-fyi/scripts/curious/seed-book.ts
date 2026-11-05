/**
 * Seed the Curious Desk from the Seriously Curious epic: every standalone
 * fact sentence of the book's 109 articles becomes a claim in the claim
 * store, so the desk (and the composer's "Curious claims" library) can draw
 * from it. Idempotent.
 *
 *   vizmaya-data/seriously-curious/articles.json      the scraped articles (facts[])
 *   vizmaya-data/seriously-curious/curious-desk.json  theme, region, country per article
 *     → curious_documents (source 'book', one per article, no body text)
 *     → curious_claims    (the fact sentence as its verbatim evidence quote)
 *     → curious_claim_sources (isbn:9781788161367, one lineage), curious_entities
 *
 * The plan is packages/curious-pipeline/src/book.ts (pure, tested). The
 * grader grades the claims like any other; one book is one secondary
 * lineage, so expect D and E until the research adds sources. Claims are
 * approved by default so the desk can spin at once; pass --status in_review
 * to queue them on the admin Curious claims tab instead. A claim a reviewer
 * has already approved, rejected or sent back keeps its status on a re-run.
 *
 * Needs migration 104_curious_book_source.sql (the 'book' source row).
 *
 * Usage: pnpm curious:seed-book [-- --status in_review] [-- --dry-run]
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'
import { BOOK_VERSION, bookPlan, SERIOUSLY_CURIOUS, type BookArticle, type BookTaxonomy } from '@vismay/curious-pipeline/book'
import { gradeClaims } from '@vismay/curious-pipeline/gradeRun'
import { insertClaims, linkClaimEntities, upsertClaimSources } from '@vismay/curious-pipeline/store'
import type { ClaimRow, ClaimStatus } from '@vismay/curious-pipeline/types'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const PKG_DIR = resolve(SCRIPT_DIR, '../../')
const DATA_DIR = resolve(SCRIPT_DIR, '../../../../vizmaya-data/seriously-curious')

loadEnv({ path: resolve(PKG_DIR, '.env.local') })
loadEnv({ path: resolve(PKG_DIR, '.env') })

const arg = (name: string): string | null => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] ?? null : null)

async function main() {
  const status = (arg('--status') ?? 'approved') as ClaimStatus
  if (!['approved', 'in_review', 'graded'].includes(status)) throw new Error(`--status must be approved, in_review or graded, not ${status}`)
  const dryRun = process.argv.includes('--dry-run')
  const book = SERIOUSLY_CURIOUS

  const articles = JSON.parse(readFileSync(resolve(DATA_DIR, 'articles.json'), 'utf8')) as BookArticle[]
  const taxonomy = (JSON.parse(readFileSync(resolve(DATA_DIR, 'curious-desk.json'), 'utf8')) as { articles: BookTaxonomy }).articles
  const plan = bookPlan(articles, taxonomy, book)
  console.log(`[curious:seed-book] ${book.slug}: ${plan.claims.length} claims from ${plan.documents.length} articles; ${plan.skipped.length} sentences left out`)
  const why = new Map<string, number>()
  for (const s of plan.skipped) why.set(s.why, (why.get(s.why) ?? 0) + 1)
  for (const [w, n] of why) console.log(`  left out ${n}: ${w}`)
  if (dryRun) {
    const byEra = new Map<string, number>()
    for (const c of plan.claims) byEra.set(c.era, (byEra.get(c.era) ?? 0) + 1)
    console.log(`  eras: ${[...byEra].map(([e, n]) => `${e} ${n}`).join(', ')}`)
    return
  }

  const sb = createServiceClient()
  const { data: source, error: srcErr } = await sb.from('curious_sources').select('id').eq('id', 'book').maybeSingle()
  if (srcErr) throw new Error(`curious_sources: ${srcErr.message}`)
  if (!source) throw new Error("No 'book' row in curious_sources: apply supabase/vizmaya-fyi/migrations/104_curious_book_source.sql first.")

  // Documents: written directly with status 'detected', so the (paused) detector never picks them up.
  const now = new Date().toISOString()
  const docRows = plan.documents.map((d) => ({
    source_id: 'book',
    external_id: d.external_id,
    canonical_url: d.canonical_url,
    title: d.title,
    publisher: book.publisher,
    author: book.author,
    language: 'en',
    published_at: `${book.year}-01-01T00:00:00Z`,
    published_precision: 'year',
    retrieved_at: now,
    rights_uri: null,
    content_hash: d.content_hash,
    raw_uri: d.raw_uri,
    extraction_method: 'pdf-text',
    text: null,
    text_hash: null,
    text_chars: null,
    query: null,
    collector_version: BOOK_VERSION,
    status: 'detected',
    detected_at: now,
    lineage_hint: `isbn:${book.isbn}`,
    meta: d.meta,
    updated_at: now,
  }))
  const { error: docErr } = await sb.from('curious_documents').upsert(docRows, { onConflict: 'source_id,external_id' })
  if (docErr) throw new Error(`curious_documents: ${docErr.message}`)
  const { data: docs, error: readErr } = await sb.from('curious_documents').select('id, external_id').eq('source_id', 'book').in('external_id', plan.documents.map((d) => d.external_id))
  if (readErr) throw new Error(`curious_documents: ${readErr.message}`)
  const docId = new Map(((docs ?? []) as Array<{ id: string; external_id: string }>).map((r) => [r.external_id, r.id]))

  const rows: ClaimRow[] = []
  for (const c of plan.claims) {
    const document_id = docId.get(c.document)
    if (!document_id) throw new Error(`document ${c.document} missing`)
    const [row] = await insertClaims(
      [
        {
          text: c.text,
          text_norm: c.text_norm,
          claim_hash: c.claim_hash,
          kind: c.kind,
          subject: c.subject,
          era: c.era,
          region: c.region,
          theme: c.theme,
          year_from: c.year_from,
          year_to: c.year_to,
          place: null,
          country_code: c.country_code,
          document_id,
          evidence_quote: c.evidence_quote,
          evidence_start: null,
          evidence_end: null,
          evidence_page: c.evidence_page,
          evidence_media_ts: null,
          is_quotation: false,
          is_anonymous: false,
          is_hearsay: c.is_hearsay,
          speaker: book.author,
          extractor_confidence: 0.9,
          detector_rules: ['book-fact'],
          detector_version: BOOK_VERSION,
          extractor_model: null,
          classifier_version: BOOK_VERSION,
          status: 'candidate',
          flags: [],
        },
      ],
      { sb },
    )
    if (!row) throw new Error(`claim not written: ${c.text.slice(0, 60)}`)
    await upsertClaimSources(
      [
        {
          claim_id: row.id,
          document_id,
          relation: 'supports',
          independence_group: `isbn:${book.isbn}`,
          is_primary: false,
          is_contemporaneous: false,
          institutional_quality: book.quality,
          quote: c.evidence_quote,
          span_start: null,
          span_end: null,
          page: c.evidence_page,
          external_ref: `isbn:${book.isbn}`,
          source_year: book.year,
          work_type: 'book',
          quote_found: true,
          verified_by: 'detector',
        },
      ],
      { sb },
    )
    await linkClaimEntities(row.id, c.entities, sb)
    rows.push(row)
    if (rows.length % 50 === 0) console.log(`  wrote ${rows.length}/${plan.claims.length}`)
  }

  const graded = await gradeClaims(rows, { sb })
  const grades = new Map<string, number>()
  for (const g of graded) grades.set(g.grade, (grades.get(g.grade) ?? 0) + 1)

  // Only claims no reviewer has touched move to the requested status.
  const fresh = rows.filter((r) => r.status === 'candidate' || r.status === 'graded').map((r) => r.id)
  for (let i = 0; i < fresh.length; i += 200) {
    const patch = status === 'approved'
      ? { status, reviewed_by: `seed:${book.slug}`, reviewed_at: now, review_note: `Seeded from ${book.title} (ISBN ${book.isbn}), p. as cited.` }
      : { status }
    const { error } = await sb.from('curious_claims').update(patch).in('id', fresh.slice(i, i + 200)).in('status', ['candidate', 'graded'])
    if (error) throw new Error(`curious_claims: ${error.message}`)
  }
  console.log(`[curious:seed-book] ${rows.length} claims graded (${[...grades].sort().map(([g, n]) => `${g} ${n}`).join(', ')}); ${fresh.length} set to ${status}, ${rows.length - fresh.length} kept their review status.`)
}

main().catch((err) => {
  console.error('[curious:seed-book] failed:', err)
  process.exit(1)
})
