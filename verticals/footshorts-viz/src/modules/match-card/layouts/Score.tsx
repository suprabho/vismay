'use client'

import type { CSSProperties } from 'react'
import { Crest } from '../../../data/Crest'
import type { MatchCardConfig } from '../index'
import { resolveFixture, splitScoreNote } from './shared'

/**
 * Score-forward layout — refined version of the original card. Editorial
 * panel on a blurred neutral surface, big score line, crests flanking the
 * team names, accent border. No background image.
 */
export default function ScoreLayout({ config }: { config: MatchCardConfig }) {
  const f = resolveFixture(config)
  const accent = config.accent ?? f.competitionColor ?? 'var(--color-accent)'
  const borderColor = config.borderColor ?? accent
  // Defaults are tuned for a light surface (e.g. the share-card sheet); pass
  // cardColor/textColor for a dark surface.
  const cardColor = config.cardColor ?? '#FBF7EF'
  const textColor = config.textColor ?? '#1D2A4A'
  const { main: scoreMain, note: scoreNote } = splitScoreNote(f.score)

  const wrap: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
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
  const scoreCol: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    minWidth: '92px',
  }
  const score: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '28px',
    fontWeight: 700,
    color: accent,
    lineHeight: 1,
  }
  const scoreSub: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: accent,
    opacity: 0.75,
  }
  const kickoff: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    letterSpacing: '0.18em',
    color: textColor,
    opacity: 0.65,
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
          <div style={scoreCol}>
            <span style={score}>{scoreMain}</span>
            {scoreNote && <span style={scoreSub}>{scoreNote}</span>}
          </div>
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
