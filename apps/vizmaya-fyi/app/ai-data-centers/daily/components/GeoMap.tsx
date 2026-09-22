'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { EditionGeoPlace, EditionGeoRegion } from '@vismay/content-source/dcEditionTypes'
import { DC_LAYERS, DC_REGIONS, type DcLayerKey } from '@vismay/content-source/dcEditionTypes'
import { LAND_MASK } from './landMask'
import { PANEL_EVENT } from './editionUtils'

interface Props {
  places: EditionGeoPlace[]
  regions: EditionGeoRegion[]
  stamp: string
}

const W = 1400
const H = 640
const PAD = 40
const px = (lon: number) => PAD + ((lon + 180) / 360) * (W - PAD * 2)
const py = (lat: number) => PAD + ((84 - lat) / 142) * (H - PAD * 2)

interface Pin extends EditionGeoPlace {
  x: number
  y: number
  r: number
  side: 'left' | 'right'
  dy: number
}

/**
 * Chapter III — full-bleed dot-matrix world map. The land mask is a flat
 * array shipped with the page (no fetch, no map library); pins are sized by
 * story count and coloured by the energy tag. Hover shows the place, click
 * opens its stories; the region bar below is proportional to story share
 * with per-layer micro-bars, and highlights the region's pins on hover.
 */
export default function GeoMap({ places, regions, stamp }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const [hot, setHot] = useState<string | null>(null)
  const [hotPin, setHotPin] = useState<string | null>(null)
  const [tip, setTip] = useState<{ left: number; top: number; pin: Pin } | null>(null)

  // Label placement: the busiest pins choose first, each trying right / left
  // and a few vertical offsets, and take the slot that overlaps the fewest
  // labels and pins already on the map — so clustered sites (Virginia and
  // Ohio, the Gulf, the Netherlands) stay legible without hand-placed offsets.
  const pins = useMemo<Pin[]>(() => {
    const base = places.map((p) => ({ ...p, x: px(p.lng), y: py(p.lat), r: 5 + Math.min(p.count, 12) * 2.2 }))
    const CH = 9.2 // px per character at the 15px mono label size
    const LH = 16
    type Box = { x1: number; y1: number; x2: number; y2: number }
    const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1)) * Math.max(0, Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1))
    const pinBoxes: Box[] = base.map((p) => ({ x1: p.x - p.r * 1.6, y1: p.y - p.r * 1.6, x2: p.x + p.r * 1.6, y2: p.y + p.r * 1.6 }))
    const labelBoxes: Box[] = []
    const chosen = new Map<string, { side: 'left' | 'right'; dy: number }>()
    const candidates: ['left' | 'right', number][] = [
      ['right', 0], ['left', 0], ['right', 16], ['right', -16], ['left', 16], ['left', -16], ['right', 30], ['left', 30], ['right', -30], ['left', -30],
    ]
    const order = [...base].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    for (const p of order) {
      const w = `${p.name} ${p.count}`.length * CH
      let best: { side: 'left' | 'right'; dy: number; box: Box } | null = null
      let bestScore = Infinity
      for (const [side, dy] of candidates) {
        const x1 = side === 'right' ? p.x + p.r + 8 : p.x - p.r - 8 - w
        const box: Box = { x1, y1: p.y + dy - LH / 2, x2: x1 + w, y2: p.y + dy + LH / 2 }
        if (box.x1 < 4 || box.x2 > W - 4 || box.y1 < 4 || box.y2 > H - 4) continue
        let score = 0
        for (const b of labelBoxes) score += overlap(box, b)
        for (const [j, b] of pinBoxes.entries()) if (base[j].slug !== p.slug) score += overlap(box, b) * 0.6
        if (score < bestScore) {
          bestScore = score
          best = { side, dy, box }
        }
        if (score === 0) break
      }
      if (best) {
        labelBoxes.push(best.box)
        chosen.set(p.slug, { side: best.side, dy: best.dy })
      }
    }
    return base.map((p) => ({ ...p, ...(chosen.get(p.slug) ?? { side: 'right' as const, dy: 0 }) }))
  }, [places])

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
    const bone = tok('--bone')
    const ink = tok('--ink')
    const dim = tok('--dim')
    const mono = tok('--mono') || 'monospace'

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
      const isHot = hotPin === p.slug
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
      c.font = `${isHot ? '600' : '500'} 15px ${mono}`
      c.textBaseline = 'middle'
      c.fillStyle = isHot ? col : bone
      c.textAlign = p.side === 'left' ? 'right' : 'left'
      c.fillText(`${p.name} ${p.count}`, p.side === 'left' ? p.x - p.r - 8 : p.x + p.r + 8, p.y + p.dy)
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
      const d = Math.hypot(p.x - x, p.y - y)
      if (d < bd) {
        bd = d
        best = p
      }
    }
    return bd < 30 ? best : null
  }

  const openPlace = (slug: string) => {
    window.dispatchEvent(new CustomEvent(PANEL_EVENT, { detail: { key: `place:${slug}` } }))
  }

  const total = regions.reduce((a, r) => a + r.count, 0) || 1

  return (
    <div className="mapbox" id="mapbox" ref={boxRef}>
      <canvas
        ref={canvasRef}
        id="map"
        width={W}
        height={H}
        aria-label="World map with pins where the edition's stories cluster"
        style={{ cursor: hotPin ? 'pointer' : 'default' }}
        onMouseMove={(e) => {
          const p = nearest(e)
          if ((p?.slug ?? null) !== hotPin) {
            setHotPin(p?.slug ?? null)
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
          if (p) openPlace(p.slug)
        }}
      />
      {pins.length === 0 && (
        <div className="notice" style={{ position: 'absolute', left: 'var(--gutter)', bottom: 90 }}>
          No story in this window carried a place tag.
        </div>
      )}
      {tip && (
        <div className="maptip" style={{ left: tip.left, top: tip.top }}>
          <b>{tip.pin.name}</b>
          <span>
            {tip.pin.count} stor{tip.pin.count === 1 ? 'y' : 'ies'} · {DC_REGIONS[tip.pin.region]}
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
      </div>
      {/* Pins are also reachable by keyboard: one button per place, visually hidden. */}
      <div style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
        {pins.map((p) => (
          <button key={p.slug} type="button" data-panel={`place:${p.slug}`}>
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
