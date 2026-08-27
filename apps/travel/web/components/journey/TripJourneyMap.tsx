'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import mapboxgl from 'mapbox-gl'
import 'mapbox-gl/dist/mapbox-gl.css'
import { resolveAssetUrl } from '@vismay/viz-engine'
import type { StopMedia, TripData, TripDay, TripStop } from '@/lib/trips'
import StopSheet from './StopSheet'
import MediaLightbox from './MediaLightbox'

/**
 * The interactive journey map — one map for the whole trip, filterable by
 * day. Pro-trip's Leaflet itinerary map rebuilt on mapbox-gl, plus media:
 *
 *   - Day tabs (All + one per day, tinted with the day color)
 *   - Numbered circular stop markers per day; stops with photos render the
 *     first photo as a circular thumbnail pin (same DOM-marker technique as
 *     the story map module's `pin.image`)
 *   - Dashed per-day route polylines through the stops in order
 *   - Stay (🏨) and airport (✈️) markers
 *   - Click a stop → detail sheet with the stop's media strip → lightbox
 *
 * All coordinates are [lng, lat].
 */

const MAP_STYLE = 'mapbox://styles/mapbox/light-v11'

type DayFilter = number | 'all'

interface Selected {
  day: TripDay
  stop: TripStop
}

interface MarkerRec {
  marker: mapboxgl.Marker
  dayIdx: number | null // null = visible on every filter (airports)
}

export default function TripJourneyMap({
  trip,
  accessToken,
}: {
  trip: TripData
  accessToken: string
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<mapboxgl.Map | null>(null)
  const markersRef = useRef<MarkerRec[]>([])
  const loadedRef = useRef(false)
  const [activeDay, setActiveDay] = useState<DayFilter>('all')
  const [selected, setSelected] = useState<Selected | null>(null)
  const [lightbox, setLightbox] = useState<StopMedia | null>(null)

  const dayCoords = useCallback(
    (dayIdx: number): [number, number][] => {
      const day = trip.days[dayIdx]
      const coords = day.stops
        .map((s) => s.coordinates)
        .filter((c): c is [number, number] => c != null)
      if (day.stay) coords.push(day.stay.coordinates)
      for (const a of trip.airports) {
        if (a.day != null && a.day === day.n) coords.push(a.coordinates)
      }
      return coords
    },
    [trip]
  )

  const allCoords = useMemo(
    () => trip.days.flatMap((_, i) => dayCoords(i)),
    [trip, dayCoords]
  )

  const fitTo = useCallback((coords: [number, number][], fallback?: TripDay) => {
    const map = mapRef.current
    if (!map) return
    if (coords.length === 0) {
      if (fallback?.center) {
        map.flyTo({ center: fallback.center, zoom: fallback.zoom ?? 12, duration: 900 })
      }
      return
    }
    const bounds = coords.reduce(
      (b, c) => b.extend(c),
      new mapboxgl.LngLatBounds(coords[0], coords[0])
    )
    map.fitBounds(bounds, { padding: 72, maxZoom: 15, duration: 900 })
  }, [])

  /* ── Map + markers + routes (mounted once) ─────────────────────────── */
  useEffect(() => {
    if (!accessToken || !containerRef.current || mapRef.current) return

    mapboxgl.accessToken = accessToken
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: allCoords[0] ?? [0, 0],
      zoom: 11,
    })
    mapRef.current = map
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')

    // Stop markers + stays + airports.
    const seenStays = new Set<string>()
    trip.days.forEach((day, dayIdx) => {
      let n = 0
      for (const stop of day.stops) {
        if (!stop.coordinates) continue
        n += 1
        const el = buildStopMarker(stop, day.color, n)
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          setSelected({ day, stop })
          map.flyTo({ center: stop.coordinates!, zoom: 15, duration: 800 })
        })
        const marker = new mapboxgl.Marker({ element: el })
          .setLngLat(stop.coordinates)
          .addTo(map)
        markersRef.current.push({ marker, dayIdx })
      }
      if (day.stay) {
        const stayKey = `${day.stay.name}:${day.stay.coordinates.join(',')}`
        if (!seenStays.has(stayKey)) {
          seenStays.add(stayKey)
          const el = buildBadgeMarker('🏨', '#6b6254', day.stay.name)
          const marker = new mapboxgl.Marker({ element: el })
            .setLngLat(day.stay.coordinates)
            .addTo(map)
          //

          // A stay shared across days should show for every filter — treat as global.
          markersRef.current.push({ marker, dayIdx: null })
        }
      }
    })
    for (const airport of trip.airports) {
      const el = buildBadgeMarker('✈️', '#43413c', `${airport.code} · ${airport.name}`)
      const marker = new mapboxgl.Marker({ element: el })
        .setLngLat(airport.coordinates)
        .addTo(map)
      markersRef.current.push({ marker, dayIdx: null })
    }

    // Dashed per-day routes.
    map.on('load', () => {
      loadedRef.current = true
      trip.days.forEach((day, dayIdx) => {
        const coords = day.stops
          .map((s) => s.coordinates)
          .filter((c): c is [number, number] => c != null)
        if (coords.length < 2) return
        map.addSource(`route-${dayIdx}`, {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: coords },
          },
        })
        map.addLayer({
          id: `route-${dayIdx}`,
          type: 'line',
          source: `route-${dayIdx}`,
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': day.color,
            'line-width': 2.5,
            'line-opacity': 0.55,
            'line-dasharray': [1.5, 2.2],
          },
        })
      })
    })

    fitTo(allCoords)

    return () => {
      markersRef.current.forEach((r) => r.marker.remove())
      markersRef.current = []
      loadedRef.current = false
      map.remove()
      mapRef.current = null
    }
    // The trip is static per page load — mount once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken])

  /* ── Day filter → marker/route visibility + camera ─────────────────── */
  useEffect(() => {
    const map = mapRef.current
    if (!map) return

    for (const rec of markersRef.current) {
      if (rec.dayIdx == null) continue // stays + airports are global — always visible
      const visible = activeDay === 'all' || activeDay === rec.dayIdx
      rec.marker.getElement().style.display = visible ? '' : 'none'
    }

    const applyRouteVisibility = () => {
      trip.days.forEach((_, dayIdx) => {
        if (!map.getLayer(`route-${dayIdx}`)) return
        const visible = activeDay === 'all' || activeDay === dayIdx
        map.setLayoutProperty(`route-${dayIdx}`, 'visibility', visible ? 'visible' : 'none')
      })
    }
    if (loadedRef.current) applyRouteVisibility()
    else map.once('load', applyRouteVisibility)

    if (activeDay === 'all') fitTo(allCoords)
    else fitTo(dayCoords(activeDay), trip.days[activeDay])
    setSelected(null)
  }, [activeDay, trip, allCoords, dayCoords, fitTo])

  const tabs: { key: DayFilter; label: string; color?: string }[] = [
    { key: 'all', label: 'All days' },
    ...trip.days.map((day, i) => ({
      key: i as DayFilter,
      label: day.n != null ? `Day ${day.n}` : day.title,
      color: day.color,
    })),
  ]

  return (
    <div className="relative flex-1 flex flex-col min-h-0">
      {/* Day tabs */}
      <nav className="flex gap-1.5 overflow-x-auto px-3 py-2 border-b border-black/10 bg-[#fffdf8]">
        {tabs.map((tab) => {
          const active = activeDay === tab.key
          return (
            <button
              key={String(tab.key)}
              onClick={() => setActiveDay(tab.key)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                active ? 'text-white' : 'bg-black/5 hover:bg-black/10 text-inherit'
              }`}
              style={active ? { background: tab.color ?? '#2b2419' } : undefined}
            >
              {tab.color && !active && (
                <span
                  aria-hidden
                  className="inline-block w-2 h-2 rounded-full mr-1.5 align-middle"
                  style={{ background: tab.color }}
                />
              )}
              {tab.label}
            </button>
          )
        })}
      </nav>

      {/* Map (or a graceful fallback without a token) */}
      {accessToken ? (
        <div ref={containerRef} className="flex-1 min-h-0" />
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-6">
          <p className="text-sm opacity-60 mb-4">
            Map unavailable (missing NEXT_PUBLIC_MAPBOX_TOKEN) — showing the stop list.
          </p>
          {trip.days
            .filter((_, i) => activeDay === 'all' || activeDay === i)
            .map((day) => (
              <div key={day.heading} className="mb-6">
                <h2 className="font-semibold mb-2" style={{ color: day.color }}>
                  {day.heading}
                </h2>
                <ul className="space-y-1">
                  {day.stops.map((stop) => (
                    <li key={stop.slug}>
                      <button
                        className="text-left text-sm hover:underline"
                        onClick={() => setSelected({ day, stop })}
                      >
                        {stop.time} · {stop.emoji} {stop.name}
                        {stop.media.length > 0 && ` · 📷 ${stop.media.length}`}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}

      {selected && (
        <StopSheet
          day={selected.day}
          stop={selected.stop}
          onClose={() => setSelected(null)}
          onOpenMedia={(m) => setLightbox(m)}
        />
      )}
      {lightbox && <MediaLightbox media={lightbox} onClose={() => setLightbox(null)} />}
    </div>
  )
}

/* ── DOM marker builders (mapbox markers live outside React) ─────────── */

function buildStopMarker(stop: TripStop, color: string, n: number): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cursor = 'pointer'
  const photo = stop.media.find((m) => m.kind === 'image')
  if (photo) {
    // Photo-thumbnail pin — circular crop ringed in the day color (same
    // technique as MapboxBackground's `pin.image` branch).
    el.style.cssText += `
      width: 34px; height: 34px; border-radius: 50%; overflow: hidden;
      box-sizing: border-box; border: 2.5px solid ${color}; background: ${color};
      box-shadow: 0 2px 6px rgba(0,0,0,0.35);
    `
    const img = document.createElement('img')
    img.src = resolveAssetUrl(photo.ref)
    img.alt = stop.name
    img.draggable = false
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;'
    el.appendChild(img)
  } else {
    el.style.cssText += `
      width: 24px; height: 24px; border-radius: 50%; background: ${color};
      border: 2px solid #fffdf8; box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
      color: #fff; font-size: 11px; font-weight: 700; font-family: ui-sans-serif, system-ui;
    `
    el.textContent = String(n)
  }
  el.title = `${stop.time} · ${stop.name}`
  return el
}

function buildBadgeMarker(glyph: string, ringColor: string, title: string): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = `
    width: 28px; height: 28px; border-radius: 50%; background: #fffdf8;
    border: 2px solid ${ringColor}; box-shadow: 0 2px 5px rgba(0,0,0,0.25);
    display: flex; align-items: center; justify-content: center; font-size: 14px;
  `
  el.textContent = glyph
  el.title = title
  return el
}
