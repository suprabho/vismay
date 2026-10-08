/**
 * The viznba HTML-story brief with its game context: the generic brief
 * (./brief) plus, for the games the story is about, the box score ESPN's
 * public site API has for each (the same `summary` endpoint the VizNBA game
 * page reads): the score by quarter, the team stats, every player's line,
 * the leaders, the runs and the lead changes, the season series and ESPN's
 * recap; for a game not played yet, the records, recent form and ESPN's win
 * probability.
 *
 * With an NBA Desk spin (@vismay/randomizer), the brief carries the spin
 * (assignment, research protocol, format, research file) and, unless the
 * editor picked games, the box scores of the games the spin drew: the team's
 * recent results and next game, and any head-to-head meeting.
 *
 * Server only: it fetches ESPN.
 */

import { VIZNBA } from '@vismay/randomizer/datasets'
import type { BriefSpin } from '@vismay/randomizer/spinBrief'
import { htmlStoryBrief } from './brief'
import type { HtmlStoryFormat } from './formats'
import type { StoryStyle } from './styles'

/** At most this many games' box scores in one brief. */
export const MAX_GAME_CONTEXT = 12

const ESPN_NBA = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba'

/** ESPN event ids are digits. */
export function isGameId(value: unknown): value is string {
  return typeof value === 'string' && /^\d{6,12}$/.test(value)
}

export interface ViznbaBriefOptions {
  /** e.g. https://viznba.com — the hosting site; game links point at it. */
  siteUrl: string
  style?: StoryStyle | null
  /** ESPN event ids (up to {@link MAX_GAME_CONTEXT}). Empty: a brief with no game context (unless a spin brings its own). */
  gameIds?: string[]
  /** Editorial intent, surfaced at the top of the context. */
  prompt?: string
  /** The story format (./formats). Default: scroll. */
  format?: HtmlStoryFormat | null
  /** An NBA Desk spin; its games are the context when `gameIds` is empty. */
  spin?: BriefSpin | null
}

/** The games a spin's brief carries box scores for (empty for any spin but an NBA Desk one). */
export function spinGameIds(spin: BriefSpin | null | undefined): string[] {
  return spin?.subject.randomizer === 'viznba' ? spin.subject.gameIds : []
}

export async function viznbaHtmlStoryBrief({ siteUrl, style, gameIds = [], prompt, format, spin }: ViznbaBriefOptions): Promise<string> {
  const picked = gameIds.filter(isGameId)
  const ids = picked.length ? picked : spinGameIds(spin)
  const angle =
    prompt ?? (spin?.subject.randomizer === 'viznba' && !picked.length ? `NBA Desk spin: ${spinPrompt(spin.subject)}` : undefined)
  const context = ids.length ? await buildGameContext(ids.slice(0, MAX_GAME_CONTEXT), { prompt: angle, siteUrl }) : null
  return htmlStoryBrief({ app: 'viznba', siteUrl, style, context, format, spin })
}

function spinPrompt(s: Extract<BriefSpin['subject'], { randomizer: 'viznba' }>): string {
  const subject = s.opponent ? `${s.team.name} v ${s.opponent.name}` : s.team.name
  return `${subject} (${s.conference.name}), the ${s.angle.name} angle, ${s.freshness.name.toLowerCase()}.`
}

/* ---------- ESPN summary ---------- */

interface EspnCompetitor {
  homeAway?: string
  score?: string
  winner?: boolean
  team?: { id?: string; displayName?: string; abbreviation?: string; logos?: Array<{ href?: string }>; logo?: string; color?: string }
  record?: Array<{ type?: string; summary?: string; displayValue?: string }>
  linescores?: Array<{ displayValue?: string; value?: number }>
}

interface EspnAthleteLine {
  athlete?: { id?: string; displayName?: string; shortName?: string; headshot?: { href?: string } | string; position?: { abbreviation?: string } }
  starter?: boolean
  didNotPlay?: boolean
  reason?: string
  stats?: string[]
}

interface EspnSummary {
  header?: {
    season?: { year?: number; type?: number }
    competitions?: Array<{
      date?: string
      neutralSite?: boolean
      competitors?: EspnCompetitor[]
      status?: { type?: { state?: string; detail?: string; shortDetail?: string; name?: string } }
    }>
  }
  gameInfo?: { venue?: { fullName?: string; address?: { city?: string; state?: string } }; attendance?: number }
  boxscore?: {
    teams?: Array<{ team?: { id?: string }; homeAway?: string; statistics?: Array<{ name?: string; label?: string; displayValue?: string }> }>
    players?: Array<{ team?: { id?: string }; statistics?: Array<{ labels?: string[]; athletes?: EspnAthleteLine[] }> }>
  }
  plays?: Array<{ period?: { number?: number }; clock?: { displayValue?: string }; homeScore?: number; awayScore?: number; scoringPlay?: boolean }>
  leaders?: Array<{
    team?: { id?: string }
    leaders?: Array<{ name?: string; displayName?: string; leaders?: Array<{ displayValue?: string; athlete?: EspnAthleteLine['athlete'] }> }>
  }>
  predictor?: { homeTeam?: { gameProjection?: string }; awayTeam?: { gameProjection?: string } }
  lastFiveGames?: Array<{ team?: { id?: string }; events?: Array<{ gameResult?: string; score?: string; atVs?: string; opponent?: { abbreviation?: string } }> }>
  seasonseries?: Array<{ type?: string; summary?: string }>
  injuries?: Array<{ team?: { id?: string }; injuries?: Array<{ status?: string; athlete?: { displayName?: string }; details?: { type?: string } }> }>
  article?: { headline?: string; description?: string; links?: { web?: { href?: string } } }
}

async function fetchSummary(id: string): Promise<EspnSummary> {
  const res = await fetch(`${ESPN_NBA}/summary?event=${id}`, {
    headers: { 'user-agent': 'Mozilla/5.0 (compatible; VizNBA/1.0)' },
    signal: AbortSignal.timeout(12_000),
    cache: 'no-store',
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return (await res.json()) as EspnSummary
}

const TEAM_STATS: Array<[string, string]> = [
  ['fieldGoalsMade-fieldGoalsAttempted', 'FG'],
  ['fieldGoalPct', 'FG%'],
  ['threePointFieldGoalsMade-threePointFieldGoalsAttempted', '3PT'],
  ['threePointFieldGoalPct', '3P%'],
  ['freeThrowsMade-freeThrowsAttempted', 'FT'],
  ['freeThrowPct', 'FT%'],
  ['totalRebounds', 'Rebounds'],
  ['offensiveRebounds', 'Offensive rebounds'],
  ['assists', 'Assists'],
  ['totalTurnovers', 'Turnovers'],
  ['steals', 'Steals'],
  ['blocks', 'Blocks'],
  ['pointsInPaint', 'Points in the paint'],
  ['fastBreakPoints', 'Fast-break points'],
  ['turnoverPoints', 'Points off turnovers'],
  ['largestLead', 'Largest lead'],
  ['leadChanges', 'Lead changes'],
]

function cell(v: string | number | null | undefined): string {
  return v === null || v === undefined || v === '' ? '' : String(v).replace(/\|/g, '/').replace(/\s+/g, ' ').trim()
}

function headshot(a: EspnAthleteLine['athlete']): string | null {
  if (!a?.headshot) return null
  return typeof a.headshot === 'string' ? a.headshot : a.headshot.href ?? null
}

function periodLabel(i: number): string {
  return i < 4 ? `Q${i + 1}` : i === 4 ? 'OT' : `${i - 3}OT`
}

/** Scoring runs of 8 or more unanswered points, from the play-by-play. */
function runs(plays: NonNullable<EspnSummary['plays']>, home: string, away: string): string[] {
  const out: string[] = []
  let side: 'home' | 'away' | null = null
  let pts = 0
  let start: { period: number; clock: string; score: string } | null = null
  let prev = { home: 0, away: 0 }
  const flush = (end: { period: number; clock: string }) => {
    if (side && pts >= 8 && start) {
      const who = side === 'home' ? home : away
      out.push(`${who} ${pts}-0 run, ${periodLabel(start.period - 1)} ${start.clock} to ${periodLabel(end.period - 1)} ${end.clock} (from ${start.score})`)
    }
  }
  let last = { period: 1, clock: '12:00' }
  for (const p of plays) {
    if (p.homeScore == null || p.awayScore == null) continue
    const dh = p.homeScore - prev.home
    const da = p.awayScore - prev.away
    const at = { period: p.period?.number ?? 1, clock: p.clock?.displayValue ?? '' }
    if (dh > 0 || da > 0) {
      const scorer: 'home' | 'away' = dh > 0 ? 'home' : 'away'
      if (scorer !== side || (dh > 0 && da > 0)) {
        flush(last)
        side = scorer
        pts = 0
        start = { ...at, score: `${away} ${prev.away}, ${home} ${prev.home}` }
      }
      pts += scorer === 'home' ? dh : da
      last = at
    }
    prev = { home: p.homeScore, away: p.awayScore }
  }
  flush(last)
  return out
}

/** One game's section of the context. */
function gameSection(id: string, d: EspnSummary, siteUrl: string): string {
  const comp = d.header?.competitions?.[0]
  const home = comp?.competitors?.find((c) => c.homeAway === 'home')
  const away = comp?.competitors?.find((c) => c.homeAway === 'away')
  if (!comp || !home || !away) return `### Game ${id}\n\nESPN has no game under this id.`
  const name = (c: EspnCompetitor) => c.team?.displayName ?? c.team?.abbreviation ?? 'TBD'
  const state = comp.status?.type?.state ?? 'pre'
  const played = state !== 'pre'
  const detail = comp.status?.type?.detail ?? comp.status?.type?.shortDetail ?? ''
  const date = (comp.date ?? '').slice(0, 10)
  const title = played
    ? `${name(away)} ${away.score ?? ''} @ ${name(home)} ${home.score ?? ''}`
    : `${name(away)} @ ${name(home)}`
  const lines: string[] = [`### ${title} (${date}, ${detail || state})`, '', `- Game page: ${siteUrl}/game/${id}`]
  const venue = d.gameInfo?.venue
  if (venue?.fullName) {
    const where = [venue.address?.city, venue.address?.state].filter(Boolean).join(', ')
    lines.push(`- Venue: ${venue.fullName}${where ? `, ${where}` : ''}${d.gameInfo?.attendance ? ` (attendance ${d.gameInfo.attendance.toLocaleString('en-US')})` : ''}`)
  }

  lines.push('', '| Team | Record | Colour | Logo |', '|------|--------|--------|------|')
  for (const c of [away, home]) {
    const ds = VIZNBA.teams.find((t) => t.espn_id === c.team?.id)
    const record = c.record?.find((r) => r.type === 'total')?.summary ?? c.record?.[0]?.summary ?? ''
    const logo = c.team?.logos?.[0]?.href ?? c.team?.logo ?? ''
    lines.push(`| ${cell(name(c))} | ${cell(record)} | ${ds?.color ?? (c.team?.color ? `#${c.team.color}` : '')} | ${cell(logo)} |`)
  }

  if (played) {
    const n = Math.max(away.linescores?.length ?? 0, home.linescores?.length ?? 0)
    if (n) {
      const heads = Array.from({ length: n }, (_, i) => periodLabel(i))
      lines.push('', '#### Score by quarter', '', `| Team | ${heads.join(' | ')} | Final |`, `|------|${heads.map(() => '----').join('|')}|-------|`)
      for (const c of [away, home]) {
        const qs = Array.from({ length: n }, (_, i) => cell(c.linescores?.[i]?.displayValue ?? c.linescores?.[i]?.value))
        lines.push(`| ${cell(name(c))} | ${qs.join(' | ')} | ${cell(c.score)} |`)
      }
    }

    const statsFor = (c: EspnCompetitor) =>
      new Map((d.boxscore?.teams?.find((t) => t.team?.id === c.team?.id || t.homeAway === c.homeAway)?.statistics ?? []).map((s) => [s.name ?? '', s.displayValue ?? '']))
    const sa = statsFor(away)
    const sh = statsFor(home)
    const rows = TEAM_STATS.filter(([k]) => sa.has(k) || sh.has(k))
    if (rows.length) {
      lines.push('', '#### Team stats', '', `| Stat | ${cell(name(away))} | ${cell(name(home))} |`, '|------|------|------|')
      for (const [k, label] of rows) lines.push(`| ${label} | ${cell(sa.get(k))} | ${cell(sh.get(k))} |`)
    }

    const found = runs(d.plays ?? [], name(home), name(away))
    if (found.length) lines.push('', '#### Runs of 8 or more', '', ...found.map((r) => `- ${r}`))

    for (const block of d.boxscore?.players ?? []) {
      const team = [away, home].find((c) => c.team?.id === block.team?.id)
      const st = block.statistics?.[0]
      if (!team || !st?.labels?.length || !st.athletes?.length) continue
      const playedLines = st.athletes.filter((a) => !a.didNotPlay && a.stats?.length)
      const out = st.athletes.filter((a) => a.didNotPlay)
      lines.push('', `#### ${name(team)} players`, '', `| Player | ${st.labels.join(' | ')} |`, `|--------|${st.labels.map(() => '---').join('|')}|`)
      for (const a of playedLines) {
        const who = `${cell(a.athlete?.displayName ?? a.athlete?.shortName)}${a.athlete?.position?.abbreviation ? ` (${a.athlete.position.abbreviation})` : ''}${a.starter ? ', starter' : ''}`
        lines.push(`| ${who} | ${(a.stats ?? []).map(cell).join(' | ')} |`)
      }
      if (out.length) lines.push('', `Did not play: ${out.map((a) => `${a.athlete?.displayName ?? '?'}${a.reason ? ` (${a.reason.toLowerCase()})` : ''}`).join(', ')}.`)
    }
  } else {
    const homePct = Number(d.predictor?.homeTeam?.gameProjection)
    const awayPct = Number(d.predictor?.awayTeam?.gameProjection)
    if (Number.isFinite(homePct) && Number.isFinite(awayPct)) {
      lines.push('', `ESPN's win probability before tip-off: ${name(away)} ${awayPct.toFixed(1)}%, ${name(home)} ${homePct.toFixed(1)}%.`)
    }
    for (const c of [away, home]) {
      const form = (d.lastFiveGames?.find((l) => l.team?.id === c.team?.id)?.events ?? [])
        .map((e) => `${e.gameResult ?? '?'} ${e.score ?? ''} ${e.atVs ?? ''} ${e.opponent?.abbreviation ?? ''}`.replace(/\s+/g, ' ').trim())
        .filter(Boolean)
      if (form.length) lines.push(`- ${name(c)}, last ${form.length}: ${form.join('; ')}`)
    }
    for (const block of d.injuries ?? []) {
      const team = [away, home].find((c) => c.team?.id === block.team?.id)
      const list = (block.injuries ?? []).map((i) => `${i.athlete?.displayName ?? '?'} (${[i.status, i.details?.type].filter(Boolean).join(', ')})`)
      if (team && list.length) lines.push(`- ${name(team)} injury report: ${list.join('; ')}`)
    }
  }

  const leaders: string[] = []
  for (const block of d.leaders ?? []) {
    const team = [away, home].find((c) => c.team?.id === block.team?.id)
    for (const l of block.leaders ?? []) {
      const top = l.leaders?.[0]
      if (!team || !top?.athlete) continue
      const shot = headshot(top.athlete)
      leaders.push(`| ${cell(name(team))} | ${cell(l.displayName ?? l.name)} | ${cell(top.athlete.displayName ?? top.athlete.shortName)} | ${cell(top.displayValue)} | ${cell(shot)} |`)
    }
  }
  if (leaders.length) lines.push('', `#### ${played ? 'Leaders' : 'Season leaders'}`, '', '| Team | Stat | Player | Value | Headshot |', '|------|------|--------|-------|----------|', ...leaders)

  const series = d.seasonseries?.find((s) => s.type === 'season') ?? d.seasonseries?.[0]
  if (series?.summary) lines.push('', `Season series: ${series.summary}.`)
  if (d.article?.headline) {
    const url = d.article.links?.web?.href?.replace(/^http:/, 'https:')
    lines.push('', `ESPN recap: ${url ? `[${d.article.headline}](${url})` : d.article.headline}${d.article.description ? `. ${d.article.description.replace(/^\s*[—–-]\s*/, '')}` : ''}`)
  }
  return lines.join('\n')
}

/**
 * The game context: one section per game, in date order, read from ESPN's
 * summary endpoint. A game ESPN can't serve is named, not dropped, so the
 * agent knows it is missing.
 */
export async function buildGameContext(gameIds: string[], { prompt, siteUrl }: { prompt?: string; siteUrl: string }): Promise<string> {
  const site = siteUrl.replace(/\/$/, '')
  const ids = Array.from(new Set(gameIds.filter(isGameId))).slice(0, MAX_GAME_CONTEXT)
  const results = await Promise.all(
    ids.map((id) =>
      fetchSummary(id).then(
        (d) => ({ id, d, error: null as string | null }),
        (e: unknown) => ({ id, d: null, error: e instanceof Error ? e.message : String(e) }),
      ),
    ),
  )
  const dated = results.sort((a, b) => (a.d?.header?.competitions?.[0]?.date ?? '').localeCompare(b.d?.header?.competitions?.[0]?.date ?? ''))
  const sections = dated.map((r) => (r.d ? gameSection(r.id, r.d, site) : `### Game ${r.id}\n\nESPN's box score could not be read (${r.error}). Leave this game out or source it elsewhere.`))
  return [
    '## Game context',
    '',
    prompt ? `Angle: ${prompt}` : null,
    prompt ? '' : null,
    `Box scores from ESPN's public NBA data for ${ids.length} ${ids.length === 1 ? 'game' : 'games'}, read ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC. Player lines keep ESPN's own column labels and order.`,
    '',
    sections.join('\n\n'),
  ]
    .filter((l): l is string => l !== null)
    .join('\n')
}
