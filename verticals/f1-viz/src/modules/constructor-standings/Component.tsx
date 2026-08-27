'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { ConstructorStandings } from '../../web/ConstructorStandings'
import type { ConstructorStandingsConfig } from './index'

export default function ConstructorStandingsVizComponent({
  config,
  noteReady,
}: VizRenderProps<ConstructorStandingsConfig>) {
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
        overflowY: 'auto',
      }}
    >
      <div style={{ width: '100%', maxWidth: '480px' }}>
        <ConstructorStandings rows={config.rows} />
      </div>
    </div>
  )
}
