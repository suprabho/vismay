'use client'

import { useEffect } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { ConstructorPodium } from '../../web/StandingsPodium'
import type { ConstructorPodiumConfig } from './index'

export default function ConstructorPodiumVizComponent({
  config,
  noteReady,
}: VizRenderProps<ConstructorPodiumConfig>) {
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
        <ConstructorPodium rows={config.rows} title={config.title} />
      </div>
    </div>
  )
}
