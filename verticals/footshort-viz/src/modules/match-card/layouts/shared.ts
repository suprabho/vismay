import { findTeam, resolveTeamColor } from '../../../data/teams'
import { findCompetition } from '../../../data/competitions'
import type { MatchCardConfig } from '../index'

export interface ResolvedFixture {
  homeName: string
  awayName: string
  homeShort: string
  awayShort: string
  homeColor: string
  awayColor: string
  competitionName: string
  competitionColor: string
  competitionTag: string
  score: string
  scorePlaceholder: boolean
}

export function resolveFixture(config: MatchCardConfig): ResolvedFixture {
  const homeEntry = findTeam(config.home)
  const awayEntry = findTeam(config.away)
  const compEntry = findCompetition(config.competitionSlug ?? config.competition)
  const score = config.score?.trim()
  return {
    homeName: homeEntry?.name ?? config.home,
    awayName: awayEntry?.name ?? config.away,
    homeShort: homeEntry?.shortName ?? homeEntry?.name ?? config.home,
    awayShort: awayEntry?.shortName ?? awayEntry?.name ?? config.away,
    homeColor: resolveTeamColor(config.home, config.homeColor),
    awayColor: resolveTeamColor(config.away, config.awayColor),
    competitionName: compEntry?.name ?? config.competition ?? '',
    competitionColor: compEntry?.color ?? 'var(--color-accent)',
    competitionTag: compEntry?.tag ?? (config.competition?.toUpperCase() ?? ''),
    score: score && score.length > 0 ? score : 'vs',
    scorePlaceholder: !score || score.length === 0,
  }
}

/** Diagonal split-color gradient: home on the left, away on the right. */
export function splitGradient(home: string, away: string): string {
  return `linear-gradient(105deg, ${home} 0%, ${home} 45%, ${away} 55%, ${away} 100%)`
}

/** Single-team radial wash, used for compact + score layouts. */
export function teamWash(color: string): string {
  return `radial-gradient(120% 100% at 15% 10%, ${color} 0%, ${darken(color, 0.4)} 100%)`
}

/** Returns a darker hex by mixing toward black by `amount` (0..1). */
export function darken(hex: string, amount: number): string {
  const c = parseHex(hex)
  if (!c) return hex
  const t = Math.max(0, Math.min(1, amount))
  const r = Math.round(c.r * (1 - t))
  const g = Math.round(c.g * (1 - t))
  const b = Math.round(c.b * (1 - t))
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}
