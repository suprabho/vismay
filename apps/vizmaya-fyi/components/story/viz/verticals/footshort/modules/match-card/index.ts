import type { VizModule } from '../../../../types'

/**
 * Footshort match-card — proof-of-concept vertical viz module.
 *
 * Shape: a small editorial card showing a fixture (home / away / score /
 * competition). Real Footshort will pipe this from a fetched fixture API;
 * for the plugin-path proof, the YAML carries the fixture inline.
 */
export interface MatchCardConfig {
  type: 'fs:match-card'
  home: string
  away: string
  /** "2–1" / "FT" / "Live" / etc. — free-form display string. */
  score?: string
  competition?: string
  /** Optional accent color override (hex). Defaults to the theme's accent. */
  accent?: string
}

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): MatchCardConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fs:match-card layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.home !== 'string' || r.home.length === 0) {
    throw new Error(`${ctx.label}: fs:match-card requires 'home' (team name)`)
  }
  if (typeof r.away !== 'string' || r.away.length === 0) {
    throw new Error(`${ctx.label}: fs:match-card requires 'away' (team name)`)
  }
  return {
    type: 'fs:match-card',
    home: r.home,
    away: r.away,
    score: typeof r.score === 'string' ? r.score : undefined,
    competition: typeof r.competition === 'string' ? r.competition : undefined,
    accent: typeof r.accent === 'string' ? r.accent : undefined,
  }
}

const matchCardModule: VizModule<MatchCardConfig> = {
  type: 'fs:match-card',
  label: 'Footshort — match card',
  slots: ['foreground'],
  parseConfig,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (config) =>
    `fs:match-card:${config.home}::${config.away}::${config.score ?? ''}`,
}

export default matchCardModule
