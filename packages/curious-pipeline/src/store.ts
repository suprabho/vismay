/**
 * Server-only Supabase access for the pipeline (service role). Every writer
 * here is idempotent: documents upsert on (source_id, external_id), claims on
 * (document_id, claim_hash), sources on their unique index. Nothing here
 * reads the network.
 */

import { createServiceClient } from '@vismay/content-source/supabase'
import type { ClaimRow, ClaimSourceUpsert, ClaimStatus, DocumentRow, DocumentStatus, DocumentUpsert, SourceId } from './types'

export type Sb = ReturnType<typeof createServiceClient>

export const DOCUMENT_UPSERT_BATCH = 200

export interface UpsertSummary {
  attempted: number
  written: number
  skipped: number
  errors: string[]
}

/**
 * Upsert documents in batches. A row whose canonical_url already exists
 * under another (source_id, external_id) is skipped, not failed: the first
 * fetch of a story keeps the provenance.
 */
export async function upsertDocuments(docs: DocumentUpsert[], opts: { sb?: Sb; batch?: number; log?: (s: string) => void } = {}): Promise<UpsertSummary> {
  const sb = opts.sb ?? createServiceClient()
  const batch = opts.batch ?? DOCUMENT_UPSERT_BATCH
  const summary: UpsertSummary = { attempted: docs.length, written: 0, skipped: 0, errors: [] }
  for (let i = 0; i < docs.length; i += batch) {
    const slice = docs.slice(i, i + batch)
    const urls = slice.map((d) => d.canonical_url)
    const { data: existing, error: lookupErr } = await sb.from('curious_documents').select('canonical_url, source_id, external_id').in('canonical_url', urls)
    if (lookupErr) {
      summary.errors.push(`lookup: ${lookupErr.message}`)
      continue
    }
    const taken = new Map((existing ?? []).map((r: { canonical_url: string; source_id: string; external_id: string }) => [r.canonical_url, `${r.source_id}:${r.external_id}`]))
    const rows = slice.filter((d) => {
      const by = taken.get(d.canonical_url)
      if (by && by !== `${d.source_id}:${d.external_id}`) {
        summary.skipped++
        return false
      }
      return true
    })
    if (!rows.length) continue
    const { error } = await sb.from('curious_documents').upsert(
      rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
      { onConflict: 'source_id,external_id' },
    )
    if (error) {
      summary.errors.push(`upsert: ${error.message}`)
      opts.log?.(`  ✗ upsert batch ${i / batch + 1}: ${error.message}`)
      continue
    }
    summary.written += rows.length
  }
  return summary
}

export async function countDocuments(sb: Sb = createServiceClient()): Promise<Array<{ source_id: SourceId; status: DocumentStatus; n: number }>> {
  const { data, error } = await sb.from('curious_documents').select('source_id, status')
  if (error) throw new Error(`curious_documents: ${error.message}`)
  const counts = new Map<string, number>()
  for (const r of (data ?? []) as Array<{ source_id: SourceId; status: DocumentStatus }>) {
    const k = `${r.source_id}|${r.status}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  return [...counts.entries()].map(([k, n]) => {
    const [source_id, status] = k.split('|') as [SourceId, DocumentStatus]
    return { source_id, status, n }
  })
}

/** Documents waiting for the detector, oldest fetch first. */
export async function listDocumentsToDetect(opts: { sb?: Sb; limit: number; source?: SourceId }): Promise<DocumentRow[]> {
  const sb = opts.sb ?? createServiceClient()
  let q = sb.from('curious_documents').select('*').eq('status', 'fetched').order('retrieved_at', { ascending: true }).limit(opts.limit)
  if (opts.source) q = q.eq('source_id', opts.source)
  const { data, error } = await q
  if (error) throw new Error(`curious_documents: ${error.message}`)
  return (data ?? []) as DocumentRow[]
}

export async function setDocumentStatus(id: string, status: DocumentStatus, opts: { sb?: Sb; error?: string } = {}): Promise<void> {
  const sb = opts.sb ?? createServiceClient()
  const patch: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
  if (status === 'detected' || status === 'no-candidates') patch.detected_at = new Date().toISOString()
  if (opts.error) {
    const { data } = await sb.from('curious_documents').select('meta').eq('id', id).maybeSingle()
    patch.meta = { ...((data?.meta as Record<string, unknown> | null) ?? {}), error: opts.error.slice(0, 500), error_at: new Date().toISOString() }
  }
  const { error } = await sb.from('curious_documents').update(patch).eq('id', id)
  if (error) throw new Error(`curious_documents ${id}: ${error.message}`)
}

export type ClaimInsert = Omit<ClaimRow, 'id' | 'created_at' | 'updated_at' | 'status' | 'grade' | 'score' | 'score_features' | 'graded_at' | 'cluster_id' | 'contradicts' | 'review_note' | 'reviewed_by' | 'reviewed_at'> &
  Partial<Pick<ClaimRow, 'status' | 'flags'>>

/** Insert claims, ignoring ones the document already has (same claim_hash). Returns the rows with ids. */
export async function insertClaims(claims: ClaimInsert[], opts: { sb?: Sb } = {}): Promise<ClaimRow[]> {
  if (!claims.length) return []
  const sb = opts.sb ?? createServiceClient()
  const { error } = await sb.from('curious_claims').upsert(claims, { onConflict: 'document_id,claim_hash', ignoreDuplicates: true })
  if (error) throw new Error(`curious_claims: ${error.message}`)
  const hashes = claims.map((c) => c.claim_hash)
  const { data, error: readErr } = await sb.from('curious_claims').select('*').in('claim_hash', hashes).in('document_id', [...new Set(claims.map((c) => c.document_id))])
  if (readErr) throw new Error(`curious_claims: ${readErr.message}`)
  return (data ?? []) as ClaimRow[]
}

export async function upsertClaimSources(rows: ClaimSourceUpsert[], opts: { sb?: Sb } = {}): Promise<void> {
  if (!rows.length) return
  const sb = opts.sb ?? createServiceClient()
  // The unique index is on an expression, so PostgREST cannot name it: insert one by one and ignore duplicates.
  for (const r of rows) {
    const { error } = await sb.from('curious_claim_sources').insert(r)
    if (error && !/duplicate key/i.test(error.message)) throw new Error(`curious_claim_sources: ${error.message}`)
  }
}

export async function listClaims(opts: { sb?: Sb; status?: ClaimStatus | ClaimStatus[]; limit?: number; offset?: number; grade?: string; theme?: string; source?: SourceId; q?: string; ids?: string[] }): Promise<{ claims: ClaimRow[]; total: number }> {
  const sb = opts.sb ?? createServiceClient()
  let q = sb.from('curious_claims').select('*', { count: 'exact' }).order('created_at', { ascending: false })
  if (opts.status) q = Array.isArray(opts.status) ? q.in('status', opts.status) : q.eq('status', opts.status)
  if (opts.grade) q = q.eq('grade', opts.grade)
  if (opts.theme) q = q.eq('theme', opts.theme)
  if (opts.ids) q = q.in('id', opts.ids)
  if (opts.q) q = q.ilike('text', `%${opts.q.replace(/[%_]/g, (m) => `\\${m}`)}%`)
  if (opts.limit != null) q = q.range(opts.offset ?? 0, (opts.offset ?? 0) + opts.limit - 1)
  const { data, error, count } = await q
  if (error) throw new Error(`curious_claims: ${error.message}`)
  let claims = (data ?? []) as ClaimRow[]
  if (opts.source) {
    const docIds = [...new Set(claims.map((c) => c.document_id))]
    const { data: docs } = await sb.from('curious_documents').select('id, source_id').in('id', docIds)
    const bySource = new Set(((docs ?? []) as Array<{ id: string; source_id: string }>).filter((d) => d.source_id === opts.source).map((d) => d.id))
    claims = claims.filter((c) => bySource.has(c.document_id))
  }
  return { claims, total: count ?? claims.length }
}

export async function getDocuments(ids: string[], sb: Sb = createServiceClient()): Promise<Map<string, DocumentRow>> {
  const out = new Map<string, DocumentRow>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await sb.from('curious_documents').select('*').in('id', ids.slice(i, i + 200))
    if (error) throw new Error(`curious_documents: ${error.message}`)
    for (const d of (data ?? []) as DocumentRow[]) out.set(d.id, d)
  }
  return out
}

export async function listClaimSources(claimIds: string[], sb: Sb = createServiceClient()): Promise<Map<string, Array<ClaimSourceUpsert & { id: number }>>> {
  const out = new Map<string, Array<ClaimSourceUpsert & { id: number }>>()
  for (let i = 0; i < claimIds.length; i += 200) {
    const { data, error } = await sb.from('curious_claim_sources').select('*').in('claim_id', claimIds.slice(i, i + 200))
    if (error) throw new Error(`curious_claim_sources: ${error.message}`)
    for (const s of (data ?? []) as Array<ClaimSourceUpsert & { id: number }>) {
      const list = out.get(s.claim_id) ?? []
      list.push(s)
      out.set(s.claim_id, list)
    }
  }
  return out
}

export async function updateClaim(id: string, patch: Partial<ClaimRow>, sb: Sb = createServiceClient()): Promise<void> {
  const { error } = await sb.from('curious_claims').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(`curious_claims ${id}: ${error.message}`)
}

export type ReviewAction = 'approve' | 'send_back' | 'reject'

/**
 * The review gate. Approve is the only transition into the desk's pool
 * view; send back flags the claim for re-extraction; reject keeps it, so the
 * same claim is not proposed again.
 */
export async function reviewClaim(
  id: string,
  opts: { action: ReviewAction; note?: string | null; text?: string | null; by: string; sb?: Sb },
): Promise<ClaimRow> {
  const sb = opts.sb ?? createServiceClient()
  const { data: before, error: readErr } = await sb.from('curious_claims').select('*').eq('id', id).maybeSingle()
  if (readErr) throw new Error(`curious_claims ${id}: ${readErr.message}`)
  if (!before) throw new Error(`Claim ${id} not found`)
  const row = before as ClaimRow
  const status: ClaimStatus = opts.action === 'approve' ? 'approved' : opts.action === 'reject' ? 'rejected' : 'sent_back'
  const now = new Date().toISOString()
  const patch: Record<string, unknown> = { status, review_note: opts.note ?? null, reviewed_by: opts.by, reviewed_at: now, updated_at: now }
  if (opts.action === 'send_back') patch.flags = [...new Set([...(row.flags ?? []), 'sent-back'])]
  if (opts.text && opts.text.trim() && opts.text.trim() !== row.text) {
    const { normalizeText, sha256 } = await import('./text')
    const text = opts.text.trim().slice(0, 500)
    patch.text = text
    patch.text_norm = normalizeText(text)
    patch.claim_hash = sha256(normalizeText(text))
  }
  const { data, error } = await sb.from('curious_claims').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(`curious_claims ${id}: ${error.message}`)
  return data as ClaimRow
}
