'use client'

import type { CSSProperties } from 'react'
import { Crest } from '../../../data/Crest'
import type { MatchCardConfig } from '../index'
import { resolveFixture } from './shared'

/**
 * Score-forward layout — refined version of the original card. Editorial
 * panel on a blurred neutral surface, big score line, crests flanking the
 * team names, accent border. No background image.
 */
export default function ScoreLayout({ config }: { config: MatchCardConfig }) {
  const f = resolveFixture(config)
  const accent = config.accent ?? f.competitionColor ?? 'var(--color-accent)'
  const borderColor = config.borderColor ?? accent
  const cardColor = config.cardColor ?? 'rgba(0,0,0,0.18)'
  const textColor = config.textColor ?? 'var(--color-text, #fff)'

  const wrap: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgb(var(--color-panel-rgb, 18 18 24) / 0.45)',
    backdropFilter: 'blur(6px)',
    padding: '1rem',
  }
  const card: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '20px 28px',
    border: `1px solid ${borderColor}`,
    borderRadius: '12px',
    color: textColor,
    minWidth: '300px',
    textAlign: 'center',
    background: cardColor,
  }
  const competition: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: accent,
  }
  const teams: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr auto 1fr',
    alignItems: 'center',
    gap: '14px',
    width: '100%',
  }
  const teamCol: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
  }
  const teamName: CSSProperties = {
    fontFamily: 'var(--font-serif, ui-serif)',
    fontSize: '15px',
    fontWeight: 600,
  }
  const score: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '28px',
    fontWeight: 700,
    color: accent,
    minWidth: '92px',
  }
  const kickoff: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    letterSpacing: '0.18em',
    color: config.textColor ?? 'rgba(255,255,255,0.6)',
    opacity: config.textColor ? 0.65 : 1,
  }

  return (
    <div style={wrap}>
      <div style={card}>
        {f.competitionName && <div style={competition}>{f.competitionName}</div>}
        <div style={teams}>
          <div style={teamCol}>
            <Crest team={config.home} size={44} crestUrl={config.homeCrestUrl} />
            <span style={teamName}>{f.homeName}</span>
          </div>
          <span style={score}>{f.score}</span>
          <div style={teamCol}>
            <Crest team={config.away} size={44} crestUrl={config.awayCrestUrl} />
            <span style={teamName}>{f.awayName}</span>
          </div>
        </div>
        {config.kickoff && <div style={kickoff}>{config.kickoff}</div>}
      </div>
    </div>
  )
}
