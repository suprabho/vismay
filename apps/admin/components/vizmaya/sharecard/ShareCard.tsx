'use client'

// Layered share-card renderer. A card is a named-slot composition (background /
// hero / elements / text / branding). Everything renders inside `captureRef`;
// the composer's drag/selection chrome lives OUTSIDE this node (or is tagged
// `data-share-ui` so the toPng filter strips it). RENDER_SIZE / OUTPUT_SIZE are
// exported for the composer's preview scaling.

import { useRef, useCallback, useMemo, useEffect, forwardRef, useImperativeHandle } from 'react'
import { toPng } from 'html-to-image'
import type {
  ResolvedUnit,
  MapPinConfig,
  MapPalette,
  VizLayer,
  MapRegionLayer,
  HeatmapLayer,
  MapTextLabel,
  MapView,
  StoryFocusArea,
} from '@vismay/viz-engine'
import { resolveSlotsFlat, ChartDataOverrideProvider } from '@vismay/viz-engine'
import { AuraBackground } from '@vismay/ui'
import type { AspectRatio } from './AspectRatioToggle'
import type { CardComposition, MapSpec } from './layers/types'
import { ElementView, TextView, transformWrapperStyle } from './layers/LayerView'
import { proxiedOverlaySrc } from './OverlayLayer'
import ShareDeckForeground from './ShareDeckForeground'
import ShareMapBg from './ShareMapBg'
import MapLegend from './MapLegend'
import BrandingHeader from './BrandingFooter'

/** Shape of a `type: 'map'` layer from `resolveSlotsFlat`. */
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

/** DOM render size — mobile-ish proportions so text looks natural; the export
 *  is scaled up via pixelRatio to hit OUTPUT_SIZE. */
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

/** Default zoom-out applied to the story's configured zoom when a map slot has
 *  no explicit per-ratio camera — the small card crops less of the subject. */
const SHARE_ZOOM_DELTA: Record<AspectRatio, number> = {
  '1:1': -0.5,
  '4:5': -0.3,
  '3:4': -0.1,
  '4:3': -0.5,
}

/** Contained maps (hero / free-object) fill their box with the geo center at
 *  the box center — no overlay-reserved padding. */
const CONTAINED_FOCUS: StoryFocusArea = { top: 0, left: 0, width: 1, height: 1 }

const MAP_READY_TIMEOUT_MS = 6000
const CHART_READY_TIMEOUT_MS = 3000
const IMG_READY_TIMEOUT_MS = 4000

interface Props {
  composition: CardComposition
  unit: ResolvedUnit
  ratio: AspectRatio
  slug: string
  title: string
  vertical?: string
  accessToken: string
  /** Story-wide map defaults (per-slot appearance overrides win). */
  palette?: MapPalette
  fontstack?: string[]
  highlightCountry?: string
  highlightColor?: string
  mapStyle?: string
  mapOpacity?: number
  defaultPinColor?: string
  defaultPinRadius?: number
  logo?: string
  /** Hide the hover Download button (the composer drives capture). */
  disableDownload?: boolean
}

export interface ShareCardHandle {
  capture: () => Promise<string | null>
  /** Effective camera for a map slot at the active ratio — the slot's per-ratio
   *  override, else the story's resolved camera + the share zoom-delta. Seeds
   *  the composer's map-edit overlay. Null when the section has no map. */
  getMapView: (spec: MapSpec) => MapView | null
}

/** Extract hero dek/byline from paragraphs (kept for callers/back-compat). */
export function extractHeroBits(paragraphs: string[]): { dek: string; byline: string } {
  const dek =
    paragraphs.find((p) => /^\*[^*]/.test(p))?.replace(/^\*+|\*+$/g, '').trim() ?? ''
  const byline =
    paragraphs.find((p) => p.startsWith('**'))?.replace(/^\*+|\*+$/g, '').trim() ?? ''
  return { dek, byline }
}

interface Gate {
  p: Promise<void>
  resolve: () => void
  done: boolean
}
function makeGate(): Gate {
  let resolve!: () => void
  const p = new Promise<void>((r) => {
    resolve = r
  })
  return { p, resolve, done: false }
}
function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
function raf(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => r()))
}

const ShareCard = forwardRef<ShareCardHandle, Props>(function LayeredShareCard(
  {
    composition,
    unit,
    ratio,
    slug,
    title,
    vertical,
    accessToken,
    palette,
    fontstack,
    highlightCountry,
    highlightColor,
    mapStyle,
    mapOpacity,
    defaultPinColor,
    defaultPinRadius,
    logo,
    disableDownload = false,
  },
  ref,
) {
  const captureRef = useRef<HTMLDivElement>(null)
  const { w, h } = RENDER_SIZE[ratio]
  const output = OUTPUT_SIZE[ratio]
  const pixelRatio = output.w / w

  // ── resolved map data from the story unit ────────────────────────────────
  const resolvedSlots = useMemo(() => resolveSlotsFlat(unit.parentConfig), [unit.parentConfig])
  const resolvedMap = useMemo<ResolvedMapLayer | undefined>(
    () => resolvedSlots.background.find((l): l is VizLayer & ResolvedMapLayer => l.type === 'map'),
    [resolvedSlots],
  )
  const resolvedPins = useMemo<MapPinConfig[]>(() => {
    const pins: MapPinConfig[] = []
    if (resolvedMap?.pins) pins.push(...resolvedMap.pins)
    for (const sub of unit.parentConfig.subsections ?? []) {
      if (sub.map?.pins) pins.push(...sub.map.pins)
    }
    const seen = new Set<string>()
    return pins.filter((p) => {
      const key = `${p.coordinates[0]},${p.coordinates[1]}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [unit.parentConfig, resolvedMap])

  const effectiveCamera = useCallback(
    (spec: MapSpec): MapView | null => {
      const r = spec.camera[ratio]
      if (r) return r
      if (!resolvedMap?.center) return null
      return {
        center: resolvedMap.center,
        zoom: (resolvedMap.zoom ?? 2) + SHARE_ZOOM_DELTA[ratio],
        pitch: resolvedMap.pitch ?? 9,
        bearing: resolvedMap.bearing ?? 0,
      }
    },
    [ratio, resolvedMap],
  )

  // ── map placements (the same set drives rendering + the capture gate) ─────
  const mapPlacements = useMemo<Array<{ id: string; spec: MapSpec }>>(() => {
    const out: Array<{ id: string; spec: MapSpec }> = []
    if (composition.background.kind === 'map') out.push({ id: 'map:bg', spec: composition.background })
    if (composition.hero?.kind === 'map') out.push({ id: 'map:hero', spec: composition.hero })
    for (const el of composition.elements) if (el.kind === 'map' && el.visible) out.push({ id: `map:el:${el.id}`, spec: el })
    return out
  }, [composition])
  const mapIds = useMemo(() => mapPlacements.map((p) => p.id), [mapPlacements])
  const hasChart = composition.hero?.kind === 'chart' && !!composition.hero.chartId

  // ── capture readiness gates (per-map + chart) ────────────────────────────
  // Gates are one-shot promises resolved by onReady/finished. They MUST be
  // re-armed whenever the map/chart inputs that trigger a re-paint change —
  // otherwise a second capture after an edit resolves instantly against a
  // stale gate and rasterizes the old frame. The signatures below cover only
  // the inputs that actually re-fire onReady/finished (camera/layers/style/pin
  // for maps; chartId/data for charts), so opacity-only tweaks don't strand a
  // gate waiting for an event that never comes.
  const mapGates = useRef<Map<string, Gate>>(new Map())
  const gateFor = useCallback((id: string): Gate => {
    let g = mapGates.current.get(id)
    if (!g) {
      g = makeGate()
      mapGates.current.set(id, g)
    }
    return g
  }, [])
  const handleMapReady = useCallback(
    (id: string) => {
      const g = gateFor(id)
      if (!g.done) {
        g.done = true
        g.resolve()
      }
    },
    [gateFor],
  )
  const chartGate = useRef<Gate>(makeGate())
  const handleChartReady = useCallback(() => {
    if (!chartGate.current.done) {
      chartGate.current.done = true
      chartGate.current.resolve()
    }
  }, [])

  const mapSig = useMemo(
    () =>
      JSON.stringify(
        mapPlacements.map((p) => ({
          id: p.id,
          cam: p.spec.camera[ratio] ?? null,
          layers: p.spec.layers,
          style: p.spec.appearance.mapStyle ?? null,
          pc: p.spec.appearance.pinColor ?? null,
          pr: p.spec.appearance.pinRadius ?? null,
        })),
      ),
    [mapPlacements, ratio],
  )
  // Re-arm every current map gate when the map inputs change.
  useEffect(() => {
    for (const id of mapIds) mapGates.current.set(id, makeGate())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapSig])

  const chartSig =
    composition.hero?.kind === 'chart'
      ? `${composition.hero.chartId}:${JSON.stringify(composition.hero.dataOverride ?? null)}`
      : ''
  useEffect(() => {
    chartGate.current = makeGate()
  }, [chartSig])

  // Mirror into refs so `capture` reads current values without re-binding.
  const mapIdsRef = useRef(mapIds)
  mapIdsRef.current = mapIds
  const hasChartRef = useRef(hasChart)
  hasChartRef.current = hasChart

  // ── map render helper (shared by all three roles) ────────────────────────
  const renderMap = useCallback(
    (id: string, spec: MapSpec, contained: boolean) => {
      const cam = effectiveCamera(spec)
      if (!cam) return null
      const pins = spec.layers.pins ? resolvedPins : []
      const regions = spec.layers.regions ? resolvedMap?.regions : undefined
      const heatmap = spec.layers.heatmap ? resolvedMap?.heatmap : undefined
      return (
        <>
          <ShareMapBg
            ratio={ratio}
            center={cam.center}
            zoom={cam.zoom}
            pitch={cam.pitch}
            bearing={cam.bearing}
            style={spec.appearance.mapStyle ?? mapStyle}
            accessToken={accessToken}
            pins={pins}
            regions={regions}
            heatmap={heatmap}
            textLabels={resolvedMap?.textLabels}
            onReady={() => handleMapReady(id)}
            palette={palette}
            fontstack={fontstack}
            highlightCountry={highlightCountry}
            highlightColor={highlightColor}
            defaultOpacity={spec.appearance.mapOpacity ?? mapOpacity}
            defaultPinColor={spec.appearance.pinColor ?? defaultPinColor}
            defaultPinRadius={spec.appearance.pinRadius ?? defaultPinRadius}
            pixelRatio={pixelRatio}
            focusArea={contained ? CONTAINED_FOCUS : undefined}
          />
          {!contained && <MapLegend regions={regions} pins={pins} />}
        </>
      )
    },
    [
      ratio,
      effectiveCamera,
      resolvedPins,
      resolvedMap,
      mapStyle,
      accessToken,
      palette,
      fontstack,
      highlightCountry,
      highlightColor,
      mapOpacity,
      defaultPinColor,
      defaultPinRadius,
      pixelRatio,
      handleMapReady,
    ],
  )

  // ── capture ───────────────────────────────────────────────────────────────
  const capture = useCallback(async (): Promise<string | null> => {
    const node = captureRef.current
    if (!node) return null
    try {
      await document.fonts.ready

      const ids = mapIdsRef.current
      if (ids.length) {
        node.scrollIntoView({ block: 'center', behavior: 'auto' })
        // Wait for EVERY map instance to idle (each registers its own gate);
        // a per-map timeout keeps a dead map from hanging capture forever.
        await Promise.all(ids.map((id) => Promise.race([gateFor(id).p, delay(MAP_READY_TIMEOUT_MS)])))
        await raf()
      }

      if (hasChartRef.current) {
        // ECharts paints async; ShareDeckForeground forwards the `finished`
        // signal through noteLayerReady → handleChartReady.
        await Promise.race([chartGate.current.p, delay(CHART_READY_TIMEOUT_MS)])
        await raf()
      }

      // Decode every <img> (posters, overlays, generated/hero photos). An
      // already-completed image (even a broken one: complete + naturalWidth 0)
      // must NOT wait on a load/error event that already fired — otherwise the
      // gate never settles. Pending images race a timeout backstop.
      const imgs = Array.from(node.querySelectorAll('img'))
      await Promise.all(
        imgs.map((img) => {
          if (img.complete) return img.naturalWidth > 0 ? img.decode().catch(() => undefined) : Promise.resolve()
          return Promise.race([
            new Promise<void>((resolve) => {
              img.addEventListener('load', () => resolve(), { once: true })
              img.addEventListener('error', () => resolve(), { once: true })
            }),
            delay(IMG_READY_TIMEOUT_MS),
          ])
        }),
      )

      // Final settle: two frames + a short delay so the Mapbox WebGL buffer and
      // any non-gated paint (opacity) are final before html-to-image samples.
      await raf()
      await raf()
      await delay(50)

      return await toPng(node, {
        width: w,
        height: h,
        pixelRatio,
        backgroundColor: getComputedStyle(node).getPropertyValue('--color-bg').trim() || '#0a0e14',
        // Strip composer chrome AND the live aura iframe (cross-origin, can't
        // rasterize — the poster <img> underneath carries the background).
        filter: (el) => !(el instanceof HTMLElement && el.dataset.shareUi === 'true'),
        includeQueryParams: true,
        cacheBust: true,
      })
    } catch (err) {
      console.error('Share card capture failed:', err)
      return null
    }
  }, [w, h, pixelRatio, gateFor])

  const getMapView = useCallback((spec: MapSpec) => effectiveCamera(spec), [effectiveCamera])

  useImperativeHandle(ref, () => ({ capture, getMapView }), [capture, getMapView])

  const handleDownload = useCallback(async () => {
    const dataUrl = await capture()
    if (!dataUrl) return
    const link = document.createElement('a')
    link.download = `${slug || 'vizmaya'}-${ratio.replace(':', 'x')}.png`
    link.href = dataUrl
    link.click()
  }, [capture, slug, ratio])

  // ── background ────────────────────────────────────────────────────────────
  const bg = composition.background
  const background = (() => {
    switch (bg.kind) {
      case 'solid':
        return <div className="absolute inset-0" style={{ background: bg.color }} />
      case 'gradient':
        return (
          <div
            className="absolute inset-0"
            style={{
              background:
                bg.gtype === 'radial'
                  ? `radial-gradient(circle at 50% 40%, ${bg.from}, ${bg.to})`
                  : `linear-gradient(${bg.angle ?? 180}deg, ${bg.from}, ${bg.to})`,
            }}
          />
        )
      case 'image':
        // eslint-disable-next-line @next/next/no-img-element
        return (
          <img
            src={proxiedOverlaySrc(bg.src)}
            alt=""
            className="absolute inset-0 h-full w-full"
            style={{ objectFit: bg.objectFit }}
          />
        )
      case 'aura':
        return (
          <>
            {bg.posterSrc && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={proxiedOverlaySrc(bg.posterSrc)}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            {/* Live preview only — cross-origin iframe is stripped from capture. */}
            <div data-share-ui="true" className="absolute inset-0">
              <AuraBackground slug={bg.slug} />
              <style>{`.bn-aura{position:absolute;inset:0;overflow:hidden}.bn-aura iframe{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:transparent}`}</style>
            </div>
          </>
        )
      case 'map':
        return <div className="absolute inset-0">{renderMap('map:bg', bg, false)}</div>
      case 'none':
      default:
        return null
    }
  })()

  // ── hero ────────────────────────────────────────────────────────────────
  const hero = (() => {
    const hl = composition.hero
    if (!hl) return null
    if (hl.kind === 'map') {
      return <div className="absolute inset-0 z-10">{renderMap('map:hero', hl, true)}</div>
    }
    const overrides = hl.dataOverride !== undefined ? { [hl.chartId]: hl.dataOverride } : {}
    return (
      <div className="absolute inset-0 z-10">
        <ChartDataOverrideProvider value={overrides}>
          <ShareDeckForeground
            slug={slug}
            unit={unit}
            ratio={ratio}
            cardHeight={h}
            chartHeading={hl.heading}
            chartSubheading={hl.subheading}
            layerScope="chart"
            noteLayerReady={handleChartReady}
          />
        </ChartDataOverrideProvider>
      </div>
    )
  })()

  return (
    <div className="relative group" style={{ width: w, height: h }}>
      <div
        ref={captureRef}
        className="relative overflow-hidden rounded-lg"
        style={{ width: w, height: h, background: 'var(--color-bg)', fontSize: 20 }}
      >
        {/* background (z0) */}
        {background}

        {/* hero (z10) */}
        {hero}

        {/* branding (z15) */}
        {composition.branding.visible && (
          <div className="absolute inset-0 z-[15]">
            <BrandingHeader title={title} logo={logo} vertical={vertical} />
          </div>
        )}

        {/* text + elements (z20+) — DOM order = stacking; later paints on top */}
        <div className="absolute inset-0 z-20">
          {composition.text.heading && <TextView block={composition.text.heading} cardWidth={w} />}
          {composition.text.subheading && <TextView block={composition.text.subheading} cardWidth={w} />}
          {composition.elements.map((el) =>
            el.kind === 'map' ? (
              el.visible ? (
                <div key={el.id} style={transformWrapperStyle(el.transform, { sizeByWidth: true })}>
                  <div
                    style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', overflow: 'hidden', borderRadius: 8 }}
                  >
                    {renderMap(`map:el:${el.id}`, el, true)}
                  </div>
                </div>
              ) : null
            ) : (
              <ElementView key={el.id} element={el} cardWidth={w} />
            ),
          )}
          {composition.text.annotations.map((a) => (
            <TextView key={a.id} block={a} cardWidth={w} />
          ))}
        </div>
      </div>

      {!disableDownload && (
        <button
          data-share-ui="true"
          onClick={handleDownload}
          className="absolute inset-0 z-30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
          style={{ background: 'rgba(0,0,0,0.4)' }}
        >
          <div
            className="rounded-lg px-4 py-2 font-[family-name:var(--font-mono)] text-[0.75rem] uppercase tracking-wider"
            style={{ background: 'var(--color-accent)', color: 'var(--color-bg)' }}
          >
            Download PNG
          </div>
        </button>
      )}
    </div>
  )
})

export default ShareCard
