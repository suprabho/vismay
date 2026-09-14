#!/usr/bin/env node
// Build the map layer for the korean-war-frontline story.
//
//   node vizmaya-data/korean-war-frontline/scripts/build-geojson.mjs
//
// Inputs (this folder):
//   frontlines.csv          beat,seq,lon,lat — one hand-placed polyline per beat, west → east
//   korea-outline.geojson   Natural Earth 1:10m North + South Korea (two rings sharing the DMZ)
//   beats.csv               beat metadata (dates, line names, stated area shares)
//
// Output:
//   apps/vizmaya-fyi/public/data/korean-war-frontlines.geojson
//     held-<beat>   polygon of the peninsula north of the line (communist-held), closed along
//                   the coast + Yalu/Tumen so it always follows the landmass exactly
//     front-<beat>  thin strip (±STRIP_KM) along the line itself, clipped to land
//     parallel-38   the 38th parallel reference strip (alias of front-parallel)
//
// The story config lists which feature ids each section shades (`map.regions.items`), so
// swapping in better geometry (e.g. properly digitised CMH maps) is a data change here,
// not a code change. Lines are indicative, not surveyed.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA = path.join(HERE, '..')
const OUT = path.join(HERE, '../../../apps/vizmaya-fyi/public/data/korean-war-frontlines.geojson')
const N = 120 // resampled points per line
const STRIP_KM = 2.5 // half-width of the frontline strip
const SIMPLIFY_KM = 0.6 // coastline simplification tolerance (Douglas–Peucker)

// ---------- projection helpers (Web-Mercator-ish plane in km, good enough at 33–43°N) ----------
const R = 6371
const rad = (d) => (d * Math.PI) / 180
const merc = ([lon, lat]) => [R * rad(lon), R * Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2))]
const unmerc = ([x, y]) => [(x / R / Math.PI) * 180, ((2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * 180) / Math.PI]
const round = ([lon, lat]) => [+lon.toFixed(4), +lat.toFixed(4)]

// ---------- inputs ----------
const csv = (file) => {
  const [head, ...rows] = fs.readFileSync(path.join(DATA, file), 'utf8').trim().split('\n')
  const cols = head.split(',')
  const split = (r) => (r.match(/("[^"]*"|[^,]*)(,|$)/g) || []).slice(0, cols.length).map((v) => v.replace(/,$/, '').replace(/^"|"$/g, ''))
  return rows.map((r) => Object.fromEntries(split(r).map((v, i) => [cols[i], v])))
}
const lines = {}
for (const r of csv('frontlines.csv')) (lines[r.beat] ||= []).push([+r.lon, +r.lat])
const beats = csv('beats.csv')

const outline = JSON.parse(fs.readFileSync(path.join(DATA, 'korea-outline.geojson'), 'utf8'))
const rings = outline.features[0].geometry.coordinates.map((p) => p[0]).sort((a, b) => b.length - a.length)

// ---------- stitch NK + SK rings into one peninsula ring along the shared DMZ edge ----------
const key = (p) => p[0].toFixed(4) + ',' + p[1].toFixed(4)
function stitch(A, B) {
  A = A.slice(0, -1) // drop closing vertex
  B = B.slice(0, -1)
  const inB = new Set(B.map(key))
  const shared = A.map((p) => inB.has(key(p)))
  // longest circular run of shared vertices in A = the DMZ
  let best = null
  for (let s = 0; s < A.length; s++) {
    if (!shared[s] || shared[(s - 1 + A.length) % A.length]) continue
    let e = s
    while (shared[(e + 1) % A.length]) e = (e + 1) % A.length
    const len = ((e - s + A.length) % A.length) + 1
    if (!best || len > best.len) best = { s, e, len }
  }
  const P = A[best.s], Q = A[best.e]
  // A's non-shared arc: from Q forward around to P
  const arcA = []
  for (let i = best.e; ; i = (i + 1) % A.length) { arcA.push(A[i]); if (i === best.s) break }
  // B's arc from P to Q avoiding the shared run
  const iP = B.findIndex((p) => key(p) === key(P)), iQ = B.findIndex((p) => key(p) === key(Q))
  const fwd = [], bwd = []
  for (let i = iP; ; i = (i + 1) % B.length) { fwd.push(B[i]); if (i === iQ) break }
  for (let i = iP; ; i = (i - 1 + B.length) % B.length) { bwd.push(B[i]); if (i === iQ) break }
  const inA = new Set(A.map(key))
  const score = (arc) => arc.filter((p) => inA.has(key(p))).length
  const arcB = score(fwd) <= score(bwd) ? fwd : bwd
  const ring = [...arcA, ...arcB.slice(1, -1)]
  ring.push(ring[0])
  return { ring, dmzShared: best.len, leftoverShared: shared.filter(Boolean).length - best.len }
}
const { ring: peninsula, dmzShared, leftoverShared } = stitch(rings[0], rings[1])
console.log(`peninsula ring: ${peninsula.length} vertices (DMZ run ${dmzShared}, stray shared ${leftoverShared})`)
// closed ring: split at the vertex farthest from the start so DP has a real baseline
function simplifyRing(ring, tol) {
  const k = ring.reduce((m, p, i) => (Math.hypot(p[0] - ring[0][0], p[1] - ring[0][1]) > Math.hypot(ring[m][0] - ring[0][0], ring[m][1] - ring[0][1]) ? i : m), 0)
  return [...simplify(ring.slice(0, k + 1), tol), ...simplify(ring.slice(k), tol).slice(1)]
}
const PEN = simplifyRing(peninsula.map(merc), SIMPLIFY_KM)
console.log(`simplified to ${PEN.length} vertices at ${SIMPLIFY_KM} km`)

// ---------- geometry helpers ----------
function resample(pts, n) {
  const seg = [0]
  for (let i = 1; i < pts.length; i++) seg.push(seg[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]))
  const L = seg[seg.length - 1], out = []
  for (let k = 0; k < n; k++) {
    const d = (L * k) / (n - 1)
    let i = 1
    while (i < seg.length - 1 && seg[i] < d) i++
    const t = (d - seg[i - 1]) / (seg[i] - seg[i - 1] || 1)
    out.push([pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t])
  }
  return out
}
function segInt(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]]
  const den = r[0] * s[1] - r[1] * s[0]
  if (Math.abs(den) < 1e-12) return null
  const qp = [c[0] - a[0], c[1] - a[1]]
  const t = (qp[0] * s[1] - qp[1] * s[0]) / den, u = (qp[0] * r[1] - qp[1] * r[0]) / den
  if (t < 0 || t > 1 || u < 0 || u > 1) return null
  return { t, u, p: [a[0] + r[0] * t, a[1] + r[1] * t] }
}
function inside(p, ring) {
  let c = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j]
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
// first crossing of `line` (walking from index `from` in direction `dir`) with the ring
function firstCrossing(line, from, dir) {
  for (let i = from; i + dir >= 0 && i + dir < line.length; i += dir) {
    const a = line[i], b = line[i + dir]
    let best = null
    for (let j = 0; j < PEN.length - 1; j++) {
      const h = segInt(a, b, PEN[j], PEN[j + 1])
      if (h && (!best || h.t < best.t)) best = { ...h, edge: j, lineIdx: i }
    }
    if (best) return best
  }
  return null
}
function nearestVertex(p) {
  let bi = 0, bd = Infinity
  for (let j = 0; j < PEN.length - 1; j++) { const d = Math.hypot(PEN[j][0] - p[0], PEN[j][1] - p[1]); if (d < bd) { bd = d; bi = j } }
  return { p: PEN[bi], edge: bi, lineIdx: null }
}
// Area on an (approximately) equal-area plane — Mercator inflates the north, so measure in
// lon·cos(lat) / lat space instead. Only the ratio matters here.
function area(ringXY) {
  const ring = ringXY.map((p) => { const [lon, lat] = unmerc(p); return [lon * Math.cos(rad(lat)), lat] })
  let a = 0
  for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
  return a / 2
}
// Douglas–Peucker, tolerance in km (plane units)
function simplify(pts, tol) {
  if (pts.length < 3) return pts
  const keep = new Array(pts.length).fill(false)
  keep[0] = keep[pts.length - 1] = true
  const stack = [[0, pts.length - 1]]
  while (stack.length) {
    const [s, e] = stack.pop()
    const a = pts[s], b = pts[e]
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1
    let bi = -1, bd = tol
    for (let i = s + 1; i < e; i++) {
      const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + b[0] * a[1] - b[1] * a[0]) / len
      if (d > bd) { bd = d; bi = i }
    }
    if (bi > 0) { keep[bi] = true; stack.push([s, bi], [bi, e]) }
  }
  return pts.filter((_, i) => keep[i])
}

// polygon of land NORTH of the line: trimmed line + the ring arc through the northernmost vertex
function heldPolygon(line) {
  const west = firstCrossing(line, 0, +1) || (inside(line[0], PEN) ? nearestVertex(line[0]) : null)
  const east = firstCrossing(line, line.length - 1, -1) || (inside(line[line.length - 1], PEN) ? nearestVertex(line[line.length - 1]) : null)
  if (!west || !east) throw new Error('line does not reach the landmass at both ends')
  const i0 = west.lineIdx === null ? 0 : west.lineIdx + 1
  const i1 = east.lineIdx === null ? line.length - 1 : east.lineIdx
  const trimmed = [west.p, ...line.slice(i0, i1 + 1), east.p]
  // ring arc from east.edge to west.edge — pick the direction that passes the northernmost vertex
  const northIdx = PEN.reduce((m, p, i) => (p[1] > PEN[m][1] ? i : m), 0)
  const n = PEN.length - 1
  const fwd = [], bwd = []
  for (let j = (east.edge + 1) % n; ; j = (j + 1) % n) { fwd.push(j); if (j === west.edge) break }
  for (let j = east.edge; ; j = (j - 1 + n) % n) { bwd.push(j); if (j === (west.edge + 1) % n) break }
  const arc = fwd.includes(northIdx) ? fwd : bwd
  const ring = [...trimmed, ...arc.map((j) => PEN[j]), trimmed[0]]
  return { ring, trimmed }
}
// thin strip around a polyline (offset both sides in the km plane)
function strip(line, half) {
  const L = [], Rr = []
  for (let i = 0; i < line.length; i++) {
    const a = line[Math.max(0, i - 1)], b = line[Math.min(line.length - 1, i + 1)]
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1
    const nx = -dy / len, ny = dx / len
    L.push([line[i][0] + nx * half, line[i][1] + ny * half])
    Rr.push([line[i][0] - nx * half, line[i][1] - ny * half])
  }
  const ring = [...L, ...Rr.reverse()]
  ring.push(ring[0])
  return ring
}
const toLL = (ring) => ring.map((p) => round(unmerc(p)))

// ---------- build ----------
const features = []
const penArea = Math.abs(area(PEN))
const shareCheck = []
for (const b of beats) {
  const raw = lines[b.beat]
  if (!raw) throw new Error(`no line for beat ${b.beat}`)
  const line = resample(raw.map(merc), N)
  const { ring, trimmed } = heldPolygon(line)
  const share = Math.round((Math.abs(area(ring)) / penArea) * 100)
  shareCheck.push({ beat: b.beat, computed: share, stated: +b.held_by_north_pct })
  features.push({
    type: 'Feature',
    properties: { id: `held-${b.beat}`, beat: b.beat, kind: 'held', date: b.date_shown, line: b.line_name, held_by_north_pct: +b.held_by_north_pct, computed_share_pct: share },
    geometry: { type: 'Polygon', coordinates: [toLL(ring)] },
  })
  features.push({
    type: 'Feature',
    properties: { id: `front-${b.beat}`, beat: b.beat, kind: 'front', date: b.date_shown, line: b.line_name },
    geometry: { type: 'Polygon', coordinates: [toLL(strip(trimmed, STRIP_KM))] },
  })
}
// 38th parallel reference strip (same geometry as front-parallel, stable id for every section)
const par = features.find((f) => f.properties.id === 'front-parallel')
features.push({ ...par, properties: { id: 'parallel-38', kind: 'reference', label: '38th parallel' } })

fs.writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', features }))
console.table(shareCheck)
console.log(`wrote ${features.length} features → ${path.relative(process.cwd(), OUT)} (${(fs.statSync(OUT).size / 1024).toFixed(0)} kB)`)
