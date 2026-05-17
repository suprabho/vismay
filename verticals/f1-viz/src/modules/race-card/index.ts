/**
 * `f1:race-card` — placeholder.
 *
 * TODO(vizf1-scaffold): wire as a full VizModule (parseConfig + load +
 * stableIdentity) and register it from src/index.ts. Skipped in the initial
 * scaffold to keep the surface small — the working three are race-row,
 * driver-standings, and position-chart.
 */

export interface RaceCardConfig {
  type: 'f1:race-card'
  /** Grand Prix display name, e.g. "Monaco Grand Prix" */
  grandPrix: string
  /** Season year. */
  season: number
  /** Winning driver display name. */
  winner: string
}
