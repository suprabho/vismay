'use client'

import type { CSSProperties } from 'react'
import type { RaceCardConfig } from '../index'
import { darken, resolveRace } from './shared'

/**
 * Horizontal feature card — wide GP hero with the country flag, large GP
 * name, circuit kicker, and round watermark on the right.
 */
export default function HorizontalLayout({ config }: { config: RaceCardConfig }) {
  const r = resolveRace(config)
  const bg = config.backgroundImage
    ? `linear-gradient(95deg, ${r.accent}f0 0%, ${darken(r.accent, 0.35)}cc 70%, rgba(0,0,0,0.6) 100%), url(${config.backgroundImage}) center/cover`
    : `linear-gradient(95deg, ${r.accent} 0%, ${darken(r.accent, 0.5)} 100%)`

  const wrap: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
  }
  const card: CSSProperties = {
    width: 'min(640px, 100%)',
    aspectRatio: '16 / 7',
    borderRadius: '18px',
    padding: '18px 26px',
    background: bg,
    backgroundBlendMode: config.backgroundImage ? 'multiply' : 'normal',
    color: '#fff',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 16px 40px rgba(0,0,0,0.32)',
    display: 'grid',
    gridTemplateColumns: 'auto 1fr',
    columnGap: '20px',
    alignItems: 'center',
  }
  const flagBox: CSSProperties = {
    width: 'clamp(72px, 12vw, 110px)',
    aspectRatio: '3 / 2',
    borderRadius: '8px',
    overflow: 'hidden',
    boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
    background: 'rgba(255,255,255,0.08)',
  }
  const stack: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    zIndex: 1,
    minWidth: 0,
  }
  const kicker: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.85)',
  }
  const gpName: CSSProperties = {
    fontFamily: 'var(--font-serif, ui-serif)',
    fontSize: 'clamp(20px, 3vw, 30px)',
    fontWeight: 700,
    letterSpacing: '-0.01em',
    lineHeight: 1.05,
    textShadow: '0 1px 8px rgba(0,0,0,0.35)',
  }
  const circuit: CSSProperties = {
    fontFamily: 'var(--font-sans, system-ui)',
    fontSize: '12px',
    color: 'rgba(255,255,255,0.8)',
    letterSpacing: '0.02em',
  }
  const round: CSSProperties = {
    position: 'absolute',
    right: '-2%',
    bottom: '-30%',
    fontFamily: 'var(--font-mono)',
    fontWeight: 800,
    fontSize: 'clamp(80px, 22vw, 180px)',
    letterSpacing: '-0.06em',
    color: 'rgba(255,255,255,0.08)',
    lineHeight: 1,
    pointerEvents: 'none',
  }
  const session: CSSProperties = {
    marginTop: '4px',
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    letterSpacing: '0.18em',
    color: 'rgba(255,255,255,0.85)',
  }

  return (
    <div style={wrap}>
      <div style={card}>
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
          <div style={kicker}>
            Round {config.round ?? '—'} · {config.season}
          </div>
          <div style={gpName}>{r.gpName}</div>
          {r.circuit && <div style={circuit}>{r.circuit}</div>}
          {(config.sessionLabel || r.dateLabel) && (
            <div style={session}>
              {[config.sessionLabel, r.dateLabel].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        {config.round !== undefined && <div style={round}>R{config.round}</div>}
      </div>
    </div>
  )
}
