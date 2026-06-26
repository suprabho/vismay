'use client'

import type { CSSProperties } from 'react'
import { Crest } from '../../../data/Crest'
import type { MatchCardConfig } from '../index'
import { resolveFixture, splitScoreNote } from './shared'

/**
 * Bare score card — the editorial panel itself: competition line, crests
 * flanking the team names, big centered score, accent border. `ScoreLayout`
 * centers a single one in the viz cell; the `grid` layout tiles several so every
 * tile is the same card as the standalone `score` layout.
 */
export function ScoreCard({
  config,
  width,
}: {
  config: MatchCardConfig
  /** Card width. Omitted = standalone (min 300px); the grid passes `100%` to fill its cell. */
  width?: number | string
}) {
  const f = resolveFixture(config)
  const accent = config.accent ?? f.competitionColor ?? 'var(--color-accent)'
  const borderColor = config.borderColor ?? accent
  // Defaults are tuned for a light surface (e.g. the share-card sheet); pass
  // cardColor/textColor for a dark surface.
  const cardColor = config.cardColor ?? '#FBF7EF'
  const textColor = config.textColor ?? '#1D2A4A'
  const { main: scoreMain, note: scoreNote } = splitScoreNote(f.score)

  const card: CSSProperties = {
    width,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '20px 28px',
    border: `1px solid ${borderColor}`,
    borderRadius: '12px',
    color: textColor,
    // Grid tiles pass an explicit width and must shrink with their column; only
    // the standalone card claims a minimum width.
    minWidth: width !== undefined ? 0 : '300px',
    boxSizing: 'border-box',
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
    // `minmax(0, 1fr)` (not a bare `1fr`) so the team columns can shrink below
    // their content's min-content width. A bare `1fr` keeps the implicit
    // `min-width: auto`, which lets a long single-word name (Germany,
    // Netherlands, Australia) force its track wider than the card and push the
    // away crest + name past the right border, where the frame clips them.
    gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
    alignItems: 'center',
    gap: '14px',
    width: '100%',
  }
  const teamCol: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    // Pair with the `minmax(0, …)` tracks above so this flex column can shrink
    // and its name actually wraps instead of overflowing the card.
    minWidth: 0,
  }
  const teamName: CSSProperties = {
    fontFamily: 'var(--font-serif, ui-serif)',
    fontSize: '15px',
    fontWeight: 600,
    maxWidth: '100%',
    // Wrap on spaces first; break a too-long single word as a last resort so
    // it never spills past the card edge.
    overflowWrap: 'break-word',
    hyphens: 'auto',
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
  )
}

/**
 * Score-forward layout — refined version of the original card. Centers a single
 * editorial score card in the viz cell. No background image.
 */
export default function ScoreLayout({ config }: { config: MatchCardConfig }) {
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
      <ScoreCard config={config} />
    </div>
  )
}
