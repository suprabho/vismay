/**
 * The evidence grade, computed from explicit features and never from
 * prose. Each feature is a fact about the claim's sources (is there a
 * primary document, do two independent lineages agree within five years of
 * the event, how institutional is the best source, is the quotation found
 * in print, do the entity's life dates bracket the year...) and each
 * penalty a fact about how the story travels (one anonymous account
 * repeated, citations that loop back on themselves, a long gap, a
 * translation, a contradiction). The weights are the design's; the
 * thresholds are explicit; score_features is stored so a reviewer can see
 * why a claim got its grade, and a later version can re-grade without
 * re-reading anything.
 */

import { provenanceDedupe } from './dedupe'
import { SOURCE_POLICIES } from './policy'
import type { ClaimRow, ClaimSourceUpsert, DocumentRow, Grade } from './types'

export const GRADE_VERSION = 'curious-grade-v1-2026-11'

export const GRADE_WEIGHTS = {
  primary: 0.3,
  independentContemporaneous: 0.2,
  institutional: 0.15,
  quotation: 0.1,
  chronPlausible: 0.1,
  geoConsistent: 0.05,
  textConfidence: 0.05,
  secondaryScholarship: 0.05,
} as const

export const GRADE_PENALTIES = {
  anonymousRepetition: 0.1,
  circular: 0.15,
  timeGap: 0.1,
  translation: 0.05,
  contradiction: 0.25,
} as const

export const GRADE_THRESHOLDS: Array<[Grade, number]> = [
  ['A', 0.75],
  ['B', 0.55],
  ['C', 0.4],
  ['D', 0.25],
]

export const GRADE_RULES = {
  /** A source this close to the event, in years, is contemporaneous. */
  contemporaneousYears: 5,
  /** A library document this close to the event counts as primary. */
  primaryYears: 2,
  /** Earliest source this long after the event, with no primary, is a time gap. */
  timeGapYears: 20,
  /** An anonymous story needs this many sources in one lineage to count as repetition. */
  repetitionSources: 3,
} as const

export interface ScoreFeatures {
  primary: 0 | 1
  independentContemporaneous: 0 | 1
  /** 0..1, the best source's institutional quality. */
  institutional: number
  quotation: 0 | 1
  chronPlausible: 0 | 1
  geoConsistent: 0 | 1
  /** 0..1, the lesser of OCR and extractor confidence. */
  textConfidence: number
  secondaryScholarship: 0 | 1
  anonymousRepetition: 0 | 1
  circular: 0 | 1
  timeGap: 0 | 1
  translation: 0 | 1
  contradiction: 0 | 1
  nGroups: number
  nSources: number
  nDerived: number
  nPrimary: number
  /** Why each feature was set, for the reviewer. */
  notes: string[]
  version: string
}

export interface EntityFacts {
  name: string
  kind: string
  /** Astronomical years. */
  birthYear?: number | null
  deathYear?: number | null
  /** Year a work was made or an event happened. */
  year?: number | null
  countryCode?: string | null
  isLivingPrivate?: boolean
}

export interface GradeInput {
  claim: Pick<ClaimRow, 'text' | 'kind' | 'year_from' | 'year_to' | 'country_code' | 'flags' | 'evidence_quote'> & {
    /** From the extractor: attribution and confidence live in the detector's source row, passed here directly. */
    isQuotation?: boolean
    isAnonymous?: boolean
    isHearsay?: boolean
    extractorConfidence?: number | null
    language?: string | null
  }
  sources: Array<Pick<ClaimSourceUpsert, 'relation' | 'independence_group' | 'is_primary' | 'is_contemporaneous' | 'institutional_quality' | 'external_ref' | 'verified_by' | 'document_id' | 'source_year' | 'work_type' | 'cites_cluster' | 'quote_found'> & {
    /** Language of the source document, when known without the document map. */
    language?: string | null
  }>
  documents?: Map<string, Pick<DocumentRow, 'published_at' | 'source_id' | 'ocr_confidence' | 'language'>>
  entities?: EntityFacts[]
}

const yearOfIso = (iso: string | null | undefined): number | null => (iso ? Number(iso.slice(0, 4)) : null)

export function scoreFeatures(input: GradeInput): ScoreFeatures {
  const { claim, sources, entities = [] } = input
  const notes: string[] = []
  const eventYear = claim.year_from ?? claim.year_to ?? null
  const srcYear = (s: GradeInput['sources'][number]): number | null => s.source_year ?? (s.document_id && input.documents?.get(s.document_id) ? yearOfIso(input.documents.get(s.document_id)!.published_at) : null)

  const supporting = sources.filter((s) => s.relation === 'supports' || s.relation === 'cites')
  const { groups, nSources, nDerived } = provenanceDedupe(sources)
  const nPrimary = sources.filter((s) => s.is_primary).length

  const primary: 0 | 1 = nPrimary > 0 || supporting.some((s) => s.external_ref?.startsWith('doi:') && s.relation === 'supports') ? 1 : 0
  if (primary) notes.push('a primary source supports it')

  const contemporaneousGroups = new Set(
    supporting
      .filter((s) => {
        if (s.is_contemporaneous) return true
        const y = srcYear(s)
        return eventYear != null && y != null && Math.abs(y - eventYear) <= GRADE_RULES.contemporaneousYears
      })
      .map((s) => s.independence_group),
  )
  const independentContemporaneous: 0 | 1 = contemporaneousGroups.size >= 2 ? 1 : 0
  if (independentContemporaneous) notes.push(`${contemporaneousGroups.size} independent lineages within ${GRADE_RULES.contemporaneousYears} years of the event`)
  else if (groups.length >= 2) notes.push(`${groups.length} independent lineages, none contemporaneous`)
  else notes.push(`${nSources || 0} source${nSources === 1 ? '' : 's'} in ${groups.length} lineage${groups.length === 1 ? '' : 's'}`)

  const institutional = supporting.reduce((m, s) => Math.max(m, s.institutional_quality ?? 0), 0)

  const quotation: 0 | 1 = claim.isQuotation && supporting.some((s) => s.quote_found) ? 1 : 0
  if (claim.isQuotation) notes.push(quotation ? 'the quotation is found in a second lineage' : 'the quotation is not found elsewhere')

  let chronPlausible: 0 | 1 = 1
  if (eventYear != null) {
    for (const e of entities) {
      if (e.birthYear != null && eventYear < e.birthYear) {
        chronPlausible = 0
        notes.push(`${e.name} was born in ${e.birthYear}, after ${eventYear}`)
      }
      if (e.deathYear != null && eventYear > e.deathYear + 1 && e.kind === 'person') {
        chronPlausible = 0
        notes.push(`${e.name} died in ${e.deathYear}, before ${eventYear}`)
      }
      if (e.year != null && e.kind === 'work' && eventYear < e.year - 1) {
        chronPlausible = 0
        notes.push(`${e.name} dates from ${e.year}, after ${eventYear}`)
      }
    }
  } else {
    chronPlausible = 0
    notes.push('no year on the claim')
  }

  let geoConsistent: 0 | 1 = 1
  const placed = entities.filter((e) => e.countryCode)
  if (claim.country_code && placed.length && !placed.some((e) => e.countryCode === claim.country_code)) {
    geoConsistent = 0
    notes.push(`the claim is placed in ${claim.country_code} but its entities are in ${[...new Set(placed.map((e) => e.countryCode))].join(', ')}`)
  }

  const ocr = sources.map((s) => (s.document_id ? input.documents?.get(s.document_id)?.ocr_confidence : null)).filter((x): x is number => typeof x === 'number')
  const textConfidence = Math.max(0, Math.min(1, Math.min(claim.extractorConfidence ?? 1, ocr.length ? Math.min(...ocr) : 1)))

  const secondaryScholarship: 0 | 1 = sources.some((s) => s.relation === 'cites' && /^(journal-article|book-chapter|monograph|book|proceedings-article|dissertation)$/.test(s.work_type ?? '')) ? 1 : 0
  if (secondaryScholarship) notes.push('a scholarly work is cited')

  const anonymousRepetition: 0 | 1 = claim.isAnonymous && groups.length <= 1 && nSources >= GRADE_RULES.repetitionSources ? 1 : 0
  if (anonymousRepetition) notes.push(`${nSources} retellings of one anonymous account`)

  const cited = sources.filter((s) => s.relation === 'cites')
  const circular: 0 | 1 = cited.length > 0 && cited.every((s) => s.cites_cluster) ? 1 : 0
  if (circular) notes.push('every cited work points back into this cluster')

  const years = supporting.map(srcYear).filter((y): y is number => y != null)
  const earliest = years.length ? Math.min(...years) : null
  const timeGap: 0 | 1 = !primary && eventYear != null && earliest != null && earliest - (claim.year_to ?? eventYear) > GRADE_RULES.timeGapYears ? 1 : 0
  if (timeGap) notes.push(`the earliest source is ${earliest! - (claim.year_to ?? eventYear!)} years after the event`)

  const langs = new Set(supporting.map((s) => s.language ?? (s.document_id ? input.documents?.get(s.document_id)?.language : null)).filter(Boolean))
  const translation: 0 | 1 = (claim.language && langs.size && ![...langs].some((l) => l === claim.language)) || (claim.isHearsay && langs.size > 1) ? 1 : 0
  if (translation) notes.push('the claim crossed a language')

  const contradiction: 0 | 1 = claim.flags?.includes('contradiction') ? 1 : 0
  if (contradiction) notes.push('a contradicting claim is in the store')

  return { primary, independentContemporaneous, institutional, quotation, chronPlausible, geoConsistent, textConfidence, secondaryScholarship, anonymousRepetition, circular, timeGap, translation, contradiction, nGroups: groups.length, nSources, nDerived, nPrimary, notes, version: GRADE_VERSION }
}

/** The weighted sum, clamped to 0..1. */
export function scoreClaim(f: ScoreFeatures): number {
  let s = 0
  for (const [k, w] of Object.entries(GRADE_WEIGHTS) as Array<[keyof typeof GRADE_WEIGHTS, number]>) s += w * f[k]
  for (const [k, w] of Object.entries(GRADE_PENALTIES) as Array<[keyof typeof GRADE_PENALTIES, number]>) s -= w * f[k]
  return Math.round(Math.max(0, Math.min(1, s)) * 1000) / 1000
}

/**
 * The grade for a score. With the features, grade D is a floor for the case
 * the design names D ("a repeated anecdote whose chain traces to an
 * unsourced account"): three or more sources, not contradicted, not
 * circular, chronologically possible. E stays for the contradicted, the
 * impossible, the circular and the unsupported single account.
 */
export function gradeFor(score: number, f?: Pick<ScoreFeatures, 'nSources' | 'contradiction' | 'circular' | 'chronPlausible'>): Grade {
  let grade: Grade = 'E'
  for (const [g, min] of GRADE_THRESHOLDS) {
    if (score >= min) {
      grade = g
      break
    }
  }
  if (grade === 'E' && f && f.nSources >= GRADE_RULES.repetitionSources && !f.contradiction && !f.circular && f.chronPlausible) return 'D'
  return grade
}

export const GRADE_LABELS: Record<Grade, string> = {
  A: 'Direct primary evidence plus independent corroboration',
  B: 'Strong contemporaneous evidence or multiple independent reputable sources',
  C: 'Plausible and well-sourced secondary account; primary evidence not located',
  D: 'Repeated anecdote whose evidentiary chain traces to an unsourced account',
  E: 'Contradicted, impossible, circular or unsupported',
}

/** The flags the grade adds (the detector's and the contradiction flag stay). */
export function gradeFlags(f: ScoreFeatures, existing: string[] = []): string[] {
  const out = new Set(existing)
  if (f.anonymousRepetition) out.add('anonymous-repetition')
  if (f.circular) out.add('circular')
  if (f.timeGap) out.add('time-gap')
  if (f.translation) out.add('translation')
  if (f.nSources >= GRADE_RULES.repetitionSources && f.nGroups <= 1 && !f.primary) out.add('unverified-popular')
  return [...out]
}

export const policyQuality = (sourceId: keyof typeof SOURCE_POLICIES): number => SOURCE_POLICIES[sourceId].institutionalQuality
