'use client'

import { Suspense, lazy, type ComponentType } from 'react'
import { getVizModule, type VizLayer, type VizRenderProps } from '@vismay/viz-engine'

/** Stable lazy component per module type — created once and cached so React
 *  doesn't remount a layer on every render. */
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
 * Render one `VizLayer` through the viz-engine registry: look up the module by
 * `layer.type`, parse its config, and mount its lazy Component. No positioning
 * wrapper — the caller places it (so the host frame / stack layout owns layout).
 */
export function LayerView({
  layer,
  slug = 'composer',
  onReady,
}: {
  layer: VizLayer
  slug?: string
  onReady?: () => void
}) {
  const mod = getVizModule(layer.type)
  const Comp = lazyFor(layer.type)
  if (!mod || !Comp) return null

  let config: unknown
  try {
    config = mod.parseConfig(layer, { slug, label: layer.type })
  } catch {
    return null
  }

  return (
    <Suspense fallback={null}>
      <Comp
        slug={slug}
        unitKey={slug}
        config={config}
        activeStep={0}
        mode="capture"
        noteReady={onReady ?? (() => {})}
        isActive
      />
    </Suspense>
  )
}
