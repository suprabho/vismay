'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DcRegionKey, EditionGeoCountry, EditionGeoPlace, EditionGeoRegion } from '@vismay/dc-editions/dcEditionTypes'
import { DC_LAYERS, DC_REGIONS, type DcLayerKey } from '@vismay/dc-editions/dcEditionTypes'
import { LAND_MASK } from './landMask'
import { PANEL_EVENT } from './editionUtils'
import { countryDots, nearestDot, regionDots } from './landFill'

interface Props {
  places: EditionGeoPlace[]
  /** The country layer (migration 100); editions frozen before it pass []. */
  countries?: EditionGeoCountry[]
  regions: EditionGeoRegion[]
  stamp: string
}

/** The three geography layers a story carries (migration 100). */
export type GeoLayer = 'place' | 'country' | 'region'

export const GEO_LAYERS: { key: GeoLayer; label: string; desc: string }[] = [
  { key: 'place', label: 'Localities', desc: 'City hubs and states the story names' },
  { key: 'country', label: 'Countries', desc: 'Where the development happens, or the company’s home' },
  { key: 'region', label: 'Regions', desc: 'Five world regions' },
]

const W = 1400
const H = 640
const PAD = 40
const px = (lon: number) => PAD + ((lon + 180) / 360) * (W - PAD * 2)
const py = (lat: number) => PAD + ((84 - lat) / 142) * (H - PAD * 2)

/** A fixed anchor per region (the series timeline still draws region bubbles here). */
export const REGION_ANCHOR: Record<DcRegionKey, [lng: number, lat: number]> = {
  na: [-100, 42],
  ea: [112, 30],
  eu: [12, 50],
  me: [58, 26],
  other: [24, -24],
}

interface Pin {
  /** `place:<slug>`, `country:<code>` or `region:<key>` — the panel key the pin opens. */
  key: string
  name: string
  region: DcRegionKey
  count: number
  /** Countries: how many of the stories are also pinned to a locality. */
  placed?: number
  energy: boolean
  kind: GeoLayer
  x: number
  y: number
  r: number
  /** Countries and regions: the land-mask dots the pin fills (indices into LAND_MASK pairs). */
  dots?: number[]
  /** Countries and regions: 0–1 share of the day's lead, which sets the fill's strength. */
  strength?: number
  /** A country owning three dots or fewer also gets a ring, so Singapore can be found. */
  small?: boolean
}

const dotX = (i: number) => px(LAND_MASK[i * 2] / 10)
const dotY = (i: number) => py(LAND_MASK[i * 2 + 1] / 10)

function buildPins(layer: GeoLayer, places: EditionGeoPlace[], countries: EditionGeoCountry[], regions: EditionGeoRegion[]): Pin[] {
  if (layer === 'place') {
    return places.map((p) => ({ key: `place:${p.slug}`, name: p.name, region: p.region, count: p.count, energy: p.energy, kind: 'place' as const, x: px(p.lng), y: py(p.lat), r: 5 + Math.min(p.count, 12) * 2.2 }))
  }
  if (layer === 'country') {
    const lead = Math.max(1, ...countries.map((c) => c.count))
    // Each country fills its own land dots; strength ∝ stories against the
    // day's most-reported country. A country too small to own a dot borrows
    // the one nearest its centroid.
    return countries.map((c) => {
      const own = countryDots(c.code)
      const dots = own.length > 0 ? own : [nearestDot(c.lng, c.lat)]
      return { key: `country:${c.code}`, name: c.name, region: c.region, count: c.count, placed: c.count - c.unplaced, energy: c.energy, kind: 'country' as const, x: px(c.lng), y: py(c.lat), r: 0, dots, strength: Math.sqrt(c.count / lead), small: own.length <= 3 }
    })
  }
  const lead = Math.max(1, ...regions.map((r) => r.count))
  return regions.map((r) => {
    const [lng, lat] = REGION_ANCHOR[r.key]
    const energy = countries.some((c) => c.region === r.key && c.energy) || places.some((p) => p.region === r.key && p.energy)
    return { key: `region:${r.key}`, name: DC_REGIONS[r.key], region: r.key, count: r.count, energy, kind: 'region' as const, x: px(lng), y: py(lat), r: 0, dots: regionDots(r.key), strength: Math.sqrt(r.count / lead) }
  })
}

/** Which pin each filled dot belongs to. A country's own dots win over a borrowed one. */
function dotOwners(pins: Pin[]): Map<number, Pin> {
  const owners = new Map<number, Pin>()
  for (const p of pins) if (!p.small) for (const i of p.dots ?? []) owners.set(i, p)
  for (const p of pins) if (p.small) for (const i of p.dots ?? []) if (!owners.has(i)) owners.set(i, p)
  return owners
}

/**
 * Chapter III — full-bleed dot-matrix world map. The land mask is a flat
 * array shipped with the page (no fetch, no map library). The switch at the
 * top picks which of the story's three geography layers is drawn: a solid
 * disc per locality (city hub or state the text names), or — for countries
 * (where the development happens, or the company's home) and world regions —
 * the land dots inside that country or region filled in (landCountry.ts tags
 * every dot). Discs are sized, fills strengthened, by story count; both are
 * coloured by the energy tag. Hover shows the name/count in a
 * tooltip (nothing is lettered on the map), click opens the stories; the
 * region bar below is proportional to story share with per-layer micro-bars,
 * and highlights the region's pins on hover in every mode.
 */
export default function GeoMap({ places, countries = [], regions, stamp }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  // Countries is the fullest layer (most stories carry one); editions frozen
  // before the country layer existed open on their localities.
  const [layer, setLayer] = useState<GeoLayer>(countries.length > 0 ? 'country' : 'place')
  const [hot, setHot] = useState<string | null>(null)
  const [hotPin, setHotPin] = useState<string | null>(null)
  const [tip, setTip] = useState<{ left: number; top: number; pin: Pin } | null>(null)

  const pins = useMemo<Pin[]>(() => buildPins(layer, places, countries, regions), [layer, places, countries, regions])
  const owners = useMemo(() => dotOwners(pins), [pins])

  const draw = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    cv.width = W * dpr
    cv.height = H * dpr
    const c = cv.getContext('2d')
    if (!c) return
    const root = cv.closest('.dcd') ?? document.documentElement
    const tok = (n: string) => getComputedStyle(root).getPropertyValue(n).trim()
    const dot = tok('--map-dot')
    const acc = tok('--accent')
    const en = tok('--energy')
    const ink = tok('--ink')
    const dim = tok('--dim')

    c.setTransform(dpr, 0, 0, dpr, 0, 0)
    c.clearRect(0, 0, W, H)
    c.fillStyle = dot
    for (let i = 0; i < LAND_MASK.length; i += 2) {
      if (owners.has(i / 2)) continue
      c.beginPath()
      c.arc(px(LAND_MASK[i] / 10), py(LAND_MASK[i + 1] / 10), 2.4, 0, Math.PI * 2)
      c.fill()
    }
    // Countries and regions: fill the dots they own, stronger for more stories.
    for (const [i, p] of owners) {
      const on = hot === null || hot === p.region
      const isHot = hotPin === p.key
      const base = 0.4 + 0.6 * (p.strength ?? 1)
      c.fillStyle = p.energy ? en : acc
      if (isHot) {
        c.globalAlpha = 0.18
        c.beginPath()
        c.arc(dotX(i), dotY(i), 4.6, 0, Math.PI * 2)
        c.fill()
      }
      c.globalAlpha = isHot ? 1 : on ? base : base * 0.3
      c.beginPath()
      c.arc(dotX(i), dotY(i), isHot ? 2.9 : 2.6, 0, Math.PI * 2)
      c.fill()
    }
    c.globalAlpha = 1
    c.strokeStyle = dot
    c.lineWidth = 0.6
    c.setLineDash([2, 7])
    c.beginPath()
    c.moveTo(PAD, py(0))
    c.lineTo(W - PAD, py(0))
    c.stroke()
    c.setLineDash([])

    for (const p of pins) {
      const col = p.energy ? en : acc
      const on = hot === null || hot === p.region
      const isHot = hotPin === p.key
      if (p.kind !== 'place') {
        // Filled above; a country of a dot or three also gets a ring to find it by.
        if (p.small) {
          const i = p.dots?.[0]
          c.globalAlpha = on ? (isHot ? 1 : 0.75) : 0.25
          c.strokeStyle = col
          c.lineWidth = isHot ? 1.8 : 1.2
          c.beginPath()
          c.arc(i === undefined ? p.x : dotX(i), i === undefined ? p.y : dotY(i), isHot ? 10 : 8, 0, Math.PI * 2)
          c.stroke()
          c.globalAlpha = 1
        }
        continue
      }
      c.globalAlpha = (on ? 1 : 0.25) * 0.16
      c.fillStyle = col
      c.beginPath()
      c.arc(p.x, p.y, p.r * (isHot ? 2.6 : 2.1), 0, Math.PI * 2)
      c.fill()
      c.globalAlpha = on ? 1 : 0.25
      c.beginPath()
      c.arc(p.x, p.y, p.r, 0, Math.PI * 2)
      c.fill()
      c.fillStyle = ink
      c.beginPath()
      c.arc(p.x, p.y, Math.max(1.5, p.r - 3), 0, Math.PI * 2)
      c.fill()
      c.fillStyle = col
      c.beginPath()
      c.arc(p.x, p.y, Math.max(1, p.r - 5), 0, Math.PI * 2)
      c.fill()
      c.globalAlpha = 1
    }
    c.strokeStyle = dim
    c.lineWidth = 1
    for (const [x, y, sx, sy] of [
      [10, 10, 1, 1],
      [W - 10, 10, -1, 1],
      [10, H - 10, 1, -1],
      [W - 10, H - 10, -1, -1],
    ]) {
      c.beginPath()
      c.moveTo(x, y + 12 * sy)
      c.lineTo(x, y)
      c.lineTo(x + 12 * sx, y)
      c.stroke()
    }
  }, [pins, owners, hot, hotPin])

  useEffect(() => {
    draw()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => draw()
    mq.addEventListener('change', onChange)
    const root = canvasRef.current?.closest('.dcd')
    const mo = new MutationObserver(draw)
    if (root) mo.observe(root, { attributes: true, attributeFilter: ['data-theme'] })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => {
      mq.removeEventListener('change', onChange)
      mo.disconnect()
    }
  }, [draw])

  const nearest = (e: React.MouseEvent<HTMLCanvasElement>): Pin | null => {
    const cv = canvasRef.current
    if (!cv) return null
    const b = cv.getBoundingClientRect()
    const x = ((e.clientX - b.left) * W) / b.width
    const y = ((e.clientY - b.top) * H) / b.height
    if (layer !== 'place') {
      // Hit the filled dot under the cursor (within one grid step).
      let hit: Pin | null = null
      let hd = 9
      for (const [i, p] of owners) {
        const d = Math.hypot(dotX(i) - x, dotY(i) - y)
        if (d < hd) {
          hd = d
          hit = p
        }
      }
      return hit
    }
    let best: Pin | null = null
    let bd = Infinity
    for (const p of pins) {
      const d = Math.hypot(p.x - x, p.y - y)
      if (d < bd) {
        bd = d
        best = p
      }
    }
    // Discs within 30px.
    return best && bd < 30 ? best : null
  }

  const openPin = (key: string) => {
    window.dispatchEvent(new CustomEvent(PANEL_EVENT, { detail: { key } }))
  }

  const pickLayer = (next: GeoLayer) => {
    setLayer(next)
    setHotPin(null)
    setTip(null)
  }

  const total = regions.reduce((a, r) => a + r.count, 0) || 1
  const empty =
    layer === 'place'
      ? 'No story in this window named a locality.'
      : layer === 'country'
        ? countries.length === 0 && places.length > 0
          ? 'This edition was frozen before the country layer existed — switch to Localities.'
          : 'No story in this window carried a country.'
        : 'No story in this window carried a region.'
  const tipDetail = (p: Pin) => {
    const n = `${p.count} stor${p.count === 1 ? 'y' : 'ies'}`
    if (p.kind === 'country') return `${n}${p.placed ? ` · ${p.placed} at a named locality` : ''} · ${DC_REGIONS[p.region]}`
    if (p.kind === 'region') return `${n} across the region`
    return `${n} · ${DC_REGIONS[p.region]}`
  }

  return (
    <div className="mapbox" id="mapbox" ref={boxRef} data-geo-layer={layer}>
      <div className="map-scroll">
        <canvas
          ref={canvasRef}
          id="map"
          width={W}
          height={H}
          aria-label={`World map of the edition's stories by ${GEO_LAYERS.find((l) => l.key === layer)?.label.toLowerCase()}`}
          style={{ cursor: hotPin ? 'pointer' : 'default' }}
          onMouseMove={(e) => {
            const p = nearest(e)
            if ((p?.key ?? null) !== hotPin) {
              setHotPin(p?.key ?? null)
              setHot(p ? p.region : null)
            }
            if (p && boxRef.current) {
              const bb = boxRef.current.getBoundingClientRect()
              const x = e.clientX - bb.left
              const y = e.clientY - bb.top
              setTip({ left: Math.min(x + 14, bb.width - 180), top: y - 74 > 8 ? y - 74 : y + 18, pin: p })
            } else setTip(null)
          }}
          onMouseLeave={() => {
            setHot(null)
            setHotPin(null)
            setTip(null)
          }}
          onClick={(e) => {
            const p = nearest(e)
            if (p) openPin(p.key)
          }}
        />
        {pins.length === 0 && (
          <div className="notice" style={{ position: 'absolute', left: 'var(--gutter)', bottom: 90 }}>
            {empty}
          </div>
        )}
      </div>
      {tip && (
        <div className="maptip" style={{ left: tip.left, top: tip.top }}>
          <b>{tip.pin.name}</b>
          <span>{tipDetail(tip.pin)}</span>
          <em>Click to read</em>
        </div>
      )}
      <div className="stamp">{stamp}</div>
      <div className="legend">
        <span>
          <i />
          {layer === 'place' ? 'Story cluster' : layer === 'country' ? 'Stories in the country' : 'Stories in the region'}
        </span>
        <span>
          <i className="energy" />
          Energy-tagged
        </span>
      </div>
      <div className="layerswitch" role="group" aria-label="Geography layer">
        {GEO_LAYERS.map((l) => {
          const n = l.key === 'place' ? places.length : l.key === 'country' ? countries.length : regions.length
          return (
            <button key={l.key} type="button" aria-pressed={layer === l.key} title={l.desc} onClick={() => pickLayer(l.key)}>
              {l.label}
              <span>{n}</span>
            </button>
          )
        })}
      </div>
      {/* Pins are also reachable by keyboard: one button per pin, visually hidden. */}
      <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {pins.map((p) => (
          <button key={p.key} type="button" data-panel={p.key}>
            {p.name}, {p.count} stories
          </button>
        ))}
      </div>
      <div className="regionbar" id="regionbar">
        {regions.map((r) => (
          <button
            key={r.key}
            type="button"
            data-panel={`region:${r.key}`}
            className={hot === r.key ? 'hot' : undefined}
            style={{ flexGrow: Math.max(1, (r.count / total) * 10) }}
            onMouseEnter={() => setHot(r.key)}
            onMouseLeave={() => setHot(null)}
          >
            <b>{DC_REGIONS[r.key]}</b>
            <span>{r.count}</span>
            <span className="rmini">
              {(Object.keys(DC_LAYERS) as DcLayerKey[])
                .filter((l) => (r.byLayer[l] ?? 0) > 0)
                .map((l) => (
                  <i key={l} style={{ flex: r.byLayer[l] }} title={`${DC_LAYERS[l].name} ${r.byLayer[l]}`} />
                ))}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
