'use client'

import type { CSSProperties } from 'react'
import type { RaceCardConfig } from '../index'
import { accentWash, resolveRace } from './shared'

/**
 * Compact chip — small race badge like the reference Monaco GP card.
 * Time/session label on top, GP name + flag, formula-1 footer line.
 */
export default function CompactLayout({ config }: { config: RaceCardConfig }) {
  const r = resolveRace(config)
  const wrap: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0.75rem',
  }
  const card: CSSProperties = {
    width: 'min(220px, 100%)',
    borderRadius: '14px',
    padding: '14px 16px',
    background: accentWash(r.accent),
    color: '#fff',
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
  }
  const top: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    letterSpacing: '0.18em',
    fontWeight: 600,
  }
  const gpRow: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '2px',
  }
  const gpName: CSSProperties = {
    fontFamily: 'var(--font-serif, ui-serif)',
    fontSize: '17px',
    fontWeight: 700,
    lineHeight: 1.1,
  }
  const foot: CSSProperties = {
    marginTop: '4px',
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.7)',
  }
  return (
    <div style={wrap}>
      <div style={card}>
        {(config.sessionLabel || r.dateLabel) && (
          <div style={top}>{config.sessionLabel ?? r.dateLabel}</div>
        )}
        <div style={gpRow}>
          {r.flagSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={r.flagSrc}
              alt=""
              width={22}
              height={14}
              style={{ borderRadius: '2px', objectFit: 'cover', boxShadow: '0 0 0 1px rgba(0,0,0,0.2)' }}
            />
          )}
          <span style={gpName}>{r.gpName.replace(/Grand Prix$/, '').trim() || r.gpName}</span>
        </div>
        <div style={foot}>Formula 1{config.round ? ` · Rd ${config.round}` : ''}</div>
      </div>
    </div>
  )
}
