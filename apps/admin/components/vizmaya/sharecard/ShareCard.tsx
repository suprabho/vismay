'use client'

// Ported from apps/vizmaya-fyi/components/share/ShareCard.tsx, extended with an
// `overlays` prop (emoji / image stickers) rendered INSIDE the capture node so
// they're part of the exported PNG. RENDER_SIZE / OUTPUT_SIZE are exported for
// the composer's preview scaling.

import { useRef, useCallback, useMemo, useState, forwardRef, useImperativeHandle } from 'react'
import { toPng } from 'html-to-image'
import type { ResolvedUnit, MapPinConfig, MapPinOverride, MapPalette, ShareSectionOverride, ShareLayerVisibility, VizLayer, MapRegionLayer, HeatmapLayer } from '@vismay/viz-engine'
import type { MapTextLabel } from '@vismay/viz-engine'
import { resolveSlotsFlat } from '@vismay/viz-engine'
import type { AspectRatio } from './AspectRatioToggle'
import type { Overlay } from './types'
import ShareTextCard from './ShareTextCard'
import ShareStatCard from './ShareStatCard'
import ShareHeroCard from './ShareHeroCard'
import ShareDeckForeground from './ShareDeckForeground'
import ShareMapBg from './ShareMapBg'
import MapLegend from './MapLegend'
import BrandingHeader from './BrandingFooter'
import OverlayLayer from './OverlayLayer'

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
 */
const BASE = 390

export const RENDER_SIZE: Record<AspectRatio, { w: number; h: number }> = {
  '1:1': { w: BASE, h: BASE },
  '4:5': { w: BASE, h: BASE * (5 / 4) },
  '3:4': { w: BASE, h: BASE * (4 / 3) },
  '4:3': { w: BASE * (4 / 3), h: BASE },
}

export const OUTPUT_SIZE: Record<AspectRatio, { w: number; h: number }> = {
  '1:1': { w: 1080, h: 1080 },
  '4:5': { w: 1080, h: 1350 },
  '3:4': { w: 1080, h: 1440 },
  '4:3': { w: 1440, h: 1080 },
}

/**
 * Default zoom-out applied on top of the story's configured zoom when a card
 * doesn't ship its own per-ratio override. Share cards are much smaller than
 * the interactive viewport, so pulling the camera back a bit keeps the
 * subject from cropping into the title overlay.
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
  /** For `variant === 'graph'`, which subset of the foreground to render. */
  graphScope?: 'all' | 'stat' | 'chart'
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
  /** Draggable emoji / image overlays placed on top of the card. */
  overlays?: Overlay[]
  /** When true, hide the per-card hover Download button (the composer drives it). */
  disableDownload?: boolean
}

export interface ShareCardHandle {
  capture: () => Promise<string | null>
}

/** Extract hero dek and byline from paragraphs (matches MapStorySection logic). */
export function extractHeroBits(paragraphs: string[]): { dek: string; byline: string } {
  const dek =
    paragraphs.find((p) => /^\*[^*]/.test(p))?.replace(/^\*+|\*+$/g, '').trim() ?? ''
  const byline =
    paragraphs.find((p) => p.startsWith('**'))?.replace(/^\*+|\*+$/g, '').trim() ?? ''
  return { dek, byline }
}

const ShareCard = forwardRef<ShareCardHandle, Props>(function ShareCard(
  { unit, index, ratio, slug, title, vertical, accessToken, variant = 'auto', graphScope = 'all', shareOverride, palette, fontstack, highlightCountry, highlightColor, mapOpacity, mapStyle, defaultPinColor, defaultPinRadius, logo, overlays, disableDownload = false },
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
  const resolvedSlots = useMemo(() => resolveSlotsFlat(parentConfig), [parentConfig])
  const resolvedMap = useMemo<ResolvedMapLayer | undefined>(
    () => resolvedSlots.background.find((l): l is VizLayer & ResolvedMapLayer => l.type === 'map'),
    [resolvedSlots]
  )
  const vizForegroundLayers = useMemo(
    () =>
      resolvedSlots.foreground.filter(
        (l) => l.type !== 'text' && l.type !== 'bodyText'
      ),
    [resolvedSlots]
  )
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

  const layers: ShareLayerVisibility = {
    pins: shareSubOverride?.layers?.pins ?? shareOverride?.layers?.pins,
    regions: shareSubOverride?.layers?.regions ?? shareOverride?.layers?.regions,
    heatmap: shareSubOverride?.layers?.heatmap ?? shareOverride?.layers?.heatmap,
  }

  const chartHeading = shareSubOverride?.chart?.heading ?? shareOverride?.chart?.heading
  const chartSubheading = shareSubOverride?.chart?.subheading ?? shareOverride?.chart?.subheading

  const mapTitleHeading =
    shareSubOverride?.mapTitle?.heading ?? shareOverride?.mapTitle?.heading ?? heading
  const mapTitleSubheading =
    shareSubOverride?.mapTitle?.subheading ?? shareOverride?.mapTitle?.subheading ?? subheading
  const heroHeading =
    shareSubOverride?.hero?.heading ?? shareOverride?.hero?.heading ?? heading
  const heroDek =
    shareSubOverride?.hero?.dek ?? shareOverride?.hero?.dek ?? extractHeroBits(paragraphs).dek
  const heroImageOffset =
    shareSubOverride?.hero?.imageOffset ?? shareOverride?.hero?.imageOffset
  const mapTitleDek =
    shareSubOverride?.mapTitle?.dek ?? shareOverride?.mapTitle?.dek ?? heroDek
  const statDescription =
    shareSubOverride?.stat?.description ?? shareOverride?.stat?.description ?? paragraphs.join(' ')

  const hidePretext = shareSubOverride?.hidePretext ?? shareOverride?.hidePretext ?? false

  const subsectionMap = parentConfig.subsections?.[unit.subIndex]?.map
  const subRatio = shareSubOverride?.map?.ratios?.[ratio]
  const secRatio = shareOverride?.map?.ratios?.[ratio]
  const mapCenter =
    subRatio?.center ?? shareSubOverride?.map?.center ?? secRatio?.center ?? shareOverride?.map?.center ?? subsectionMap?.center ?? resolvedMap?.center
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
  const resolvedRegions =
    shareSubOverride?.map?.regions ?? shareOverride?.map?.regions ?? subsectionMap?.regions ?? resolvedMap?.regions
  const resolvedHeatmap =
    shareSubOverride?.map?.heatmap ?? shareOverride?.map?.heatmap ?? subsectionMap?.heatmap ?? resolvedMap?.heatmap
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

  const textLabels = useMemo<MapTextLabel[] | undefined>(() => {
    if (shareSubOverride?.map?.textLabels) return shareSubOverride.map.textLabels
    if (shareOverride?.map?.textLabels) return shareOverride.map.textLabels
    if (subsectionMap?.textLabels) return subsectionMap.textLabels
    return resolvedMap?.textLabels
  }, [resolvedMap, shareOverride, shareSubOverride, subsectionMap])

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

      // Wait for the Mapbox GL map to finish loading + go idle. Without this,
      // toPng rasterizes an empty canvas or a map without regions drawn.
      if (showMap) {
        node.scrollIntoView({ block: 'center', behavior: 'auto' })
        await waitForMap()
        await new Promise<void>((r) => requestAnimationFrame(() => r()))
      }

      // Wait for every <img> (overlay assets, generated images, hero photos)
      // to finish loading before snapshotting.
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
          if (el instanceof HTMLElement && el.dataset.shareUi === 'true') return false
          return true
        },
        // Key the html-to-image cache on the FULL url (query string included) so
        // multiple proxied overlays (proxy-image?url=...) don't collide on one
        // cache key and re-serve the first-fetched image for all of them.
        includeQueryParams: true,
        cacheBust: true,
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

        {/* Emoji / image overlays — part of the captured PNG */}
        <OverlayLayer overlays={overlays ?? []} cardWidth={w} />
      </div>

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
