'use client'

import { useMemo } from 'react'
import {
  ForegroundLayoutSlot,
  resolveSlots,
  FOREGROUND_VISUAL_TYPES as VISUAL_TYPES,
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
 * per aspect ratio.
 *
 * Why this exists: the legacy share path mounted the foreground via a bare
 * `<ForegroundVizSlot>` using the layers' AUTHORED styles — `vw`/`vh`
 * (viewport-bound) and `position`/`%`-width tuned for a full-screen deck slide.
 * Inside a ~390px card those units resolve against the wrong box, so charts
 * collapsed to thin lines, stats clipped, and `bodyText` layers (which read
 * their copy from a context only `ForegroundLayoutSlot` provides) printed the
 * `[bodyText: no content resolved]` placeholder.
 *
 * This routes the foreground through `<ForegroundLayoutSlot>` — the same
 * dispatcher the live deck uses — with a CARD-RELATIVE synthesized layout:
 *   • hero / cover            → image fills the card, title overlaid on a scrim,
 *   • lead + viz on 4:3       → side-by-side (stat/text left, chart right),
 *   • lead + viz on portrait  → stacked full-width (stat over chart),
 *   • single visual layer     → fills the card (authored position/size stripped).
 *
 * Prose layers (`text`, `bodyText`) are dropped here — the section's copy is
 * carried by the separate text card, so the graph card stays purely visual.
 */

// `VISUAL_TYPES` (chart-like modules with no intrinsic block height) and
// `PROSE_TYPES` (text/bodyText) are imported from viz-engine so this renderer
// and the share-card builders classify layers identically.

/** Strip authored `position`/`size` so the layer fills its region (inset:0)
 *  instead of honoring the deck slide's `width:50%`/`position:right`/`62vh`. */
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
    // Drop the authored position/size too — stacked layers flow full-width.
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
  chartHeading?: string
  chartSubheading?: string
  /**
   * Which subset of the section's foreground to render. Decks that pair a
   * `bigStat` lead with a chart emit two share cards — one `'stat'` (lead only)
   * and one `'chart'` (visual only) — instead of stacking both onto one card.
   * `'all'` (default) keeps the legacy combined behavior.
   */
  layerScope?: 'all' | 'stat' | 'chart'
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
  chartHeading,
  chartSubheading,
  layerScope = 'all',
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
    if (layerScope === 'stat') layers = layers.filter((l) => !VISUAL_TYPES.has(l.type))
    else if (layerScope === 'chart') layers = layers.filter((l) => VISUAL_TYPES.has(l.type))
    if (layers.length === 0) return null

    // Hero/cover: keep the image's authored full-bleed sizing; it fills + crops.
    if (isHeroLike) {
      return { foreground: { kind: 'flat', layers }, isPortrait: false }
    }

    const viz = layers.filter((l) => VISUAL_TYPES.has(l.type))
    const lead = layers.filter((l) => !VISUAL_TYPES.has(l.type)) // bigStat, keyValue, quote…

    // Single visual layer → fill the card (strip authored 50%-width/position).
    if (layers.length === 1) {
      return { foreground: { kind: 'flat', layers: [fillLayer(layers[0])] }, isPortrait: false }
    }

    // Multiple layers → stack full-width on every ratio. Side-by-side was
    // tempting on landscape, but the deck's bigStat number is sized in `vw`
    // (clamp(3.5rem, 11vw, 7.5rem)) and clips in a narrow column — it only fits
    // when given the full card width, which stacking guarantees. Charts get an
    // explicit card-relative height; on the short 4:3 card the chart is sized
    // down so stat + chart fit without a scrollbar. bigStat/keyValue self-size.
    const hasLead = lead.length > 0
    const visualBudget = hasLead ? (isLandscape ? 0.36 : 0.5) : isLandscape ? 0.66 : 0.84
    const perVisual = Math.max(
      120,
      Math.round((cardHeight * visualBudget) / Math.max(1, viz.length))
    )
    const stacked = layers.map((l) =>
      VISUAL_TYPES.has(l.type) ? withStackHeight(l, perVisual) : fillLayer(l)
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
  }, [parentConfig, isHeroLike, isLandscape, cardHeight, layerScope])

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

  // Hero/cover: full-bleed image with a bottom scrim so the (charcoal) title
  // stays legible over a dark photograph.
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
                  className="font-serif font-bold"
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
