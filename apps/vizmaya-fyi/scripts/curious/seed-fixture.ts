/**
 * Load the design's worked example (Disco Dancer: the popularity claim and
 * the spy claim) into Supabase as approved claims, so the Curious Desk has
 * a pool before the collectors have run. Idempotent. The grades come from
 * the grader, not the fixture; the fixture's `expect` is checked and the
 * run fails if a grade falls outside it.
 *
 * Usage: pnpm curious:seed-fixture [-- --status in_review]   (default approved)
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'
import { gradeClaims } from '@vismay/curious-pipeline/gradeRun'
import { insertClaims, linkClaimEntities, upsertClaimSources, upsertDocuments } from '@vismay/curious-pipeline/store'
import { normalizeText, sha256 } from '@vismay/curious-pipeline/text'
import { eraOf } from '@vismay/curious-pipeline/taxonomy'
import type { ClaimKind, ClaimRow, ClaimStatus, DocumentUpsert, EntityKind, SourceRelation, VerifiedBy } from '@vismay/curious-pipeline/types'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

interface Fixture {
  documents: Array<Omit<DocumentUpsert, 'retrieved_at' | 'content_hash' | 'raw_uri' | 'text_hash' | 'text_chars' | 'collector_version' | 'meta' | 'published_precision'> & { key: string; published_precision: DocumentUpsert['published_precision'] }>
  claims: Array<{
    key: string
    document: string
    text: string
    kind: ClaimKind
    subject: string
    theme: string
    region: string
    year_from: number | null
    year_to: number | null
    place: string | null
    country_code: string | null
    evidence_quote: string
    is_quotation: boolean
    is_anonymous: boolean
    is_hearsay: boolean
    speaker: string | null
    extractor_confidence: number
    entities: Array<{ name: string; kind: EntityKind; birth_year?: number; year?: number; country_code?: string }>
    sources: Array<{ document: string | null; relation: SourceRelation; independence_group: string; is_primary: boolean; is_contemporaneous: boolean; institutional_quality: number; external_ref?: string; source_year?: number; work_type?: string; verified_by: VerifiedBy; quote?: string; page?: number }>
    expect: string[]
  }>
}

async function main() {
  const status = (process.argv.includes('--status') ? process.argv[process.argv.indexOf('--status') + 1] : 'approved') as ClaimStatus
  const fx = JSON.parse(readFileSync(resolve('../../packages/curious-pipeline/src/fixtures/disco-dancer.json'), 'utf8')) as Fixture
  const sb = createServiceClient()
  const now = new Date().toISOString()
  const docs: DocumentUpsert[] = fx.documents.map(({ key: _key, ...d }) => ({
    ...d,
    retrieved_at: now,
    content_hash: sha256(d.text ? normalizeText(d.text) : `${d.canonical_url}\n${d.title ?? ''}`),
    raw_uri: 'fixture:disco-dancer',
    text_hash: d.text ? sha256(normalizeText(d.text)) : null,
    text_chars: d.text ? d.text.length : null,
    collector_version: 'fixture-disco-dancer-v1',
    meta: { fixture: true },
  }))
  const up = await upsertDocuments(docs, { sb })
  if (up.errors.length) throw new Error(up.errors.join('; '))
  const { data: rows } = await sb.from('curious_documents').select('id, external_id').in('external_id', fx.documents.map((d) => d.external_id))
  const docId = new Map(fx.documents.map((d) => [d.key, ((rows ?? []) as Array<{ id: string; external_id: string }>).find((r) => r.external_id === d.external_id)?.id]))
  const inserted: ClaimRow[] = []
  for (const c of fx.claims) {
    const document_id = docId.get(c.document)
    if (!document_id) throw new Error(`document ${c.document} missing`)
    const [row] = await insertClaims(
      [
        {
          text: c.text,
          text_norm: normalizeText(c.text),
          claim_hash: sha256(normalizeText(c.text)),
          kind: c.kind,
          subject: c.subject,
          era: eraOf(c.year_from),
          region: c.region,
          theme: c.theme,
          year_from: c.year_from,
          year_to: c.year_to,
          place: c.place,
          country_code: c.country_code,
          document_id,
          evidence_quote: c.evidence_quote,
          evidence_start: null,
          evidence_end: null,
          evidence_page: null,
          evidence_media_ts: null,
          is_quotation: c.is_quotation,
          is_anonymous: c.is_anonymous,
          is_hearsay: c.is_hearsay,
          speaker: c.speaker,
          extractor_confidence: c.extractor_confidence,
          detector_rules: ['fixture'],
          detector_version: 'fixture',
          extractor_model: null,
          classifier_version: 'fixture-disco-dancer-v1',
          status: 'candidate',
          flags: [],
        },
      ],
      { sb },
    )
    await linkClaimEntities(row.id, c.entities, sb)
    for (const e of c.entities) {
      await sb.from('curious_entities').update({ birth_year: e.birth_year ?? null, year: e.year ?? null, country_code: e.country_code ?? null, resolved_at: now }).eq('kind', e.kind).eq('name_norm', normalizeText(e.name))
    }
    await upsertClaimSources(
      c.sources.map((s) => ({
        claim_id: row.id,
        document_id: s.document ? docId.get(s.document) ?? null : null,
        relation: s.relation,
        independence_group: s.independence_group,
        is_primary: s.is_primary,
        is_contemporaneous: s.is_contemporaneous,
        institutional_quality: s.institutional_quality,
        quote: s.quote ?? null,
        span_start: null,
        span_end: null,
        page: s.page ?? null,
        external_ref: s.external_ref ?? null,
        source_year: s.source_year ?? null,
        work_type: s.work_type ?? null,
        verified_by: s.verified_by,
      })),
      { sb },
    )
    inserted.push(row)
  }
  const graded = await gradeClaims(inserted, { sb, log: (l) => console.log(l) })
  for (const g of graded) {
    const c = fx.claims[inserted.findIndex((r) => r.id === g.id)]
    if (!c.expect.includes(g.grade)) throw new Error(`${c.key} graded ${g.grade}, expected ${c.expect.join('/')}: ${g.features.notes.join('; ')}`)
    await sb.from('curious_claims').update({ status, reviewed_by: 'fixture', reviewed_at: now, review_note: 'Seeded from the design’s worked example.' }).eq('id', g.id)
  }
  console.log(`Seeded ${inserted.length} claims as ${status}.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
