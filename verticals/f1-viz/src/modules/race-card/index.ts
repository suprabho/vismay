/**
 * `f1:race-card` — minimum-viable F1 viz module.
 *
 * Mirrors the shape of footshort-viz's match-card. Once @vismay/viz-engine
 * exports VizModule / VizRenderProps, swap the placeholder types out for the
 * real ones and wire it through registerVizModule from src/index.ts.
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
