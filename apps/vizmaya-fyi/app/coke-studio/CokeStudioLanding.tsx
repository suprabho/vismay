'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import Link from 'next/link'
import 'mapbox-gl/dist/mapbox-gl.css'
import { Map, Source, Layer, type MapRef } from 'react-map-gl/mapbox'
import VizmayaLogo from '@/components/VizmayaLogo'
import { applyMapPalette } from '@vismay/viz-engine'
import type { Epic, EpicStory } from '@vismay/content-source/epics'
import type {
  CokeStudioCorpusStats,
  CokeStudioPlaceSummary,
} from '@/lib/coke-studio/data'
import {
  cokeStudioLogoPalette,
  cokeStudioMapPalette,
  pinCategoryFor,
  type CokeStudioTheme,
} from './theme'
import PlaceDetail from './PlaceDetail'

interface Props {
  epic: Epic
  places: CokeStudioPlaceSummary[]
  stories: EpicStory[]
  stats: CokeStudioCorpusStats
  theme: CokeStudioTheme
  mapStyle: string
  embed?: boolean
  initialView?: {
    longitude?: number
    latitude?: number
    zoom?: number
    pitch?: number
    bearing?: number
  }
}

// Centred on Pakistan with enough zoom to show the qawwali heartland (Lahore,
// Multan, Punjab, Sindh) and the historical reach into Khurasan + the
// Hijaz. Users can pan/zoom out — `maxZoom` is the only camera constraint.
const DEFAULT_VIEW_STATE = {
  longitude: 71,
  latitude: 29,
  zoom: 3.6,
}

const alpha = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return n.toString()
}

export default function CokeStudioLanding({
  epic,
  places,
  stories,
  stats,
  theme,
  mapStyle,
  embed = false,
  initialView,
}: Props) {
  const mapRef = useRef<MapRef | null>(null)
  const [selectedCanonical, setSelectedCanonical] = useState<string | null>(null)
  const [hoveredCanonical, setHoveredCanonical] = useState<string | null>(null)
  const [cursor, setCursor] = useState<'grab' | 'pointer'>('grab')

  const initialViewState = useMemo(
    () => ({
      longitude: initialView?.longitude ?? DEFAULT_VIEW_STATE.longitude,
      latitude: initialView?.latitude ?? DEFAULT_VIEW_STATE.latitude,
      zoom: initialView?.zoom ?? DEFAULT_VIEW_STATE.zoom,
      ...(initialView?.pitch !== undefined ? { pitch: initialView.pitch } : {}),
      ...(initialView?.bearing !== undefined ? { bearing: initialView.bearing } : {}),
    }),
    // Map only reads initialViewState on first render — snapshot once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const logoPalette = useMemo(() => cokeStudioLogoPalette(theme), [theme])
  const mapPalette = useMemo(() => cokeStudioMapPalette(theme), [theme])

  useEffect(() => {
    let cancelled = false
    let map: ReturnType<NonNullable<typeof mapRef.current>['getMap']> | null = null
    const apply = () => {
      if (cancelled || !map) return
      // getStyle() throws "Style is not done loading" if called too early;
      // catch and bail — style.load fires apply() again.
      let layers
      try {
        layers = map.getStyle()?.layers
      } catch {
        return
      }
      if (!layers || layers.length === 0) return
      applyMapPalette(map, mapPalette)
    }
    const tryBind = () => {
      if (cancelled) return
      const m = mapRef.current?.getMap()
      if (!m) {
        setTimeout(tryBind, 50)
        return
      }
      map = m
      apply()
      m.on('style.load', apply)
    }
    tryBind()
    return () => {
      cancelled = true
      if (map) map.off('style.load', apply)
    }
  }, [mapPalette])

  // Two-way bridge for the admin embed previewer — same contract as the
  // other epic landings (`vizmaya:view` outbound, `vizmaya:setview` inbound).
  useEffect(() => {
    if (!embed) return
    if (typeof window === 'undefined') return
    if (window.parent === window) return

    let cancelled = false
    let map: ReturnType<NonNullable<typeof mapRef.current>['getMap']> | null = null

    const emitView = () => {
      if (!map) return
      const c = map.getCenter()
      window.parent.postMessage(
        {
          type: 'vizmaya:view',
          longitude: c.lng,
          latitude: c.lat,
          zoom: map.getZoom(),
          pitch: map.getPitch(),
          bearing: map.getBearing(),
        },
        '*',
      )
    }

    const handleMessage = (e: MessageEvent) => {
      if (!map) return
      const d = e.data as Record<string, unknown> | null
      if (!d || typeof d !== 'object' || d.type !== 'vizmaya:setview') return
      const opts: { center?: [number, number]; zoom?: number; pitch?: number; bearing?: number } = {}
      const lng = typeof d.longitude === 'number' ? d.longitude : undefined
      const lat = typeof d.latitude === 'number' ? d.latitude : undefined
      if (lng !== undefined || lat !== undefined) {
        const c = map.getCenter()
        opts.center = [lng ?? c.lng, lat ?? c.lat]
      }
      if (typeof d.zoom === 'number') opts.zoom = d.zoom
      if (typeof d.pitch === 'number') opts.pitch = d.pitch
      if (typeof d.bearing === 'number') opts.bearing = d.bearing
      if (Object.keys(opts).length === 0) return
      map.jumpTo(opts)
    }

    const tryBind = () => {
      if (cancelled) return
      const m = mapRef.current?.getMap()
      if (!m) {
        setTimeout(tryBind, 50)
        return
      }
      map = m
      m.on('moveend', emitView)
      window.addEventListener('message', handleMessage)
      emitView()
    }
    tryBind()

    return () => {
      cancelled = true
      if (map) map.off('moveend', emitView)
      window.removeEventListener('message', handleMessage)
    }
  }, [embed])

  // Pin sizing: sqrt-scaled by mention count, normalised to a soft 4–16 px
  // core radius. Sqrt keeps the long-tail places (Mecca, Karbala — referenced
  // in scores of songs) from drowning the median place in pixels.
  const maxMentions = useMemo(
    () => Math.max(1, ...places.map((p) => p.mentionCount)),
    [places],
  )

  const pinsGeoJson = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: places.map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
        properties: {
          canonical: p.canonical,
          type: p.type,
          category: pinCategoryFor(p.type),
          mentionCount: p.mentionCount,
          songCount: p.songCount,
          coreRadius: 3 + Math.sqrt(p.mentionCount / maxMentions) * 13,
          label: p.canonical,
        },
      })),
    }),
    [places, maxMentions],
  )

  const selectPlace = (canonical: string) => {
    const p = places.find((x) => x.canonical === canonical)
    if (!p) return
    setSelectedCanonical(canonical)
    mapRef.current?.getMap().easeTo({
      center: [p.lng, p.lat],
      zoom: Math.max(5, mapRef.current.getMap().getZoom()),
      duration: 900,
      essential: true,
    })
  }

  return (
    <div
      className="relative w-full h-screen overflow-hidden"
      style={
        {
          background: theme.ink,
          color: theme.bone,
          '--vmy-surface': theme.surface,
          '--vmy-bone': theme.bone,
          '--vmy-ember': theme.accent,
          '--vmy-ink': theme.ink,
        } as CSSProperties
      }
    >
      <Map
        ref={mapRef}
        reuseMaps
        initialViewState={initialViewState}
        mapboxAccessToken={process.env.NEXT_PUBLIC_MAPBOX_TOKEN}
        mapStyle={mapStyle}
        attributionControl={false}
        doubleClickZoom={false}
        cursor={cursor}
        interactiveLayerIds={['cs-pin-core']}
        onMouseMove={(e) => {
          const feat = e.features?.[0]
          const canonical = feat?.properties?.canonical as string | undefined
          setHoveredCanonical(canonical ?? null)
          setCursor(feat ? 'pointer' : 'grab')
        }}
        onMouseLeave={() => {
          setHoveredCanonical(null)
          setCursor('grab')
        }}
        onClick={(e) => {
          const feat = e.features?.[0]
          if (!feat) {
            setSelectedCanonical(null)
            return
          }
          const canonical = feat.properties?.canonical as string | undefined
          if (canonical) selectPlace(canonical)
        }}
        style={{ position: 'absolute', inset: 0 }}
      >
        <Source id="cs-pins" type="geojson" data={pinsGeoJson}>
          {/* Halo for selected — sits under the core to bloom around it. */}
          <Layer
            id="cs-pin-halo"
            type="circle"
            filter={['==', ['get', 'canonical'], selectedCanonical ?? '']}
            paint={{
              'circle-radius': ['+', ['get', 'coreRadius'], 8],
              'circle-color': theme.accentHi,
              'circle-opacity': 0.25,
              'circle-blur': 0.7,
            }}
          />
          <Layer
            id="cs-pin-core"
            type="circle"
            paint={{
              'circle-radius': ['get', 'coreRadius'],
              'circle-color': [
                'case',
                ['==', ['get', 'canonical'], selectedCanonical ?? ''],
                theme.accentHi,
                ['==', ['get', 'canonical'], hoveredCanonical ?? ''],
                theme.accentMid,
                [
                  'match',
                  ['get', 'category'],
                  'sacred', theme.pinSacred,
                  'nature', theme.pinNature,
                  /* settlement default */ theme.pinSettlement,
                ],
              ],
              'circle-opacity': 0.92,
              'circle-stroke-color': theme.accentEdge,
              'circle-stroke-width': 1,
              'circle-stroke-opacity': 0.55,
            }}
          />
          {/* Labels for the top-mentioned places only — keeps the map readable
              at the default zoom. Threshold is "≥ ~half the max" rather than a
              fixed count so the labels track the corpus size as it grows. */}
          <Layer
            id="cs-pin-labels"
            type="symbol"
            filter={['>', ['get', 'mentionCount'], Math.max(3, Math.ceil(maxMentions * 0.4))]}
            layout={{
              'text-field': ['get', 'label'],
              'text-font': ['DIN Offc Pro Medium', 'Arial Unicode MS Regular'],
              'text-size': 11,
              'text-offset': [0, -1.6],
              'text-anchor': 'bottom',
              'text-allow-overlap': false,
              'text-transform': 'uppercase',
              'text-letter-spacing': 0.08,
            }}
            paint={{
              'text-color': theme.bone,
              'text-halo-color': theme.ink,
              'text-halo-width': 1,
              'text-halo-blur': 0.4,
            }}
          />
        </Source>
      </Map>

      {/* Category legend — bottom-left, hides under the open sheet on mobile. */}
      <div
        className={`absolute left-3 md:left-4 ${
          embed ? 'bottom-3 md:bottom-4' : 'bottom-[96px] md:bottom-[88px]'
        } z-10 pointer-events-none ${selectedCanonical ? 'hidden md:block' : ''}`}
      >
        <div
          className="rounded-full px-3 py-1.5 flex items-center gap-x-3 gap-y-1 flex-wrap max-w-[calc(100vw-1.5rem)]"
          style={{
            background: alpha(theme.surface, 85),
            border: `1px solid ${alpha(theme.bone, 12)}`,
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
          }}
        >
          <span
            className="text-[9px] font-mono uppercase tracking-wider mr-1"
            style={{ color: theme.muted }}
          >
            Place
          </span>
          {[
            { label: 'Settlement', color: theme.pinSettlement },
            { label: 'Sacred', color: theme.pinSacred },
            { label: 'Nature', color: theme.pinNature },
          ].map((b) => (
            <span key={b.label} className="inline-flex items-center gap-1.5">
              <span
                className="inline-block rounded-full"
                style={{
                  width: 9,
                  height: 9,
                  background: b.color,
                  border: `1px solid ${alpha(theme.accentEdge, 60)}`,
                }}
              />
              <span
                className="text-[10px] tracking-tight"
                style={{ color: alpha(theme.bone, 85) }}
              >
                {b.label}
              </span>
            </span>
          ))}
          <span
            className="text-[9px] font-mono mx-1"
            style={{ color: alpha(theme.muted, 70) }}
          >
            ·
          </span>
          <span
            className="text-[10px] tracking-tight"
            style={{ color: alpha(theme.bone, 70) }}
          >
            Size = mentions
          </span>
        </div>
      </div>

      {/* Top header — hidden in embed mode. */}
      {!embed && (
        <div
          className="absolute top-0 left-0 right-0 z-10 px-4 md:px-6 py-3 md:py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-2 md:gap-4 pointer-events-none"
          style={{
            background: `linear-gradient(to bottom, ${alpha(theme.ink, 95)} 0%, ${alpha(
              theme.ink,
              70,
            )} 60%, transparent 100%)`,
          }}
        >
          <div className="w-full md:w-auto flex flex-col md:flex-row md:items-center gap-2 md:gap-3">
            <div className="flex items-center justify-between md:justify-start gap-3">
              <Link
                href="/"
                aria-label="Vizmaya home"
                className="pointer-events-auto shrink-0 rounded-md transition-opacity hover:opacity-80 focus:opacity-80 focus:outline-none"
              >
                <VizmayaLogo
                  className="w-[150px] h-[36px] md:w-[180px] md:h-[44px]"
                  palette={logoPalette}
                />
              </Link>
              <div
                className="md:hidden pointer-events-auto shrink-0 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-wider"
                style={{
                  background: alpha(theme.surface, 85),
                  border: `1px solid ${alpha(theme.bone, 12)}`,
                  color: theme.accentHi,
                }}
              >
                Qawwali corpus
              </div>
            </div>
            <div className="min-w-0">
              <h1
                className="text-base md:text-lg leading-tight tracking-tight"
                style={{
                  fontFamily: 'var(--font-fraunces), serif',
                  color: theme.bone,
                  fontWeight: 500,
                }}
              >
                {epic.name}
              </h1>
              {epic.description && (
                <p
                  className="mt-0.5 text-[11px] md:text-xs max-w-xl"
                  style={{ color: theme.muted }}
                >
                  {epic.description}
                </p>
              )}
              <p
                className="text-[11px] md:text-xs mt-0.5 font-mono uppercase tracking-[0.18em]"
                style={{ color: theme.muted }}
              >
                <span style={{ color: theme.accentHi }}>{formatCount(stats.songCount)}</span> songs
                <span className="mx-1.5 opacity-50">·</span>
                <span style={{ color: theme.accentHi }}>{stats.seasonCount}</span> seasons
                <span className="mx-1.5 opacity-50">·</span>
                <span style={{ color: theme.accentHi }}>{formatCount(stats.mentionCount)}</span> mentions
                <span className="mx-1.5 opacity-50">·</span>
                <span style={{ color: theme.accentHi }}>{stats.placeCount}</span> places
              </p>
            </div>
          </div>

          <div
            className="hidden md:flex pointer-events-auto shrink-0 rounded-full px-3 py-1 text-[11px] font-mono uppercase tracking-wider"
            style={{
              background: alpha(theme.surface, 85),
              border: `1px solid ${alpha(theme.bone, 12)}`,
              color: theme.accentHi,
            }}
          >
            Qawwali corpus
          </div>
        </div>
      )}

      {selectedCanonical && (
        <PlaceDetail
          key={selectedCanonical}
          canonical={selectedCanonical}
          onClose={() => setSelectedCanonical(null)}
          theme={theme}
        />
      )}

      {!embed && (
        <footer
          className="absolute left-0 right-0 bottom-0 z-10 px-6 py-4"
          style={{
            background: `linear-gradient(to top, ${alpha(theme.ink, 95)}, transparent)`,
          }}
        >
          <div
            className="text-[10px] uppercase tracking-widest mb-2"
            style={{ color: theme.muted }}
          >
            vizmaya stories
          </div>
          {stories.length === 0 ? (
            <p className="text-xs" style={{ color: alpha(theme.muted, 70) }}>
              No stories assigned to this epic yet.
            </p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {stories.map((s) => (
                <Link
                  key={s.slug}
                  href={`/story/${s.slug}`}
                  className="cs-story-chip shrink-0 px-3 py-2 rounded text-sm"
                  style={{
                    border: `1px solid ${theme.line}`,
                    color: alpha(theme.bone, 85),
                    background: alpha(theme.surface, 60),
                  }}
                >
                  {s.title}
                </Link>
              ))}
            </div>
          )}
        </footer>
      )}

      <style jsx>{`
        .cs-story-chip:hover {
          border-color: ${alpha(theme.accentHi, 60)};
          color: ${theme.accentHi};
        }
      `}</style>
    </div>
  )
}
