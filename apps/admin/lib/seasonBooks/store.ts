import 'server-only'
import { createServiceClient } from '@vismay/content-source/supabase'
import { planSchema, planSummary, seasonLabel, seasonSlug, starterPlan, type Plan, type SeasonBook, type SeasonBookSummary } from './plan'
import type { MatchRow } from './matches'

/**
 * Readers/writers for the private season-book tables (footshorts Supabase):
 * `admin_season_books` (migration 20261014000000) for the plans and
 * `admin_historical_matches` (20261013000000) for the match data the beat
 * finder and data-bound charts read. Admin-only: every caller is behind
 * `isAuthed()`.
 */

const TABLE = 'admin_season_books'
const MATCHES = 'admin_historical_matches'
const SUMMARY_COLUMNS = 'slug,season_start,title,beat_count,spread_count,carded_count,updated_at,updated_by'

export class BookStoreError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

function missingTable(message: string, table: string): boolean {
  return message.includes(table) && /does not exist|schema cache|not find/i.test(message)
}

function fail(message: string, table = TABLE): never {
  if (missingTable(message, table)) {
    throw new BookStoreError(table === TABLE
      ? 'Season-book storage is unavailable. Apply the admin_season_books migration (supabase/footshorts) first.'
      : 'Match data is unavailable. Apply the admin_historical_matches migration and run history:import first.', 503)
  }
  throw new BookStoreError(message, 500)
}

interface BookRow {
  slug: string
  season_start: number
  title: string
  plan: unknown
  revision: number
  updated_at: string
  updated_by: string | null
}

function toBook(row: BookRow): SeasonBook {
  const parsed = planSchema.safeParse(row.plan)
  return {
    slug: row.slug,
    seasonStart: row.season_start,
    title: row.title,
    // A plan written by an older planner that no longer validates still opens:
    // the editor shows what parses and the next save writes it back clean.
    plan: parsed.success ? parsed.data : { beats: [], spreads: [] },
    revision: row.revision,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

export async function listSeasonBooks(): Promise<SeasonBookSummary[]> {
  const { data, error } = await createServiceClient().from(TABLE).select(SUMMARY_COLUMNS).order('season_start', { ascending: true })
  if (error) fail(error.message)
  return (data ?? []).map(r => ({
    slug: r.slug,
    seasonStart: r.season_start,
    title: r.title,
    beatCount: r.beat_count,
    spreadCount: r.spread_count,
    cardedCount: r.carded_count,
    updatedAt: r.updated_at,
    updatedBy: r.updated_by,
  }))
}

export async function getSeasonBook(slug: string): Promise<SeasonBook | null> {
  const { data, error } = await createServiceClient().from(TABLE)
    .select('slug,season_start,title,plan,revision,updated_at,updated_by').eq('slug', slug).maybeSingle()
  if (error) fail(error.message)
  return data ? toBook(data as BookRow) : null
}

export async function createSeasonBook(seasonStart: number, title: string | undefined, by: string | null): Promise<SeasonBook> {
  const plan = starterPlan()
  const { data, error } = await createServiceClient().from(TABLE).insert({
    slug: seasonSlug(seasonStart),
    season_start: seasonStart,
    title: title?.trim() || `The ${seasonLabel(seasonStart)} season`,
    plan,
    ...counts(plan),
    updated_by: by,
  }).select('slug,season_start,title,plan,revision,updated_at,updated_by').single()
  if (error) {
    if (error.code === '23505') throw new BookStoreError(`There is already a book for ${seasonLabel(seasonStart)}.`, 409)
    fail(error.message)
  }
  return toBook(data as BookRow)
}

function counts(plan: Plan) {
  const s = planSummary(plan)
  return { beat_count: s.beatCount, spread_count: s.spreadCount, carded_count: s.cardedCount }
}

/**
 * Save the plan (and title) if nobody has saved since `revision`. On a
 * conflict the caller gets 409 and reloads; nothing is merged silently.
 */
export async function saveSeasonBook(slug: string, revision: number, patch: { plan: Plan; title: string }, by: string | null): Promise<SeasonBook> {
  const { data, error } = await createServiceClient().from(TABLE).update({
    plan: patch.plan,
    title: patch.title,
    ...counts(patch.plan),
    revision: revision + 1,
    updated_at: new Date().toISOString(),
    updated_by: by,
  }).eq('slug', slug).eq('revision', revision).select('slug,season_start,title,plan,revision,updated_at,updated_by').maybeSingle()
  if (error) fail(error.message)
  if (!data) {
    const current = await getSeasonBook(slug)
    if (!current) throw new BookStoreError('Book not found', 404)
    throw new BookStoreError(`Someone saved this book since you opened it (${current.updatedBy ?? 'unknown'}, revision ${current.revision}). Reload to get their changes.`, 409)
  }
  return toBook(data as BookRow)
}

export async function deleteSeasonBook(slug: string): Promise<void> {
  const { error } = await createServiceClient().from(TABLE).delete().eq('slug', slug)
  if (error) fail(error.message)
}

/** One competition-season's matches, compact, for the planner to compute on. */
export async function listSeasonMatches(seasonStart: number, competition: string): Promise<MatchRow[]> {
  const sb = createServiceClient()
  const rows: MatchRow[] = []
  for (let offset = 0; offset < 4000; offset += 1000) {
    const { data, error } = await sb.from(MATCHES)
      .select('match_date,stage,home_team,away_team,home_score,away_score')
      .eq('season_start', seasonStart).eq('competition', competition)
      .not('home_score', 'is', null).not('away_score', 'is', null)
      .order('match_date', { ascending: true }).order('id', { ascending: true })
      .range(offset, offset + 999)
    if (error) fail(error.message, MATCHES)
    for (const r of data ?? []) rows.push({ d: r.match_date, s: r.stage, h: r.home_team, a: r.away_team, hg: r.home_score, ag: r.away_score })
    if ((data?.length ?? 0) < 1000) return rows
  }
  return rows
}
