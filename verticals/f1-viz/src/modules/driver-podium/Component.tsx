'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { DriverPodium } from '../../web/StandingsPodium'
import type { DriverPodiumConfig } from './index'

export default function DriverPodiumVizComponent({
  config,
  noteReady,
}: VizRenderProps<DriverPodiumConfig>) {
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
        <DriverPodium rows={config.rows} title={config.title} />
      </div>
    </div>
  )
}
