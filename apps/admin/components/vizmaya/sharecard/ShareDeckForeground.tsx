'use client'

// Ported from apps/vizmaya-fyi/components/share/ShareDeckForeground.tsx.

import { useMemo } from 'react'
import {
  ForegroundLayoutSlot,
  resolveSlots,
  isForegroundVisualType as isVisual,
  FOREGROUND_PROSE_TYPES as PROSE_TYPES,
} from '@vismay/viz-engine'
import type {
  ResolvedUnit,
  VizLayer,
  ForegroundLayoutDef,
  ResolvedForeground,
} from '@vismay/viz-engine'
import type { AspectRatio } from './AspectRatioToggle'

/**
 * Renders a deck section's composed foreground on a share card, responsively
 * per aspect ratio. Routes the foreground through `<ForegroundLayoutSlot>` —
 * the same dispatcher the live deck uses — with a CARD-RELATIVE synthesized
 * layout so charts resize and multi-layer sections stack instead of squishing.
 * Prose layers (`text`, `bodyText`) are dropped here — the section's copy is
 * carried by the separate text card, so the graph card stays purely visual.
 */

/** Slice a lead list layer's `items[]` to one region and optionally retitle it,
 *  so a single `keyValue` (etc.) can render as one share card per region. */
function sliceItemsLayer(
  layer: VizLayer,
  slice: number | [number, number],
  heading?: string
): VizLayer {
  const items = (layer as { items?: unknown }).items
  if (!Array.isArray(items)) return layer
  const [start, end] = typeof slice === 'number' ? [slice, slice + 1] : slice
  return {
    ...(layer as VizLayer & { items: unknown[]; title?: string }),
    items: items.slice(start, end),
    ...(heading !== undefined ? { title: heading } : {}),
  } as VizLayer
}

/** Strip authored `position`/`size` so the layer fills its region (inset:0). */
function fillLayer(layer: VizLayer): VizLayer {
  const style = layer.style ?? {}
  return { ...layer, style: { ...style, position: undefined, size: undefined } }
}

/** Give a layer a portrait-stack height (px) so the stack path sizes it
 *  card-relative instead of the viewport-bound `40vh` default. */
function withStackHeight(layer: VizLayer, px: number): VizLayer {
  const style = layer.style ?? {}
  const portrait = style.portrait ?? {}
  const size = portrait.size ?? {}
  return {
    ...layer,
    style: {
      ...style,
      position: undefined,
      size: undefined,
      portrait: { ...portrait, size: { ...size, height: `${px}px` } },
    },
  }
}

interface Props {
  slug: string
  unit: ResolvedUnit
  ratio: AspectRatio
  /** Rendered card height in px (RENDER_SIZE[ratio].h) — drives stack heights. */
  cardHeight: number
  heroEyebrow?: string
  heroHeading?: string
  heroDek?: string
  /** CSS `object-position` override for the hero/cover image's crop on this card. */
  heroImageOffset?: string
  chartHeading?: string
  chartSubheading?: string
  /** Which subset of the section's foreground to render. */
  layerScope?: 'all' | 'stat' | 'chart'
  /** Region split (`shareGroups`): the slice of the lead list layer's `items[]`. */
  itemSlice?: number | [number, number]
  itemHeading?: string
}

interface BuiltForeground {
  foreground: ResolvedForeground
  isPortrait: boolean
}

export default function ShareDeckForeground({
  slug,
  unit,
  ratio,
  cardHeight,
  heroEyebrow,
  heroHeading,
  heroDek,
  heroImageOffset,
  chartHeading,
  chartSubheading,
  layerScope = 'all',
  itemSlice,
  itemHeading,
}: Props) {
  const { parentConfig } = unit
  const rawKind = parentConfig.kind ?? 'text'
  const layoutName = typeof parentConfig.layout === 'string' ? parentConfig.layout : ''
  const isHeroLike =
    rawKind === 'cover' || rawKind === 'hero' || layoutName === 'hero-full-bleed'
  const isLandscape = ratio === '4:3'

  const built = useMemo<BuiltForeground | null>(() => {
    const resolved = resolveSlots(parentConfig)
    const allLayers: VizLayer[] =
      resolved.foreground.kind === 'flat'
        ? resolved.foreground.layers
        : Object.values(resolved.foreground.regions).flat()
    let layers = allLayers.filter((l) => !PROSE_TYPES.has(l.type))
    // Stat/chart split: narrow to just the lead callout or just the visual.
    if (layerScope === 'stat') layers = layers.filter((l) => !isVisual(l.type))
    else if (layerScope === 'chart') layers = layers.filter((l) => isVisual(l.type))
    // Region split: keep only this region's slice of the lead list's items[].
    if (itemSlice !== undefined) {
      layers = layers.map((l) => sliceItemsLayer(l, itemSlice, itemHeading))
    }
    if (layers.length === 0) return null

    // Hero/cover: keep the image's authored full-bleed sizing; it fills + crops.
    if (isHeroLike) {
      const heroLayers = heroImageOffset
        ? layers.map((l) => (l.type === 'image' ? { ...l, focus: heroImageOffset } : l))
        : layers
      return { foreground: { kind: 'flat', layers: heroLayers }, isPortrait: false }
    }

    const viz = layers.filter((l) => isVisual(l.type))
    const lead = layers.filter((l) => !isVisual(l.type)) // bigStat, keyValue, quote…

    // Single visual layer → fill the card (strip authored 50%-width/position).
    if (layers.length === 1) {
      return { foreground: { kind: 'flat', layers: [fillLayer(layers[0])] }, isPortrait: false }
    }

    // Multiple layers → stack full-width on every ratio. Charts get an explicit
    // card-relative height; bigStat/keyValue self-size.
    const hasLead = lead.length > 0
    const visualBudget = hasLead ? (isLandscape ? 0.36 : 0.5) : isLandscape ? 0.66 : 0.84
    const perVisual = Math.max(
      120,
      Math.round((cardHeight * visualBudget) / Math.max(1, viz.length))
    )
    const stacked = layers.map((l) =>
      isVisual(l.type) ? withStackHeight(l, perVisual) : fillLayer(l)
    )
    const fill = { position: 'absolute' as const, inset: 0 }
    const inlineDef: ForegroundLayoutDef = {
      name: 'share-card-stack',
      stackOnPortrait: true,
      regions: { default: { style: fill } },
      portrait: { name: 'share-card-stack.portrait', regions: { default: { style: fill } } },
    }
    return {
      foreground: { kind: 'regions', layout: 'share-card-stack', regions: { default: stacked }, inlineDef },
      isPortrait: true,
    }
  }, [parentConfig, isHeroLike, isLandscape, cardHeight, layerScope, heroImageOffset, itemSlice, itemHeading])

  if (!built) return null

  const slot = (
    <ForegroundLayoutSlot
      slug={slug}
      foreground={built.foreground}
      unit={unit}
      activeStep={unit.subIndex}
      mode="capture"
      isPortrait={built.isPortrait}
    />
  )

  // Hero/cover: full-bleed image with a bottom scrim so the title stays legible
  // over a dark photograph.
  if (isHeroLike) {
    return (
      <div className="relative w-full h-full overflow-hidden">
        <div className="absolute inset-0">{slot}</div>
        {(heroEyebrow || heroHeading || heroDek) && (
          <>
            <div
              className="absolute inset-x-0 bottom-0 pointer-events-none"
              style={{
                height: '62%',
                background:
                  'linear-gradient(to top, rgb(var(--color-bg-rgb) / 0.96) 0%, rgb(var(--color-bg-rgb) / 0.78) 34%, rgb(var(--color-bg-rgb) / 0) 100%)',
              }}
            />
            <div
              className="absolute z-30 pointer-events-none flex flex-col"
              style={{ left: '7%', right: '7%', bottom: '8%', gap: '8px' }}
            >
              {heroEyebrow && (
                <div
                  className="font-[family-name:var(--font-mono)] uppercase"
                  style={{ fontSize: '11px', letterSpacing: '0.16em', color: 'var(--color-accent)' }}
                >
                  {heroEyebrow}
                </div>
              )}
              {heroHeading && (
                <h2
                  className="share-display font-serif font-bold"
                  style={{ fontSize: '25px', lineHeight: 1.12, color: 'var(--color-text)' }}
                >
                  {heroHeading}
                </h2>
              )}
              {heroDek && (
                <p
                  className="font-serif"
                  style={{ fontSize: '14px', lineHeight: 1.35, color: 'var(--color-muted)' }}
                >
                  {heroDek}
                </p>
              )}
            </div>
          </>
        )}
      </div>
    )
  }

  // Non-hero: padded frame, optional share-override chart heading, then the
  // composed (filled / side-by-side / stacked) foreground.
  return (
    <div className="w-full h-full flex flex-col p-[14px] pb-[34px]">
      {layerScope !== 'stat' && (chartHeading || chartSubheading) && (
        <div className="shrink-0 mb-1">
          {chartHeading && (
            <h4
              className="font-serif text-[20px] text-center font-bold leading-[1.2]"
              style={{ color: 'var(--color-accent)' }}
            >
              {chartHeading}
            </h4>
          )}
          {chartSubheading && (
            <p
              className="text-[16px] text-center leading-[1.4]"
              style={{ color: 'var(--color-muted)' }}
            >
              {chartSubheading}
            </p>
          )}
        </div>
      )}
      {/* ForegroundVizSlot's portrait stack is `overflow-y:auto`; hide its
          scrollbar so it never rasterizes into the captured PNG. */}
      <style>{`.sdfg-clip ::-webkit-scrollbar{width:0;height:0;display:none}`}</style>
      <div className="relative flex-1 min-h-0">
        <div className="sdfg-clip absolute inset-0 overflow-hidden **:min-h-0!">{slot}</div>
      </div>
    </div>
  )
}
