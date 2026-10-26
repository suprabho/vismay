/**
 * Season analytics over `admin_historical_matches` rows: standings, the points
 * race, results strips, goals by month, and the beat finder that turns a
 * competition's season into candidate story beats (lead changes, runs,
 * collapses, records).
 *
 * Pure and client-safe: the books API ships a competition-season's matches
 * once and the planner computes everything in the browser.
 * Points are 3/1/0 with no deductions; tie-break is goal difference, goals
 * scored, then name.
 */
import { chapterForMonth, chapterLabel, seasonLabel, type BeatKind } from './plan'

export interface MatchRow {
  /** Match date, YYYY-MM-DD. */
  d: string
  /** Stage, e.g. "League", "R16", "Final"; null for internationals. */
  s: string | null
  h: string
  a: string
  hg: number
  ag: number
}

export interface StandingRow {
  team: string
  p: number
  w: number
  d: number
  l: number
  gf: number
  ga: number
  gd: number
  pts: number
}

export type Result = 'W' | 'D' | 'L'

const monthOf = (date: string) => date.slice(0, 7)

/** Played league matches in date order. */
export function leagueMatches(rows: MatchRow[]): MatchRow[] {
  return rows.filter(r => (r.s === 'League' || r.s == null) && Number.isFinite(r.hg) && Number.isFinite(r.ag))
    .sort((x, y) => x.d.localeCompare(y.d))
}

export function standings(rows: MatchRow[], untilDate?: string): StandingRow[] {
  const table = new Map<string, StandingRow>()
  const row = (team: string) => {
    let r = table.get(team)
    if (!r) table.set(team, (r = { team, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, gd: 0, pts: 0 }))
    return r
  }
  for (const m of rows) {
    const home = row(m.h)
    const away = row(m.a)
    if (untilDate && m.d > untilDate) continue
    home.p++; away.p++
    home.gf += m.hg; home.ga += m.ag
    away.gf += m.ag; away.ga += m.hg
    if (m.hg > m.ag) { home.w++; away.l++; home.pts += 3 }
    else if (m.hg < m.ag) { away.w++; home.l++; away.pts += 3 }
    else { home.d++; away.d++; home.pts++; away.pts++ }
  }
  for (const r of table.values()) r.gd = r.gf - r.ga
  return [...table.values()].sort((x, y) => y.pts - x.pts || y.gd - x.gd || y.gf - x.gf || x.team.localeCompare(y.team))
}

/** The last day of a YYYY-MM month. */
export function monthEnd(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  const day = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return `${monthKey}-${String(day).padStart(2, '0')}`
}

export interface RacePoint {
  d: string
  /** Games played. */
  n: number
  pts: number
}

/** Cumulative points after each of the team's games. */
export function pointsRace(rows: MatchRow[], teams: string[]): { team: string; points: RacePoint[] }[] {
  return teams.map(team => {
    const points: RacePoint[] = []
    let pts = 0
    for (const m of rows) {
      if (m.h !== team && m.a !== team) continue
      const gf = m.h === team ? m.hg : m.ag
      const ga = m.h === team ? m.ag : m.hg
      pts += gf > ga ? 3 : gf === ga ? 1 : 0
      points.push({ d: m.d, n: points.length + 1, pts })
    }
    return { team, points }
  })
}

export interface StripGame {
  d: string
  opponent: string
  home: boolean
  gf: number
  ga: number
  r: Result
}

export function resultsStrip(rows: MatchRow[], team: string): StripGame[] {
  return rows.filter(m => m.h === team || m.a === team).map(m => {
    const home = m.h === team
    const gf = home ? m.hg : m.ag
    const ga = home ? m.ag : m.hg
    return { d: m.d, opponent: home ? m.a : m.h, home, gf, ga, r: gf > ga ? 'W' : gf === ga ? 'D' : 'L' }
  })
}

export function goalsByMonth(rows: MatchRow[]): { month: string; games: number; goals: number; perGame: number }[] {
  const by = new Map<string, { games: number; goals: number }>()
  for (const m of rows) {
    const k = monthOf(m.d)
    const e = by.get(k) ?? { games: 0, goals: 0 }
    e.games++
    e.goals += m.hg + m.ag
    by.set(k, e)
  }
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b))
    .map(([month, e]) => ({ month, ...e, perGame: e.games ? e.goals / e.games : 0 }))
}

/** The team's table position after each of its league games (round order, not date order). */
export function positionsByRound(rows: MatchRow[], team: string): { n: number; d: string; pos: number }[] {
  const league = leagueMatches(rows)
  const dates = [...new Set(league.filter(m => m.h === team || m.a === team).map(m => m.d))]
  return dates.map((d, i) => ({ n: i + 1, d, pos: standings(league, d).findIndex(r => r.team === team) + 1 }))
}

/** Who was top after every match date, with the gap to second. */
export function leaderByDate(rows: MatchRow[]): { d: string; leader: string; margin: number }[] {
  const league = leagueMatches(rows)
  const dates = [...new Set(league.map(m => m.d))]
  return dates.map(d => {
    const table = standings(league, d)
    return { d, leader: table[0]?.team ?? '', margin: table.length > 1 ? table[0].pts - table[1].pts : 0 }
  })
}

export function teamsOf(rows: MatchRow[]): string[] {
  return [...new Set(rows.flatMap(m => [m.h, m.a]))].sort((a, b) => a.localeCompare(b))
}

/** Default points-race teams: the final top four. */
export function topTeams(rows: MatchRow[], n = 4): string[] {
  return standings(leagueMatches(rows)).slice(0, n).map(r => r.team)
}

// ---------------------------------------------------------------------------
// Beat finder

export interface BeatSuggestion {
  key: string
  month: string
  kind: BeatKind
  strength: 1 | 2 | 3
  text: string
  teams: string
  evidence: string
}

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const fmtDate = (d: string) => DATE.format(new Date(`${d}T00:00:00Z`))
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`

interface Run {
  team: string
  length: number
  from: string
  to: string
}

/** The team's longest run of games matching `keep`. */
function longestRun(games: StripGame[], team: string, keep: (g: StripGame) => boolean): Run | null {
  let best: Run | null = null
  let start = -1
  for (let i = 0; i <= games.length; i++) {
    if (i < games.length && keep(games[i])) {
      if (start < 0) start = i
      continue
    }
    if (start >= 0) {
      const length = i - start
      if (!best || length > best.length) best = { team, length, from: games[start].d, to: games[i - 1].d }
      start = -1
    }
  }
  return best
}

function bestRun(rows: MatchRow[], teams: string[], keep: (g: StripGame) => boolean): Run | null {
  let best: Run | null = null
  for (const t of teams) {
    const r = longestRun(resultsStrip(rows, t), t, keep)
    if (r && (!best || r.length > best.length)) best = r
  }
  return best
}

/**
 * Candidate beats for one competition's season. Each is one sentence a
 * writer can keep, rewrite or drop; the evidence line says where it came from.
 */
export function findBeats(seasonStart: number, competition: string, rows: MatchRow[], isLeague: boolean): BeatSuggestion[] {
  const out: BeatSuggestion[] = []
  const add = (s: Omit<BeatSuggestion, 'key' | 'month'> & { month: string }) =>
    out.push({ ...s, month: chapterForMonth(seasonStart, s.month), key: `${s.kind}:${s.text}` })
  const played = rows.filter(r => Number.isFinite(r.hg) && Number.isFinite(r.ag)).sort((x, y) => x.d.localeCompare(y.d))
  if (!played.length) return out
  const season = seasonLabel(seasonStart)

  if (isLeague) {
    const league = leagueMatches(played)
    const teams = teamsOf(league)
    const final = standings(league)
    const months = [...new Set(league.map(m => monthOf(m.d)))]

    // Title race: who led at each month's end, and when the lead changed hands.
    let leader: string | null = null
    let changes = 0
    const bestPos = new Map<string, { pos: number; month: string }>()
    for (const m of months) {
      const table = standings(league, monthEnd(m))
      table.forEach((r, i) => {
        const b = bestPos.get(r.team)
        if (r.p >= 5 && (!b || i + 1 < b.pos)) bestPos.set(r.team, { pos: i + 1, month: m })
      })
      const top = table[0]
      if (!top || top.p < 3) continue
      if (leader && top.team !== leader) {
        changes++
        const gap = top.pts - table[1].pts
        add({ month: m, kind: 'title-race', strength: 3, teams: `${top.team} | ${leader}`,
          text: `${top.team} took top spot from ${leader} in ${chapterLabel(m)}${gap > 0 ? `, ${gap} point${gap === 1 ? '' : 's'} clear at the month’s end` : ' on goal difference'}.`,
          evidence: `${competition} table at ${monthEnd(m)}: ${table.slice(0, 3).map(r => `${r.team} ${r.pts}`).join(', ')}` })
      }
      leader = top.team
    }

    const champ = final[0]
    const runnerUp = final[1]
    if (champ && runnerUp) {
      const margin = champ.pts - runnerUp.pts
      add({ month: monthOf(league[league.length - 1].d), kind: 'title-race', strength: 3, teams: `${champ.team} | ${runnerUp.team}`,
        text: `${champ.team} won the ${season} ${competition} by ${margin === 0 ? 'goal difference' : `${margin} point${margin === 1 ? '' : 's'}`}${changes ? `, after the lead changed hands ${changes === 1 ? 'once' : changes === 2 ? 'twice' : `${changes} times`}` : ', and led from start to finish'}.`,
        evidence: `Final table: ${final.slice(0, 4).map(r => `${r.team} ${r.pts}`).join(', ')}` })
      if (champ.l === 0) add({ month: monthOf(league[league.length - 1].d), kind: 'record', strength: 3, teams: champ.team,
        text: `${champ.team} went the whole ${competition} season unbeaten: ${champ.w} wins, ${champ.d} draws, no defeats.`,
        evidence: `Final record ${champ.w}-${champ.d}-${champ.l}` })
    }

    // Runs: unbeaten (unless a whole season), winning, winless.
    const unbeaten = bestRun(league, teams, g => g.r !== 'L')
    if (unbeaten && unbeaten.length >= 10 && !(champ && champ.l === 0 && unbeaten.team === champ.team)) add({ month: monthOf(unbeaten.to), kind: 'streak', strength: 2, teams: unbeaten.team,
      text: `${unbeaten.team} went ${unbeaten.length} league games unbeaten between ${fmtDate(unbeaten.from)} and ${fmtDate(unbeaten.to)}.`,
      evidence: 'Longest unbeaten run in the competition this season' })
    const wins = bestRun(league, teams, g => g.r === 'W')
    if (wins && wins.length >= 6) add({ month: monthOf(wins.to), kind: 'streak', strength: wins.length >= 9 ? 3 : 2, teams: wins.team,
      text: `${wins.team} won ${wins.length} league games in a row (${fmtDate(wins.from)} to ${fmtDate(wins.to)}).`,
      evidence: 'Longest winning run in the competition this season' })
    const winless = bestRun(league, teams, g => g.r !== 'W')
    if (winless && winless.length >= 8) add({ month: monthOf(winless.to), kind: 'collapse', strength: 2, teams: winless.team,
      text: `${winless.team} went ${winless.length} league games without a win (${fmtDate(winless.from)} to ${fmtDate(winless.to)}).`,
      evidence: 'Longest winless run in the competition this season' })

    // Collapse: the steepest fall from a month-end high to the final position.
    let fall: { team: string; from: number; to: number; month: string } | null = null
    final.forEach((r, i) => {
      const b = bestPos.get(r.team)
      if (b && b.pos <= 4 && i + 1 - b.pos >= 5 && (!fall || i + 1 - b.pos > fall.to - fall.from)) fall = { team: r.team, from: b.pos, to: i + 1, month: b.month }
    })
    const f = fall as { team: string; from: number; to: number; month: string } | null
    if (f) add({ month: f.month, kind: 'collapse', strength: 3, teams: f.team,
      text: `${f.team} were ${ordinal(f.from)} at the end of ${chapterLabel(f.month)} and finished ${ordinal(f.to)}.`,
      evidence: `Month-end tables vs the final table` })

    // Survival: the gap at the bottom.
    const relegationLine = final.length >= 18 ? final.length - 3 : null
    if (relegationLine) {
      const safe = final[relegationLine - 1]
      const down = final[relegationLine]
      if (safe && down && safe.pts - down.pts <= 2) add({ month: monthOf(league[league.length - 1].d), kind: 'survival', strength: 2, teams: `${safe.team} | ${down.team}`,
        text: `${safe.team} stayed up by ${safe.pts === down.pts ? 'goal difference' : `${safe.pts - down.pts} point${safe.pts - down.pts === 1 ? '' : 's'}`} over ${down.team}.`,
        evidence: `Final table, ${ordinal(relegationLine)} v ${ordinal(relegationLine + 1)} (check the competition’s relegation places)` })
    }

    const attack = [...final].sort((x, y) => y.gf - x.gf)[0]
    const defence = [...final].sort((x, y) => x.ga - y.ga)[0]
    if (attack) add({ month: monthOf(league[league.length - 1].d), kind: 'record', strength: 1, teams: attack.team,
      text: `${attack.team} scored ${attack.gf} league goals, the most in the ${competition}.`, evidence: 'Final table, goals for' })
    if (defence) add({ month: monthOf(league[league.length - 1].d), kind: 'record', strength: 1, teams: defence.team,
      text: `${defence.team} conceded only ${defence.ga} league goals in ${defence.p} games.`, evidence: 'Final table, goals against' })
  }

  // Any competition: the biggest win and the wildest game.
  const margin = (m: MatchRow) => Math.abs(m.hg - m.ag)
  const biggest = [...played].sort((x, y) => margin(y) - margin(x) || (y.hg + y.ag) - (x.hg + x.ag))[0]
  if (biggest && margin(biggest) >= 4) {
    const homeWon = biggest.hg > biggest.ag
    const [w, l, wg, lg] = homeWon ? [biggest.h, biggest.a, biggest.hg, biggest.ag] : [biggest.a, biggest.h, biggest.ag, biggest.hg]
    add({ month: monthOf(biggest.d), kind: 'record', strength: 2, teams: `${w} | ${l}`,
      text: `${w} beat ${l} ${wg}–${lg}${homeWon ? '' : ' away'}, the biggest win of the ${competition} season.`,
      evidence: `${biggest.d}${biggest.s && biggest.s !== 'League' ? `, ${biggest.s}` : ''}` })
  }
  const wildest = [...played].sort((x, y) => (y.hg + y.ag) - (x.hg + x.ag))[0]
  if (wildest && wildest !== biggest && wildest.hg + wildest.ag >= 8) add({ month: monthOf(wildest.d), kind: 'record', strength: 1, teams: `${wildest.h} | ${wildest.a}`,
    text: `${wildest.h} ${wildest.hg}–${wildest.ag} ${wildest.a} was the ${competition}’s highest-scoring game.`, evidence: wildest.d })

  if (!isLeague) {
    const final = played.filter(m => /^final$/i.test(m.s ?? '')).pop()
    if (final) {
      const winner = final.hg > final.ag ? final.h : final.hg < final.ag ? final.a : null
      add({ month: monthOf(final.d), kind: 'europe', strength: 3, teams: `${final.h} | ${final.a}`,
        text: winner ? `${winner} won the ${competition} final, ${Math.max(final.hg, final.ag)}–${Math.min(final.hg, final.ag)} against ${winner === final.h ? final.a : final.h}.` : `The ${competition} final, ${final.h} v ${final.a}, finished ${final.hg}–${final.ag} after 90 minutes.`,
        evidence: `${final.d}, Final` })
    }
  }

  const order = { 3: 0, 2: 1, 1: 2 } as const
  return out.sort((x, y) => x.month.localeCompare(y.month) || order[x.strength] - order[y.strength])
}
