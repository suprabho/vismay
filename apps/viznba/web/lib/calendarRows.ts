import type { Game } from './espn'
import { tipoff } from './labels'
import { countdown } from './time'
import type { Team } from './teams'

/** Serializable view models handed to the calendar's client components. */

export type Tone = 'final' | 'live' | 'up'

export type SideRow = {
  team: Team
  /** Score once played, record before tip-off. */
  right: string
  bright: boolean
  played: boolean
}

export type DayRow = {
  id: string
  date: string
  time: string
  et: string | null
  tone: Tone
  status: string
  favLabel: string | null
  sides: [SideRow, SideRow]
}

export type LineRow = {
  id: string
  away: Team
  home: Team
  line: string
  tone: Tone
  status: string
}

export function tone(g: Game): Tone {
  return g.state === 'post' ? 'final' : g.state === 'in' ? 'live' : 'up'
}

export function favLabel(g: Game, followed: Set<string>): string | null {
  const a = followed.has(g.away.team.id)
  const h = followed.has(g.home.team.id)
  if (a && h) return 'Both your teams'
  if (a) return g.away.team.name
  if (h) return g.home.team.name
  return null
}

export function dayRow(g: Game, tz: string, followed: Set<string>): DayRow {
  const played = g.state !== 'pre'
  const lead =
    played && g.home.score != null && g.away.score != null && g.home.score !== g.away.score
      ? g.home.score > g.away.score
        ? 'home'
        : 'away'
      : null
  const side = (ha: 'away' | 'home'): SideRow => ({
    team: g[ha].team,
    right: played ? String(g[ha].score ?? '') : (g[ha].record ?? ''),
    bright: !played || lead === null || lead === ha,
    played,
  })
  const t = tipoff(g, tz)
  const cd = countdown(g.date)
  return {
    id: g.id,
    date: g.date,
    time: t.local,
    et: t.et,
    tone: tone(g),
    status:
      g.state === 'post'
        ? g.status
        : g.state === 'in'
          ? `LIVE · ${g.status}`
          : g.status || (cd ? cd.toUpperCase() : 'UPCOMING'),
    favLabel: favLabel(g, followed),
    sides: [side('away'), side('home')],
  }
}

export function lineRow(g: Game, tz: string): LineRow {
  return {
    id: g.id,
    away: g.away.team,
    home: g.home.team,
    line: g.state === 'pre' ? '@' : `${g.away.score} – ${g.home.score}`,
    tone: tone(g),
    status: g.state === 'post' ? g.status : g.state === 'in' ? `LIVE · ${g.status}` : g.status || tipoff(g, tz).local,
  }
}

export function involves(g: Game, ids: Set<string>): boolean {
  return ids.has(g.home.team.id) || ids.has(g.away.team.id)
}
