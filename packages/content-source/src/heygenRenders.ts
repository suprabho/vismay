/**
 * Persistence for HeyGen template renders driven from the admin HeyGen Studio.
 *
 * Schema: supabase/vizmaya-fyi/migrations/061_heygen_renders.sql. A row is
 * inserted `pending` when a render is kicked off (see /api/heygen/generate),
 * then the status poll route (/api/heygen/status/[videoId]) downloads the
 * finished MP4, uploads it to the `story-video` bucket, and flips the row to
 * `completed` (or `failed`). Reads take an injected `SupabaseClient` so the
 * caller controls service-vs-anon, mirroring storyVideo.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Storage bucket reused for HeyGen MP4s (public, accepts video/mp4). */
export const HEYGEN_BUCKET = 'story-video'

const TABLE = 'heygen_renders'

export type HeygenRenderStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface HeygenRenderRow {
  id: number
  video_id: string
  slug: string
  app_slug: string | null
  template_id: string
  title: string | null
  variables: Record<string, unknown> | null
  dimension: { width: number; height: number } | null
  test: boolean
  status: HeygenRenderStatus
  storage_path: string | null
  public_url: string | null
  thumbnail_url: string | null
  duration_ms: number | null
  error: string | null
  created_at: string | null
  updated_at: string | null
}

/** Bucket key for a render's MP4 — namespaced by story so renders group cleanly. */
export function heygenStoragePath(slug: string, videoId: string): string {
  return `heygen/${slug}/${videoId}.mp4`
}

export interface InsertHeygenRenderArgs {
  videoId: string
  slug: string
  appSlug?: string | null
  templateId: string
  title?: string | null
  variables?: Record<string, unknown> | null
  dimension?: { width: number; height: number } | null
  test?: boolean
  status?: HeygenRenderStatus
}

export async function insertHeygenRender(
  supabase: SupabaseClient,
  args: InsertHeygenRenderArgs,
): Promise<HeygenRenderRow> {
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      video_id: args.videoId,
      slug: args.slug,
      app_slug: args.appSlug ?? null,
      template_id: args.templateId,
      title: args.title ?? null,
      variables: args.variables ?? null,
      dimension: args.dimension ?? null,
      test: args.test ?? false,
      status: args.status ?? 'pending',
    })
    .select()
    .single()
  if (error) throw new Error(`insertHeygenRender: ${error.message}`)
  return data as HeygenRenderRow
}

export interface HeygenRenderPatch {
  status?: HeygenRenderStatus
  storage_path?: string | null
  public_url?: string | null
  thumbnail_url?: string | null
  duration_ms?: number | null
  error?: string | null
}

export async function updateHeygenRender(
  supabase: SupabaseClient,
  videoId: string,
  patch: HeygenRenderPatch,
): Promise<HeygenRenderRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('video_id', videoId)
    .select()
    .maybeSingle()
  if (error) throw new Error(`updateHeygenRender ${videoId}: ${error.message}`)
  return (data as HeygenRenderRow | null) ?? null
}

export async function getHeygenRender(
  supabase: SupabaseClient,
  videoId: string,
): Promise<HeygenRenderRow | null> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('video_id', videoId)
    .maybeSingle()
  if (error) throw new Error(`getHeygenRender ${videoId}: ${error.message}`)
  return (data as HeygenRenderRow | null) ?? null
}

export async function listHeygenRenders(
  supabase: SupabaseClient,
  slug: string,
): Promise<HeygenRenderRow[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('slug', slug)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`listHeygenRenders ${slug}: ${error.message}`)
  return (data as HeygenRenderRow[]) ?? []
}
