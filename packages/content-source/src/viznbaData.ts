/**
 * VizNBA ingest-pipeline health for the admin Pipeline tab (/viznba/pipeline):
 * the viznba_ tables the news worker writes (apps/viznba/worker,
 * supabase/viznba/migrations/001_init.sql) read back as counts by status,
 * freshness, what the app's Feed can see, per-source quality, topics, the
 * worker's failure reasons, tagging coverage and the most-tagged teams and
 * people.
 *
 * Status counts are exact `count` queries; the breakdowns scan the last
 * STATS_WINDOW_DAYS days of rows, paged past PostgREST's max_rows.
 * SERVER-ONLY (service-role client).
 */

import { createServiceClient } from './supabase'

/** Days of history behind the breakdowns. */
const STATS_WINDOW_DAYS = 14
const PAGE_SIZE = 1000
/** Hard stop on paging, so a runaway table can't hang the admin request. */
const MAX_PAGES = 30
const DAY = 864e5

type ServiceClient = ReturnType<typeof createServiceClient>

export interface ViznbaSourceStat {
  source: string
  publisher: string
  total: number
  summarized: number
  hidden: number
  failed: number
  pending: number
  withImage: number
  /** Summarized rows with at least one entity tag. */
  withTags: number
}

export interface ViznbaTopicStat {
  /** viznba_articles.topic_category; null when the classifier never ran. */
  topic: string | null
  count: number
  /** NBA topics reach the feed; the rest are hidden by design. */
  nba: boolean
}

export interface ViznbaTopEntity {
  type: 'team' | 'player' | 'coach'
  id: string
  name: string
  /** Team abbreviation, or the player's / coach's team. */
  team: string | null
  imageUrl: string | null
  articles: number
  /** Mean tag confidence from the Jev gate. */
  confidence: number
}

export interface ViznbaPipelineStats {
  articles: { total: number; summarized: number; failed: number; pending: number; hidden: number }
  window: { days: number; articles: number }
  /** What the app's Feed shows: the newest summarized rows. */
  feed: {
    latestPublishedAt: string | null
    minutesSinceLatest: number | null
    last24h: { ingested: number; summarized: number; failed: number; pending: number; hidden: number }
  }
  freshness: { latestIngestedAt: string | null; minutesSinceLatest: number | null }
  roster: { teams: number; activePlayers: number; coaches: number; latestSeededAt: string | null; minutesSinceSeed: number | null }
  /** Of the window's summarized rows: how many carry tags, and of which kind. */
  tagging: { summarized: number; tagged: number; tags: { team: number; player: number; coach: number } }
  bySource: ViznbaSourceStat[]
  byTopic: ViznbaTopicStat[]
  byDay: Array<{ day: string; ingested: number; summarized: number }>
  /** The worker's failure_reason values in the window, most common first. */
  failures: Array<{ reason: string; count: number }>
  topTeams: ViznbaTopEntity[]
  topPeople: ViznbaTopEntity[]
}

/** The topics the worker sends to Claude (apps/viznba/worker/src/summarise.ts); the rest are hidden. */
export const VIZNBA_NBA_TOPICS = ['game', 'transaction', 'injury', 'draft', 'front_office', 'league', 'analysis', 'off_court'] as const

interface CountFilter {
  status?: string
  ingestedSince?: string
}

async function countArticles(db: ServiceClient, f: CountFilter): Promise<number> {
  let q = db.from('viznba_articles').select('id', { count: 'exact', head: true })
  if (f.status) q = q.eq('status', f.status)
  if (f.ingestedSince) q = q.gte('ingested_at', f.ingestedSince)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

async function countRows(db: ServiceClient, table: string, filter?: (q: any) => any): Promise<number> {
  let q = db.from(table).select('*', { count: 'exact', head: true })
  if (filter) q = filter(q)
  const { count, error } = await q
  if (error) throw error
  return count ?? 0
}

interface ArticleRow {
  id: string
  source_id: string
  publisher: string
  status: string
  topic_category: string | null
  failure_reason: string | null
  image_url: string | null
  ingested_at: string
  viznba_article_entities: Array<{ entity_type: 'team' | 'player' | 'coach'; entity_id: string; confidence: number | null }> | null
}

async function fetchWindow(db: ServiceClient, sinceIso: string): Promise<ArticleRow[]> {
  const rows: ArticleRow[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await db
      .from('viznba_articles')
      .select('id, source_id, publisher, status, topic_category, failure_reason, image_url, ingested_at, viznba_article_entities(entity_type, entity_id, confidence)')
      .gte('ingested_at', sinceIso)
      .order('ingested_at', { ascending: false })
      .order('id', { ascending: true })
      .range(rows.length, rows.length + PAGE_SIZE - 1)
    if (error) throw error
    const batch = (data ?? []) as ArticleRow[]
    if (batch.length === 0) break
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) break
  }
  return rows
}

function minutesSince(iso: string | null, now: number): number | null {
  return iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000)) : null
}

/** Strip ids, URLs and numbers so the same failure groups together. */
function failureKey(reason: string): string {
  return reason
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{27,}\b/gi, '<id>')
    .replace(/\d+/g, 'N')
    .slice(0, 160)
}

export async function fetchViznbaPipelineStats(): Promise<ViznbaPipelineStats> {
  const db = createServiceClient()
  const now = Date.now()
  const daySince = new Date(now - DAY).toISOString()
  const windowSince = new Date(now - STATS_WINDOW_DAYS * DAY).toISOString()

  const [
    total,
    summarized,
    failed,
    pending,
    hidden,
    d1Ingested,
    d1Summarized,
    d1Failed,
    d1Pending,
    d1Hidden,
    latestIngest,
    latestPublished,
    teamCount,
    playerCount,
    coachCount,
    latestSeed,
    rows,
  ] = await Promise.all([
    countArticles(db, {}),
    countArticles(db, { status: 'summarized' }),
    countArticles(db, { status: 'failed' }),
    countArticles(db, { status: 'pending' }),
    countArticles(db, { status: 'hidden' }),
    countArticles(db, { ingestedSince: daySince }),
    countArticles(db, { status: 'summarized', ingestedSince: daySince }),
    countArticles(db, { status: 'failed', ingestedSince: daySince }),
    countArticles(db, { status: 'pending', ingestedSince: daySince }),
    countArticles(db, { status: 'hidden', ingestedSince: daySince }),
    db.from('viznba_articles').select('ingested_at').order('ingested_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('viznba_articles').select('published_at').eq('status', 'summarized').order('published_at', { ascending: false }).limit(1).maybeSingle(),
    countRows(db, 'viznba_teams'),
    countRows(db, 'viznba_players', (q) => q.eq('active', true)),
    countRows(db, 'viznba_coaches', (q) => q.eq('active', true)),
    db.from('viznba_players').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    fetchWindow(db, windowSince),
  ])
  if (latestIngest.error) throw latestIngest.error
  if (latestPublished.error) throw latestPublished.error
  if (latestSeed.error) throw latestSeed.error

  const latestIngestedAt = (latestIngest.data as { ingested_at: string } | null)?.ingested_at ?? null
  const latestPublishedAt = (latestPublished.data as { published_at: string } | null)?.published_at ?? null
  const latestSeededAt = (latestSeed.data as { updated_at: string } | null)?.updated_at ?? null

  // Sources, topics, days, failures, tagging.
  const sources = new Map<string, ViznbaSourceStat>()
  const topics = new Map<string | null, number>()
  const days = new Map<string, { ingested: number; summarized: number }>()
  const failures = new Map<string, number>()
  const tags = { team: 0, player: 0, coach: 0 }
  let windowSummarized = 0
  let tagged = 0
  const entityHits = new Map<string, { type: ViznbaTopEntity['type']; id: string; n: number; conf: number }>()
  for (const r of rows) {
    const s = sources.get(r.source_id) ?? {
      source: r.source_id,
      publisher: r.publisher,
      total: 0,
      summarized: 0,
      hidden: 0,
      failed: 0,
      pending: 0,
      withImage: 0,
      withTags: 0,
    }
    s.total++
    if (r.status === 'summarized') s.summarized++
    else if (r.status === 'hidden') s.hidden++
    else if (r.status === 'failed') s.failed++
    else if (r.status === 'pending') s.pending++
    if (r.image_url) s.withImage++
    const ents = r.viznba_article_entities ?? []
    if (r.status === 'summarized') {
      windowSummarized++
      if (ents.length) {
        tagged++
        s.withTags++
      }
      for (const e of ents) {
        tags[e.entity_type]++
        const key = `${e.entity_type}:${e.entity_id}`
        const hit = entityHits.get(key) ?? { type: e.entity_type, id: e.entity_id, n: 0, conf: 0 }
        hit.n++
        hit.conf += e.confidence ?? 1
        entityHits.set(key, hit)
      }
    }
    sources.set(r.source_id, s)
    if (r.status !== 'pending' && r.status !== 'failed') topics.set(r.topic_category, (topics.get(r.topic_category) ?? 0) + 1)
    const day = r.ingested_at.slice(0, 10)
    const d = days.get(day) ?? { ingested: 0, summarized: 0 }
    d.ingested++
    if (r.status === 'summarized') d.summarized++
    days.set(day, d)
    if (r.status === 'failed' && r.failure_reason) {
      const k = failureKey(r.failure_reason)
      failures.set(k, (failures.get(k) ?? 0) + 1)
    }
  }

  const byDay: ViznbaPipelineStats['byDay'] = []
  for (let i = STATS_WINDOW_DAYS - 1; i >= 0; i--) {
    const k = new Date(now - i * DAY).toISOString().slice(0, 10)
    byDay.push({ day: k, ...(days.get(k) ?? { ingested: 0, summarized: 0 }) })
  }

  // Names for the most-tagged entities.
  const top = (type: ViznbaTopEntity['type'] | 'people', n: number) =>
    [...entityHits.values()]
      .filter((h) => (type === 'people' ? h.type !== 'team' : h.type === type))
      .sort((a, b) => b.n - a.n || a.id.localeCompare(b.id))
      .slice(0, n)
  const topTeamHits = top('team', 10)
  const topPeopleHits = top('people', 12)
  const playerIds = topPeopleHits.filter((h) => h.type === 'player').map((h) => h.id)
  const coachIds = topPeopleHits.filter((h) => h.type === 'coach').map((h) => h.id)
  const [teamsR, playersR, coachesR] = await Promise.all([
    db.from('viznba_teams').select('team_id, abbreviation, display_name, logo_url'),
    playerIds.length
      ? db.from('viznba_players').select('player_id, display_name, team_id, headshot_url').in('player_id', playerIds)
      : Promise.resolve({ data: [], error: null }),
    coachIds.length
      ? db.from('viznba_coaches').select('coach_id, display_name, team_id').in('coach_id', coachIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (teamsR.error) throw teamsR.error
  if (playersR.error) throw playersR.error
  if (coachesR.error) throw coachesR.error
  const teams = new Map(
    ((teamsR.data ?? []) as Array<{ team_id: string; abbreviation: string; display_name: string; logo_url: string | null }>).map((t) => [t.team_id, t]),
  )
  const players = new Map(
    ((playersR.data ?? []) as Array<{ player_id: string; display_name: string; team_id: string | null; headshot_url: string | null }>).map((p) => [p.player_id, p]),
  )
  const coaches = new Map(((coachesR.data ?? []) as Array<{ coach_id: string; display_name: string; team_id: string | null }>).map((c) => [c.coach_id, c]))
  const abbr = (teamId: string | null | undefined) => (teamId ? teams.get(teamId)?.abbreviation ?? teamId.toUpperCase() : null)
  const describe = (h: { type: ViznbaTopEntity['type']; id: string; n: number; conf: number }): ViznbaTopEntity => {
    const base = { type: h.type, id: h.id, articles: h.n, confidence: Math.round((h.conf / h.n) * 100) / 100 }
    if (h.type === 'team') {
      const t = teams.get(h.id)
      return { ...base, name: t?.display_name ?? h.id, team: t?.abbreviation ?? null, imageUrl: t?.logo_url ?? null }
    }
    if (h.type === 'player') {
      const p = players.get(h.id)
      return { ...base, name: p?.display_name ?? h.id, team: abbr(p?.team_id), imageUrl: p?.headshot_url ?? null }
    }
    const c = coaches.get(h.id)
    return { ...base, name: c?.display_name ?? h.id, team: abbr(c?.team_id), imageUrl: null }
  }

  return {
    articles: { total, summarized, failed, pending, hidden },
    window: { days: STATS_WINDOW_DAYS, articles: rows.length },
    feed: {
      latestPublishedAt,
      minutesSinceLatest: minutesSince(latestPublishedAt, now),
      last24h: { ingested: d1Ingested, summarized: d1Summarized, failed: d1Failed, pending: d1Pending, hidden: d1Hidden },
    },
    freshness: { latestIngestedAt, minutesSinceLatest: minutesSince(latestIngestedAt, now) },
    roster: {
      teams: teamCount,
      activePlayers: playerCount,
      coaches: coachCount,
      latestSeededAt: latestSeededAt,
      minutesSinceSeed: minutesSince(latestSeededAt, now),
    },
    tagging: { summarized: windowSummarized, tagged, tags },
    bySource: [...sources.values()].sort((a, b) => b.total - a.total),
    byTopic: [...topics.entries()]
      .map(([topic, count]) => ({ topic, count, nba: !!topic && (VIZNBA_NBA_TOPICS as readonly string[]).includes(topic) }))
      .sort((a, b) => Number(b.nba) - Number(a.nba) || b.count - a.count),
    byDay,
    failures: [...failures.entries()].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count).slice(0, 8),
    topTeams: topTeamHits.map(describe),
    topPeople: topPeopleHits.map(describe),
  }
}
