/**
 * Bundled competition palette for fs:match-card. Maps slugs to display name,
 * brand color, and a short tag used in the watermark layer of card variants.
 *
 * The match-card layouts paint the competition tag faintly behind the score
 * (à la the "CHAMPIONS LEAGUE" star pattern in broadcast graphics). Authors
 * can override per-card via YAML (`competitionSlug`, `competitionLogoUrl`).
 */

export interface CompetitionEntry {
  name: string
  /** Brand hex used for the watermark and accent fills. */
  color: string
  /** Short broadcast-style tag drawn behind the score in horizontal/portrait layouts. */
  tag: string
}

export const COMPETITIONS: Record<string, CompetitionEntry> = {
  prem: { name: 'Premier League', color: '#3D195B', tag: 'PREMIER LEAGUE' },
  'premier-league': { name: 'Premier League', color: '#3D195B', tag: 'PREMIER LEAGUE' },
  'la-liga': { name: 'La Liga', color: '#EE3524', tag: 'LA LIGA' },
  'serie-a': { name: 'Serie A', color: '#024494', tag: 'SERIE A' },
  bundesliga: { name: 'Bundesliga', color: '#D20515', tag: 'BUNDESLIGA' },
  'ligue-1': { name: 'Ligue 1', color: '#091C3E', tag: 'LIGUE 1' },
  ucl: { name: 'UEFA Champions League', color: '#00468B', tag: 'CHAMPIONS LEAGUE' },
  'champions-league': {
    name: 'UEFA Champions League',
    color: '#00468B',
    tag: 'CHAMPIONS LEAGUE',
  },
  uel: { name: 'UEFA Europa League', color: '#F26522', tag: 'EUROPA LEAGUE' },
  'fa-cup': { name: 'FA Cup', color: '#1B1F2A', tag: 'FA CUP' },
  'world-cup': { name: 'FIFA World Cup', color: '#326295', tag: 'WORLD CUP' },
}

export function findCompetition(slugOrName?: string): CompetitionEntry | null {
  if (!slugOrName) return null
  const direct = COMPETITIONS[slugOrName]
  if (direct) return direct
  const slug = slugOrName.toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return COMPETITIONS[slug] ?? null
}
