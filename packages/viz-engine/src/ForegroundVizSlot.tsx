'use client'

import { Suspense, lazy, useMemo, useRef } from 'react'
import type { CSSProperties, ComponentType } from 'react'
import type { VizLayer } from './lib/storyConfig.types'
import { getVizModule } from './registry'
import type { VizCaptureHandle, VizModule, VizRenderProps } from './types'

interface ForegroundVizSlotProps {
  slug: string
  /** One foreground layer stack for the active unit. */
  layers: VizLayer[]
  /** Identity of the active unit — drives keying so layer-level state resets cleanly across sections. */
  unitKey: string
  activeStep: number
  mode: 'scroll' | 'autoplay' | 'capture' | 'print'
  /**
   * Optional callback invoked once per layer when its module signals first paint.
   * Plumbs into `useStoryReadiness` so PDF/share capture waits for all layers.
   * Defaults to a no-op so the slot is safe to use outside the readiness flow.
   */
  noteLayerReady?: (layerKey: string) => void
}

function layerWrapperStyle(layer: VizLayer, index: number): CSSProperties {
  const s = layer.style ?? {}
  const isPositioned = s.position != null || s.size != null
  const css: CSSProperties = {
    position: 'absolute',
    inset: isPositioned ? undefined : 0,
    zIndex: s.zIndex ?? index,
    pointerEvents: s.pointerEvents ?? (index === 0 ? 'auto' : 'none'),
  }
  if (s.opacity != null) css.opacity = s.opacity
  if (s.blendMode) css.mixBlendMode = s.blendMode
  if (s.size?.width) css.width = s.size.width
  if (s.size?.height) css.height = s.size.height
  if (s.position) {
    const { x, y } = s.position
    if (x === 'left') css.left = 0
    else if (x === 'right') css.right = 0
    else if (x === 'center') {
      css.left = '50%'
      css.transform = `${css.transform ?? ''} translateX(-50%)`.trim()
    } else if (typeof x === 'string') css.left = x
    if (y === 'top') css.top = 0
    else if (y === 'bottom') css.bottom = 0
    else if (y === 'center') {
      css.top = '50%'
      css.transform = `${css.transform ?? ''} translateY(-50%)`.trim()
    } else if (typeof y === 'string') css.top = y
    if (x == null) css.left = 0
    if (y == null) css.top = 0
  }
  return css
}

interface LayerProps {
  slug: string
  layer: VizLayer
  module: VizModule
  index: number
  unitKey: string
  activeStep: number
  mode: ForegroundVizSlotProps['mode']
  noteReady: () => void
}

function ForegroundLayer({ slug, layer, module, index, unitKey, activeStep, mode, noteReady }: LayerProps) {
  const captureRef = useRef<VizCaptureHandle | null>(null)
  // Lazy import the module's component once per module. `useMemo` keys on the
  // module reference so distinct layers of the same type share the cached lazy.
  const LazyComponent = useMemo(
    () => lazy(module.load as () => Promise<{ default: ComponentType<VizRenderProps<unknown>> }>),
    [module]
  )
  const config = useMemo(() => {
    try {
      return module.parseConfig(layer, { slug, label: `foreground[${index}] (${layer.type})` })
    } catch (err) {
      console.error(err)
      return null
    }
  }, [layer, module, slug, index])
  if (config == null) return null
  return (
    <div style={layerWrapperStyle(layer, index)}>
      <Suspense fallback={null}>
        <LazyComponent
          slug={slug}
          unitKey={unitKey}
          config={config}
          activeStep={activeStep}
          mode={mode}
          noteReady={noteReady}
          captureRef={captureRef}
          isActive={true}
        />
      </Suspense>
    </div>
  )
}

export default function ForegroundVizSlot({
  slug,
  layers,
  unitKey,
  activeStep,
  mode,
  noteLayerReady,
}: ForegroundVizSlotProps) {
  if (layers.length === 0) return null
  // `position: relative` so the absolutely-positioned layer wrappers below
  // contain themselves to this slot's box, not the viewport. Single-layer
  // legacy stories (chart-only) flatten to one absolutely-positioned wrapper
  // that fills the slot — visually identical to today's direct ChartPanel mount.
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {layers.map((layer, index) => {
        const module = getVizModule(layer.type)
        if (!module || !module.slots.includes('foreground')) {
          if (typeof window !== 'undefined') {
            console.warn(`[ForegroundVizSlot] unknown or non-foreground viz type '${layer.type}'`)
          }
          return null
        }
        // Use the module's stableIdentity when present (e.g. chart keys by id
        // so the ECharts instance persists across subsections of the same
        // parent — animations tween between activeStep values cleanly).
        // Fall back to a unit-scoped key so distinct layers of unmoduled types
        // remount on unit change without state bleed.
        const stableId = module.stableIdentity?.(layer as never)
        const layerKey = stableId ?? `${unitKey}:${index}:${layer.type}`
        return (
          <ForegroundLayer
            key={layerKey}
            slug={slug}
            layer={layer}
            module={module}
            index={index}
            unitKey={unitKey}
            activeStep={activeStep}
            mode={mode}
            noteReady={() => noteLayerReady?.(layerKey)}
          />
        )
      })}
    </div>
  )
}
