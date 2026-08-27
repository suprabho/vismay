/**
 * DB helpers for the `travel_trip_media` table (migration 074) — the travel
 * app's per-item media manifest, moved from `<slug>.media.yaml` so curation
 * works against the deployed app. One row per photo/video; keep every write
 * small (single rows or ≤100-row chunks — never a whole-manifest blob).
 *
 * This module is the shared contract between the curation surface, the journey
 * map's media attach, and the scrapbook story's layer injection.
 */

import { createServiceClient } from './supabase'
import { isValidTripSlug } from './travelTrips'

export interface TravelTripMediaRow {
  trip_slug: string
  file: string
  kind: 'image' | 'video'
  day: number | null
  stop: string | null
  caption: string | null
  selected: boolean
  sort_order: number | null
  taken_at: string | null
  match: 'auto' | 'manual'
  original: string | null
  created_at: string
  updated_at: string
}

/** Fields a caller may change after a row exists. */
export type TravelTripMediaPatch = Partial<
  Pick<TravelTripMediaRow, 'kind' | 'day' | 'stop' | 'caption' | 'selected' | 'sort_order'>
>

/** Row shape for inserts/upserts (timestamps default server-side). */
export type TravelTripMediaInput = Omit<TravelTripMediaRow, 'created_at' | 'updated_at'>

const SAFE_MEDIA_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/

export function isValidMediaFile(file: string): boolean {
  return typeof file === 'string' && SAFE_MEDIA_FILE.test(file) && !file.includes('..')
}

function assertSlug(slug: string, fn: string): void {
  if (!isValidTripSlug(slug)) throw new Error(`${fn}: bad slug "${slug}"`)
}

const ORDER = { column: 'sort_order', file: 'file' } as const

function hasSupabaseEnv(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SERVICE_ROLE_KEY
}

/** All rows for a trip, curated order (sort_order nulls-last, then file). */
export async function listTripMedia(slug: string): Promise<TravelTripMediaRow[]> {
  assertSlug(slug, 'listTripMedia')
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('travel_trip_media')
    .select('*')
    .eq('trip_slug', slug)
    .order(ORDER.column, { ascending: true, nullsFirst: false })
    .order(ORDER.file, { ascending: true })
  if (error) throw new Error(`listTripMedia: ${error.message}`)
  return (data ?? []) as TravelTripMediaRow[]
}

/**
 * Selected rows for one day, curated order. Never throws: the scrapbook page
 * must render (via its YAML fallback) when env is missing, the table hasn't
 * been migrated yet, or the query fails.
 */
export async function getSelectedTripMedia(
  slug: string,
  day: number
): Promise<TravelTripMediaRow[]> {
  if (!isValidTripSlug(slug) || !hasSupabaseEnv()) return []
  try {
    const sb = createServiceClient()
    const { data, error } = await sb
      .from('travel_trip_media')
      .select('*')
      .eq('trip_slug', slug)
      .eq('day', day)
      .eq('selected', true)
      .order(ORDER.column, { ascending: true, nullsFirst: false })
      .order(ORDER.file, { ascending: true })
    if (error) {
      console.warn(`[travelMedia] getSelectedTripMedia(${slug}, ${day}): ${error.message}`)
      return []
    }
    return (data ?? []) as TravelTripMediaRow[]
  } catch (e) {
    console.warn(`[travelMedia] getSelectedTripMedia(${slug}, ${day}):`, e)
    return []
  }
}

const UPSERT_CHUNK = 100

/**
 * Insert (or with `ignoreDuplicates: false`, upsert) rows in ≤100-row chunks —
 * the shared Supabase instance has been wedged by large single writes before.
 * Returns the number of rows written.
 */
export async function upsertTripMedia(
  rows: TravelTripMediaInput[],
  opts: { ignoreDuplicates?: boolean } = {}
): Promise<number> {
  if (rows.length === 0) return 0
  const ignoreDuplicates = opts.ignoreDuplicates ?? true
  for (const r of rows) {
    assertSlug(r.trip_slug, 'upsertTripMedia')
    if (!isValidMediaFile(r.file)) throw new Error(`upsertTripMedia: bad file "${r.file}"`)
  }
  const sb = createServiceClient()
  let written = 0
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK)
    const { data, error } = await sb
      .from('travel_trip_media')
      .upsert(chunk, { onConflict: 'trip_slug,file', ignoreDuplicates })
      .select('file')
    if (error) throw new Error(`upsertTripMedia: ${error.message}`)
    written += (data ?? []).length
  }
  return written
}

/** Apply one patch to many files of a trip. Returns the affected row count. */
export async function updateTripMedia(
  slug: string,
  files: string[],
  patch: TravelTripMediaPatch
): Promise<number> {
  assertSlug(slug, 'updateTripMedia')
  if (files.length === 0 || Object.keys(patch).length === 0) return 0
  for (const f of files) {
    if (!isValidMediaFile(f)) throw new Error(`updateTripMedia: bad file "${f}"`)
  }
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('travel_trip_media')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('trip_slug', slug)
    .in('file', files)
    .select('file')
  if (error) throw new Error(`updateTripMedia: ${error.message}`)
  return (data ?? []).length
}

export async function deleteTripMedia(slug: string, file: string): Promise<void> {
  assertSlug(slug, 'deleteTripMedia')
  if (!isValidMediaFile(file)) throw new Error(`deleteTripMedia: bad file "${file}"`)
  const sb = createServiceClient()
  const { error } = await sb
    .from('travel_trip_media')
    .delete()
    .eq('trip_slug', slug)
    .eq('file', file)
  if (error) throw new Error(`deleteTripMedia: ${error.message}`)
}
