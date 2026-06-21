'use client'

import { Suspense, lazy, type ComponentType } from 'react'
import { getVizModule, type VizLayer, type VizRenderProps } from '@vismay/viz-engine'

/** Stable lazy component per module type — created once and cached so React
 *  doesn't remount the body on every render. */
const lazyCache = new Map<string, ComponentType<VizRenderProps<unknown>>>()

function lazyFor(type: string): ComponentType<VizRenderProps<unknown>> | null {
  const cached = lazyCache.get(type)
  if (cached) return cached
  const mod = getVizModule(type)
  if (!mod) return null
  const Comp = lazy(
    mod.load as () => Promise<{ default: ComponentType<VizRenderProps<unknown>> }>,
  )
  lazyCache.set(type, Comp)
  return Comp
}

/**
 * Render one foreground layer through the viz-engine registry: look up the
 * module by `layer.type`, parse its config, and mount its lazy Component. The
 * share-card canvas uses this to render the card body via the registry (the
 * `fscard:*` modules own each card type, not a hand-written switch). The body
 * mounts in the host's existing container with no positioning wrapper, so output
 * is pixel-identical to the old body.
 */
export function FsCardLayerView({
  layer,
  onReady,
}: {
  layer: VizLayer
  onReady?: () => void
}) {
  const mod = getVizModule(layer.type)
  const Comp = lazyFor(layer.type)
  if (!mod || !Comp) return null

  let config: unknown
  try {
    config = mod.parseConfig(layer, { slug: 'share-card', label: layer.type })
  } catch {
    return null
  }

  return (
    <Suspense fallback={null}>
      <Comp
        slug="share-card"
        unitKey="share-card"
        config={config}
        activeStep={0}
        mode="capture"
        noteReady={onReady ?? (() => {})}
        isActive
      />
    </Suspense>
  )
}
