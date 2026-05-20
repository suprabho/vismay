'use client'

import type { CSSProperties } from 'react'
import type { RaceCardConfig } from '../index'
import { resolveRace } from './shared'

/**
 * Score-forward layout — editorial panel on a blurred neutral surface, big
 * GP name, flag + circuit kicker, optional winner. Sister to fs:match-card's
 * Score layout — no background image.
 */
export default function ScoreLayout({ config }: { config: RaceCardConfig }) {
  const r = resolveRace(config)
  const accent = r.accent

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
    gap: '10px',
    padding: '22px 30px',
    border: `1px solid ${accent}`,
    borderRadius: '12px',
    color: 'var(--color-text, #fff)',
    minWidth: '300px',
    textAlign: 'center',
    background: 'rgba(0,0,0,0.18)',
  }
  const kicker: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: accent,
  }
  const flagRow: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
  }
  const gpName: CSSProperties = {
    fontFamily: 'var(--font-serif, ui-serif)',
    fontSize: '24px',
    fontWeight: 700,
    lineHeight: 1.1,
    letterSpacing: '-0.01em',
  }
  const winner: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '12px',
    color: 'rgba(255,255,255,0.85)',
  }
  const circuit: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '10px',
    letterSpacing: '0.18em',
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <div style={kicker}>
          {config.season}
          {config.round ? ` · Round ${config.round}` : ''}
        </div>
        <div style={flagRow}>
          {r.flagSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={r.flagSrc}
              alt=""
              width={28}
              height={18}
              style={{ borderRadius: '2px', objectFit: 'cover', boxShadow: '0 0 0 1px rgba(0,0,0,0.2)' }}
            />
          )}
          <span style={gpName}>{r.gpName}</span>
        </div>
        {config.winner && <div style={winner}>🏆 {config.winner}</div>}
        {r.circuit && <div style={circuit}>{r.circuit}</div>}
      </div>
    </div>
  )
}
