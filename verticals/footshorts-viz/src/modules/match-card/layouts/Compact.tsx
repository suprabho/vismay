'use client'

import type { CSSProperties } from 'react'
import { Crest } from '../../../data/Crest'
import type { MatchCardConfig } from '../index'
import { resolveFixture, teamWash } from './shared'

/**
 * Compact chip — small fixture badge like the reference Real-Madrid vs
 * Barcelona / Monaco GP cards. Single home-team wash background, two crests
 * stacked on the left, score or kickoff on the right.
 *
 * `CompactCard` is the bare card (no centering wrapper) so the `grid` layout can
 * tile many of them; `CompactLayout` centers a single one in the viz cell.
 */
export function CompactCard({
  config,
  width = 'min(280px, 100%)',
}: {
  config: MatchCardConfig
  /** Card width. Defaults to the standalone size; the grid passes `100%` to fill its cell. */
  width?: number | string
}) {
  const f = resolveFixture(config)
  const card: CSSProperties = {
    width,
    borderRadius: '14px',
    padding: '14px 16px',
    background: teamWash(f.homeColor),
    color: 'var(--color-text, #fff)',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
  }
  const kickoff: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    letterSpacing: '0.16em',
    color: 'rgba(255,255,255,0.85)',
    fontWeight: 600,
  }
  const teamRow: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontFamily: 'var(--font-sans, system-ui)',
    fontSize: '15px',
    fontWeight: 600,
  }
  const compLine: CSSProperties = {
    marginTop: '2px',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.7)',
  }
  return (
    <div style={card}>
      {(config.kickoff || config.score) && (
        <div style={kickoff}>{config.kickoff ?? config.score}</div>
      )}
      <div style={teamRow}>
        <Crest team={config.home} size={22} crestUrl={config.homeCrestUrl} />
        <span>{f.homeShort}</span>
      </div>
      <div style={teamRow}>
        <Crest team={config.away} size={22} crestUrl={config.awayCrestUrl} />
        <span>{f.awayShort}</span>
      </div>
      {f.competitionName && <div style={compLine}>{f.competitionName}</div>}
    </div>
  )
}

export default function CompactLayout({ config }: { config: MatchCardConfig }) {
  const wrap: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.75rem',
  }
  return (
    <div style={wrap}>
      <CompactCard config={config} />
    </div>
  )
}
