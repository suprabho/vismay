/**
 * Grading against the store: gather a claim's sources, documents and
 * entity facts, compute the features, write grade, score, score_features
 * and flags. Shared by the grade and verify CLIs. Server only.
 */

import { createServiceClient } from '@vismay/content-source/supabase'
import { gradeFlags, gradeFor, scoreClaim, scoreFeatures, type EntityFacts, type ScoreFeatures } from './grade'
import { getDocuments, listClaimSources, type Sb } from './store'
import type { ClaimRow, ClaimStatus, EntityRow, Grade } from './types'

export interface GradedClaim {
  id: string
  grade: Grade
  score: number
  features: ScoreFeatures
}

export async function entityFactsFor(claimIds: string[], sb: Sb): Promise<Map<string, EntityFacts[]>> {
  const out = new Map<string, EntityFacts[]>()
  for (let i = 0; i < claimIds.length; i += 200) {
    const { data, error } = await sb.from('curious_claim_entities').select('claim_id, curious_entities(*)').in('claim_id', claimIds.slice(i, i + 200))
    if (error) throw new Error(`curious_claim_entities: ${error.message}`)
    for (const r of (data ?? []) as unknown as Array<{ claim_id: string; curious_entities: EntityRow | EntityRow[] | null }>) {
      const e = Array.isArray(r.curious_entities) ? r.curious_entities[0] : r.curious_entities
      if (!e) continue
      const list = out.get(r.claim_id) ?? []
      list.push({ name: e.name, kind: e.kind, birthYear: e.birth_year, deathYear: e.death_year, year: e.year, countryCode: e.country_code, isLivingPrivate: e.is_living_private })
      out.set(r.claim_id, list)
    }
  }
  return out
}

/**
 * Grade these claims and write the result. `status` is what a graded claim
 * becomes ('graded' by default, 'in_review' to queue it); an approved,
 * rejected or in-review claim keeps its status and only its grade changes.
 */
export async function gradeClaims(claims: ClaimRow[], opts: { sb?: Sb; status?: ClaimStatus; log?: (s: string) => void } = {}): Promise<GradedClaim[]> {
  if (!claims.length) return []
  const sb = opts.sb ?? createServiceClient()
  const ids = claims.map((c) => c.id)
  const [sources, facts] = await Promise.all([listClaimSources(ids, sb), entityFactsFor(ids, sb)])
  const docIds = new Set<string>()
  for (const c of claims) docIds.add(c.document_id)
  for (const list of sources.values()) for (const s of list) if (s.document_id) docIds.add(s.document_id)
  const docs = await getDocuments([...docIds], sb)
  const out: GradedClaim[] = []
  for (const c of claims) {
    const srcs = sources.get(c.id) ?? []
    const features = scoreFeatures({
      claim: { ...c, isQuotation: c.is_quotation, isAnonymous: c.is_anonymous, isHearsay: c.is_hearsay, extractorConfidence: c.extractor_confidence, language: docs.get(c.document_id)?.language ?? null },
      sources: srcs,
      documents: docs,
      entities: facts.get(c.id) ?? [],
    })
    const score = scoreClaim(features)
    const grade = gradeFor(score, features)
    const flags = gradeFlags(features, c.flags ?? [])
    const living = (facts.get(c.id) ?? []).some((e) => e.isLivingPrivate)
    if (living && !flags.includes('personal-data')) flags.push('personal-data')
    const keep = c.status === 'approved' || c.status === 'rejected' || c.status === 'in_review' || c.status === 'sent_back'
    const status: ClaimStatus = keep ? c.status : (opts.status ?? 'graded')
    const { error } = await sb
      .from('curious_claims')
      .update({ grade, score, score_features: features, flags, status, graded_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', c.id)
    if (error) throw new Error(`curious_claims ${c.id}: ${error.message}`)
    out.push({ id: c.id, grade, score, features })
    opts.log?.(`  ${grade} ${score.toFixed(2)} ${c.text.slice(0, 80)}`)
  }
  return out
}
