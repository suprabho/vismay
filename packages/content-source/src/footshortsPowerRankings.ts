import { createServiceClient } from './supabase'

/**
 * Footshorts Opta Power Rankings (the admin "Power rankings" tab).
 *
 * Rows are created ONLY by the worker's weekly theanalyst.com scrape
 * (apps/footshorts/worker/src/theanalystPowerRankings.ts) as status='draft'.
 * The admin reviews a draft — fixing unresolved team entities or the narrative
 * if needed — then explicitly publishes it, which is what makes the row
 * visible to consumer surfaces (RLS gates public select on
 * status='published'). Same lifecycle as footshortsShareCards. See migration
 * `20260824000002_power_rankings.sql`.
 */

export type PowerRankingStatus = 'draft' | 'published'

/** One ranked team, as scraped (team_name verbatim from theanalyst) and as
 *  resolved (resolved_entity_id → entities.id, null on a resolver miss —
 *  editable in the admin before publishing). */
export interface PowerRankingEntry {
  rank: number
  team_name: string
  resolved_entity_id: string | null
  score: number | null
  movement: number | null
  competition: string | null
}

export interface SavedPowerRanking {
  id: string
  sourceUrl: string
  weekLabel: string | null
  rankings: PowerRankingEntry[]
  narrative: string | null
  status: PowerRankingStatus
  scrapedAt: string
  publishedAt: string | null
  createdAt: string
  updatedAt: string
}

/** A row without its `rankings` list — the tab's timeline only needs metadata;
 *  the full list is lazy-loaded when a snapshot is opened. */
export type PowerRankingSummary = Omit<SavedPowerRanking, 'rankings'> & {
  /** Number of ranked teams (so the list can show "Top 100" etc. without the payload). */
  entryCount: number
}

export interface UpdatePowerRanking {
  rankings?: PowerRankingEntry[]
  narrative?: string | null
  weekLabel?: string | null
}

interface Row {
  id: string
  source_url: string
  week_label: string | null
  rankings: PowerRankingEntry[]
  narrative: string | null
  content_hash: string
  scraped_at: string
  status: PowerRankingStatus
  published_at: string | null
  created_at: string
  updated_at: string
}

function rowToRanking(r: Row): SavedPowerRanking {
  return {
    id: r.id,
    sourceUrl: r.source_url,
    weekLabel: r.week_label,
    rankings: r.rankings ?? [],
    narrative: r.narrative,
    status: r.status,
    scrapedAt: r.scraped_at,
    publishedAt: r.published_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

const DEFAULT_LIMIT = 30
const MAX_LIMIT = 100

/** Newest-first metadata list. Pulls `rankings` only to count entries —
 *  jsonb_array_length isn't reachable through supabase-js selects, and the
 *  lists are small (≤ a few hundred entries). */
export async function listPowerRankingSummaries(
  opts: { limit?: number } = {},
): Promise<PowerRankingSummary[]> {
  const limit = Math.min(Math.max(Math.trunc(opts.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT)
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('power_rankings')
    .select('*')
    .order('scraped_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`listPowerRankingSummaries: ${error.message}`)
  return ((data as Row[]) ?? []).map((r) => {
    const { rankings, ...rest } = rowToRanking(r)
    return { ...rest, entryCount: rankings.length }
  })
}

export async function getPowerRanking(id: string): Promise<SavedPowerRanking | null> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('power_rankings')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`getPowerRanking: ${error.message}`)
  return data ? rowToRanking(data as Row) : null
}

/** Editor corrections before publish: fix a mis-resolved team, adjust the
 *  narrative, or relabel the week. content_hash is untouched on purpose — it
 *  tracks what theanalyst published, not what the editor amended. */
export async function updatePowerRanking(
  id: string,
  patch: UpdatePowerRanking,
): Promise<SavedPowerRanking> {
  const sb = createServiceClient()
  // No DB trigger maintains updated_at, so bump it here.
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (patch.rankings !== undefined) update.rankings = patch.rankings
  if (patch.narrative !== undefined) update.narrative = patch.narrative
  if (patch.weekLabel !== undefined) update.week_label = patch.weekLabel
  const { data, error } = await sb
    .from('power_rankings')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(`updatePowerRanking: ${error.message}`)
  return rowToRanking(data as Row)
}

/** Make the snapshot visible to consumer surfaces (RLS select gate). */
export async function publishPowerRanking(id: string): Promise<SavedPowerRanking> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('power_rankings')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(`publishPowerRanking: ${error.message}`)
  return rowToRanking(data as Row)
}

/** Pull a published snapshot back to draft (hides it from consumers again). */
export async function unpublishPowerRanking(id: string): Promise<SavedPowerRanking> {
  const sb = createServiceClient()
  const { data, error } = await sb
    .from('power_rankings')
    .update({ status: 'draft', published_at: null })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(`unpublishPowerRanking: ${error.message}`)
  return rowToRanking(data as Row)
}

export async function deletePowerRanking(id: string): Promise<void> {
  const sb = createServiceClient()
  const { error } = await sb.from('power_rankings').delete().eq('id', id)
  if (error) throw new Error(`deletePowerRanking: ${error.message}`)
}
