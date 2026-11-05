/**
 * Writes the LLM desk's checked claims (llm.ts) into the claim store the
 * review queue reads: one curious_documents row per cited page (source
 * 'web-search', no text, only provenance; a page another collector already
 * fetched keeps its row), the claim as in_review with its grade and the
 * checker's notes in score_features, one curious_claim_sources row per
 * cited page verified by 'llm-check', and the entities. Server only.
 */

import { createServiceClient } from '@vismay/content-source/supabase'
import { LLM_VERSION, webSearchExternalId, type CheckedClaim } from './llm'
import { linkClaimEntities, upsertClaimSources, type Sb } from './store'
import { sha256 } from './text'
import type { ClaimSourceUpsert } from './types'

/** What the desk already has: recent claim texts for the model to avoid, every claim hash to skip. */
export async function knownClaims(sb: Sb = createServiceClient(), opts: { avoid?: number } = {}): Promise<{ avoid: string[]; knownHashes: Set<string> }> {
  const knownHashes = new Set<string>()
  const recent: string[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('curious_claims').select('text, claim_hash').order('created_at', { ascending: false }).range(from, from + 999)
    if (error) throw new Error(`curious_claims: ${error.message}`)
    for (const r of (data ?? []) as Array<{ text: string; claim_hash: string }>) {
      knownHashes.add(r.claim_hash)
      if (recent.length < (opts.avoid ?? 60)) recent.push(r.text.length > 160 ? `${r.text.slice(0, 159)}…` : r.text)
    }
    if (!data || data.length < 1000) break
  }
  return { avoid: recent, knownHashes }
}

/** The document id for each cited page, creating web-search rows for the new ones. */
async function ensureDocuments(claim: CheckedClaim, sb: Sb, query: string | null): Promise<Map<string, string>> {
  const urls = [...new Set(claim.sources.map((s) => s.canonical_url))]
  const { data: existing, error } = await sb.from('curious_documents').select('id, canonical_url').in('canonical_url', urls)
  if (error) throw new Error(`curious_documents: ${error.message}`)
  const ids = new Map(((existing ?? []) as Array<{ id: string; canonical_url: string }>).map((r) => [r.canonical_url, r.id]))
  const now = new Date().toISOString()
  const missing = claim.sources.filter((s, i, all) => !ids.has(s.canonical_url) && all.findIndex((x) => x.canonical_url === s.canonical_url) === i)
  if (missing.length) {
    const rows = missing.map((s) => ({
      source_id: 'web-search',
      external_id: webSearchExternalId(s.canonical_url),
      canonical_url: s.canonical_url,
      title: s.title,
      publisher: s.publisher,
      author: s.author,
      language: null,
      published_at: s.published_at,
      published_precision: s.published_precision,
      retrieved_at: now,
      rights_uri: null,
      content_hash: sha256(s.canonical_url),
      raw_uri: s.url,
      extraction_method: 'html-text',
      text: null,
      text_hash: null,
      text_chars: null,
      query: s.query ?? query,
      collector_version: LLM_VERSION,
      status: 'detected',
      detected_at: now,
      lineage_hint: s.independence_group,
      meta: { read: s.read, quality: s.quality },
      updated_at: now,
    }))
    const { error: upErr } = await sb.from('curious_documents').upsert(rows, { onConflict: 'source_id,external_id' })
    if (upErr) throw new Error(`curious_documents: ${upErr.message}`)
    const { data: after, error: readErr } = await sb.from('curious_documents').select('id, canonical_url').in('canonical_url', missing.map((m) => m.canonical_url))
    if (readErr) throw new Error(`curious_documents: ${readErr.message}`)
    for (const r of (after ?? []) as Array<{ id: string; canonical_url: string }>) ids.set(r.canonical_url, r.id)
  }
  return ids
}

export interface WriteSummary {
  written: Array<{ id: string; text: string; grade: string }>
  errors: string[]
}

/** Write the kept claims as in_review. A claim already present on its document is left as it is. */
export async function writeCheckedClaims(claims: CheckedClaim[], opts: { sb?: Sb; query?: string | null; requestedBy?: string | null } = {}): Promise<WriteSummary> {
  const sb = opts.sb ?? createServiceClient()
  const out: WriteSummary = { written: [], errors: [] }
  for (const c of claims) {
    try {
      const docs = await ensureDocuments(c, sb, opts.query ?? null)
      const ev = c.sources[c.evidence]
      const documentId = docs.get(ev.canonical_url)
      if (!documentId || !ev.quote) throw new Error('evidence document missing')
      const now = new Date().toISOString()
      const lineages = new Set(c.sources.filter((s) => s.relation === 'supports').map((s) => s.independence_group)).size
      const row = {
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
        place: c.place,
        country_code: c.country_code,
        document_id: documentId,
        evidence_quote: ev.quote,
        is_quotation: c.is_quotation,
        is_anonymous: c.is_anonymous,
        is_hearsay: c.is_hearsay,
        speaker: c.speaker,
        extractor_confidence: null,
        detector_rules: ['llm'],
        detector_version: LLM_VERSION,
        extractor_model: c.models.propose,
        classifier_version: c.models.check,
        status: 'in_review',
        grade: c.grade,
        score: c.score,
        score_features: {
          method: 'llm-check',
          verdict: c.verdict,
          core: c.core,
          embellishment: c.embellishment,
          why_curious: c.why_curious,
          original_text: c.original_text !== c.text ? c.original_text : null,
          lineages,
          primary: c.sources.some((s) => s.is_primary && s.relation === 'supports') ? 1 : 0,
          models: c.models,
          requested_by: opts.requestedBy ?? null,
          notes: c.notes,
        },
        graded_at: now,
        flags: c.flags,
      }
      const { data, error } = await sb.from('curious_claims').upsert(row, { onConflict: 'document_id,claim_hash', ignoreDuplicates: true }).select('id')
      if (error) throw new Error(`curious_claims: ${error.message}`)
      let id = (data as Array<{ id: string }> | null)?.[0]?.id
      if (!id) {
        const { data: found } = await sb.from('curious_claims').select('id').eq('document_id', documentId).eq('claim_hash', c.claim_hash).maybeSingle()
        id = (found as { id: string } | null)?.id
        if (!id) throw new Error('claim not written')
        continue
      }
      const sources: ClaimSourceUpsert[] = c.sources
        .map((s) => ({ s, doc: docs.get(s.canonical_url) }))
        .filter((x): x is { s: (typeof c.sources)[number]; doc: string } => !!x.doc)
        .map(({ s, doc }) => ({
          claim_id: id!,
          document_id: doc,
          relation: s.relation === 'supports' && s.derived_from ? 'derived_from' : s.relation,
          independence_group: s.independence_group,
          is_primary: s.is_primary,
          is_contemporaneous: false,
          institutional_quality: s.quality,
          quote: s.quote,
          span_start: null,
          span_end: null,
          page: null,
          external_ref: `url:${s.canonical_url}`,
          source_year: s.published_at ? Number(s.published_at.slice(0, 4)) : null,
          quote_found: s.quote_found,
          verified_by: 'llm-check',
        }))
      await upsertClaimSources(sources, { sb })
      await linkClaimEntities(id, c.entities, sb)
      out.written.push({ id, text: c.text, grade: c.grade })
    } catch (e) {
      out.errors.push(`${c.text.slice(0, 60)}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return out
}
