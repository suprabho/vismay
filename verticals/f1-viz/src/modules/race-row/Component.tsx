'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { RaceRow } from '../../web/RaceRow'
import type { RaceRowConfig } from './index'

export default function RaceRowVizComponent({
  config,
  noteReady,
}: VizRenderProps<RaceRowConfig>) {
  useEffect(() => {
    const h = requestAnimationFrame(() => noteReady())
    return () => cancelAnimationFrame(h)
  }, [noteReady])

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <RaceRow race={config.race} />
      </div>
    </div>
  )
}
