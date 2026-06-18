'use client'

import type { CSSProperties } from 'react'
import type { MatchCardConfig, MatchCardItem } from '../index'
import { ScoreCard } from './Score'
import { capToGrid, fsGridStyle } from '../../shared/grid'

/**
 * Grid layout — tiles several fixtures as score cards in a `columns`-wide matrix
 * (mirrors `fs:team-form-strip`'s grid). Each `cards[i]` becomes a single-fixture
 * config rendered through `ScoreCard`, so every tile is the same editorial card
 * as the standalone `score` layout: per-card colors, crests and competition
 * lines all behave identically, and any grid-level theming is inherited.
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
      <div style={{ width: '100%', maxWidth: '960px' }}>
        <div style={fsGridStyle(cols, config.cardWidth)}>
          {items.map((item, i) => (
            <ScoreCard
              key={`${item.home}-${item.away}-${i}`}
              config={itemConfig(item, config)}
              width="100%"
            />
          ))}
        </div>
      </div>
    </div>
  )
}

/** Build a single-fixture score config from one grid item, inheriting grid-level theming. */
function itemConfig(item: MatchCardItem, grid: MatchCardConfig): MatchCardConfig {
  return {
    type: 'fs:match-card',
    layout: 'score',
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
    // Inherit the grid's editorial theming so every tile matches. When the grid
    // sets no uniform accent, a per-card `homeColor` becomes that tile's accent
    // (border + score + competition line), so cards stay visually distinct even
    // when they share a competition. Falls back to the competition color in
    // ScoreCard when neither is set.
    accent: grid.accent ?? item.homeColor,
    cardColor: grid.cardColor,
    borderColor: grid.borderColor,
    textColor: grid.textColor,
  }
}
