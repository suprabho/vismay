'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EditionGeoCountry, EditionGeoPlace, EditionGeoRegion } from '@vismay/dc-editions/dcEditionTypes'
import { DC_LAYERS, DC_REGIONS, type DcLayerKey } from '@vismay/dc-editions/dcEditionTypes'
import { LAND_MASK } from './landMask'
import { PANEL_EVENT } from './editionUtils'

interface Props {
  places: EditionGeoPlace[]
  /** The country layer (migration 100); editions frozen before it pass []. */
  countries?: EditionGeoCountry[]
  regions: EditionGeoRegion[]
  stamp: string
}

const W = 1400
const H = 640
const PAD = 40
const px = (lon: number) => PAD + ((lon + 180) / 360) * (W - PAD * 2)
const py = (lat: number) => PAD + ((84 - lat) / 142) * (H - PAD * 2)

interface Pin {
  /** `place:<slug>` or `country:<code>` — the panel key the pin opens. */
  key: string
  name: string
  region: EditionGeoPlace['region']
  /** Stories: at the locality, or in the country with no locality. */
  count: number
  energy: boolean
  /** A country ring stands for stories tagged to the country but to no locality. */
  kind: 'place' | 'country'
  x: number
  y: number
  r: number
}

/**
 * Chapter III — full-bleed dot-matrix world map. The land mask is a flat
 * array shipped with the page (no fetch, no map library). Two kinds of pin:
 * a solid disc per locality (sized by story count, coloured by the energy
 * tag) and a hollow ring at a country's centroid for the stories tagged to
 * that country but to no locality — so "Samsung raises HBM output" shows up
 * over Korea instead of vanishing or being drawn on Seoul. Hover shows the
 * name/count in a tooltip (nothing is lettered on the map), click opens the
 * stories; the region bar below is proportional to story share with
 * per-layer micro-bars, and highlights the region's pins on hover.
 */
export default function GeoMap({ places, countries = [], regions, stamp }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [hot, setHot] = useState<string | null>(null)
  const [hotPin, setHotPin] = useState<string | null>(null)
  const [tip, setTip] = useState<{ left: number; top: number; pin: Pin } | null>(null)

  const pins = useMemo<Pin[]>(
    () => [
      ...countries
        .filter((c) => c.unplaced > 0)
        .map((c): Pin => ({ key: `country:${c.code}`, name: c.name, region: c.region, count: c.unplaced, energy: c.energy, kind: 'country', x: px(c.lng), y: py(c.lat), r: 6 + Math.min(c.unplaced, 12) * 2 })),
      ...places.map((p): Pin => ({ key: `place:${p.slug}`, name: p.name, region: p.region, count: p.count, energy: p.energy, kind: 'place', x: px(p.lng), y: py(p.lat), r: 5 + Math.min(p.count, 12) * 2.2 })),
    ],
    [places, countries],
  )

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
      c.beginPath()
      c.arc(px(LAND_MASK[i] / 10), py(LAND_MASK[i + 1] / 10), 2.4, 0, Math.PI * 2)
      c.fill()
    }
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
      if (p.kind === 'country') {
        // Country ring: stroke only, so a locality disc inside the same country still reads.
        c.globalAlpha = on ? (isHot ? 0.95 : 0.6) : 0.2
        c.strokeStyle = col
        c.lineWidth = isHot ? 2.4 : 1.6
        c.setLineDash([3, 4])
        c.beginPath()
        c.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        c.stroke()
        c.setLineDash([])
        c.fillStyle = col
        c.beginPath()
        c.arc(p.x, p.y, 2, 0, Math.PI * 2)
        c.fill()
        c.globalAlpha = 1
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
  }, [pins, hot, hotPin])

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
    let best: Pin | null = null
    let bd = Infinity
    for (const p of pins) {
      // A locality disc wins over the country ring around it.
      const d = Math.hypot(p.x - x, p.y - y) + (p.kind === 'country' ? 6 : 0)
      if (d < bd) {
        bd = d
        best = p
      }
    }
    return bd < 30 ? best : null
  }

  const openPin = (key: string) => {
    window.dispatchEvent(new CustomEvent(PANEL_EVENT, { detail: { key } }))
  }

  const total = regions.reduce((a, r) => a + r.count, 0) || 1

  return (
    <div className="mapbox" id="mapbox" ref={boxRef}>
      <div className="map-scroll">
        <canvas
          ref={canvasRef}
          id="map"
          width={W}
          height={H}
          aria-label="World map with pins where the edition's stories cluster"
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
            No story in this window carried a place or country tag.
          </div>
        )}
      </div>
      {tip && (
        <div className="maptip" style={{ left: tip.left, top: tip.top }}>
          <b>{tip.pin.name}</b>
          <span>
            {tip.pin.count} stor{tip.pin.count === 1 ? 'y' : 'ies'}
            {tip.pin.kind === 'country' ? ' · country-level, no locality' : ''} · {DC_REGIONS[tip.pin.region]}
          </span>
          <em>Click to read</em>
        </div>
      )}
      <div className="stamp">{stamp}</div>
      <div className="legend">
        <span>
          <i />
          Story cluster
        </span>
        <span>
          <i className="energy" />
          Energy-tagged
        </span>
        {pins.some((p) => p.kind === 'country') && (
          <span>
            <i className="country" />
            Country only
          </span>
        )}
      </div>
      {/* Pins are also reachable by keyboard: one button per place, visually hidden. */}
      <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {pins.map((p) => (
          <button key={p.key} type="button" data-panel={p.key}>
            {p.name}, {p.count} stories{p.kind === 'country' ? ' (country level)' : ''}
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
