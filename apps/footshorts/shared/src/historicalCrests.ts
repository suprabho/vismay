// Club crests for the football-seasons books (vizmaya-data/football-seasons, Layer 6):
// the crest each club wore that season, picked by scripts/crests.py, plus the file an
// editor uploaded where the pick is missing or wrong. Private admin storage: never
// write these rows or files to entities or any consumer-facing table or bucket.
export const HISTORY_CRESTS_TABLE = 'admin_season_crests';
export const HISTORY_CRESTS_BUCKET = 'admin-season-crests';
/** Club marks per club and season (footshorts migration 20261021000000): kit, review overrides, generated row. */
export const HISTORY_CLUB_MARKS_TABLE = 'admin_club_marks';
/** data/kits.csv column → admin_club_marks column. A push writes only these. */
export const CLUB_MARK_KIT_COLUMNS = {
  pattern: 'kit_pattern', c1: 'kit_c1', c2: 'kit_c2', confidence: 'kit_confidence', source: 'kit_source', page: 'kit_page',
  needs_review: 'kit_needs_review', review_note: 'kit_note',
} as const;
/** data/club_marks.csv: one row per club per crest era (toClubMark spec 2), pulled from admin_club_marks. charge is "shape:#hex". */
export const CLUB_MARKS_CSV_HEADER = ['season', 'wiki', 'name', 'code', 'crest', 'pattern', 'c1', 'c2', 'ring', 'rim', 'charge', 'league',
  'from', 'to', 'family_confidence', 'needs_review', 'review_reasons', 'reviewed_by'] as const;
/** data/mark_overrides.csv column → admin_club_marks column: the editorial design (family, rim, field, charges); the review queue still wins. */
export const CLUB_MARK_SEED_COLUMNS = {
  family: 'seed_family', rim: 'seed_rim', pattern: 'seed_pattern', c1: 'seed_c1', c2: 'seed_c2', charge: 'seed_charge',
} as const;

/** Columns that come from crests.csv. A push overwrites only these, so an upload
 * made in the admin (upload_*, uploaded_*) survives. */
export const HISTORY_CREST_CONTENT_COLUMNS = ['season', 'wiki', 'name', 'canonical_id', 'slug', 'top_flight', 'competitions',
  'country', 'qid', 'source', 'era', 'era_label', 'file', 'file_url', 'thumb_url', 'logopedia_page', 'needs_review',
  'review_note'] as const;

export interface HistoryCrest {
  season: string;
  wiki: string;
  name: string;
  canonical_id: string;
  slug: string;
  top_flight: string;
  competitions: string;
  country: string;
  qid: string;
  source: string;
  era: '' | 'season' | 'current';
  era_label: string;
  file: string;
  file_url: string;
  thumb_url: string;
  logopedia_page: string;
  needs_review: boolean;
  review_note: string;
  upload_path: string | null;
  upload_type: string | null;
  uploaded_by: string | null;
  uploaded_at: string | null;
}

/** Upload formats the bucket takes → file extension. */
export const CREST_UPLOAD_TYPES: Record<string, string> = {
  'image/png': 'png', 'image/svg+xml': 'svg', 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/gif': 'gif',
};
export const CREST_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;
