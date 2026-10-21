import sharp from 'sharp'
import { sanitizeSvg } from './svg'
import { ClubMarkError, type ClubMarkInput, type CrestFamily } from './types'

/**
 * Family classification (spec step 1): the crest is rasterised to a 256 px alpha
 * mask, measured (aspect, fill, ellipse fit, how the top and lower third run),
 * and dropped. Only the family and a 0–1 confidence leave this module: no path,
 * pixel or colour of the crest reaches a club mark. Node only (sharp).
 */

const MASK_PX = 256
const MAX_SOURCE_BYTES = 5 * 1024 * 1024
const USER_AGENT = 'VismayClubMarks/1.0 (+https://vismay.xyz)'

/** The silhouette, plus how strongly the crest carries a concentric band (read from its colours, then dropped). */
export type Mask = { data: Uint8Array; width: number; height: number; ring?: number }
export type FamilyFeatures = {
  aspect: number
  fill: number
  ellipseIoU: number
  /** The same two, measured below any crown or star: from the first row at 60% of the widest row. */
  bodyAspect: number
  bodyEllipseIoU: number
  top: number
  upper: number
  bottom: number
  lowerTaper: number
  /** Width of the last rows over the widest: ~0 for a pointed base, ~0.3+ for a round one. */
  tip: number
  /** Share of radii that cross one circular colour edge at the same distance (a lettering band). */
  ring: number
}

const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x)

function isSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, 16384)).replace(/^﻿/, '').trimStart()
  const rest = head.replace(/^<\?xml[^>]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '').trimStart()
    .replace(/^<!DOCTYPE[^[>]*(\[[\s\S]*?\])?\s*>/i, '').replace(/<!--[\s\S]*?-->/g, '').trimStart()
  return /^<svg[\s>]/i.test(rest)
}

const isRaster = (b: Uint8Array) => startsWith(b, [0x89, 0x50, 0x4e, 0x47]) || startsWith(b, [0xff, 0xd8, 0xff])
  || startsWith(b, [0x47, 0x49, 0x46, 0x38]) || (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8))

async function crestBytes(crest: NonNullable<ClubMarkInput['crest']>): Promise<Uint8Array> {
  if ('svg' in crest) return new TextEncoder().encode(crest.svg)
  if ('data' in crest) return crest.data
  let res: Response
  try {
    res = await fetch(crest.url, { headers: { 'user-agent': USER_AGENT, accept: 'image/*' }, signal: AbortSignal.timeout(20_000) })
  } catch (e) {
    throw new ClubMarkError('E_FETCH', e instanceof Error ? e.message : undefined)
  }
  if (!res.ok) throw new ClubMarkError('E_FETCH', `HTTP ${res.status}`)
  return new Uint8Array(await res.arrayBuffer())
}

/** The crest as RGBA (≤ 1024 px, a baked-in background made transparent) with the bounds of its opaque part. */
export type CrestImage = { rgba: Buffer; width: number; height: number; bbox: { x0: number; y0: number; x1: number; y1: number } }

export async function crestImage(crest: NonNullable<ClubMarkInput['crest']>): Promise<CrestImage> {
  const bytes = await crestBytes(crest)
  if (bytes.byteLength > MAX_SOURCE_BYTES) throw new ClubMarkError('E_FORMAT', 'over 5 MB')
  let img: sharp.Sharp
  if (isSvg(bytes)) {
    const clean = sanitizeSvg(new TextDecoder().decode(bytes))
    const meta = await sharp(Buffer.from(clean.markup), { density: 72 }).metadata()
    const density = Math.min(20_000, (72 * 1024) / Math.max(meta.width || 1, meta.height || 1))
    img = sharp(Buffer.from(clean.markup), { density })
  } else if (isRaster(bytes)) {
    img = sharp(Buffer.from(bytes)).rotate()
  } else {
    throw new ClubMarkError('E_FORMAT')
  }
  const { data, info } = await img.resize(1024, 1024, { fit: 'inside', withoutEnlargement: true }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const w = info.width, h = info.height
  const alpha = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i++) alpha[i] = data[i * 4 + 3]!
  removeBackground(data, alpha, w, h)
  for (let i = 0; i < w * h; i++) data[i * 4 + 3] = alpha[i]!
  let x0 = w, y0 = h, x1 = -1, y1 = -1
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (alpha[y * w + x]! >= 128) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  }
  if (x1 < 0) throw new ClubMarkError('E_FORMAT', 'nothing opaque in the crest')
  return { rgba: data, width: w, height: h, bbox: { x0, y0, x1, y1 } }
}

/** The crest's silhouette: alpha ≥ 50%, cropped to its bounds, longest side 256 px. */
export async function crestMask(crest: NonNullable<ClubMarkInput['crest']>): Promise<Mask> {
  const { rgba: data, width: w, height: h, bbox: { x0, y0, x1, y1 } } = await crestImage(crest)
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1
  const k = MASK_PX / Math.max(bw, bh)
  const mw = Math.max(1, Math.round(bw * k)), mh = Math.max(1, Math.round(bh * k))
  const mask = new Uint8Array(mw * mh)
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const sx = Math.min(x1, x0 + Math.floor((x + 0.5) / k)), sy = Math.min(y1, y0 + Math.floor((y + 0.5) / k))
    mask[y * mw + x] = data[(sy * w + sx) * 4 + 3]! >= 128 ? 1 : 0
  }
  return { data: mask, width: mw, height: mh, ring: ringBand(data, w, h, { x0, y0, x1, y1 }) }
}

/**
 * A lettering band (Charlton, Leicester, Middlesbrough): along most radii the strongest
 * colour edge between 55% and 90% of the radius sits at the same distance — the band's
 * inner circle. Returns the share of radii that agree (0 when the band is not round).
 */
function ringBand(rgba: Buffer, w: number, h: number, b: { x0: number; y0: number; x1: number; y1: number }): number {
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2, R = Math.min(b.x1 - b.x0, b.y1 - b.y0) / 2
  const lum = (x: number, y: number) => {
    const i = (Math.round(y) * w + Math.round(x)) * 4
    if (x < 0 || y < 0 || x >= w || y >= h) return 1
    const a = rgba[i + 3]! / 255
    return ((0.2126 * rgba[i]! + 0.7152 * rgba[i + 1]! + 0.0722 * rgba[i + 2]!) / 255) * a + (1 - a)
  }
  const peaks: number[] = []
  for (let k = 0; k < 120; k++) {
    const t = (k / 120) * 2 * Math.PI, dx = Math.cos(t), dy = Math.sin(t)
    let best = 0, at = -1
    for (let f = 0.55; f <= 0.9; f += 0.005) {
      const d = Math.abs(lum(cx + dx * (f + 0.01) * R, cy + dy * (f + 0.01) * R) - lum(cx + dx * (f - 0.01) * R, cy + dy * (f - 0.01) * R))
      if (d > best) { best = d; at = f }
    }
    if (best > 0.15) peaks.push(at)
  }
  if (peaks.length < 60) return 0
  const sorted = [...peaks].sort((x, y) => x - y)
  const median = sorted[Math.floor(sorted.length / 2)]!
  return Math.round((peaks.filter(p => Math.abs(p - median) <= 0.03).length / 120) * 1000) / 1000
}

/** A raster on a solid background: flood-fill from the four corners (RGB distance ≤ 24) to transparent. */
function removeBackground(rgba: Buffer, alpha: Uint8Array, w: number, h: number) {
  const corners = [0, w - 1, (h - 1) * w, h * w - 1]
  if (corners.some(i => alpha[i]! < 250)) return
  const seen = new Uint8Array(w * h)
  for (const seed of corners) {
    if (seen[seed]) continue
    const ref = [rgba[seed * 4]!, rgba[seed * 4 + 1]!, rgba[seed * 4 + 2]!]
    const stack = [seed]
    seen[seed] = 1
    while (stack.length) {
      const i = stack.pop()!
      alpha[i] = 0
      const x = i % w, y = (i - x) / w
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j < 0 || seen[j]) continue
        const d = Math.hypot(rgba[j * 4]! - ref[0]!, rgba[j * 4 + 1]! - ref[1]!, rgba[j * 4 + 2]! - ref[2]!)
        if (d <= 24) { seen[j] = 1; stack.push(j) }
      }
    }
  }
}

/** Shape measurements on the silhouette, its holes filled row by row (a crest's outline, not its detail). */
export function familyFeatures({ data, width: w, height: h, ring = 0 }: Mask): FamilyFeatures {
  const extent: [number, number][] = []
  let area = 0
  for (let y = 0; y < h; y++) {
    let lo = -1, hi = -1
    for (let x = 0; x < w; x++) if (data[y * w + x]) { if (lo < 0) lo = x; hi = x }
    extent.push([lo, hi])
    if (lo >= 0) area += hi - lo + 1
  }
  const widthAt = (f: number) => {
    const [lo, hi] = extent[Math.min(h - 1, Math.max(0, Math.round(f * (h - 1))))]!
    return lo < 0 ? 0 : (hi - lo + 1) / w
  }
  const mean = (a: number, b: number) => {
    let s = 0, n = 0
    for (let f = a; f <= b + 1e-9; f += 0.01) { s += widthAt(f); n++ }
    return s / n
  }
  // Ellipse inscribed in the bounds (from row y0 down) vs the row-filled silhouette.
  const ellipseFit = (y0: number) => {
    let inter = 0, union = 0, lo = w, hi = -1
    for (let y = y0; y < h; y++) { const e = extent[y]!; if (e[0] >= 0) { lo = Math.min(lo, e[0]); hi = Math.max(hi, e[1]) } }
    const bw = hi - lo + 1, bh = h - y0, cx = lo + bw / 2, cy = y0 + bh / 2
    for (let y = y0; y < h; y++) {
      const [elo, ehi] = extent[y]!
      for (let x = lo; x <= hi; x++) {
        const e = ((x + 0.5 - cx) / (bw / 2)) ** 2 + ((y + 0.5 - cy) / (bh / 2)) ** 2 <= 1
        const m = elo >= 0 && x >= elo && x <= ehi
        if (e && m) inter++
        if (e || m) union++
      }
    }
    return { iou: union ? inter / union : 0, aspect: bh / Math.max(1, bw) }
  }
  const widest = Math.max(...extent.map(([lo, hi]) => (lo < 0 ? 0 : hi - lo + 1)))
  const bodyTop = Math.max(0, extent.findIndex(([lo, hi]) => lo >= 0 && hi - lo + 1 >= 0.6 * widest))
  const whole = ellipseFit(0), body = ellipseFit(bodyTop)
  const r = (v: number) => Math.round(v * 1000) / 1000
  return {
    aspect: r(h / w),
    fill: r(area / (w * h)),
    ellipseIoU: r(whole.iou),
    bodyAspect: r(body.aspect),
    bodyEllipseIoU: r(body.iou),
    top: r(mean(0.04, 0.12)),
    upper: r(Math.max(...Array.from({ length: 31 }, (_, i) => widthAt(0.1 + i * 0.01)))),
    bottom: r(mean(0.9, 0.97)),
    lowerTaper: r(mean(0.88, 0.95) / Math.max(0.01, mean(0.55, 0.65))),
    tip: r(mean(0.93, 0.98) / Math.max(0.01, Math.max(...extent.map(([lo, hi]) => (lo < 0 ? 0 : (hi - lo + 1) / w))))),
    ring,
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const near = (v: number, target: number, tolerance: number) => clamp01(1 - Math.abs(v - target) / tolerance)

/**
 * Family scores from the features; confidence is the winner's score less the
 * runner-up's, scaled to 0–1 (a clear shape scores near 1, an in-between one low).
 */
export function scoreFamilies(f: FamilyFeatures): Record<CrestFamily, number> {
  // Round: the silhouette fills the ellipse inscribed in its bounds (circles ~0.99, shields ~0.85).
  // A crown or stars on a round badge are measured off (body*), but cost a little confidence.
  const round = Math.max(clamp01((f.ellipseIoU - 0.9) / 0.07), 0.9 * clamp01((f.bodyEllipseIoU - 0.92) / 0.06))
  const aspect = f.ellipseIoU >= f.bodyEllipseIoU ? f.aspect : f.bodyAspect
  // Shield: wide across the upper body (crowns allowed), narrowing through the lower third, solid (a pennant
  // triangle fills half its box); a diamond's pointed top rules it out.
  const shield = clamp01((f.upper - 0.75) / 0.2) * clamp01((0.95 - f.lowerTaper) / 0.3) * clamp01((f.fill - 0.42) / 0.15)
    * clamp01((f.top - 0.15) / 0.2)
  // Plate: a rectangle (full rows down to the bottom) or a lettermark / figure that is none of the shapes above.
  const rect = clamp01((f.fill - 0.86) / 0.07) * clamp01((f.bottom - 0.7) / 0.2)
  const loose = clamp01((0.6 - f.fill) / 0.14)
  return {
    // A ringed roundel is still a roundel: the ring band is the mark's own ring now.
    roundel: round * near(aspect, 1, 0.2),
    oval: round * clamp01((aspect - 1.1) / 0.1),
    // Pointed and round-based shields are both heaters.
    heater: shield * (1 - round) * (1 - rect),
    plate: Math.max(rect, loose * (1 - round)),
    // Hexagons are set by hand (Wolves): the silhouette features do not separate them from roundels reliably.
    hexagon: 0,
  }
}

export function classifyFamily(f: FamilyFeatures): { family: CrestFamily; confidence: number; scores: Record<CrestFamily, number> } {
  const scores = scoreFamilies(f)
  const ranked = (Object.entries(scores) as [CrestFamily, number][]).sort((a, b) => b[1] - a[1])
  const [best, second] = ranked
  const confidence = Math.round(clamp01(best![1] - second![1] * 0.5) * 100) / 100
  return { family: best![0], confidence, scores }
}
