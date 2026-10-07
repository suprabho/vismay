/**
 * Server-side reads and writes for the randomizer: the spin log
 * (randomizer_spins) and the Desk's live heat (desk_heat), migration 088,
 * and the Football Desk's news snapshot (loadFootshortsNews), read from the
 * footshorts tables in the same Supabase project.
 *
 * A spin is created only here, and only by an authenticated caller (admin's
 * session-gated routes, or the token-gated routes on vizmaya-fyi that the MCP
 * server and agents call), so the log the repeat blocks read can't be filled
 * by anyone with the public brief URL.
 *
 * Lifecycle: spun → (re-spin: rejected) → researching (research saved, no
 * hero insight yet) → insight_review (hero insight written, gated
 * randomizers) → approved (a human approved it; ungated Desk spins skip
 * straight here) → published (a story tied to the spin went public).
 *
 * Server only: imports the service Supabase client.
 */

import { createServiceClient } from '@vismay/content-source/supabase'
import { DESK, FOOTSHORTS } from './datasets'
import { draw } from './draw'
import { randomSeed, seedHex } from './rng'
import { extractHeroInsight } from './stub'
import {
  RANDOMIZER_META,
  type DeskHeadline,
  type DeskHeatRow,
  type FootshortsCompetitionNews,
  type FootshortsFixtureRef,
  type FootshortsHeadline,
  type FootshortsNews,
  type FootshortsTeamNews,
  type RandomizerId,
  type SpinHistoryEntry,
  type SpinRecord,
  type SpinStatus,
} from './types'

const DAY = 864e5
const MIGRATION_HINT = 'The randomizer needs migration 088_randomizer.sql applied'

/** A failure with the HTTP status the routes should answer with. */
export class SpinError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

export function hasRandomizerEnv(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

function check(error: { code?: string; message: string } | null): void {
  if (!error) return
  if (error.code === '42P01' || error.code === 'PGRST205') throw new SpinError(MIGRATION_HINT, 503)
  if (error.code === '23514' && /randomizer_check/.test(error.message)) {
    throw new SpinError('Football Desk spins need migration 090_randomizer_footshorts.sql applied', 503)
  }
  throw new SpinError(error.message, 500)
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isSpinId(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}

function mapSpin(r: any): SpinRecord {
  return {
    id: r.id,
    randomizer: r.randomizer,
    status: r.status,
    seed: r.seed,
    reels: r.reels ?? {},
    picks: r.picks,
    subject: r.subject,
    primary: r.primary_value,
    combo: r.combo,
    summary: r.summary,
    rules: r.rules ?? [],
    meta: r.meta ?? {},
    options: { locks: [], ...(r.options ?? {}) },
    rejectedReason: r.rejected_reason ?? null,
    respinOf: r.respin_of ?? null,
    researchMd: r.research_md ?? null,
    heroInsight: r.hero_insight ?? null,
    reviewNote: r.review_note ?? null,
    storySlug: r.story_slug ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function getSpin(id: string): Promise<SpinRecord | null> {
  if (!isSpinId(id)) return null
  const { data, error } = await createServiceClient().from('randomizer_spins').select('*').eq('id', id).maybeSingle()
  check(error)
  return data ? mapSpin(data) : null
}

export async function listSpins({
  randomizer,
  randomizers,
  limit = 50,
}: { randomizer?: RandomizerId; randomizers?: RandomizerId[]; limit?: number } = {}): Promise<SpinRecord[]> {
  let q = createServiceClient()
    .from('randomizer_spins')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200))
  if (randomizer) q = q.eq('randomizer', randomizer)
  else if (randomizers?.length) q = q.in('randomizer', randomizers)
  const { data, error } = await q
  check(error)
  return (data ?? []).map(mapSpin)
}

async function history(randomizer: RandomizerId, excludeId?: string): Promise<SpinHistoryEntry[]> {
  const since = new Date(Date.now() - 91 * DAY).toISOString()
  const { data, error } = await createServiceClient()
    .from('randomizer_spins')
    .select('id, status, primary_value, combo, meta, picks, created_at')
    .eq('randomizer', randomizer)
    .neq('status', 'rejected')
    .gte('created_at', since)
    .order('created_at', { ascending: true })
  check(error)
  return (data ?? [])
    .filter((r: any) => r.id !== excludeId)
    .map((r: any) => ({
      id: r.id,
      status: r.status,
      primary: r.primary_value,
      combo: r.combo,
      meta: r.meta ?? {},
      picks: r.picks,
      createdAt: r.created_at,
    }))
}

export interface CreateSpinInput {
  randomizer: RandomizerId
  /** The spin on screen: locks keep its values, and a re-spin rejects it. */
  from?: string | null
  locks?: string[]
  /** Reject `from` and draw again. */
  respin?: boolean
  /** Why `from` was rejected (decision D6). */
  reason?: string | null
  pair?: boolean
  sequence?: boolean
  /** 'admin', 'mcp', 'api'. */
  createdBy: string
  /** Replay a seed instead of drawing a fresh one. */
  seed?: number
}

export async function createSpin(input: CreateSpinInput): Promise<SpinRecord> {
  const db = createServiceClient()
  let prev: SpinRecord | null = null
  if (input.from) {
    prev = await getSpin(input.from)
    if (!prev) throw new SpinError(`no spin ${input.from}`, 404)
    if (prev.randomizer !== input.randomizer) throw new SpinError(`spin ${prev.id} is a ${prev.randomizer} spin`, 400)
  }
  if (input.respin) {
    if (!prev) throw new SpinError('a re-spin needs the spin it replaces (from)', 400)
    if (prev.status === 'rejected') throw new SpinError(`spin ${prev.id} was already rejected`, 409)
    if (prev.status === 'published') throw new SpinError(`spin ${prev.id} already shipped a story; spin a new one instead`, 409)
  }

  const seed = input.seed ?? randomSeed()
  const [past, heat, news] = await Promise.all([
    // The spin being re-spun is about to be rejected: it must not block its own replacement.
    history(input.randomizer, input.respin ? prev?.id : undefined),
    input.randomizer === 'desk' ? listDeskHeat() : Promise.resolve([] as DeskHeatRow[]),
    input.randomizer === 'footshorts' ? loadFootshortsNews() : Promise.resolve(null),
  ])
  const reason = input.reason?.trim().slice(0, 200) || null
  let result: ReturnType<typeof draw>
  try {
    result = draw({
      randomizer: input.randomizer,
      seed,
      history: past,
      prev,
      locks: input.locks,
      pair: input.pair,
      sequence: input.sequence,
      heat,
      news,
    })
  } catch (e) {
    // The draw only throws when there is nothing to draw from (an empty footshorts snapshot).
    throw new SpinError(e instanceof Error ? e.message : String(e), 503)
  }
  if (input.respin && prev) {
    result.rules.unshift({
      tag: 're-spin',
      kind: 'block',
      text: `Previous result (${prev.summary}) logged as rejected${reason ? `: ${reason}` : ''}.`,
    })
  }

  const { data, error } = await db
    .from('randomizer_spins')
    .insert({
      randomizer: input.randomizer,
      seed: seedHex(seed),
      reels: result.reels,
      picks: result.picks,
      subject: result.subject,
      primary_value: result.primary,
      combo: result.combo,
      summary: result.summary,
      rules: result.rules,
      meta: result.meta,
      options: { locks: input.locks ?? [], pair: !!input.pair, sequence: !!input.sequence },
      respin_of: input.respin ? prev!.id : null,
      created_by: input.createdBy,
    })
    .select('*')
    .single()
  check(error)

  if (input.respin && prev) {
    const { error: rejectError } = await db
      .from('randomizer_spins')
      .update({ status: 'rejected', rejected_reason: reason, updated_at: new Date().toISOString() })
      .eq('id', prev.id)
    check(rejectError)
  }
  return mapSpin(data)
}

/** Whether a story tied to this spin may go public: gated randomizers wait for an approved hero insight. */
export function spinAllowsPublish(spin: Pick<SpinRecord, 'randomizer' | 'status'>): boolean {
  return !RANDOMIZER_META[spin.randomizer].gated || spin.status === 'approved' || spin.status === 'published'
}

async function update(id: string, patch: Record<string, unknown>): Promise<SpinRecord> {
  const { data, error } = await createServiceClient()
    .from('randomizer_spins')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single()
  check(error)
  return mapSpin(data)
}

async function requireSpin(id: string): Promise<SpinRecord> {
  const spin = await getSpin(id)
  if (!spin) throw new SpinError(`no spin ${id}`, 404)
  return spin
}

/**
 * Save the research file. The status follows the HERO INSIGHT section: none
 * yet is `researching`; one is `insight_review` for gated randomizers (or
 * stays `approved` when the approved sentence is unchanged) and `approved`
 * for the Desk.
 */
export async function saveSpinResearch(id: string, markdown: string): Promise<SpinRecord> {
  const spin = await requireSpin(id)
  if (spin.status === 'rejected') throw new SpinError(`spin ${id} was rejected; research a live spin`, 409)
  if (markdown.length > 400_000) throw new SpinError('research file is over 400 KB', 413)
  const hero = extractHeroInsight(markdown)
  let status: SpinStatus
  if (spin.status === 'published') status = 'published'
  else if (!hero) status = 'researching'
  else if (!RANDOMIZER_META[spin.randomizer].gated) status = 'approved'
  else status = spin.status === 'approved' && spin.heroInsight === hero ? 'approved' : 'insight_review'
  return update(id, { research_md: markdown, hero_insight: hero, status })
}

/** The human gate on the hero insight (decision D4). */
export async function reviewSpin(
  id: string,
  { action, note, by }: { action: 'approve' | 'send_back'; note?: string | null; by?: string | null },
): Promise<SpinRecord> {
  const spin = await requireSpin(id)
  if (spin.status === 'rejected' || spin.status === 'published') {
    throw new SpinError(`spin ${id} is ${spin.status}; nothing to review`, 409)
  }
  if (action === 'approve') {
    if (!spin.heroInsight) throw new SpinError('there is no hero insight to approve yet', 409)
    return update(id, { status: 'approved', review_note: note?.trim() || null, reviewed_by: by ?? null })
  }
  if (!note?.trim()) throw new SpinError('say what to fix when sending an insight back', 400)
  return update(id, { status: 'researching', review_note: note.trim(), reviewed_by: by ?? null })
}

/** Record the story a spin shipped (the publish API calls this). */
export async function linkSpinStory(id: string, slug: string, published: boolean): Promise<SpinRecord> {
  const spin = await requireSpin(id)
  const status: SpinStatus = published && spinAllowsPublish(spin) ? 'published' : spin.status
  return update(id, { story_slug: slug, status })
}

/* ---------- Desk heat ---------- */

function mapHeat(r: any): DeskHeatRow {
  return {
    subId: r.sub_id,
    heat: r.heat,
    heatUpdated: r.heat_updated ?? null,
    topHeadlines: Array.isArray(r.top_headlines) ? r.top_headlines : [],
    refreshStatus: r.refresh_status === 'failed' ? 'failed' : 'ok',
    refreshError: r.refresh_error ?? null,
    refreshedBy: r.refreshed_by ?? null,
  }
}

export async function listDeskHeat(): Promise<DeskHeatRow[]> {
  const { data, error } = await createServiceClient().from('desk_heat').select('*')
  check(error)
  return (data ?? []).map(mapHeat)
}

export interface HeatRefresh {
  subId: string
  heat: number
  topHeadlines?: DeskHeadline[]
}

export interface HeatFailure {
  subId: string
  error: string
}

function knownSub(subId: string): boolean {
  return DESK.sub_industries.some((s) => s.id === subId)
}

function cleanHeadlines(list: DeskHeadline[] | undefined): DeskHeadline[] {
  return (list ?? [])
    .filter((h) => h && typeof h.title === 'string' && typeof h.url === 'string' && /^\d{4}-\d{2}-\d{2}/.test(String(h.date)))
    .map((h) => ({ title: h.title.trim().slice(0, 300), url: h.url.trim(), date: String(h.date).slice(0, 10) }))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)
}

/**
 * Write a heat refresh: successes get a new heat, headlines and timestamp;
 * failures are recorded (keeping the last good heat) so the admin shows them
 * and the draw turns those spins Evergreen.
 */
export async function refreshDeskHeat(
  { refreshed = [], failed = [] }: { refreshed?: HeatRefresh[]; failed?: HeatFailure[] },
  by: string,
): Promise<DeskHeatRow[]> {
  const unknown = [...refreshed, ...failed].map((r) => r.subId).filter((id) => !knownSub(id))
  if (unknown.length) throw new SpinError(`unknown sub-industry: ${unknown.join(', ')}`, 400)
  const now = new Date().toISOString()
  const db = createServiceClient()
  const existing = new Map((await listDeskHeat()).map((h) => [h.subId, h]))

  const rows = [
    ...refreshed.map((r) => ({
      sub_id: r.subId,
      heat: Math.round(Math.min(100, Math.max(0, r.heat))),
      heat_updated: now,
      top_headlines: cleanHeadlines(r.topHeadlines),
      refresh_status: 'ok',
      refresh_error: null,
      refreshed_by: by,
      updated_at: now,
    })),
    ...failed.map((f) => {
      const prev = existing.get(f.subId)
      const seed = DESK.sub_industries.find((s) => s.id === f.subId)!
      return {
        sub_id: f.subId,
        heat: prev?.heat ?? seed.heat,
        heat_updated: prev?.heatUpdated ?? null,
        top_headlines: prev?.topHeadlines ?? [],
        refresh_status: 'failed',
        refresh_error: f.error.slice(0, 300),
        refreshed_by: by,
        updated_at: now,
      }
    }),
  ]
  if (!rows.length) return [...existing.values()]
  const { error } = await db.from('desk_heat').upsert(rows, { onConflict: 'sub_id' })
  check(error)
  return listDeskHeat()
}

/* ---------- Footshorts news ---------- */

/** The tunable windows behind the Football Desk's news snapshot. */
export const FOOTSHORTS_NEWS_RULES = {
  /** Heat counts the tagged stories in this many days. */
  newsWindowDays: 14,
  /** A team is in a tournament's draw when it has a fixture in it this far back… */
  fixtureLookbackDays: 60,
  /** …or this far ahead. */
  fixtureLookaheadDays: 30,
  /** Pages of 1000 rows read at most, per table. */
  maxPages: 10,
} as const

const UPCOMING = new Set(['SCHEDULED', 'TIMED', 'IN_PLAY', 'PAUSED', 'LIVE'])

async function readPages<T>(
  read: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { code?: string; message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let page = 0; page < FOOTSHORTS_NEWS_RULES.maxPages; page++) {
    const { data, error } = await read(page * 1000, page * 1000 + 999)
    check(error)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/** 0 to 100 on a log scale, relative to the busiest. */
function heatScale(score: number, max: number): number {
  return max > 0 ? Math.round((100 * Math.log1p(score)) / Math.log1p(max)) : 0
}

interface FixtureRow {
  id: string
  competition_slug: string
  kickoff_at: string
  status: string
  home_team_id: string | null
  away_team_id: string | null
  home_team_name: string | null
  away_team_name: string | null
  home_score: number | null
  away_score: number | null
}

interface ArticleRow {
  id: string
  headline: string
  url: string
  publisher: string
  published_at: string
  article_entities: Array<{ entity_id: string; confidence: number | null }> | null
}

/**
 * The live news the Football Desk draws from: every team with a fixture in a
 * covered tournament in the window, with the stories tagged to it in the
 * news window (heat, count, newest headlines) and its recent and next
 * fixtures; and per tournament, the stories tagged to it or its teams.
 * Read from the footshorts feed (articles, article_entities), so unlike the
 * Desk's heat it needs no refresh job and is never stale.
 */
export async function loadFootshortsNews(now: Date = new Date()): Promise<FootshortsNews> {
  const db = createServiceClient()
  const t = now.getTime()
  const slugs = FOOTSHORTS.competitions.map((c) => c.slug)
  const fixtureFrom = new Date(t - FOOTSHORTS_NEWS_RULES.fixtureLookbackDays * DAY).toISOString()
  const fixtureTo = new Date(t + FOOTSHORTS_NEWS_RULES.fixtureLookaheadDays * DAY).toISOString()
  const newsSince = new Date(t - FOOTSHORTS_NEWS_RULES.newsWindowDays * DAY).toISOString()

  const [fixtures, articles] = await Promise.all([
    readPages<FixtureRow>((a, b) =>
      db
        .from('fixtures')
        .select('id, competition_slug, kickoff_at, status, home_team_id, away_team_id, home_team_name, away_team_name, home_score, away_score')
        .in('competition_slug', slugs)
        .gte('kickoff_at', fixtureFrom)
        .lte('kickoff_at', fixtureTo)
        .order('kickoff_at', { ascending: true })
        .order('id', { ascending: true })
        .range(a, b),
    ),
    readPages<ArticleRow>((a, b) =>
      db
        .from('articles')
        .select('id, headline, url, publisher, published_at, article_entities(entity_id, confidence)')
        .eq('status', 'summarized')
        .or('is_cluster_lead.eq.true,cluster_id.is.null')
        .gte('published_at', newsSince)
        .order('published_at', { ascending: false })
        .order('id', { ascending: true })
        .range(a, b),
    ),
  ])

  // The teams: entity rows for every side with a fixture in the window.
  const teamIds = Array.from(new Set(fixtures.flatMap((f) => [f.home_team_id, f.away_team_id]).filter((id): id is string => !!id)))
  const entityRows: Array<{ id: string; slug: string; name: string; country: string | null; crest_url: string | null }> = []
  for (const ids of chunks(teamIds, 150)) {
    const { data, error } = await db.from('entities').select('id, slug, name, country, crest_url').eq('type', 'team').in('id', ids)
    check(error)
    entityRows.push(...((data ?? []) as typeof entityRows))
  }
  const entityById = new Map(entityRows.map((e) => [e.id, e]))
  const { data: leagueRows, error: leagueError } = await db
    .from('entities')
    .select('id, slug')
    .eq('type', 'league')
    .in('slug', FOOTSHORTS.competitions.flatMap((c) => c.entity_slugs))
  check(leagueError)
  const leagueIdsFor = (entitySlugs: string[]) =>
    new Set(((leagueRows ?? []) as Array<{ id: string; slug: string }>).filter((l) => entitySlugs.includes(l.slug)).map((l) => l.id))

  // News per entity: a confidence-weighted score, the story count and the newest headlines.
  const score = new Map<string, number>()
  const count = new Map<string, number>()
  const headlines = new Map<string, FootshortsHeadline[]>()
  const headline = (a: ArticleRow): FootshortsHeadline => ({
    title: a.headline.trim().slice(0, 300),
    url: a.url,
    publisher: a.publisher,
    date: a.published_at.slice(0, 10),
  })
  for (const a of articles) {
    for (const ae of a.article_entities ?? []) {
      const c = Math.min(1, Math.max(0, ae.confidence ?? 1))
      score.set(ae.entity_id, (score.get(ae.entity_id) ?? 0) + c)
      count.set(ae.entity_id, (count.get(ae.entity_id) ?? 0) + 1)
      const list = headlines.get(ae.entity_id) ?? []
      if (list.length < 3) headlines.set(ae.entity_id, [...list, headline(a)])
    }
  }

  // Fixtures per team, and which tournaments each team is in.
  const ref = (f: FixtureRow): FootshortsFixtureRef => ({
    id: f.id,
    competition: f.competition_slug,
    kickoff: f.kickoff_at,
    status: f.status,
    homeId: f.home_team_id,
    awayId: f.away_team_id,
    home: (f.home_team_id && entityById.get(f.home_team_id)?.name) || f.home_team_name || 'TBD',
    away: (f.away_team_id && entityById.get(f.away_team_id)?.name) || f.away_team_name || 'TBD',
    homeScore: f.home_score,
    awayScore: f.away_score,
  })
  const byTeam = new Map<string, FixtureRow[]>()
  for (const f of fixtures) {
    for (const id of [f.home_team_id, f.away_team_id]) {
      if (id && entityById.has(id)) byTeam.set(id, [...(byTeam.get(id) ?? []), f])
    }
  }
  const maxTeam = Math.max(0, ...[...byTeam.keys()].map((id) => score.get(id) ?? 0))
  const teams: FootshortsTeamNews[] = [...byTeam.entries()]
    .map(([id, list]) => {
      const e = entityById.get(id)!
      return {
        id,
        slug: e.slug,
        name: e.name,
        country: e.country,
        crestUrl: e.crest_url,
        competitions: slugs.filter((s) => list.some((f) => f.competition_slug === s)),
        heat: heatScale(score.get(id) ?? 0, maxTeam),
        articles: count.get(id) ?? 0,
        headlines: headlines.get(id) ?? [],
        recent: list
          .filter((f) => f.status === 'FINISHED')
          .sort((a, b) => b.kickoff_at.localeCompare(a.kickoff_at))
          .slice(0, 3)
          .map(ref),
        upcoming: list
          .filter((f) => UPCOMING.has(f.status) && Date.parse(f.kickoff_at) >= t - 3 * 3600e3)
          .sort((a, b) => a.kickoff_at.localeCompare(b.kickoff_at))
          .slice(0, 2)
          .map(ref),
      }
    })
    .sort((a, b) => a.slug.localeCompare(b.slug))

  // Tournaments: the stories tagged to the league entity or any of its teams.
  const compScores = FOOTSHORTS.competitions.map((c) => {
    const members = new Set([...leagueIdsFor(c.entity_slugs), ...teams.filter((tm) => tm.competitions.includes(c.slug)).map((tm) => tm.id)])
    let total = 0
    let n = 0
    const top: FootshortsHeadline[] = []
    for (const a of articles) {
      const hits = (a.article_entities ?? []).filter((ae) => members.has(ae.entity_id))
      if (!hits.length) continue
      total += Math.max(...hits.map((ae) => Math.min(1, Math.max(0, ae.confidence ?? 1))))
      n++
      if (top.length < 3) top.push(headline(a))
    }
    return { slug: c.slug, total, n, top, teams: teams.filter((tm) => tm.competitions.includes(c.slug)).length }
  })
  const maxComp = Math.max(0, ...compScores.map((c) => c.total))
  const competitions: FootshortsCompetitionNews[] = compScores.map((c) => ({
    slug: c.slug,
    heat: heatScale(c.total, maxComp),
    articles: c.n,
    headlines: c.top,
    teams: c.teams,
  }))

  return { asOf: now.toISOString(), windowDays: FOOTSHORTS_NEWS_RULES.newsWindowDays, competitions, teams }
}
