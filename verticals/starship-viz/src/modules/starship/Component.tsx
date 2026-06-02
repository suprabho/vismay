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

  // Stage background — opt-in via `config.stage`. Default is transparent so
  // the layer's section background shows through (the common case for the
  // bone-white editorial palette). Explicit `color` + optional `opacity` get
  // composed into an rgba string when both are present; missing `opacity`
  // defaults to 1.
  const stageBg = useMemo(() => stageBackground(config.stage), [config.stage])

  // The viewer is a passive, scroll-driven visual in every mode except
  // `inspect` (which is the one mode meant for direct manipulation via
  // OrbitControls). Marking the box `pointer-events: none` lets wheel/touch
  // pass straight through to the scroll container behind it, so scrolling
  // over the starship scrolls the page (advancing sections / the scrub
  // progress that drives the camera) instead of getting trapped on the canvas.
  const interactive = config.mode === 'inspect'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        background: stageBg,
        pointerEvents: interactive ? 'auto' : 'none',
      }}
    >
      <StarshipScene
        model={config.model}
        mode={config.mode}
        progress={progress}
        material={config.material}
        camera={config.camera}
        onReady={noteReady}
        showGround={config.ground?.show}
        groundColor={config.ground?.color}
        groundOpacity={config.ground?.opacity}
      />
    </div>
  )
}

function stageBackground(stage: StarshipViewerConfig['stage']): string {
  if (!stage || stage.color == null) return 'transparent'
  const opacity = stage.opacity ?? 1
  if (opacity >= 1) return stage.color
  // Hex → rgba blend so the color dims over whatever's behind without
  // dimming the canvas children.
  const m = /^#([0-9a-f]{6})$/i.exec(stage.color)
  if (!m) return stage.color
  const n = parseInt(m[1], 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}
