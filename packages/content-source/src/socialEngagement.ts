/**
 * Social engagement events — reads + writes for the engagement_event table
 * (migration 028). Shared by the ingest workers (YouTube script, email
 * ingest endpoint) and the /admin/social inbox.
 *
 * One table per row, no normalisation — see the plan doc for context.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from './supabase'

export type Platform = 'youtube' | 'linkedin' | 'x'
export type EventType = 'mention' | 'reply' | 'comment' | 'dm'
export type Status = 'new' | 'seen' | 'replied' | 'dismissed'

export const PLATFORMS: Platform[] = ['youtube', 'linkedin', 'x']
export const STATUSES: Status[] = ['new', 'seen', 'replied', 'dismissed']

export interface EngagementEvent {
  id: string
  platform: Platform
  external_id: string
  type: EventType
  source_url: string | null
  author_handle: string | null
  author_metadata: Record<string, unknown> | null
  content: string | null
  created_at: string
  parent_external_id: string | null
  parent_url: string | null
  parent_content: string | null
  status: Status
  ingested_at: string
}

/** Shape every ingest worker normalises to before upserting. */
export interface NormalizedEvent {
  platform: Platform
  external_id: string
  type: EventType
  source_url?: string | null
  author_handle?: string | null
  author_metadata?: Record<string, unknown> | null
  content?: string | null
  created_at: string
  parent_external_id?: string | null
  parent_url?: string | null
  parent_content?: string | null
}

/**
 * Upsert a batch of events. `(platform, external_id)` is the natural key;
 * re-runs are no-ops. Returns the number of rows successfully written.
 */
export async function upsertEvents(
  events: NormalizedEvent[],
  sb: SupabaseClient = createServiceClient()
): Promise<number> {
  if (events.length === 0) return 0
  const { data, error } = await sb
    .from('engagement_event')
    .upsert(events, { onConflict: 'platform,external_id', ignoreDuplicates: false })
    .select('id')
  if (error) throw new Error(`upsertEvents: ${error.message}`)
  return data?.length ?? 0
}

export interface ListEventsParams {
  platforms?: Platform[]
  statuses?: Status[]
  limit?: number
}

export async function listEvents(
  params: ListEventsParams = {},
  sb: SupabaseClient = createServiceClient()
): Promise<EngagementEvent[]> {
  let q = sb
    .from('engagement_event')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(params.limit ?? 200)
  if (params.platforms && params.platforms.length > 0) {
    q = q.in('platform', params.platforms)
  }
  if (params.statuses && params.statuses.length > 0) {
    q = q.in('status', params.statuses)
  }
  const { data, error } = await q
  if (error) throw new Error(`listEvents: ${error.message}`)
  return (data ?? []) as EngagementEvent[]
}

export async function updateStatus(
  id: string,
  status: Status,
  sb: SupabaseClient = createServiceClient()
): Promise<void> {
  const { error } = await sb
    .from('engagement_event')
    .update({ status })
    .eq('id', id)
  if (error) throw new Error(`updateStatus: ${error.message}`)
}

/** Aggregated counts for the inbox header. */
export interface EngagementSummary {
  total: number
  newCount: number
  byPlatform: Record<Platform, number>
}

export async function summarize(
  sb: SupabaseClient = createServiceClient()
): Promise<EngagementSummary> {
  const { data, error } = await sb
    .from('engagement_event')
    .select('platform, status')
  if (error) throw new Error(`summarize: ${error.message}`)
  const rows = (data ?? []) as { platform: Platform; status: Status }[]
  const byPlatform: Record<Platform, number> = { youtube: 0, linkedin: 0, x: 0 }
  let newCount = 0
  for (const r of rows) {
    byPlatform[r.platform] = (byPlatform[r.platform] ?? 0) + 1
    if (r.status === 'new') newCount++
  }
  return { total: rows.length, newCount, byPlatform }
}
