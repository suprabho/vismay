import 'server-only'
import { createServiceClient } from '@vismay/content-source/supabase'
import { HISTORY_CLUB_MARKS_TABLE, HISTORY_CRESTS_BUCKET, HISTORY_CRESTS_TABLE, type HistoryCrest } from '@footshorts/shared/historicalCrests'
import { crestExtension, crestUploadPath, type ClubMarkView, type CrestView } from './crests'

/**
 * Readers/writers for the private `admin_season_crests` table and the private
 * `admin-season-crests` bucket (footshorts migration 20261020000000). Rows come
 * from crests.csv via `history:crests-sync --push`; this module only reads them
 * and sets or clears the upload. Admin-only: every caller is behind `isAuthed()`.
 */

const COLUMNS = 'season,wiki,name,canonical_id,slug,top_flight,competitions,country,qid,source,era,era_label,file,file_url,thumb_url,logopedia_page,needs_review,review_note,upload_path,upload_type,uploaded_by,uploaded_at'
const SIGNED_URL_SECONDS = 60 * 60

export class CrestStoreError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

export function fail(message: string): never {
  if (/admin_club_marks/.test(message) && /does not exist|schema cache|not find/i.test(message)) {
    throw new CrestStoreError('Club marks are not set up yet. Apply the admin_club_marks migration (supabase/footshorts), then push kits with history:club-marks-sync.', 503)
  }
  if (/admin_season_crests/.test(message) && /does not exist|schema cache|not find/i.test(message)) {
    throw new CrestStoreError('Crests are not set up yet. Apply the admin_season_crests migration (supabase/footshorts), then push crests with history:crests-sync.', 503)
  }
  if (/bucket not found/i.test(message)) {
    throw new CrestStoreError('The admin-season-crests bucket is missing. Apply the admin_season_crests migration (supabase/footshorts).', 503)
  }
  throw new CrestStoreError(message, 500)
}

/** Seasons that have crests, newest first. */
export async function listCrestSeasons(): Promise<string[]> {
  const { data, error } = await createServiceClient().from(HISTORY_CRESTS_TABLE).select('season').order('season', { ascending: false }).limit(10000)
  if (error) fail(error.message)
  return [...new Set((data ?? []).map(r => r.season as string))]
}

/** Signed URLs for bucket paths, 200 per request. */
export async function signCrestPaths(paths: string[]): Promise<Map<string, string>> {
  const signed = new Map<string, string>()
  const unique = [...new Set(paths)]
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await createServiceClient().storage.from(HISTORY_CRESTS_BUCKET).createSignedUrls(unique.slice(i, i + 200), SIGNED_URL_SECONDS)
    if (error) fail(error.message)
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl)
  }
  return signed
}

export const MARK_COLUMNS = 'wiki,kit_pattern,kit_c1,kit_c2,kit_confidence,kit_source,kit_page,kit_needs_review,kit_note,'
  + 'override_family,override_code,override_pattern,override_c1,override_c2,override_charge,override_rim,seed_family,seed_charge,seed_rim,seed_pattern,seed_c1,seed_c2,'
  + 'reviewed_by,reviewed_at,status,error_code,error_message,'
  + 'code,crest,pattern,c1,c2,ring,rim,charge,league,era_from,era_to,family_confidence,checks,print,needs_review,review_reasons,alt,spec_version,'
  + 'generated_from,generated_by,generated_at'

/** Club-mark rows of a season (or some of its clubs) by wiki. */
export async function loadMarks(season: string, wikis?: string[]): Promise<Map<string, ClubMarkView>> {
  let q = createServiceClient().from(HISTORY_CLUB_MARKS_TABLE).select(MARK_COLUMNS).eq('season', season).limit(5000)
  if (wikis) q = q.in('wiki', wikis)
  const { data, error } = await q
  if (error) fail(error.message)
  return new Map(((data ?? []) as unknown as (ClubMarkView & { wiki: string })[]).map(({ wiki, ...m }) => [wiki, m]))
}

async function withImages(season: string, rows: HistoryCrest[]): Promise<CrestView[]> {
  const signed = await signCrestPaths(rows.map(r => r.upload_path).filter((p): p is string => !!p))
  const marks = rows.length ? await loadMarks(season, rows.length === 1 ? [rows[0]!.wiki] : undefined) : new Map<string, ClubMarkView>()
  return rows.map(r => ({
    ...r,
    image_url: (r.upload_path && signed.get(r.upload_path)) || r.thumb_url || r.file_url || null,
    mark: marks.get(r.wiki) ?? null,
  }))
}

export async function listCrests(season: string): Promise<CrestView[]> {
  const { data, error } = await createServiceClient().from(HISTORY_CRESTS_TABLE).select(COLUMNS)
    .eq('season', season).order('top_flight').order('name').limit(5000)
  if (error) fail(error.message)
  return withImages(season, (data ?? []) as HistoryCrest[])
}

export async function getCrest(season: string, wiki: string): Promise<HistoryCrest> {
  const { data, error } = await createServiceClient().from(HISTORY_CRESTS_TABLE).select(COLUMNS)
    .eq('season', season).eq('wiki', wiki).maybeSingle()
  if (error) fail(error.message)
  if (!data) throw new CrestStoreError('That club is not in this season’s crests. Reload the page.', 404)
  return data as HistoryCrest
}

/** Store the file (type already sniffed) and point the club at it; a previous upload in another format is removed. */
export async function uploadCrest(season: string, wiki: string, bytes: Uint8Array, type: string, by: string | null): Promise<CrestView> {
  const crest = await getCrest(season, wiki)
  const ext = crestExtension(type)
  if (!ext) throw new CrestStoreError('Upload a PNG, SVG, WebP, JPEG or GIF.', 400)
  const path = crestUploadPath(season, wiki, crest.slug, ext)
  const sb = createServiceClient()
  const { error: upErr } = await sb.storage.from(HISTORY_CRESTS_BUCKET).upload(path, bytes, { contentType: type, upsert: true })
  if (upErr) fail(upErr.message)
  const { data, error } = await sb.from(HISTORY_CRESTS_TABLE)
    .update({ upload_path: path, upload_type: type, uploaded_by: by, uploaded_at: new Date().toISOString() })
    .eq('season', season).eq('wiki', wiki).select(COLUMNS).maybeSingle()
  if (error) fail(error.message)
  if (crest.upload_path && crest.upload_path !== path) await sb.storage.from(HISTORY_CRESTS_BUCKET).remove([crest.upload_path])
  return (await withImages(season, [data as HistoryCrest]))[0]!
}

export async function getCrestView(season: string, wiki: string): Promise<CrestView> {
  return (await withImages(season, [await getCrest(season, wiki)]))[0]!
}

/** Drop the upload: the club falls back to the crest crests.py picked (or none). */
export async function removeCrestUpload(season: string, wiki: string): Promise<CrestView> {
  const crest = await getCrest(season, wiki)
  const sb = createServiceClient()
  const { data, error } = await sb.from(HISTORY_CRESTS_TABLE)
    .update({ upload_path: null, upload_type: null, uploaded_by: null, uploaded_at: null })
    .eq('season', season).eq('wiki', wiki).select(COLUMNS).maybeSingle()
  if (error) fail(error.message)
  if (crest.upload_path) {
    const { error: rmErr } = await sb.storage.from(HISTORY_CRESTS_BUCKET).remove([crest.upload_path])
    if (rmErr) console.warn('[crests] could not delete the old upload:', rmErr.message)
  }
  return (await withImages(season, [data as HistoryCrest]))[0]!
}
