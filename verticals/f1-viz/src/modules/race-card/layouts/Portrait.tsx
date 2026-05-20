'use client'

import type { CSSProperties } from 'react'
import type { RaceCardConfig } from '../index'
import { accentWash, darken, resolveRace } from './shared'

/**
 * Portrait detail card — tall sheet with the flag centered, GP name + round
 * label, big session/kickoff stack, and an optional winner footer.
 */
export default function PortraitLayout({ config }: { config: RaceCardConfig }) {
  const r = resolveRace(config)
  const bg = config.backgroundImage
    ? `linear-gradient(180deg, ${r.accent}f0 0%, ${darken(r.accent, 0.6)}f5 100%), url(${config.backgroundImage}) center/cover`
    : accentWash(r.accent)

  const wrap: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.75rem',
  }
  const card: CSSProperties = {
    width: 'min(260px, 100%)',
    height: 'min(100%, 440px)',
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
  const flagBox: CSSProperties = {
    width: '100%',
    aspectRatio: '3 / 2',
    borderRadius: '10px',
    overflow: 'hidden',
    boxShadow: '0 6px 16px rgba(0,0,0,0.4)',
    background: 'rgba(255,255,255,0.08)',
  }
  const stack: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: '4px',
  }
  const gpName: CSSProperties = {
    fontFamily: 'var(--font-serif, ui-serif)',
    fontSize: '20px',
    fontWeight: 700,
    lineHeight: 1.1,
    letterSpacing: '-0.01em',
    textShadow: '0 1px 6px rgba(0,0,0,0.35)',
  }
  const sessionBig: CSSProperties = {
    fontFamily: 'var(--font-serif, ui-serif)',
    fontSize: '30px',
    fontWeight: 700,
    letterSpacing: '-0.01em',
  }
  const dateLine: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.8)',
  }
  const winnerPill: CSSProperties = {
    justifySelf: 'center',
    padding: '6px 10px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.18)',
    backdropFilter: 'blur(4px)',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
  }
  const circuitFoot: CSSProperties = {
    paddingTop: '10px',
    borderTop: '1px solid rgba(255,255,255,0.18)',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={topRow}>
          <span>{config.round ? `Round ${config.round}` : 'Formula 1'}</span>
          <span>{config.season}</span>
        </div>
        <div style={flagBox}>
          {r.flagSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={r.flagSrc}
              alt={r.country}
              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
          )}
        </div>
        <div style={stack}>
          <div style={gpName}>{r.gpName}</div>
          {(config.sessionLabel || r.dateLabel) && (
            <div style={sessionBig}>{config.sessionLabel ?? r.dateLabel}</div>
          )}
          {r.dateLabel && config.sessionLabel && <div style={dateLine}>{r.dateLabel}</div>}
        </div>
        {config.winner && <span style={winnerPill}>🏆 {config.winner}</span>}
        {r.circuit && <div style={circuitFoot}>{r.circuit}</div>}
      </div>
    </div>
  )
}
