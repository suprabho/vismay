'use client'

import type { CSSProperties } from 'react'
import type { RaceCardConfig } from '../index'
import { resolveRace } from './shared'

/**
 * Score-forward layout — editorial panel, big GP name, flag + circuit kicker,
 * date/session line, optional winner. Sister to fs:match-card's Score layout —
 * no background image.
 *
 * Sized from its region, not in fixed pixels: the wrapper is an inline-size
 * container and every dimension is a clamped `cqi`, so the card fills a deck's
 * wide chart region instead of floating as a 300px chip in an empty panel, and
 * still reads in a narrow share card. The translucent surface sits on the card
 * only — painting it across the whole region is what made the region look like
 * an empty grey box around a tiny card.
 */
export default function ScoreLayout({ config }: { config: RaceCardConfig }) {
  const r = resolveRace(config)
  const accent = r.accent
  const meta = [r.dateLabel, config.sessionLabel].filter(Boolean).join(' · ')

  const wrap: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    // inline-size, not size: size containment collapses to 0 height wherever
    // the parent gives no definite height (catalog, share cards).
    containerType: 'inline-size',
  }
  const card: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'clamp(8px, 2.4cqi, 18px)',
    width: 'min(100%, 640px)',
    maxHeight: '100%',
    padding: 'clamp(18px, 5cqi, 44px) clamp(20px, 6cqi, 56px)',
    border: `1px solid ${accent}`,
    borderTop: `4px solid ${accent}`,
    borderRadius: '14px',
    color: 'var(--color-text, #fff)',
    textAlign: 'center',
    background: 'rgb(var(--color-panel-rgb, 18 18 24) / 0.55)',
    backdropFilter: 'blur(6px)',
    boxSizing: 'border-box',
  }
  const kicker: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(11px, 1.9cqi, 15px)',
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: accent,
  }
  const flagRow: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 'clamp(10px, 2.2cqi, 18px)',
  }
  const flag: CSSProperties = {
    width: 'clamp(28px, 7.5cqi, 60px)',
    height: 'auto',
    aspectRatio: '3 / 2',
    borderRadius: '3px',
    objectFit: 'cover',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.2)',
  }
  const gpName: CSSProperties = {
    fontFamily: 'var(--font-serif, ui-serif)',
    fontSize: 'clamp(22px, 6.5cqi, 52px)',
    fontWeight: 700,
    lineHeight: 1.05,
    letterSpacing: '-0.015em',
  }
  const metaLine: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(11px, 2cqi, 15px)',
    color: 'rgba(255,255,255,0.75)',
  }
  const winner: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(13px, 2.8cqi, 20px)',
    color: 'rgba(255,255,255,0.92)',
  }
  const circuit: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: 'clamp(10px, 1.7cqi, 13px)',
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
            <img src={r.flagSrc} alt="" style={flag} />
          )}
          <span style={gpName}>{r.gpName}</span>
        </div>
        {meta && <div style={metaLine}>{meta}</div>}
        {config.winner && <div style={winner}>🏆 {config.winner}</div>}
        {r.circuit && <div style={circuit}>{r.circuit}</div>}
      </div>
    </div>
  )
}
