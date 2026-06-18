'use client'

import type { CSSProperties } from 'react'
import type { MatchCardConfig, MatchCardItem } from '../index'
import { CompactCard } from './Compact'
import { capToGrid, fsGridStyle } from '../../shared/grid'

/**
 * Grid layout — tiles several fixtures as compact cards in a `columns`-wide
 * matrix (mirrors `fs:team-form-strip`'s grid). Each `cards[i]` becomes a
 * single-fixture config rendered through `CompactCard`, so per-card colors,
 * crests and competition lines all work the same as a standalone compact card.
 */
export default function GridLayout({ config }: { config: MatchCardConfig }) {
  const cols = config.columns && config.columns > 0 ? config.columns : 2
  const items = capToGrid(config.cards ?? [], cols, config.rows)

  const wrap: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
  }

  return (
    <div style={wrap}>
      <div style={{ width: '100%', maxWidth: '900px' }}>
        <div style={fsGridStyle(cols, config.cardWidth)}>
          {items.map((item, i) => (
            <CompactCard
              key={`${item.home}-${item.away}-${i}`}
              config={itemConfig(item)}
              width="100%"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Build a single-fixture compact config from one grid item. */
function itemConfig(item: MatchCardItem): MatchCardConfig {
  return {
    type: 'fs:match-card',
    layout: 'compact',
    home: item.home,
    away: item.away,
    score: item.score,
    kickoff: item.kickoff,
    competition: item.competition,
    competitionSlug: item.competitionSlug,
    homeColor: item.homeColor,
    awayColor: item.awayColor,
    homeCrestUrl: item.homeCrestUrl,
    awayCrestUrl: item.awayCrestUrl,
  }
}
