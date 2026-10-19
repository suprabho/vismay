import 'server-only'
import { createServiceClient } from '@vismay/content-source/supabase'
import { HISTORY_CRESTS_BUCKET, HISTORY_CRESTS_TABLE, type HistoryCrest } from '@footshorts/shared/historicalCrests'
import { crestExtension, crestUploadPath, type CrestView } from './crests'

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

function fail(message: string): never {
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

async function withImages(rows: HistoryCrest[]): Promise<CrestView[]> {
  const paths = rows.map(r => r.upload_path).filter((p): p is string => !!p)
  const signed = new Map<string, string>()
  if (paths.length) {
    const { data, error } = await createServiceClient().storage.from(HISTORY_CRESTS_BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS)
    if (error) fail(error.message)
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl)
  }
  return rows.map(r => ({ ...r, image_url: (r.upload_path && signed.get(r.upload_path)) || r.thumb_url || r.file_url || null }))
}

export async function listCrests(season: string): Promise<CrestView[]> {
  const { data, error } = await createServiceClient().from(HISTORY_CRESTS_TABLE).select(COLUMNS)
    .eq('season', season).order('top_flight').order('name').limit(5000)
  if (error) fail(error.message)
  return withImages((data ?? []) as HistoryCrest[])
}

async function getCrest(season: string, wiki: string): Promise<HistoryCrest> {
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
  return (await withImages([data as HistoryCrest]))[0]!
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
  return (await withImages([data as HistoryCrest]))[0]!
}
