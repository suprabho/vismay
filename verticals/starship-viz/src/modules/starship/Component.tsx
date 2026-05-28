'use client'

import { useMemo } from 'react'
import type { VizRenderProps } from '@vismay/viz-engine'
import { StarshipScene } from '../../web/StarshipScene'
import type { StarshipViewerConfig } from './index'

/**
 * Foreground component for `starship:viewer`.
 *
 * Renders one R3F scene that fills the layer's wrapper box. Reads
 * `activeStep` from the engine's scroll state and maps it onto a 0..1
 * `progress` value for explode/bellyflop. Rotate/inspect ignore it.
 */
export default function StarshipViewerComponent({
  config,
  activeStep,
  noteReady,
}: VizRenderProps<StarshipViewerConfig>) {
  const progress = useMemo(() => {
    const steps = config.scrubSteps ?? 1
    const t = activeStep / steps
    return t < 0 ? 0 : t > 1 ? 1 : t
  }, [activeStep, config.scrubSteps])

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background:
          'radial-gradient(ellipse at 50% 60%, rgba(40,52,68,0.4) 0%, rgba(10,14,20,0.92) 70%)',
      }}
    >
      <StarshipScene
        model={config.model}
        mode={config.mode}
        progress={progress}
        material={config.material}
        onReady={noteReady}
      />
    </div>
  )
}
