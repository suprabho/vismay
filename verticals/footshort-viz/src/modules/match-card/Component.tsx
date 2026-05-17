'use client'

import { useEffect } from 'react'
import type { CSSProperties } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import type { MatchCardConfig } from './index'

export default function MatchCardComponent({
  config,
  noteReady,
}: VizRenderProps<MatchCardConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  const accent = config.accent ?? 'var(--color-accent)'

  const wrapperStyle: CSSProperties = {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgb(var(--color-panel-rgb) / 0.45)',
    backdropFilter: 'blur(6px)',
  }
  const cardStyle: CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '1.5rem 2rem',
    border: `1px solid ${accent}`,
    borderRadius: '0.5rem',
    color: 'var(--color-text)',
    minWidth: '240px',
    textAlign: 'center',
  }
  const competitionStyle: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '11px',
    letterSpacing: '0.18em',
    textTransform: 'uppercase',
    color: accent,
  }
  const scoreLineStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.75rem',
    fontFamily: 'var(--font-serif)',
    fontSize: '24px',
    lineHeight: 1.1,
  }
  const scoreStyle: CSSProperties = {
    fontFamily: 'var(--font-mono)',
    fontSize: '20px',
    color: accent,
    minWidth: '64px',
  }

  return (
    <div style={wrapperStyle}>
      <div style={cardStyle}>
        {config.competition && <div style={competitionStyle}>{config.competition}</div>}
        <div style={scoreLineStyle}>
          <span>{config.home}</span>
          <span style={scoreStyle}>{config.score ?? '–'}</span>
          <span>{config.away}</span>
        </div>
      </div>
    </div>
  )
}
