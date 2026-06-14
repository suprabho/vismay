'use client'

import { useRef, useCallback, useMemo, useState, forwardRef, useImperativeHandle } from 'react'
import { toPng } from 'html-to-image'
import type { ResolvedUnit, MapPinConfig, MapPinOverride, MapPalette, ShareSectionOverride, ShareLayerVisibility, VizLayer, MapRegionLayer, HeatmapLayer } from '@vismay/viz-engine'
import type { MapTextLabel } from '@vismay/viz-engine'
import { resolveSlotsFlat } from '@vismay/viz-engine'
import type { AspectRatio } from './AspectRatioToggle'
import ShareTextCard from './ShareTextCard'
import ShareStatCard from './ShareStatCard'
import ShareHeroCard from './ShareHeroCard'
import ShareDeckForeground from './ShareDeckForeground'
import ShareMapBg from './ShareMapBg'
import MapLegend from './MapLegend'
import BrandingHeader from './BrandingFooter'

/**
 * Shape of a `type: 'map'` layer as returned by `resolveSlotsFlat`. Mirrors
 * `parentConfig.map` so the legacy and new (`background: [{type:'map'}]`)
 * syntaxes feed the same share-mode map cascade below.
 */
type ResolvedMapLayer = {
  type: 'map'
  center?: [number, number]
  zoom?: number
  pitch?: number
  bearing?: number
  pins?: MapPinConfig[]
  regions?: MapRegionLayer
  heatmap?: HeatmapLayer
  textLabels?: MapTextLabel[]
}

/**
 * DOM render size — matches mobile proportions so text looks natural.
 * The exported image is scaled up via pixelRatio to hit the target output.
 *
 * Output targets:
 *   1:1 → 1080×1080  (pixelRatio ≈ 2.77)
 *   4:5 → 1080×1350  (pixelRatio ≈ 2.77) — Instagram portrait
 *   3:4 → 1080×1440  (pixelRatio ≈ 2.77)
 *   4:3 → 1440×1080  (pixelRatio ≈ 2.77)
 */
const BASE = 390

const RENDER_SIZE: Record<AspectRatio, { w: number; h: number }> = {
  '1:1': { w: BASE, h: BASE },
  '4:5': { w: BASE, h: BASE * (5 / 4) },
  '3:4': { w: BASE, h: BASE * (4 / 3) },
  '4:3': { w: BASE * (4 / 3), h: BASE },
}

const OUTPUT_SIZE: Record<AspectRatio, { w: number; h: number }> = {
  '1:1': { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
  '3:4': { w: 1080, h: 1440 },
  '4:3': { w: 1440, h: 1080 },
}

/**
 * Default zoom-out applied on top of the story's configured zoom when a card
 * doesn't ship its own per-ratio override. Share cards are much smaller than
 * the interactive viewport, so pulling the camera back a bit keeps the
 * subject from cropping into the title overlay. Each unit is logarithmic
 * (≈23% smaller per −0.3).
 */
const SHARE_ZOOM_DELTA: Record<AspectRatio, number> = {
  '1:1': -0.5,
  '4:5': -0.3,
  '3:4': -0.1,
  '4:3': -0.5,
}

export type CardVariant = 'auto' | 'map-title' | 'graph'

interface Props {
  unit: ResolvedUnit
  index: number
  ratio: AspectRatio
  slug: string
  title: string
  /** Story vertical (e.g. `footshorts`) — scopes brand chrome on the card. */
  vertical?: string
  accessToken: string
  /** Card variant — 'auto' picks by section kind, 'map-title' forces map + title overlay */
  variant?: CardVariant
  /**
   * For `variant === 'graph'`, which subset of the section's foreground to
   * render: `'stat'` (lead callout only), `'chart'` (visual only), or `'all'`
   * (combined — the default). Decks that pair a bigStat with a chart emit a
   * `'stat'` card followed by a `'chart'` card.
   */
  graphScope?: 'all' | 'stat' | 'chart'
  /**
   * For region-split graph cards (`shareGroups`): the slice of the lead list
   * layer's `items[]` this card renders — a number, or `[start, end]`.
   */
  itemSlice?: number | [number, number]
  /** Per-card heading for the region-split card; overrides the layer's title. */
  itemHeading?: string
  /** Per-section overrides from share config */
  shareOverride?: ShareSectionOverride
  /** Story-wide map palette (forwarded to the share map background). */
  palette?: MapPalette
  /** Story-wide Mapbox fontstack. */
  fontstack?: string[]
  /** Story `defaults.highlightCountry` — ISO alpha-2 (e.g. "KR"). */
  highlightCountry?: string
  /** Story `defaults.highlightColor`. */
  highlightColor?: string
  /** Story `defaults.mapOpacity`. */
  mapOpacity?: number
  /** Story `defaults.mapStyle` — Mapbox style URL pulled from the per-story config. */
  mapStyle?: string
  /** Story `defaults.pinColor`. */
  defaultPinColor?: string
  /** Story `defaults.pinRadius`. */
  defaultPinRadius?: number
  /** Optional per-story logo path shown in the branding header. */
  logo?: string
  /** When true, hide the per-card hover Download button (used by edit mode). */
  disableDownload?: boolean
}

export interface ShareCardHandle {
  capture: () => Promise<string | null>
}

/**
 * Extract hero dek and byline from paragraphs (matches MapStorySection logic).
 */
export function extractHeroBits(paragraphs: string[]): { dek: string; byline: string } {
  const dek =
    paragraphs.find((p) => /^\*[^*]/.test(p))?.replace(/^\*+|\*+$/g, '').trim() ?? ''
  const byline =
    paragraphs.find((p) => p.startsWith('**'))?.replace(/^\*+|\*+$/g, '').trim() ?? ''
  return { dek, byline }
}

const ShareCard = forwardRef<ShareCardHandle, Props>(function ShareCard(
  { unit, index, ratio, slug, title, vertical, accessToken, variant = 'auto', graphScope = 'all', itemSlice, itemHeading, shareOverride, palette, fontstack, highlightCountry, highlightColor, mapOpacity, mapStyle, defaultPinColor, defaultPinRadius, logo, disableDownload = false },
  ref
) {
  const captureRef = useRef<HTMLDivElement>(null)
  const mapReadyRef = useRef(false)
  const mapReadyResolvers = useRef<Array<() => void>>([])
  const [, setMapReadyTick] = useState(0)
  const handleMapReady = useCallback(() => {
    mapReadyRef.current = true
    for (const r of mapReadyResolvers.current) r()
    mapReadyResolvers.current = []
    setMapReadyTick((t) => t + 1)
  }, [])
  const waitForMap = useCallback(
    () =>
      new Promise<void>((resolve) => {
        if (mapReadyRef.current) resolve()
        else mapReadyResolvers.current.push(resolve)
      }),
    []
  )
  const { w, h } = RENDER_SIZE[ratio]
  const output = OUTPUT_SIZE[ratio]
  const pixelRatio = output.w / w
  const { parentConfig, paragraphs } = unit
  // Resolve foreground/background through the slot shim so stories that use
  // the new `foreground:` / `background:` syntax (or any registered viz module
  // like `fs:match-card`, `image`, `embed`, …) appear on share cards. The shim
  // also synthesizes a legacy `map:` block into a `type: 'map'` background
  // layer, so the map cascade below works the same for both syntaxes.
  const resolvedSlots = useMemo(() => resolveSlotsFlat(parentConfig), [parentConfig])
  const resolvedMap = useMemo<ResolvedMapLayer | undefined>(
    () => resolvedSlots.background.find((l): l is VizLayer & ResolvedMapLayer => l.type === 'map'),
    [resolvedSlots]
  )
  // Foreground layers that deserve their own visual share card. Text layers
  // are excluded because share mode already renders the section's heading /
  // paragraphs via ShareTextCard / ShareHeroCard / ShareStatCard — emitting a
  // duplicate "viz" card for a `- type: text` layer would render the same copy
  // twice.
  // Visual foreground layers — text/bodyText prose is carried by the text card,
  // so exclude it here (a `graph` card is purely visual). Keeps a pure-bodyText
  // section from emitting an empty graph card.
  const vizForegroundLayers = useMemo(
    () =>
      resolvedSlots.foreground.filter(
        (l) => l.type !== 'text' && l.type !== 'bodyText'
      ),
    [resolvedSlots]
  )
  // Per-subsection share override — sits between the section-level share
  // override and the story config in the cascade.
  const shareSubOverride = shareOverride?.subsections?.[unit.subIndex]
  const heading =
    shareSubOverride?.heading ?? shareOverride?.heading ?? unit.heading
  const subheading =
    shareSubOverride?.subheading ?? shareOverride?.subheading ?? unit.subheading
  const kind = parentConfig.kind ?? 'text'
  const hasVizForeground = vizForegroundLayers.length > 0
  const isMapTitle = variant === 'map-title'
  const isGraph = variant === 'graph'
  // Only show map bg on hero cards and map-title variant
  const showMap = !!resolvedMap?.center && (kind === 'hero' || isMapTitle)

  // Resolve layer visibility (share-subsection > share-section). A `false`
  // value at any level suppresses the layer; otherwise it's shown.
  const layers: ShareLayerVisibility = {
    pins: shareSubOverride?.layers?.pins ?? shareOverride?.layers?.pins,
    regions: shareSubOverride?.layers?.regions ?? shareOverride?.layers?.regions,
    heatmap: shareSubOverride?.layers?.heatmap ?? shareOverride?.layers?.heatmap,
  }

  // Chart-card-specific text override (lives in its own slot so chart cards
  // can have a heading/subheading that doesn't collide with the map-title or
  // content cards in the same scope).
  const chartHeading = shareSubOverride?.chart?.heading ?? shareOverride?.chart?.heading
  const chartSubheading = shareSubOverride?.chart?.subheading ?? shareOverride?.chart?.subheading

  // Variant-scoped text overrides. Each falls back to the section-level
  // heading/subheading cascade so existing yaml without these slots keeps
  // working unchanged. `??` (not `||`) so explicit `""` blanks render blank.
  const mapTitleHeading =
    shareSubOverride?.mapTitle?.heading ?? shareOverride?.mapTitle?.heading ?? heading
  const mapTitleSubheading =
    shareSubOverride?.mapTitle?.subheading ?? shareOverride?.mapTitle?.subheading ?? subheading
  const heroHeading =
    shareSubOverride?.hero?.heading ?? shareOverride?.hero?.heading ?? heading
  const heroDek =
    shareSubOverride?.hero?.dek ?? shareOverride?.hero?.dek ?? extractHeroBits(paragraphs).dek
  // CSS object-position override for the cover/hero image's crop on this card.
  // Undefined falls through to the image layer's own `focus`, then center.
  const heroImageOffset =
    shareSubOverride?.hero?.imageOffset ?? shareOverride?.hero?.imageOffset
  // Map-title overlay's dek can be overridden independently; falls back to
  // `hero.dek` so a single `hero.dek` setting still controls both surfaces.
  const mapTitleDek =
    shareSubOverride?.mapTitle?.dek ?? shareOverride?.mapTitle?.dek ?? heroDek
  const statDescription =
    shareSubOverride?.stat?.description ?? shareOverride?.stat?.description ?? paragraphs.join(' ')

  const hidePretext = shareSubOverride?.hidePretext ?? shareOverride?.hidePretext ?? false

  // Resolve map properties. Cascade for camera (center/zoom/pitch/bearing):
  //   share-subsection ratios[ratio] >
  //   share-subsection base >
  //   share-section ratios[ratio] >
  //   share-section base >
  //   story-subsection > parent (sourced from the resolved background map
  //   layer so legacy `map:` and new `background: [{type:'map'}]` both flow
  //   through the same fallback path).
  // Only the camera fields are aspect-specific — pins / regions / heatmap /
  // textLabels are the same across aspects and use the original cascade.
  const subsectionMap = parentConfig.subsections?.[unit.subIndex]?.map
  const subRatio = shareSubOverride?.map?.ratios?.[ratio]
  const secRatio = shareOverride?.map?.ratios?.[ratio]
  const mapCenter =
    subRatio?.center ?? shareSubOverride?.map?.center ?? secRatio?.center ?? shareOverride?.map?.center ?? subsectionMap?.center ?? resolvedMap?.center
  // Zoom cascade: a per-ratio override wins outright. Otherwise resolve the
  // base zoom and apply the share-card default zoom-out so cards pull back a
  // bit from the story's interactive framing.
  const ratioZoomOverride = subRatio?.zoom ?? secRatio?.zoom
  const baseZoom =
    shareSubOverride?.map?.zoom ?? shareOverride?.map?.zoom ?? subsectionMap?.zoom ?? resolvedMap?.zoom
  const mapZoom =
    ratioZoomOverride !== undefined
      ? ratioZoomOverride
      : baseZoom !== undefined
        ? baseZoom + SHARE_ZOOM_DELTA[ratio]
        : undefined
  const mapPitch =
    subRatio?.pitch ?? shareSubOverride?.map?.pitch ?? secRatio?.pitch ?? shareOverride?.map?.pitch ?? subsectionMap?.pitch ?? resolvedMap?.pitch
  const mapBearing =
    subRatio?.bearing ?? shareSubOverride?.map?.bearing ?? secRatio?.bearing ?? shareOverride?.map?.bearing ?? subsectionMap?.bearing ?? resolvedMap?.bearing
  // Regions / heatmap: share override layers can override either, with full
  // cascade. `layers.{regions,heatmap} === false` suppresses entirely below.
  const resolvedRegions =
    shareSubOverride?.map?.regions ?? shareOverride?.map?.regions ?? subsectionMap?.regions ?? resolvedMap?.regions
  const resolvedHeatmap =
    shareSubOverride?.map?.heatmap ?? shareOverride?.map?.heatmap ?? subsectionMap?.heatmap ?? resolvedMap?.heatmap
  // Thin patch: `regionLabelCodes` replaces the parent's labels.codes allowlist
  // without forcing the user to restate the whole regions block.
  const labelCodesOverride =
    shareSubOverride?.regionLabelCodes ?? shareOverride?.regionLabelCodes
  const patchedRegions = useMemo(() => {
    if (!resolvedRegions) return resolvedRegions
    if (!labelCodesOverride) return resolvedRegions
    return {
      ...resolvedRegions,
      labels: { ...(resolvedRegions.labels ?? {}), codes: labelCodesOverride },
    }
  }, [resolvedRegions, labelCodesOverride])
  const mapRegions = layers.regions === false ? undefined : patchedRegions
  const mapHeatmap = layers.heatmap === false ? undefined : resolvedHeatmap

  // Free-floating text labels. Same cascade as pins; not gated by layer
  // visibility (textLabels are independent of the pins layer toggle).
  const textLabels = useMemo<MapTextLabel[] | undefined>(() => {
    if (shareSubOverride?.map?.textLabels) return shareSubOverride.map.textLabels
    if (shareOverride?.map?.textLabels) return shareOverride.map.textLabels
    if (subsectionMap?.textLabels) return subsectionMap.textLabels
    return resolvedMap?.textLabels
  }, [resolvedMap, shareOverride, shareSubOverride, subsectionMap])

  // Collect pins for this card:
  //   • share-subsection pins (if set, replaces all)
  //   • share-section pins (if set, replaces all)
  //   • else if this is a subsection map card with its own pins, use just those
  //   • else union of parent pins + all subsection pins (the parent overview card)
  // Then suppressed entirely if layers.pins === false.
  // Finally, per-label patches from `pinOverrides` are merged on top so the
  // share card can tweak color / anchor / radius / pulse without restating
  // the whole pin list.
  const allPins = useMemo<MapPinConfig[]>(() => {
    if (layers.pins === false) return []
    const base: MapPinConfig[] = (() => {
      if (shareSubOverride?.map?.pins) return shareSubOverride.map.pins
      if (shareOverride?.map?.pins) return shareOverride.map.pins
      if (subsectionMap?.pins) return subsectionMap.pins
      const pins: MapPinConfig[] = []
      if (resolvedMap?.pins) pins.push(...resolvedMap.pins)
      if (parentConfig.subsections) {
        for (const sub of parentConfig.subsections) {
          if (sub.map?.pins) pins.push(...sub.map.pins)
        }
      }
      // Deduplicate by coordinates
      const seen = new Set<string>()
      return pins.filter((p) => {
        const key = `${p.coordinates[0]},${p.coordinates[1]}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    })()
    const overridesByLabel: Record<string, MapPinOverride> = {
      ...(shareOverride?.pinOverrides ?? {}),
      ...(shareSubOverride?.pinOverrides ?? {}),
    }
    if (Object.keys(overridesByLabel).length === 0) return base
    return base.flatMap((p) => {
      const patch = p.label ? overridesByLabel[p.label] : undefined
      if (patch?.hidden) return []
      return [patch ? { ...p, ...patch } : p]
    })
  }, [parentConfig, resolvedMap, shareOverride, shareSubOverride, subsectionMap, layers.pins])

  const capture = useCallback(async (): Promise<string | null> => {
    const node = captureRef.current
    if (!node) return null
    try {
      await document.fonts.ready

      // Wait for the Mapbox GL map to finish loading its style, tiles,
      // region layer (for custom GeoJSON this includes the fetch) and
      // go idle. Without this, toPng rasterizes an empty canvas or a
      // map without regions drawn.
      if (showMap) {
        // The map is mounted lazily via IntersectionObserver to stay under
        // the browser's WebGL context cap. Scroll the card into view so its
        // observer fires before we start waiting.
        node.scrollIntoView({ block: 'center', behavior: 'auto' })
        await waitForMap()
        // One extra rAF so popup DOM elements have a chance to lay out
        // their final position after the map resolves.
        await new Promise<void>((r) => requestAnimationFrame(() => r()))
      }

      // Wait for every <img> in the capture target to finish loading
      // before snapshotting. html-to-image clones the node and re-fetches
      // each src; if the image hasn't resolved yet the cloned <img>
      // rasterizes empty.
      const imgs = Array.from(node.querySelectorAll('img'))
      await Promise.all(
        imgs.map((img) => {
          if (img.complete && img.naturalWidth > 0) {
            return img.decode().catch(() => undefined)
          }
          return new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          })
        })
      )

      const dataUrl = await toPng(node, {
        width: w,
        height: h,
        pixelRatio,
        backgroundColor: getComputedStyle(node).getPropertyValue('--color-bg').trim() || '#0a0e14',
        filter: (el) => {
          // Hide download buttons during capture
          if (el instanceof HTMLElement && el.dataset.shareUi === 'true') return false
          return true
        },
      })
      return dataUrl
    } catch (err) {
      console.error('Share card capture failed:', err)
      return null
    }
  }, [w, h, pixelRatio, showMap, waitForMap])

  useImperativeHandle(ref, () => ({ capture }), [capture])

  const handleDownload = useCallback(async () => {
    const dataUrl = await capture()
    if (!dataUrl) return
    const link = document.createElement('a')
    link.download = `${slug}-${index + 1}-${ratio.replace(':', 'x')}.png`
    link.href = dataUrl
    link.click()
  }, [capture, slug, index, ratio])

  return (
    <div className="relative group" style={{ width: w, height: h }}>
      {/* Capture target — rendered at mobile-like size, exported at high pixelRatio */}
      <div
        ref={captureRef}
        className="relative overflow-hidden rounded-lg"
        style={{
          width: w,
          height: h,
          background: 'var(--color-bg)',
          fontSize: 20,
        }}
      >
          {/* Map background layer — only on hero and map-title cards */}
          {showMap && (
            <>
              <ShareMapBg
                ratio={ratio}
                center={mapCenter!}
                zoom={mapZoom!}
                pitch={mapPitch}
                bearing={mapBearing}
                style={mapStyle}
                accessToken={accessToken}
                pins={allPins}
                regions={mapRegions}
                heatmap={mapHeatmap}
                textLabels={textLabels}
                onReady={handleMapReady}
                palette={palette}
                fontstack={fontstack}
                highlightCountry={highlightCountry}
                highlightColor={highlightColor}
                defaultOpacity={mapOpacity}
                defaultPinColor={defaultPinColor}
                defaultPinRadius={defaultPinRadius}
                pixelRatio={pixelRatio}
              />
              <MapLegend
                regions={mapRegions}
                pins={allPins}
                leftColumn={isMapTitle && ratio === '4:3'}
              />
            </>
          )}

          {/* Content layer */}
          <div className="relative z-10 h-full flex flex-col">
            {isMapTitle ? (
              /* Map + section heading overlay card. Portrait/square ratios:
                 caption sits in a translucent panel along the top so the map
                 (and any region labels / legend) sit unobstructed below.
                 4:3 landscape: caption moves into a left-column panel
                 occupying ~1/3 of the card width — the map takes the right 2/3
                 and the legend (passed `leftColumn` above) sits beneath the
                 caption in the same column. */
              ratio === '4:3' ? (
                <div className="flex justify-start h-full p-[10px] pt-[15px]">
                  <div
                    className="rounded-lg p-[10px] backdrop-blur-sm w-1/3 self-start"
                    style={{
                      background: 'rgb(var(--color-panel-rgb) / 0.2)',
                      border: '0.5px solid var(--color-line)',
                    }}
                  >
                    <h2
                      className="share-display font-serif font-bold leading-[1.2] text-[20px]"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {mapTitleHeading ?? title}
                    </h2>
                    {mapTitleSubheading && (
                      <p
                        className="text-[15px] leading-[1.4] mt-[5px]"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        {mapTitleSubheading}
                      </p>
                    )}
                    {kind === 'hero' && mapTitleDek && (
                      <p
                        className="text-[16px] leading-[1.4] mt-[5px]"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        {mapTitleDek}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col justify-start h-full p-[10px] pt-[15px]">
                  <div
                    className="rounded-lg p-[10px] backdrop-blur-sm"
                    style={{
                      background: 'rgb(var(--color-panel-rgb) / 0.2)',
                      border: '0.5px solid var(--color-line)',
                    }}
                  >
                    <h2
                      className="share-display font-serif font-bold leading-[1.2] text-[20px]"
                      style={{ color: 'var(--color-text)' }}
                    >
                      {mapTitleHeading ?? title}
                    </h2>
                    {mapTitleSubheading && (
                      <p
                        className="text-[15px] leading-[1.4] mt-[5px]"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        {mapTitleSubheading}
                      </p>
                    )}
                    {kind === 'hero' && mapTitleDek && (
                      <p
                        className="text-[16px] leading-[1.4] mt-[5px]"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        {mapTitleDek}
                      </p>
                    )}
                  </div>
                </div>
              )
            ) : isGraph && hasVizForeground ? (
              /* Foreground-viz card — composes the deck section's visual
                 foreground (chart / image / bigStat / 3D / vertical modules)
                 responsively per ratio. ShareDeckForeground routes through the
                 deck's own ForegroundLayoutSlot so charts resize and multi-layer
                 sections stack instead of squishing; hero/cover sections fill
                 with the title overlaid. */
              <ShareDeckForeground
                slug={slug}
                unit={unit}
                ratio={ratio}
                cardHeight={h}
                heroEyebrow={parentConfig.eyebrow}
                heroHeading={heroHeading}
                heroDek={heroDek}
                heroImageOffset={heroImageOffset}
                chartHeading={chartHeading}
                chartSubheading={chartSubheading}
                layerScope={graphScope}
                itemSlice={itemSlice}
                itemHeading={itemHeading}
              />
            ) : kind === 'hero' && heroHeading ? (
              <ShareHeroCard title={heroHeading} dek={heroDek} ratio={ratio} />
            ) : kind === 'stat' && heading ? (
              <ShareStatCard
                value={heading}
                subheading={subheading}
                description={statDescription}
                color={parentConfig.color}
                ratio={ratio}
              />
            ) : (
              <ShareTextCard heading={heading} subheading={subheading} paragraphs={paragraphs} hidePretext={hidePretext} ratio={ratio} />
            )}
          </div>

          {/* Branding header */}
          <BrandingHeader title={title} logo={logo} vertical={vertical} />
        </div>

      {/* Download button overlay — hidden during capture and in edit mode */}
      {!disableDownload && (
        <button
          data-share-ui="true"
          onClick={handleDownload}
          className="absolute inset-0 z-20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          style={{ background: 'rgba(0,0,0,0.4)' }}
        >
          <div
            className="rounded-lg px-4 py-2 font-[family-name:var(--font-mono)] text-[0.75rem] uppercase tracking-wider"
            style={{
              background: 'var(--color-accent)',
              color: 'var(--color-bg)',
            }}
          >
            Download PNG
          </div>
        </button>
      )}
    </div>
  )
})

export default ShareCard
