// Club crests for the football-seasons books (vizmaya-data/football-seasons, Layer 6):
// the crest each club wore that season, picked by scripts/crests.py, plus the file an
// editor uploaded where the pick is missing or wrong. Private admin storage: never
// write these rows or files to entities or any consumer-facing table or bucket.
export const HISTORY_CRESTS_TABLE = 'admin_season_crests';
export const HISTORY_CRESTS_BUCKET = 'admin-season-crests';

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
