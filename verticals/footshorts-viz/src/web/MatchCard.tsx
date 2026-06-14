'use client'

import type { MatchCardConfig } from '../modules/match-card'
import CompactLayout from '../modules/match-card/layouts/Compact'
import HorizontalLayout from '../modules/match-card/layouts/Horizontal'
import PortraitLayout from '../modules/match-card/layouts/Portrait'
import ScoreLayout from '../modules/match-card/layouts/Score'

/**
 * `fs:match-card` as a plain web component — the layout switch from the viz
 * module's `Component`, minus the engine's `noteReady` lifecycle, so hosts
 * (e.g. the admin share-card creator) can render an editorial fixture card
 * straight from a config without going through the render engine. Parallels
 * the standalone `MatchTile` export.
 */
export function MatchCard({ config }: { config: MatchCardConfig }) {
  switch (config.layout) {
    case 'compact':
      return <CompactLayout config={config} />
    case 'horizontal':
      return <HorizontalLayout config={config} />
    case 'portrait':
      return <PortraitLayout config={config} />
    case 'score':
    default:
      return <ScoreLayout config={config} />
  }
}
