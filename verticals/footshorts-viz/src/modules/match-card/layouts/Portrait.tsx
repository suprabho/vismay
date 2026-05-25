'use client'

import type { CSSProperties } from 'react'
import { Crest } from '../../../data/Crest'
import type { MatchCardConfig } from '../index'
import { darken, resolveFixture, teamWash } from './shared'

/**
 * Portrait detail card — tall sheet with crests side-by-side, big date /
 * kickoff stack, and an optional "Watch on …" line. Modeled on the Pacers
 * vs Thunder reference.
 */
export default function PortraitLayout({ config }: { config: MatchCardConfig }) {
  const f = resolveFixture(config)
  const bg = config.backgroundImage
    ? `linear-gradient(180deg, ${f.homeColor}f2 0%, ${darken(f.homeColor, 0.55)}f2 100%), url(${config.backgroundImage}) center/cover`
    : teamWash(f.homeColor)

  const wrap: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.75rem',
  }
  const card: CSSProperties = {
    width: 'min(280px, 100%)',
    height: 'min(100%, 460px)',
    borderRadius: '20px',
    padding: '18px 18px 16px',
    background: bg,
    color: '#fff',
    display: 'grid',
    gridTemplateRows: 'auto auto 1fr auto auto',
    rowGap: '10px',
    boxShadow: '0 20px 40px rgba(0,0,0,0.32)',
  }
  const topRow: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.85)',
  }
  const teamPair: CSSProperties = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    justifyItems: 'center',
    columnGap: '12px',
  }
  const teamCol: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  }
  const teamName: CSSProperties = {
    fontFamily: 'var(--font-sans, system-ui)',
    fontSize: '14px',
    fontWeight: 700,
    textAlign: 'center',
    lineHeight: 1.1,
    textShadow: '0 1px 6px rgba(0,0,0,0.4)',
  }
  const kickoffStack: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    minHeight: '90px',
  }
  const dateLine: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.8)',
  }
  const kickoffBig: CSSProperties = {
    fontFamily: 'var(--font-serif, ui-serif)',
    fontSize: '34px',
    fontWeight: 700,
    letterSpacing: '-0.01em',
  }
  const watchPill: CSSProperties = {
    justifySelf: 'center',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 10px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.18)',
    backdropFilter: 'blur(4px)',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  }
  const compFoot: CSSProperties = {
    marginTop: '4px',
    paddingTop: '10px',
    borderTop: '1px solid rgba(255,255,255,0.18)',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={topRow}>
          <span>{f.competitionTag || 'MATCH'}</span>
          <span>{config.score && !f.scorePlaceholder ? config.score : 'Upcoming'}</span>
        </div>
        <div style={teamPair}>
          <div style={teamCol}>
            <Crest team={config.home} size={56} crestUrl={config.homeCrestUrl} />
            <span style={teamName}>{f.homeShort}</span>
          </div>
          <div style={teamCol}>
            <Crest team={config.away} size={56} crestUrl={config.awayCrestUrl} />
            <span style={teamName}>{f.awayShort}</span>
          </div>
        </div>
        <div style={kickoffStack}>
          {config.dateLabel && <span style={dateLine}>{config.dateLabel}</span>}
          <span style={kickoffBig}>{config.kickoff ?? (f.scorePlaceholder ? '—' : f.score)}</span>
        </div>
        {config.watchOn && <span style={watchPill}>▶ Watch on {config.watchOn}</span>}
        {f.competitionName && <div style={compFoot}>{f.competitionName}</div>}
      </div>
    </div>
  )
}
