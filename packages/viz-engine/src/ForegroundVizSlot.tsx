'use client'

import { Suspense, lazy, useMemo, useRef } from 'react'
import type { CSSProperties, ComponentType } from 'react'
import type { VizLayer } from './lib/storyConfig.types'
import { getVizModule } from './registry'
import type { VizCaptureHandle, VizLayerPanel, VizLayerStyle, VizModule, VizRenderProps } from './types'

interface ForegroundVizSlotProps {
  slug: string
  /** One foreground layer stack for the active unit. */
  layers: VizLayer[]
  /** Identity of the active unit — drives keying so layer-level state resets cleanly across sections. */
  unitKey: string
  activeStep: number
  mode: 'scroll' | 'autoplay' | 'capture' | 'print'
  /**
   * Portrait (mobile) viewport. Enables the per-slot `style.portrait` override
   * merge in `layerWrapperStyle`. Defaults false so non-layout call sites
   * (e.g. the legacy map-format chart panel) stay byte-for-byte unchanged.
   */
  isPortrait?: boolean
  /**
   * Lay the slots out full-width and vertically (declaration order) instead of
   * honoring their authored `position`/`%`-width — fixes deck sections squishing
   * to side-by-side ~160px columns on a phone. Set by `ForegroundLayoutSlot` for
   * layouts flagged `stackOnPortrait` when the viewport is portrait.
   */
  portraitStack?: boolean
  /**
   * Optional callback invoked once per layer when its module signals first paint.
   * Plumbs into `useStoryReadiness` so PDF/share capture waits for all layers.
   * Defaults to a no-op so the slot is safe to use outside the readiness flow.
   */
  noteLayerReady?: (layerKey: string) => void
}

/**
 * Merge a module's `defaultStyle` under a layer's authored `style`. Per-field
 * shallow merge — `panel` is merged sub-field so an author can override only
 * the background without losing the default border/blur. On portrait, the
 * layer's `style.portrait` partial wins over both (lets a story tune a stacked
 * slot's height or drop it on mobile).
 */
function resolveLayerStyle(
  layer: VizLayer,
  module: VizModule | undefined,
  isPortrait: boolean,
): VizLayerStyle {
  const layerStyle = layer.style ?? {}
  const defaults = module?.defaultStyle ?? {}
  const portrait = isPortrait ? layerStyle.portrait ?? {} : {}
  const panel: VizLayerPanel | undefined =
    defaults.panel || layerStyle.panel || portrait.panel
      ? { ...defaults.panel, ...layerStyle.panel, ...portrait.panel }
      : undefined
  const merged: VizLayerStyle = { ...defaults, ...layerStyle, ...portrait, panel }
  // `portrait` is a config-only field — never let it ride along on the resolved
  // style (it carries no meaning downstream and would otherwise self-nest).
  delete merged.portrait
  return merged
}

// Visual slot types need an explicit height when stacked vertically — they
// have no intrinsic block height the way a text module does, so without one
// they'd collapse to zero. Everything else (bodyText, bigStat, quote, stat,
// keyValue, table, …) sizes to its own content.
const STACK_VISUAL_TYPES = new Set<string>([
  'chart',
  'image',
  'imageGrid',
  'mapbox',
  'map',
  'embed',
  'rive',
  'starship:viewer',
])

function stackHeightForType(type: string): string | undefined {
  return STACK_VISUAL_TYPES.has(type) ? '40vh' : undefined
}

// Panel chrome — every field is optional; unset values fall through and the
// wrapper renders bare (matching pre-panel behavior). Shared by both the
// absolute and the portrait-stack wrapper paths.
function applyPanel(css: CSSProperties, p: VizLayerPanel | undefined): void {
  if (!p) return
  if (p.background != null) css.background = p.background
  if (p.border != null) css.border = p.border
  if (p.borderRadius != null) css.borderRadius = p.borderRadius
  if (p.padding != null) css.padding = p.padding
  if (p.shadow != null) css.boxShadow = p.shadow
  if (p.backdropBlur != null) {
    const blur = `blur(${p.backdropBlur})`
    css.backdropFilter = blur
    // Safari still needs the prefixed property.
    ;(css as CSSProperties & { WebkitBackdropFilter?: string }).WebkitBackdropFilter = blur
  }
}

function layerWrapperStyle(
  layer: VizLayer,
  index: number,
  module: VizModule | undefined,
  opts: { isPortrait: boolean; stack: boolean },
): CSSProperties {
  const s = resolveLayerStyle(layer, module, opts.isPortrait)

  // Portrait stack mode: ignore authored position/`%`-width; the slot becomes a
  // full-width block in normal document flow (the parent is a flex column).
  // Height comes from an explicit `style.portrait.size.height`, else a per-type
  // default for visual slots, else auto for text. Layers are click-through so
  // vertical swipes reach the snap container (mobile charts have no tooltips).
  if (opts.stack) {
    const css: CSSProperties = {
      position: 'relative',
      width: '100%',
      flex: '0 0 auto',
      zIndex: s.zIndex ?? index,
      pointerEvents: s.pointerEvents ?? 'none',
    }
    const h = layer.style?.portrait?.size?.height ?? stackHeightForType(layer.type)
    if (h) css.height = h
    if (s.opacity != null) css.opacity = s.opacity
    if (s.blendMode) css.mixBlendMode = s.blendMode
    applyPanel(css, s.panel)
    return css
  }

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
  applyPanel(css, s.panel)
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
  isPortrait: boolean
  stack: boolean
  noteReady: () => void
}

function ForegroundLayer({
  slug,
  layer,
  module,
  index,
  unitKey,
  activeStep,
  mode,
  isPortrait,
  stack,
  noteReady,
}: LayerProps) {
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
    <div style={layerWrapperStyle(layer, index, module, { isPortrait, stack })}>
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
  isPortrait = false,
  portraitStack = false,
  noteLayerReady,
}: ForegroundVizSlotProps) {
  if (layers.length === 0) return null

  const renderedLayers = layers.map((layer, index) => {
    const module = getVizModule(layer.type)
    if (!module || !module.slots.includes('foreground')) {
      if (typeof window !== 'undefined') {
        console.warn(`[ForegroundVizSlot] unknown or non-foreground viz type '${layer.type}'`)
      }
      return null
    }
    // Use the module's stableIdentity when present (e.g. chart keys by id so the
    // ECharts instance persists across subsections of the same parent — animations
    // tween between activeStep values cleanly). Fall back to a unit-scoped key so
    // distinct layers of unmoduled types remount on unit change without state bleed.
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
        isPortrait={isPortrait}
        stack={portraitStack}
        noteReady={() => noteLayerReady?.(layerKey)}
      />
    )
  })

  // Portrait stack: a scrollable flex column. The inner wrapper uses
  // `margin: auto 0` so content centers when it fits and scrolls from the top
  // (no clipping) when a tall section overflows — robust on small devices.
  if (portraitStack) {
    return (
      <div
        style={{ width: '100%', height: '100%', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}
      >
        <div
          style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%' }}
        >
          {renderedLayers}
        </div>
      </div>
    )
  }

  // `position: relative` so the absolutely-positioned layer wrappers below
  // contain themselves to this slot's box, not the viewport. Single-layer
  // legacy stories (chart-only) flatten to one absolutely-positioned wrapper
  // that fills the slot — visually identical to today's direct ChartPanel mount.
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>{renderedLayers}</div>
  )
}
