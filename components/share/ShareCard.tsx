'use client'

import { useRef, useCallback, useMemo, useState, forwardRef, useImperativeHandle } from 'react'
import { toPng } from 'html-to-image'
import type { ResolvedUnit, MapPinConfig, MapPalette, ShareSectionOverride, ShareLayerVisibility } from '@/lib/storyConfig.types'
import type { AspectRatio } from './AspectRatioToggle'
import ShareTextCard from './ShareTextCard'
import ShareStatCard from './ShareStatCard'
import ShareHeroCard from './ShareHeroCard'
import ShareChartCard from './ShareChartCard'
import ShareMapBg from './ShareMapBg'
import BrandingHeader from './BrandingFooter'

/**
 * DOM render size — matches mobile proportions so text looks natural.
 * The exported image is scaled up via pixelRatio to hit the target output.
 *
 * Output targets:
 *   1:1 → 1080×1080  (pixelRatio ≈ 2.77)
 *   3:4 → 1080×1440  (pixelRatio ≈ 2.77)
 *   4:3 → 1440×1080  (pixelRatio ≈ 2.77)
 */
const BASE = 390

const RENDER_SIZE: Record<AspectRatio, { w: number; h: number }> = {
  '1:1': { w: BASE, h: BASE },
  '3:4': { w: BASE, h: BASE * (4 / 3) },
  '4:3': { w: BASE * (4 / 3), h: BASE },
}

const OUTPUT_SIZE: Record<AspectRatio, { w: number; h: number }> = {
  '1:1': { w: 1080, h: 1080 },
  '3:4': { w: 1080, h: 1440 },
  '4:3': { w: 1440, h: 1080 },
}

export type CardVariant = 'auto' | 'map-title' | 'graph'

interface Props {
  unit: ResolvedUnit
  index: number
  ratio: AspectRatio
  slug: string
  title: string
  accessToken: string
  /** Card variant — 'auto' picks by section kind, 'map-title' forces map + title overlay */
  variant?: CardVariant
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
function extractHeroBits(paragraphs: string[]): { dek: string; byline: string } {
  const dek =
    paragraphs.find((p) => /^\*[^*]/.test(p))?.replace(/^\*+|\*+$/g, '').trim() ?? ''
  const byline =
    paragraphs.find((p) => p.startsWith('**'))?.replace(/^\*+|\*+$/g, '').trim() ?? ''
  return { dek, byline }
}

const ShareCard = forwardRef<ShareCardHandle, Props>(function ShareCard(
  { unit, index, ratio, slug, title, accessToken, variant = 'auto', shareOverride, palette, fontstack, highlightCountry, highlightColor, mapOpacity, mapStyle, defaultPinColor, defaultPinRadius, logo, disableDownload = false },
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
  // Per-subsection share override — sits between the section-level share
  // override and the story config in the cascade.
  const shareSubOverride = shareOverride?.subsections?.[unit.subIndex]
  const heading =
    shareSubOverride?.heading ?? shareOverride?.heading ?? unit.heading
  const subheading =
    shareSubOverride?.subheading ?? shareOverride?.subheading ?? unit.subheading
  const kind = parentConfig.kind ?? 'text'
  const hasChart = !!parentConfig.chart
  const isMapTitle = variant === 'map-title'
  const isGraph = variant === 'graph'
  // Only show map bg on hero cards and map-title variant
  const showMap = !!parentConfig.map?.center && (kind === 'hero' || isMapTitle)

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

  // Resolve map properties. Cascade: share-subsection > share-section >
  // story-subsection > parent. The story-subsection override only applies
  // when this card represents a specific subsection.
  const subsectionMap = parentConfig.subsections?.[unit.subIndex]?.map
  const mapCenter =
    shareSubOverride?.map?.center ?? shareOverride?.map?.center ?? subsectionMap?.center ?? parentConfig.map?.center
  const mapZoom =
    shareSubOverride?.map?.zoom ?? shareOverride?.map?.zoom ?? subsectionMap?.zoom ?? parentConfig.map?.zoom
  const mapPitch =
    shareSubOverride?.map?.pitch ?? shareOverride?.map?.pitch ?? subsectionMap?.pitch ?? parentConfig.map?.pitch
  const mapBearing =
    shareSubOverride?.map?.bearing ?? shareOverride?.map?.bearing ?? subsectionMap?.bearing ?? parentConfig.map?.bearing
  // Regions / heatmap: share override layers can override either, with full
  // cascade. `layers.{regions,heatmap} === false` suppresses entirely below.
  const resolvedRegions =
    shareSubOverride?.map?.regions ?? shareOverride?.map?.regions ?? subsectionMap?.regions ?? parentConfig.map?.regions
  const resolvedHeatmap =
    shareSubOverride?.map?.heatmap ?? shareOverride?.map?.heatmap ?? subsectionMap?.heatmap ?? parentConfig.map?.heatmap
  const mapRegions = layers.regions === false ? undefined : resolvedRegions
  const mapHeatmap = layers.heatmap === false ? undefined : resolvedHeatmap

  // Collect pins for this card:
  //   • share-subsection pins (if set, replaces all)
  //   • share-section pins (if set, replaces all)
  //   • else if this is a subsection map card with its own pins, use just those
  //   • else union of parent pins + all subsection pins (the parent overview card)
  // Then suppressed entirely if layers.pins === false.
  const allPins = useMemo<MapPinConfig[]>(() => {
    if (layers.pins === false) return []
    if (shareSubOverride?.map?.pins) return shareSubOverride.map.pins
    if (shareOverride?.map?.pins) return shareOverride.map.pins
    if (subsectionMap?.pins) return subsectionMap.pins

    const pins: MapPinConfig[] = []
    if (parentConfig.map?.pins) pins.push(...parentConfig.map.pins)
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
  }, [parentConfig, shareOverride, shareSubOverride, subsectionMap, layers.pins])

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
        }}
      >
          {/* Map background layer — only on hero and map-title cards */}
          {showMap && (
            <ShareMapBg
              center={mapCenter!}
              zoom={mapZoom!}
              pitch={mapPitch}
              bearing={mapBearing}
              style={mapStyle}
              accessToken={accessToken}
              pins={allPins}
              regions={mapRegions}
              heatmap={mapHeatmap}
              onReady={handleMapReady}
              palette={palette}
              fontstack={fontstack}
              highlightCountry={highlightCountry}
              highlightColor={highlightColor}
              defaultOpacity={mapOpacity}
              defaultPinColor={defaultPinColor}
              defaultPinRadius={defaultPinRadius}
            />
          )}

          {/* Content layer */}
          <div className="relative z-10 h-full flex flex-col">
            {isMapTitle ? (
              /* Map + section heading overlay card — heading sits in a
                 translucent panel mirroring MapStorySection on the story
                 page so the share view matches the live story aesthetic.
                 4:3 landscape gets a more compact caption (smaller heading,
                 no hero dek) so the map isn't crowded out of view. */
              <div className="flex flex-col justify-end h-full p-4">
                <div
                  className="rounded-lg p-5 backdrop-blur-sm"
                  style={{
                    background: 'rgb(var(--color-panel-rgb) / 0.2)',
                    border: '0.5px solid var(--color-line)',
                  }}
                >
                  {parentConfig.eyebrow && (
                    <div
                      className="font-[family-name:var(--font-mono)] text-[0.65rem] uppercase tracking-[0.15em] mb-2"
                      style={{ color: 'var(--color-accent)' }}
                    >
                      {parentConfig.eyebrow}
                    </div>
                  )}
                  <h2
                    className={`font-serif font-bold leading-[1.2] ${ratio === '4:3' ? 'text-[1.25rem]' : 'text-[1.6rem]'}`}
                    style={{ color: 'var(--color-text)' }}
                  >
                    {heading || title}
                  </h2>
                  {subheading && (
                    <p
                      className="text-[0.85rem] leading-[1.4] mt-2"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      {subheading}
                    </p>
                  )}
                  {kind === 'hero' && ratio !== '4:3' && (() => {
                    const { dek } = extractHeroBits(paragraphs)
                    return dek ? (
                      <p
                        className="text-[0.8rem] leading-[1.4] mt-3 max-w-[80%]"
                        style={{ color: 'var(--color-muted)' }}
                      >
                        {dek}
                      </p>
                    ) : null
                  })()}
                </div>
              </div>
            ) : isGraph && hasChart ? (
              /* Chart-only card — one per subsection, with activeStep
                 driven by the unit's subIndex so each chart step renders
                 in its own share card. */
              <div className="h-full min-h-0">
                <ShareChartCard
                  chartId={parentConfig.chart!}
                  activeStep={unit.subIndex}
                  slug={slug}
                  heading={chartHeading}
                  subheading={chartSubheading}
                />
              </div>
            ) : kind === 'hero' && heading ? (
              <ShareHeroCard
                title={heading}
                eyebrow={parentConfig.eyebrow}
              />
            ) : kind === 'stat' && heading ? (
              <ShareStatCard
                value={heading}
                subheading={subheading}
                description={paragraphs.join(' ')}
              />
            ) : (
              <ShareTextCard heading={heading} subheading={subheading} paragraphs={paragraphs} />
            )}
          </div>

          {/* Branding header */}
          <BrandingHeader title={title} logo={logo} />
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
