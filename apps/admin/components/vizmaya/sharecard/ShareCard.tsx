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
  ResolvedForeground,
} from '@vismay/viz-engine'
import { resolveSlotsFlat, ChartDataOverrideProvider, ForegroundLayoutSlot } from '@vismay/viz-engine'
import { AuraBackground } from '@vismay/ui'
import type { AspectRatio } from './AspectRatioToggle'
import type { CardComposition, ElementLayer, MapSpec } from './layers/types'
import { DEFAULT_GRAPHIC_HEIGHT_PCT, bareChartId } from './layers/types'
import { ElementView, TextView, transformWrapperStyle } from './layers/LayerView'
import { proxiedOverlaySrc } from './OverlayLayer'
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

/** Synthetic chart id for a from-scratch (JSON-only) chart that isn't backed
 *  by a story chart. The dataOverride is keyed by this id. */
const CUSTOM_CHART_ID = 'sharecard-custom'

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
      // Authored map YAML carries its own camera (used as-is, no zoom-delta).
      if (spec.data?.center) {
        return {
          center: spec.data.center,
          zoom: spec.data.zoom ?? 2,
          pitch: spec.data.pitch ?? 9,
          bearing: spec.data.bearing ?? 0,
        }
      }
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

  // ── async render placements (drive both rendering and the capture gate) ───
  // Maps (background + each visible map element) and charts (each visible chart
  // element with a source) paint asynchronously, so each registers a readiness
  // gate keyed by a stable id.
  const mapPlacements = useMemo<Array<{ id: string; spec: MapSpec }>>(() => {
    const out: Array<{ id: string; spec: MapSpec }> = []
    if (composition.background.kind === 'map') out.push({ id: 'map:bg', spec: composition.background })
    for (const el of composition.elements) if (el.kind === 'map' && el.visible) out.push({ id: `map:el:${el.id}`, spec: el })
    return out
  }, [composition])
  const chartPlacements = useMemo<Array<{ id: string; el: Extract<ElementLayer, { kind: 'chart' }> }>>(() => {
    const out: Array<{ id: string; el: Extract<ElementLayer, { kind: 'chart' }> }> = []
    for (const el of composition.elements) {
      if (el.kind === 'chart' && el.visible && (!!el.chartId || el.dataOverride !== undefined)) {
        out.push({ id: `chart:el:${el.id}`, el })
      }
    }
    return out
  }, [composition])
  const mapIds = useMemo(() => mapPlacements.map((p) => p.id), [mapPlacements])
  const chartIds = useMemo(() => chartPlacements.map((p) => p.id), [chartPlacements])

  // ── capture readiness gates (one per map + chart, keyed by id) ────────────
  // Gates are one-shot promises resolved by onReady/finished. They MUST be
  // re-armed whenever the inputs that trigger a re-paint change — otherwise a
  // second capture after an edit resolves instantly against a stale gate and
  // rasterizes the old frame. The signatures below cover only the inputs that
  // actually re-fire onReady/finished (camera/layers/style/pin for maps;
  // chartId/data for charts), so opacity-only tweaks don't strand a gate
  // waiting for an event that never comes.
  const gates = useRef<Map<string, Gate>>(new Map())
  const gateFor = useCallback((id: string): Gate => {
    let g = gates.current.get(id)
    if (!g) {
      g = makeGate()
      gates.current.set(id, g)
    }
    return g
  }, [])
  const handleReady = useCallback(
    (id: string) => {
      const g = gateFor(id)
      if (!g.done) {
        g.done = true
        g.resolve()
      }
    },
    [gateFor],
  )

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
          data: p.spec.data ?? null,
        })),
      ),
    [mapPlacements, ratio],
  )
  // Re-arm every current map gate when the map inputs change.
  useEffect(() => {
    for (const id of mapIds) gates.current.set(id, makeGate())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapSig])

  const chartSig = useMemo(
    () => JSON.stringify(chartPlacements.map((p) => ({ id: p.id, chartId: p.el.chartId, data: p.el.dataOverride ?? null }))),
    [chartPlacements],
  )
  // Re-arm every current chart gate when the chart inputs change.
  useEffect(() => {
    for (const id of chartIds) gates.current.set(id, makeGate())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartSig])

  // Mirror into refs so `capture` reads current values without re-binding.
  const mapIdsRef = useRef(mapIds)
  mapIdsRef.current = mapIds
  const chartIdsRef = useRef(chartIds)
  chartIdsRef.current = chartIds

  // ── map render helper (shared by all three roles) ────────────────────────
  const renderMap = useCallback(
    (id: string, spec: MapSpec, contained: boolean) => {
      const cam = effectiveCamera(spec)
      if (!cam) return null
      // Authored map YAML (spec.data) wins over the story unit's resolved map.
      const pins = spec.layers.pins ? spec.data?.pins ?? resolvedPins : []
      const regions = spec.layers.regions ? spec.data?.regions ?? resolvedMap?.regions : undefined
      const heatmap = spec.layers.heatmap ? spec.data?.heatmap ?? resolvedMap?.heatmap : undefined
      const textLabels = spec.data?.textLabels ?? resolvedMap?.textLabels
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
            textLabels={textLabels}
            onReady={() => handleReady(id)}
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
      handleReady,
    ],
  )

  // ── capture ───────────────────────────────────────────────────────────────
  const capture = useCallback(async (): Promise<string | null> => {
    const node = captureRef.current
    if (!node) return null
    try {
      await document.fonts.ready

      const mapWaitIds = mapIdsRef.current
      if (mapWaitIds.length) {
        node.scrollIntoView({ block: 'center', behavior: 'auto' })
        // Wait for EVERY map instance to idle (each registers its own gate);
        // a per-map timeout keeps a dead map from hanging capture forever.
        await Promise.all(mapWaitIds.map((id) => Promise.race([gateFor(id).p, delay(MAP_READY_TIMEOUT_MS)])))
        await raf()
      }

      const chartWaitIds = chartIdsRef.current
      if (chartWaitIds.length) {
        // ECharts paints async; each chart forwards its `finished` signal through
        // noteLayerReady → handleReady. Wait for all, each racing a timeout.
        await Promise.all(chartWaitIds.map((id) => Promise.race([gateFor(id).p, delay(CHART_READY_TIMEOUT_MS)])))
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

  // ── chart element (standalone, capture-gated, box-sized by its transform) ──
  // Each chart renders independently so several can coexist: a STORY chart
  // fetches /api/chart-data/<slug>/<chartId>; a from-scratch chart is keyed by a
  // synthetic id and driven purely by its dataOverride. Both flow through the
  // foreground machinery (so they stay capture-gated). Headings render above.
  const renderChartElement = (el: Extract<ElementLayer, { kind: 'chart' }>) => {
    if (!el.visible || (!el.chartId && el.dataOverride === undefined)) return null
    // Normalize the legacy `data:` ref prefix: ChartPanel strips it before the
    // fetch and GenericChart keys its override lookup by the bare id, so effId —
    // used as BOTH the foreground layer id and the override-map key — must be bare.
    const effId = el.chartId ? bareChartId(el.chartId) : `${CUSTOM_CHART_ID}:${el.id}`
    const foreground: ResolvedForeground = { kind: 'flat', layers: [{ type: 'chart', id: effId } as VizLayer] }
    const overrides = el.dataOverride !== undefined ? { [effId]: el.dataOverride } : {}
    // A chart always needs a definite box height to paint into (its inner flex
    // column is h-full); guarantee one even if the transform somehow lacks it.
    const t = el.transform.heightPct != null ? el.transform : { ...el.transform, heightPct: DEFAULT_GRAPHIC_HEIGHT_PCT }
    return (
      <div key={el.id} style={transformWrapperStyle(t, { sizeByWidth: true })}>
        <ChartDataOverrideProvider value={overrides}>
          <div className="flex h-full w-full flex-col p-[14px] pb-[20px]">
            {(el.heading || el.subheading) && (
              <div className="mb-1 shrink-0">
                {el.heading && (
                  <h4 className="text-center font-serif text-[20px] font-bold leading-[1.2]" style={{ color: 'var(--color-accent)' }}>
                    {el.heading}
                  </h4>
                )}
                {el.subheading && (
                  <p className="text-center text-[15px] leading-[1.4]" style={{ color: 'var(--color-muted)' }}>
                    {el.subheading}
                  </p>
                )}
              </div>
            )}
            <div className="relative min-h-0 flex-1">
              <div className="absolute inset-0 overflow-hidden">
                <ForegroundLayoutSlot
                  slug={slug || 'custom'}
                  foreground={foreground}
                  unit={unit}
                  activeStep={0}
                  mode="capture"
                  noteLayerReady={() => handleReady(`chart:el:${el.id}`)}
                />
              </div>
            </div>
          </div>

        </ChartDataOverrideProvider>
      </div>
    )
  }

  return (
    <div className="relative group" style={{ width: w, height: h }}>
      <div
        ref={captureRef}
        className="relative overflow-hidden rounded-lg"
        style={{ width: w, height: h, background: 'var(--color-bg)', fontSize: 20 }}
      >
        {/* background (z0) */}
        {background}

        {/* branding (z15) */}
        {composition.branding.visible && (
          <div className="absolute inset-0 z-[15]">
            <BrandingHeader title={title} logo={logo} vertical={vertical} />
          </div>
        )}

        {/* text + foreground graphics/elements (z20+) — DOM order = stacking;
            later paints on top. Graphics (chart/map/box-image) and decorations
            (emoji/icon/flag) share the one reorderable `elements` list. */}
        <div className="absolute inset-0 z-20">
          {composition.text.heading && <TextView block={composition.text.heading} cardWidth={w} />}
          {composition.text.subheading && <TextView block={composition.text.subheading} cardWidth={w} />}
          {composition.elements.map((el) => {
            if (!el.visible) return null
            if (el.kind === 'chart') return renderChartElement(el)
            if (el.kind === 'map') {
              // Box-sized maps (heightPct set) fill their W×H; legacy/new square
              // maps keep a 1:1 box.
              const boxed = el.transform.heightPct != null
              return (
                <div key={el.id} style={transformWrapperStyle(el.transform, { sizeByWidth: true })}>
                  <div
                    style={{
                      position: 'relative',
                      width: '100%',
                      height: boxed ? '100%' : undefined,
                      aspectRatio: boxed ? undefined : '1 / 1',
                      overflow: 'hidden',
                      borderRadius: 8,
                    }}
                  >
                    {renderMap(`map:el:${el.id}`, el, true)}
                  </div>
                </div>
              )
            }
            return <ElementView key={el.id} element={el} cardWidth={w} />
          })}
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
