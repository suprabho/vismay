import type { FootshortsCardData } from '../modules/dataContext'
import type { CardFrameConfig } from '../types'

/** A competition the composer can target (mirrors the page's `initialCompetitions`). */
export interface CompetitionOption {
  slug: string
  name: string
  season: string
  hasStandings: boolean
  hasFixtures: boolean
}

/** `compKey` is `"<slug>::<season>"`. */
export function compKeyOf(c: { slug: string; season: string }): string {
  return `${c.slug}::${c.season}`
}

/**
 * Per-render context the footshorts composer host threads to the picker editors
 * (and the card frame): the static competition list + the live data store the
 * host fetches (keyed by compKey). The pickers read options from here; the
 * card modules read the same store via `FootshortsDataProvider`.
 */
export interface FootshortsComposerCtx {
  competitions: CompetitionOption[]
  data: FootshortsCardData
  /** Card-level chrome (theme/ratio/handle/logo/eyebrow/background…) the host's
   *  `renderFrame` draws around the layer stack. */
  frame: CardFrameConfig
}
