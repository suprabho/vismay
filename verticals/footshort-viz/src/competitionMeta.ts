/**
 * Display metadata for football competitions, keyed by competition slug.
 *
 * Lives in the vertical (not an app) so any consumer rendering a fixture or a
 * league tile picks up the same names + brand palette. Slugs match what the
 * Footshort worker emits (see commonName + slugify in apps/footshort/worker).
 */

const COMPETITION_DISPLAY_NAME: Record<string, string> = {
  'premier-league': 'Premier League',
  'primera-division': 'La Liga',
  bundesliga: 'Bundesliga',
  'serie-a': 'Serie A',
  'ligue-1': 'Ligue 1',
  'champions-league': 'Champions League',
  'europa-league': 'Europa League',
  'world-cup': 'World Cup',
  'european-championship': 'Euros',
  eredivisie: 'Eredivisie',
  'primeira-liga': 'Primeira Liga',
  championship: 'Championship',
  'campeonato-brasileiro-serie-a': 'Brasileirão',
}

const COMPETITION_PALETTE: Record<string, string> = {
  'premier-league': '#3D195B',
  'primera-division': '#E2231A',
  bundesliga: '#D20515',
  'serie-a': '#0066CC',
  'ligue-1': '#091C3E',
  'champions-league': '#0E1E5B',
  'europa-league': '#FF6900',
  'world-cup': '#7B2D26',
  'european-championship': '#001A70',
  eredivisie: '#F47C20',
  'primeira-liga': '#006B3F',
  championship: '#1A1A1A',
  // CBF green — original yellow killed white-text contrast on the league tile.
  'campeonato-brasileiro-serie-a': '#009C3B',
}

/**
 * Pretty display name for a competition slug. Falls back to the slug itself
 * (so unknown competitions render with at least the raw identifier).
 */
export function getCompetitionDisplayName(slug: string | null | undefined): string {
  if (!slug) return ''
  return COMPETITION_DISPLAY_NAME[slug] ?? slug
}

/**
 * Brand color for a competition slug, or undefined if we don't have one.
 * Returned as a hex string so callers can pass it straight to gradient builders.
 */
export function getCompetitionPalette(slug: string | null | undefined): string | undefined {
  if (!slug) return undefined
  return COMPETITION_PALETTE[slug]
}

/**
 * Returns a darker variant of a #RRGGBB hex by the given fractional amount
 * (0..1). Used for two-stop competition gradients on league/match tiles. If
 * the input isn't a valid hex, returns it unchanged.
 */
export function darkenHex(hex: string, amount = 0.35): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)))
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)))
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)))
  return `rgb(${r}, ${g}, ${b})`
}
