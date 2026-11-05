/**
 * Shared types for the Curious Desk's claim pipeline. The row types mirror
 * supabase/vizmaya-fyi/migrations/101_curious_claims.sql column for column;
 * the in-memory types are what the pure modules pass around.
 */

export type SourceId = 'gdelt' | 'loc' | 'europeana' | 'gallica' | 'crossref' | 'google-books' | 'wikidata' | 'web' | 'web-search' | 'book'
export const SOURCE_IDS: readonly SourceId[] = ['gdelt', 'loc', 'europeana', 'gallica', 'crossref', 'google-books', 'wikidata', 'web', 'web-search', 'book']
/** The discovery sources `collect.ts` accepts. */
export type CollectorId = 'gdelt' | 'loc' | 'europeana' | 'gallica'
export const COLLECTOR_IDS: readonly CollectorId[] = ['gdelt', 'loc', 'europeana', 'gallica']

export type AccessMethod = 'api' | 'sru' | 'iiif' | 'html' | 'none'
export type FulltextStorage = 'none' | 'snippet' | 'full'
export type PersonalDataPolicy = 'none' | 'public-figures' | 'all'

/** One row of curious_sources: what a source allows, read before any fetch. */
export interface SourcePolicy {
  id: SourceId
  name: string
  kind: 'news-index' | 'library' | 'aggregator' | 'registry' | 'web'
  baseUrl: string | null
  allowedMethod: AccessMethod
  crawlDelayMs: number
  ratePerMin: number | null
  retentionDays: number
  commercialReuse: boolean
  fulltextStorage: FulltextStorage
  personalDataPolicy: PersonalDataPolicy
  termsUrl: string | null
  termsLastChecked: string | null
  enabled: boolean
  /** Institutional quality the grader starts from for a document of this source (0..1). */
  institutionalQuality: number
}

export type PublishedPrecision = 'minute' | 'day' | 'month' | 'year' | 'unknown'
export type ExtractionMethod = 'api-json' | 'html-text' | 'ocr-alto' | 'iiif-ocr' | 'pdf-text' | 'sru-xml'
export type DocumentStatus = 'fetched' | 'detected' | 'no-candidates' | 'skipped' | 'failed'

/** What a collector yields: a curious_documents row minus the generated columns. */
export interface DocumentUpsert {
  source_id: SourceId
  external_id: string
  canonical_url: string
  archive_url?: string | null
  title: string | null
  publisher: string | null
  author: string | null
  language: string | null
  published_at: string | null
  published_precision: PublishedPrecision
  retrieved_at: string
  rights_uri: string | null
  content_hash: string
  raw_uri: string
  extraction_method: ExtractionMethod
  text: string | null
  text_hash: string | null
  text_chars: number | null
  ocr_confidence?: number | null
  query: string | null
  collector_version: string
  lineage_hint: string | null
  meta: Record<string, unknown>
}

export interface DocumentRow extends DocumentUpsert {
  id: string
  status: DocumentStatus
  detected_at: string | null
  created_at: string
  updated_at: string
}

export type ClaimKind = 'fact' | 'anecdote' | 'number' | 'quote'
export type ClaimStatus = 'candidate' | 'graded' | 'in_review' | 'approved' | 'rejected' | 'sent_back'
export type Grade = 'A' | 'B' | 'C' | 'D' | 'E'
export type ClaimFlag =
  | 'contradiction'
  | 'personal-data'
  | 'sensitive'
  | 'anonymous-repetition'
  | 'circular'
  | 'translation'
  | 'time-gap'
  | 'unverified-popular'
  | 'sent-back'

export type SourceRelation = 'supports' | 'contradicts' | 'cites' | 'derived_from' | 'mentions'
export type VerifiedBy = 'detector' | 'verify-crossref' | 'verify-books' | 'verify-wikidata' | 'human' | 'llm-check'
export type EntityKind = 'person' | 'org' | 'place' | 'work' | 'event' | 'other'

/** A curious_claim_sources row minus the generated columns. */
export interface ClaimSourceUpsert {
  claim_id: string
  document_id: string | null
  relation: SourceRelation
  independence_group: string
  is_primary: boolean
  is_contemporaneous: boolean
  institutional_quality: number | null
  quote: string | null
  span_start: number | null
  span_end: number | null
  page: number | null
  external_ref: string | null
  source_year?: number | null
  work_type?: string | null
  cites_cluster?: boolean
  quote_found?: boolean
  verified_by: VerifiedBy
}

export interface ClaimRow {
  id: string
  text: string
  text_norm: string
  claim_hash: string
  kind: ClaimKind
  subject: string | null
  era: string | null
  region: string | null
  theme: string | null
  year_from: number | null
  year_to: number | null
  place: string | null
  country_code: string | null
  document_id: string
  evidence_quote: string
  evidence_start: number | null
  evidence_end: number | null
  evidence_page: number | null
  evidence_media_ts: number | null
  is_quotation: boolean
  is_anonymous: boolean
  is_hearsay: boolean
  speaker: string | null
  extractor_confidence: number | null
  detector_rules: string[]
  detector_version: string
  extractor_model: string | null
  classifier_version: string
  status: ClaimStatus
  grade: Grade | null
  score: number | null
  score_features: Record<string, unknown> | null
  graded_at: string | null
  flags: ClaimFlag[]
  cluster_id: string | null
  contradicts: string | null
  review_note: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

/** Environment the collectors and verifiers read; the CLIs build it from process.env. */
export interface EntityRow {
  id: number
  name: string
  name_norm: string
  kind: EntityKind
  wikidata_qid: string | null
  aliases: string[]
  country_code: string | null
  lat: number | null
  lng: number | null
  birth_year: number | null
  death_year: number | null
  year: number | null
  sensitive: boolean
  is_living_private: boolean
  resolved_at: string | null
}

export interface CuriousEnv {
  europeanaKey: string | null
  crossrefMailto: string | null
  googleBooksKey: string | null
}

export function curiousEnv(env: NodeJS.ProcessEnv = process.env): CuriousEnv {
  return {
    europeanaKey: env.EUROPEANA_API_KEY?.trim() || null,
    crossrefMailto: env.CROSSREF_MAILTO?.trim() || env.UNPAYWALL_EMAIL?.trim() || null,
    googleBooksKey: env.GOOGLE_BOOKS_API_KEY?.trim() || null,
  }
}
