'use client'

import type { RaceCardConfig } from './index'

interface Props {
  config: RaceCardConfig
}

export default function RaceCardComponent({ config }: Props) {
  return (
    <div
      style={{
        padding: '2rem',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: '0.5rem',
        background: 'rgba(0,0,0,0.5)',
        color: 'white',
      }}
    >
      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.1em', opacity: 0.7 }}>
        {config.season} · {config.grandPrix}
      </div>
      <div style={{ fontSize: '1.5rem', fontWeight: 600, marginTop: '0.5rem' }}>
        {config.winner}
      </div>
    </div>
  )
}
