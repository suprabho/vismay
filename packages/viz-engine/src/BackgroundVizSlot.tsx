'use client'

import { Suspense, lazy, useMemo, useRef } from 'react'
import type { CSSProperties, ComponentType } from 'react'
import type { ResolvedUnit, VizLayer, VizLayerStyle } from './lib/storyConfig.types'
import { resolveSlots } from './lib/resolveSlots'
import { getVizModule } from './registry'
import type {
  VizCaptureHandle,
  VizModule,
  VizPersistentRenderProps,
  VizRenderProps,
} from './types'

interface BackgroundVizSlotProps {
  slug: string
  units: ResolvedUnit[]
  activeUnit: number
  mode: 'scroll' | 'autoplay' | 'capture' | 'print'
  noteLayerReady?: (key: string) => void
}

/**
 * Layer-level wrapper style. Background layers are always full-bleed (z-0,
 * pointer-events: none) so the snap container and foreground card chrome
 * stay clickable. Per-layer `style` overrides can shrink, anchor, blend, or
 * dial down opacity for overlays.
 */
function layerWrapperStyle(
  style: VizLayerStyle | undefined,
  index: number,
  visible: boolean
): CSSProperties {
  const s = style ?? {}
  const isPositioned = s.position != null || s.size != null
  const css: CSSProperties = {
    position: 'absolute',
    // Full-bleed by default. As soon as the author provides a `position` or a
    // `size`, the box becomes a free-floating overlay and we drop `inset: 0`
    // so it doesn't stretch to fill the viewport.
    inset: isPositioned ? undefined : 0,
    zIndex: s.zIndex ?? index,
    pointerEvents: s.pointerEvents ?? 'none',
    visibility: visible ? 'visible' : 'hidden',
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
    // Sensible defaults when the author specifies one axis only: pin the
    // unspecified axis to the top-left corner so the layer has a definite
    // place to sit instead of inheriting the viewport-stretching inset.
    if (x == null) css.left = 0
    if (y == null) css.top = 0
  }
  return css
}

/**
 * Information about a single distinct background instance in the story —
 * the bookkeeping unit that ensures Mapbox doesn't dispose / rebuild on
 * every scroll snap.
 */
interface InstanceEntry {
  module: VizModule
  identity: string
  /** Per-unit layer configs. `null` if the unit's background stack omits this instance. */
  perUnitLayers: (VizLayer | null)[]
  /** Index used for default z-stacking when authors omit `style.zIndex`. */
  index: number
}

function buildInstances(units: ResolvedUnit[]): InstanceEntry[] {
  const byKey = new Map<string, InstanceEntry>()
  const order: string[] = []
  units.forEach((unit, unitIdx) => {
    const layers = resolveSlots(unit.parentConfig).background
    layers.forEach((layer, layerIdx) => {
      const module = getVizModule(layer.type)
      if (!module || !module.slots.includes('background')) {
        if (typeof window !== 'undefined') {
          // Don't crash — degrade silently and warn.
          console.warn(`[BackgroundVizSlot] unknown or non-background viz type '${layer.type}'`)
        }
        return
      }
      // Identity gates dedup: same (type, identity) shares one instance.
      // The map module returns 'map:default' so every unit's map collapses
      // into a single instance. An image module would return 'image:<src>'.
      const ident = module.stableIdentity?.(layer as never) ?? `${layer.type}:${JSON.stringify(layer)}`
      const key = `${layer.type}::${ident}`
      let entry = byKey.get(key)
      if (!entry) {
        entry = {
          module,
          identity: key,
          perUnitLayers: new Array(units.length).fill(null),
          index: layerIdx,
        }
        byKey.set(key, entry)
        order.push(key)
      }
      entry.perUnitLayers[unitIdx] = layer
    })
  })
  return order.map((k) => byKey.get(k)!)
}

interface PersistentLayerProps {
  slug: string
  entry: InstanceEntry
  activeUnit: number
  mode: BackgroundVizSlotProps['mode']
  noteReady: () => void
}

function PersistentLayer({
  slug,
  entry,
  activeUnit,
  mode,
  noteReady,
}: PersistentLayerProps) {
  const captureRef = useRef<VizCaptureHandle | null>(null)
  const LazyComponent = useMemo(
    () =>
      lazy(
        entry.module.loadPersistent! as () => Promise<{
          default: ComponentType<VizPersistentRenderProps<unknown>>
        }>
      ),
    [entry.module]
  )
  // Parse each unit's layer config; nulls pass through as nulls.
  const configs = useMemo(
    () =>
      entry.perUnitLayers.map((layer, idx) => {
        if (!layer) return null
        try {
          return entry.module.parseConfig(layer, {
            slug,
            label: `background[unit ${idx}] (${layer.type})`,
          })
        } catch (err) {
          console.error(err)
          return null
        }
      }),
    [entry.perUnitLayers, entry.module, slug]
  )
  // Persistent-aggregated layers are always visible while ANY unit references
  // them — per-unit visibility is the module's concern (e.g. fading the map
  // out for units that opt out via `background: { type: 'none' }`).
  const anyReferenced = entry.perUnitLayers.some((l) => l != null)
  const sampleLayer = entry.perUnitLayers.find((l) => l != null) ?? null
  return (
    <div style={layerWrapperStyle(sampleLayer?.style, entry.index, anyReferenced)}>
      <Suspense fallback={null}>
        <LazyComponent
          slug={slug}
          configs={configs}
          activeUnit={activeUnit}
          mode={mode}
          noteReady={noteReady}
          captureRef={captureRef}
        />
      </Suspense>
    </div>
  )
}

interface PerUnitLayerProps {
  slug: string
  entry: InstanceEntry
  activeUnit: number
  mode: BackgroundVizSlotProps['mode']
  noteReady: () => void
}

function PerUnitLayer({
  slug,
  entry,
  activeUnit,
  mode,
  noteReady,
}: PerUnitLayerProps) {
  const captureRef = useRef<VizCaptureHandle | null>(null)
  const LazyComponent = useMemo(
    () =>
      lazy(
        entry.module.load as () => Promise<{
          default: ComponentType<VizRenderProps<unknown>>
        }>
      ),
    [entry.module]
  )
  // A per-unit instance mounts once with the FIRST unit's layer that
  // references it (or the active unit's, when active). Visibility toggles by
  // whether the active unit references this identity. This keeps the
  // instance alive across scroll, so an image-background instance doesn't
  // unload/reload between units that share its src.
  const layerForActive = entry.perUnitLayers[activeUnit]
  const isVisible = layerForActive != null
  const sampleLayer = layerForActive ?? entry.perUnitLayers.find((l) => l != null) ?? null
  const config = useMemo(() => {
    if (!sampleLayer) return null
    try {
      return entry.module.parseConfig(sampleLayer, {
        slug,
        label: `background (${sampleLayer.type})`,
      })
    } catch (err) {
      console.error(err)
      return null
    }
  }, [sampleLayer, entry.module, slug])
  if (!sampleLayer || config == null) return null
  return (
    <div style={layerWrapperStyle(sampleLayer.style, entry.index, isVisible)}>
      <Suspense fallback={null}>
        <LazyComponent
          slug={slug}
          unitKey={`bg-${entry.identity}`}
          config={config}
          activeStep={activeUnit}
          mode={mode}
          noteReady={noteReady}
          captureRef={captureRef}
          isActive={isVisible}
        />
      </Suspense>
    </div>
  )
}

/**
 * Background slot dispatcher. Renders the union of every unit's background
 * layer stack, deduped by `(type, stableIdentity)` so persistent instances
 * (notably the Mapbox map) survive scroll-snap transitions without disposal.
 *
 * Two mounting strategies per module:
 *   - `persistent-aggregated` (map): mounts ONE component, feeds it every
 *     unit's config at once, lets the module derive per-unit camera/style.
 *   - `per-unit` (image, video, rive, embed): mounts ONE component per unique
 *     stableIdentity, fed the active unit's config, toggled by visibility
 *     when the active unit doesn't reference it.
 */
export default function BackgroundVizSlot({
  slug,
  units,
  activeUnit,
  mode,
  noteLayerReady,
}: BackgroundVizSlotProps) {
  const instances = useMemo(() => buildInstances(units), [units])
  if (instances.length === 0) return null
  return (
    <div className="fixed inset-0 z-0 pointer-events-none" style={{ position: 'fixed' }}>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {instances.map((entry) => {
          const noteReady = () => noteLayerReady?.(entry.identity)
          if (entry.module.mountingMode === 'persistent-aggregated' && entry.module.loadPersistent) {
            return (
              <PersistentLayer
                key={entry.identity}
                slug={slug}
                entry={entry}
                activeUnit={activeUnit}
                mode={mode}
                noteReady={noteReady}
              />
            )
          }
          return (
            <PerUnitLayer
              key={entry.identity}
              slug={slug}
              entry={entry}
              activeUnit={activeUnit}
              mode={mode}
              noteReady={noteReady}
            />
          )
        })}
      </div>
    </div>
  )
}
