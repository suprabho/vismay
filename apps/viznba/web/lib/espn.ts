import 'server-only'
import { teamFromEspn, type Team } from './teams'
import { addDays, dayKey, ET, todayKey } from './time'
import { elapsed, type MarginPoint } from './margin'

/**
 * ESPN's public NBA site API — free, no key. The raw payloads are large and
 * loosely shaped, so everything is normalised into the small types below at
 * this boundary and the rest of the app never sees ESPN JSON.
 *
 *   scoreboard?dates=YYYYMMDD   every game on one US-Eastern day
 *   summary?event=ID            box score, play-by-play, predictor, recap
 *   news                        league headlines
 *   standings (apis/v2)         conference tables
 */

const SITE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'
const STANDINGS = 'https://site.api.espn.com/apis/v2/sports/basketball/nba/standings'

async function getJson<T>(url: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VizNBA/1.0)' },
      next: { revalidate },
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ types */

export type GameState = 'pre' | 'in' | 'post'

export type Side = {
  team: Team
  homeAway: 'home' | 'away'
  score: number | null
  record: string | null
  winner: boolean
  linescores: number[]
  /** Scoreboard team stats keyed by ESPN stat name (fieldGoalPct, rebounds…). */
  stats: Record<string, string>
}

export type Game = {
  id: string
  date: string
  state: GameState
  /** "Q3 4:12", "HALF", "FINAL", "FINAL/OT" — empty before tip-off. */
  status: string
  away: Side
  home: Side
  venue: string | null
  city: string | null
  /** "Preseason", "Play-In", "East 1st Round - Game 3" … when ESPN gives one. */
  note: string | null
}

type EspnStatus = {
  period?: number
  displayClock?: string
  type?: { name?: string; state?: string; completed?: boolean; shortDetail?: string }
}

type EspnCompetitor = {
  homeAway: 'home' | 'away'
  winner?: boolean
  score?: string | { value?: number; displayValue?: string }
  team: { id: string; abbreviation?: string; shortDisplayName?: string; name?: string }
  linescores?: Array<{ value?: number; displayValue?: string }>
  records?: Array<{ type?: string; summary?: string }>
  record?: Array<{ type?: string; summary?: string }> | string
  statistics?: Array<{ name: string; displayValue: string }>
}

type EspnEvent = {
  id: string
  date: string
  season?: { slug?: string; type?: number }
  status?: EspnStatus
  competitions: Array<{
    date?: string
    status?: EspnStatus
    competitors: EspnCompetitor[]
    venue?: { fullName?: string; address?: { city?: string } }
    notes?: Array<{ headline?: string }>
  }>
}

/* -------------------------------------------------------------- normalise */

function periodLabel(p: number): string {
  if (p <= 4) return `Q${p}`
  return p === 5 ? 'OT' : `${p - 4}OT`
}

function statusLabel(s: EspnStatus | undefined): { state: GameState; status: string } {
  const state = (s?.type?.state as GameState) ?? 'pre'
  const name = s?.type?.name ?? ''
  const p = s?.period ?? 0
  if (state === 'post') {
    if (name === 'STATUS_POSTPONED') return { state: 'pre', status: 'POSTPONED' }
    if (name === 'STATUS_CANCELED') return { state: 'pre', status: 'CANCELED' }
    return { state, status: p > 4 ? `FINAL/${periodLabel(p)}` : 'FINAL' }
  }
  if (state === 'in') {
    if (name === 'STATUS_HALFTIME') return { state, status: 'HALF' }
    if (name === 'STATUS_END_PERIOD') return { state, status: `END ${periodLabel(p)}` }
    return { state, status: `${periodLabel(p)} ${s?.displayClock ?? ''}`.trim() }
  }
  if (name === 'STATUS_POSTPONED') return { state, status: 'POSTPONED' }
  return { state, status: '' }
}

function toNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'object' ? Number((v as { value?: number }).value) : Number(v)
  return Number.isFinite(n) ? n : null
}

function recordOf(c: EspnCompetitor): string | null {
  const list = c.records ?? (Array.isArray(c.record) ? c.record : undefined)
  if (typeof c.record === 'string') return c.record
  const total = list?.find((r) => r.type === 'total') ?? list?.[0]
  return total?.summary?.replace('-', '–') ?? null
}

function side(c: EspnCompetitor): Side {
  return {
    team: teamFromEspn(c.team.id, c.team.abbreviation, c.team.shortDisplayName ?? c.team.name),
    homeAway: c.homeAway,
    score: toNumber(c.score),
    record: recordOf(c),
    winner: !!c.winner,
    linescores: (c.linescores ?? [])
      .map((l) => toNumber(l.value ?? l.displayValue))
      .filter((n): n is number => n != null),
    stats: Object.fromEntries((c.statistics ?? []).map((s) => [s.name, s.displayValue])),
  }
}

export function normaliseEvent(e: EspnEvent): Game | null {
  const comp = e.competitions?.[0]
  if (!comp) return null
  const home = comp.competitors.find((c) => c.homeAway === 'home')
  const away = comp.competitors.find((c) => c.homeAway === 'away')
  if (!home || !away) return null
  const { state, status } = statusLabel(comp.status ?? e.status)
  const note =
    comp.notes?.[0]?.headline ?? (e.season?.slug === 'preseason' || e.season?.type === 1 ? 'Preseason' : null)
  return {
    id: e.id,
    date: comp.date ?? e.date,
    state,
    status,
    away: side(away),
    home: side(home),
    venue: comp.venue?.fullName ?? null,
    city: comp.venue?.address?.city ?? null,
    note,
  }
}

/* ------------------------------------------------------------- scoreboard */

/** Cache live-ish days briefly, settled ones for an hour. */
function scoreboardTtl(etDay: string): number {
  const today = todayKey(ET)
  return etDay >= addDays(today, -1) && etDay <= today ? 30 : 3600
}

export async function scoreboard(etDay: string): Promise<Game[]> {
  const data = await getJson<{ events?: EspnEvent[] }>(
    `${SITE}/scoreboard?dates=${etDay.replaceAll('-', '')}&limit=100`,
    scoreboardTtl(etDay),
  )
  return (data?.events ?? []).map(normaliseEvent).filter((g): g is Game => g !== null)
}

async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        out[i] = await fn(items[i])
      }
    }),
  )
  return out
}

/**
 * Games for each local day in `days` (in the viewer's zone). ESPN buckets by
 * US-Eastern day, and a local day can straddle two ET days, so this fetches
 * the ET day before the range too and re-buckets by local start time.
 */
export async function gamesByLocalDay(days: string[], tz: string): Promise<Map<string, Game[]>> {
  const out = new Map<string, Game[]>(days.map((d) => [d, []]))
  if (!days.length) return out
  const etDays: string[] = []
  for (let d = addDays(days[0], -1); d <= days[days.length - 1]; d = addDays(d, 1)) etDays.push(d)
  const boards = await pool(etDays, 8, scoreboard)
  const seen = new Set<string>()
  for (const g of boards.flat()) {
    if (seen.has(g.id)) continue
    seen.add(g.id)
    out.get(dayKey(g.date, tz))?.push(g)
  }
  for (const list of out.values()) list.sort((a, b) => a.date.localeCompare(b.date))
  return out
}

/* ---------------------------------------------------------------- summary */

export type TeamBox = {
  fg: string
  fgPct: string
  threes: string
  threePct: string
  ft: string
  reb: string
  ast: string
  tov: string
  stl: string
  blk: string
  paint: string
  fastBreak: string
  largestLead: string
  leadChanges: string
}

export type Leader = { stat: string; name: string; value: string; headshot: string | null }

export type Recap = {
  headline: string
  description: string
  published: string
  url: string | null
  image: string | null
}

export type GameDetail = {
  game: Game
  margin: MarginPoint[]
  periods: number
  box: { home: TeamBox | null; away: TeamBox | null }
  leaders: { home: Leader[]; away: Leader[] }
  /** Pre-game win probability (0–100) from ESPN's matchup predictor. */
  predictor: { home: number; away: number } | null
  lastFive: { home: Array<'W' | 'L'>; away: Array<'W' | 'L'> }
  lastMeeting: { date: string; homeAbbr: string; awayAbbr: string; homeScore: number; awayScore: number } | null
  seriesSummary: string | null
  recap: Recap | null
  recentPlays: Array<{ period: number; clock: string; text: string; home: number; away: number; scoring: boolean }>
}

type EspnSummary = {
  header?: { competitions?: Array<EspnEvent['competitions'][number] & { status?: EspnStatus }>; id?: string; season?: { type?: number } }
  boxscore?: { teams?: Array<{ team: { id: string }; homeAway?: string; statistics?: Array<{ name: string; displayValue: string }> }> }
  plays?: Array<{
    period?: { number?: number }
    clock?: { displayValue?: string }
    text?: string
    homeScore?: number
    awayScore?: number
    scoringPlay?: boolean
  }>
  leaders?: Array<{
    team: { id: string }
    leaders?: Array<{
      name: string
      displayName?: string
      leaders?: Array<{ displayValue: string; athlete?: { shortName?: string; displayName?: string; headshot?: { href?: string } | string } }>
    }>
  }>
  predictor?: { homeTeam?: { gameProjection?: string }; awayTeam?: { gameProjection?: string } }
  lastFiveGames?: Array<{ team: { id: string }; events?: Array<{ gameResult?: string }> }>
  seasonseries?: Array<{
    summary?: string
    type?: string
    events?: Array<{
      date: string
      statusType?: { completed?: boolean }
      competitors?: Array<{ homeAway: string; score?: string; team: { id: string; abbreviation?: string } }>
    }>
  }>
  article?: {
    headline?: string
    description?: string
    published?: string
    links?: { web?: { href?: string } }
    images?: Array<{ url?: string }>
  }
}

function boxFrom(stats: Array<{ name: string; displayValue: string }> | undefined): TeamBox | null {
  if (!stats?.length) return null
  const s = Object.fromEntries(stats.map((x) => [x.name, x.displayValue]))
  return {
    fg: s['fieldGoalsMade-fieldGoalsAttempted'] ?? '',
    fgPct: s.fieldGoalPct ?? '',
    threes: s['threePointFieldGoalsMade-threePointFieldGoalsAttempted'] ?? '',
    threePct: s.threePointFieldGoalPct ?? '',
    ft: s['freeThrowsMade-freeThrowsAttempted'] ?? '',
    reb: s.totalRebounds ?? '',
    ast: s.assists ?? '',
    tov: s.totalTurnovers ?? s.turnovers ?? '',
    stl: s.steals ?? '',
    blk: s.blocks ?? '',
    paint: s.pointsInPaint ?? '',
    fastBreak: s.fastBreakPoints ?? '',
    largestLead: s.largestLead ?? '',
    leadChanges: s.leadChanges ?? '',
  }
}

function headshotOf(a: { headshot?: { href?: string } | string } | undefined): string | null {
  if (!a?.headshot) return null
  return typeof a.headshot === 'string' ? a.headshot : (a.headshot.href ?? null)
}

/** `ttl` in seconds: short while a game is live, long once it is final. */
export async function gameDetail(id: string, ttl = 60): Promise<GameDetail | null> {
  if (!/^\d+$/.test(id)) return null
  const data = await getJson<EspnSummary>(`${SITE}/summary?event=${id}`, ttl)
  const comp = data?.header?.competitions?.[0]
  if (!data || !comp) return null
  const game = normaliseEvent({
    id,
    date: comp.date ?? '',
    season: { type: data.header?.season?.type },
    competitions: [comp],
  })
  if (!game) return null

  const plays = data.plays ?? []
  const margin: MarginPoint[] = [{ t: 0, period: 1, clock: '12:00', home: 0, away: 0 }]
  let periods = 4
  for (const p of plays) {
    const period = p.period?.number ?? 1
    periods = Math.max(periods, period)
    const last = margin[margin.length - 1]
    if (p.homeScore == null || p.awayScore == null) continue
    if (p.homeScore === last.home && p.awayScore === last.away) continue
    const clock = p.clock?.displayValue ?? '0:00'
    margin.push({ t: elapsed(period, clock), period, clock, home: p.homeScore, away: p.awayScore })
  }

  const boxFor = (ha: 'home' | 'away') =>
    boxFrom(data.boxscore?.teams?.find((t) => t.team.id === game[ha].team.espnId || t.homeAway === ha)?.statistics)

  const leadersFor = (ha: 'home' | 'away'): Leader[] => {
    const block = data.leaders?.find((l) => l.team.id === game[ha].team.espnId)
    return (block?.leaders ?? [])
      .filter((l) => ['points', 'rebounds', 'assists'].includes(l.name))
      .map((l) => {
        const top = l.leaders?.[0]
        return {
          stat: l.name === 'points' ? 'PTS' : l.name === 'rebounds' ? 'REB' : 'AST',
          name: top?.athlete?.shortName ?? top?.athlete?.displayName ?? '—',
          value: top?.displayValue ?? '',
          headshot: headshotOf(top?.athlete),
        }
      })
  }

  const homePct = Number(data.predictor?.homeTeam?.gameProjection)
  const awayPct = Number(data.predictor?.awayTeam?.gameProjection)
  const predictor =
    Number.isFinite(homePct) && Number.isFinite(awayPct) && homePct + awayPct > 0
      ? { home: Math.round(homePct), away: Math.round(awayPct) }
      : null

  const formFor = (ha: 'home' | 'away'): Array<'W' | 'L'> =>
    (data.lastFiveGames?.find((l) => l.team.id === game[ha].team.espnId)?.events ?? [])
      .map((e) => e.gameResult)
      .filter((r): r is 'W' | 'L' => r === 'W' || r === 'L')
      .reverse()
      .slice(-5)

  const series = data.seasonseries?.find((s) => s.type === 'season') ?? data.seasonseries?.[0]
  const met = (series?.events ?? []).filter(
    (e) => e.statusType?.completed && new Date(e.date).getTime() < new Date(game.date).getTime(),
  )
  const lm = met[met.length - 1]
  const lmHome = lm?.competitors?.find((c) => c.homeAway === 'home')
  const lmAway = lm?.competitors?.find((c) => c.homeAway === 'away')
  const lastMeeting =
    lm && lmHome && lmAway
      ? {
          date: lm.date,
          homeAbbr: teamFromEspn(lmHome.team.id, lmHome.team.abbreviation).abbr,
          awayAbbr: teamFromEspn(lmAway.team.id, lmAway.team.abbreviation).abbr,
          homeScore: Number(lmHome.score),
          awayScore: Number(lmAway.score),
        }
      : null

  const a = data.article
  const recap: Recap | null = a?.headline
    ? {
        headline: a.headline,
        description: a.description?.replace(/^\s*[—–-]\s*/, '') ?? '',
        published: a.published ?? game.date,
        url: a.links?.web?.href?.replace(/^http:/, 'https:') ?? null,
        image: a.images?.[0]?.url ?? null,
      }
    : null

  const recentPlays = plays
    .slice(-12)
    .reverse()
    .map((p) => ({
      period: p.period?.number ?? 1,
      clock: p.clock?.displayValue ?? '',
      text: p.text ?? '',
      home: p.homeScore ?? 0,
      away: p.awayScore ?? 0,
      scoring: !!p.scoringPlay,
    }))

  return {
    game,
    margin,
    periods,
    box: { home: boxFor('home'), away: boxFor('away') },
    leaders: { home: leadersFor('home'), away: leadersFor('away') },
    predictor,
    lastFive: { home: formFor('home'), away: formFor('away') },
    lastMeeting,
    seriesSummary: series?.summary ?? null,
    recap,
    recentPlays,
  }
}

/* ------------------------------------------------------------------- news */

export type NewsItem = {
  id: string
  kind: 'news' | 'feature' | 'recap'
  /** Pill text: "Game recap", "Injury", "Feature"… */
  label: string
  publisher: string
  headline: string
  body: string
  published: string
  url: string | null
  image: string | null
  teams: Team[]
  gameId: string | null
}

type EspnArticle = {
  id: number
  type?: string
  headline?: string
  description?: string
  published?: string
  byline?: string
  links?: { web?: { href?: string } }
  images?: Array<{ url?: string; type?: string }>
  categories?: Array<{ type?: string; teamId?: number; team?: { id?: number }; eventId?: number; event?: { id?: number } }>
}

export async function espnNews(limit = 40): Promise<NewsItem[]> {
  const data = await getJson<{ articles?: EspnArticle[] }>(`${SITE}/news?limit=${limit}`, 600)
  return (data?.articles ?? [])
    .filter((a) => a.type !== 'Media' && a.headline)
    .map((a) => {
      const teamIds = new Set(
        (a.categories ?? [])
          .filter((c) => c.type === 'team')
          .map((c) => String(c.teamId ?? c.team?.id ?? '')),
      )
      const event = a.categories?.find((c) => c.type === 'event')
      const kind = a.type === 'Recap' ? 'recap' : a.type === 'Story' ? 'feature' : 'news'
      return {
        id: `espn-${a.id}`,
        kind,
        label: kind === 'recap' ? 'Game recap' : kind === 'feature' ? 'Feature' : 'News',
        publisher: 'ESPN',
        headline: a.headline!,
        body: a.description ?? '',
        published: a.published ?? new Date().toISOString(),
        url: a.links?.web?.href ?? null,
        image: a.images?.find((i) => i.url)?.url ?? null,
        // Season previews tag all 30 teams; chips only help when it's a few.
        teams: teamIds.size > 4 ? [] : [...teamIds].map((id) => teamFromEspn(id)).filter((t) => !t.id.startsWith('x')),
        gameId: event ? String(event.eventId ?? event.event?.id ?? '') || null : null,
      } satisfies NewsItem
    })
}

/* -------------------------------------------------------------- standings */

export type StandingRow = {
  team: Team
  wins: number
  losses: number
  pct: string
  gb: string
  seed: number
  diff: number
  ppg: number
  oppg: number
  streak: string
  lastTen: string
}

export type Standings = {
  season: string
  conferences: Array<{ name: string; rows: StandingRow[] }>
}

type EspnStandings = {
  seasons?: Array<{ year: number; displayName?: string }>
  season?: number
  children?: Array<{
    name: string
    standings?: {
      seasonDisplayName?: string
      entries?: Array<{ team: { id: string; abbreviation?: string }; stats: Array<{ name: string; value?: number; displayValue?: string }> }>
    }
  }>
}

export async function standings(): Promise<Standings | null> {
  const data = await getJson<EspnStandings>(STANDINGS, 3600)
  if (!data?.children?.length) return null
  const conferences = data.children.map((c) => {
    const rows = (c.standings?.entries ?? []).map((e) => {
      const s = Object.fromEntries(e.stats.map((x) => [x.name, x]))
      const num = (k: string) => Number(s[k]?.value ?? s[k]?.displayValue ?? 0)
      return {
        team: teamFromEspn(e.team.id, e.team.abbreviation),
        wins: num('wins'),
        losses: num('losses'),
        pct: s.winPercent?.displayValue ?? '.000',
        gb: s.gamesBehind?.displayValue ?? '-',
        seed: num('playoffSeed'),
        diff: num('differential'),
        ppg: num('avgPointsFor'),
        oppg: num('avgPointsAgainst'),
        streak: s.streak?.displayValue ?? '',
        lastTen: s['Last Ten Games']?.displayValue ?? '',
      }
    })
    rows.sort((a, b) => (a.seed || 99) - (b.seed || 99) || b.wins - a.wins)
    return { name: c.name, rows }
  })
  const season = data.children[0].standings?.seasonDisplayName ?? ''
  return { season, conferences }
}
