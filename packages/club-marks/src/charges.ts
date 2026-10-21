import { EMBLEMS, type EmblemId } from './emblems'
import {
  CHARGE_LAYERS, CHARGE_LIMITS, CHARGE_SHAPES, RIM_LIMITS,
  type Charge, type ChargeLayer, type ChargeShape, type PrimitiveShape, type RimBand,
} from './types'

/**
 * Charges: what sits on the field. A primitive (a plain geometric shape) or an emblem
 * from the house library (./emblems: simplified crest motifs drawn in Figma), each
 * placed by hand with a scale, stretch, rotation, offset and layer. Client-safe.
 */

const PRIMITIVE_LABELS: Record<PrimitiveShape, string> = {
  circle: 'Circle', triangle: 'Triangle', 'triangle-down': 'Triangle (down)', square: 'Square', diamond: 'Diamond', bar: 'Bar',
  chevron: 'Chevron', star: 'Star', cross: 'Cross', ring: 'Ring', half: 'Half circle', hexagon: 'Hexagon',
}
export const CHARGE_LABELS: Record<ChargeShape, string> = {
  ...PRIMITIVE_LABELS,
  ...(Object.fromEntries(Object.entries(EMBLEMS).map(([id, e]) => [id, e.label])) as Record<EmblemId, string>),
}

export const isPrimitive = (v: unknown): v is PrimitiveShape => typeof v === 'string' && (CHARGE_SHAPES as readonly string[]).includes(v)
export const isEmblem = (v: unknown): v is EmblemId => typeof v === 'string' && Object.hasOwn(EMBLEMS, v)
export const isChargeShape = (v: unknown): v is ChargeShape => isPrimitive(v) || isEmblem(v)
/** The colour slots a charge's shape takes: a primitive one, an emblem as many as it was drawn with. */
export const chargeSlots = (shape: ChargeShape): string[] => (isEmblem(shape) ? [...EMBLEMS[shape].slots] : ['Colour'])

const HEX = /^#[0-9A-F]{6}$/i
const within = (v: unknown, [lo, hi]: readonly [number, number]) => v === undefined || (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi)
export const isCharge = (v: unknown): v is Charge => {
  if (!v || typeof v !== 'object') return false
  const c = v as Charge
  return isChargeShape(c.shape) && typeof c.colour === 'string' && HEX.test(c.colour)
    && (c.colours === undefined || (Array.isArray(c.colours) && c.colours.length < CHARGE_LIMITS.colours && c.colours.every(h => typeof h === 'string' && HEX.test(h))))
    && within(c.scale, CHARGE_LIMITS.scale) && within(c.rotate, CHARGE_LIMITS.rotate)
    && within(c.x, CHARGE_LIMITS.offset) && within(c.y, CHARGE_LIMITS.offset)
    && within(c.sx, CHARGE_LIMITS.stretch) && within(c.sy, CHARGE_LIMITS.stretch)
    && (c.layer === undefined || (CHARGE_LAYERS as readonly string[]).includes(c.layer))
}
export const isChargeList = (v: unknown): v is Charge[] => Array.isArray(v) && v.length <= CHARGE_LIMITS.count && v.every(isCharge)

const n = (v: number) => String(Math.round(v * 1000) / 1000)
const rnd = (v: number, d: number) => Math.round(v * d) / d

/** A charge with its defaults dropped and its numbers rounded, so equal charges compare (and hash) equal. */
export function normalizeCharge(c: Charge): Charge {
  const out: Charge = { shape: c.shape, colour: c.colour.toUpperCase() }
  const extra = (c.colours ?? []).map(h => h.toUpperCase()).slice(0, chargeSlots(c.shape).length - 1)
  if (extra.length) out.colours = extra
  if (c.scale !== undefined && rnd(c.scale, 100) !== 1) out.scale = rnd(c.scale, 100)
  if (c.rotate !== undefined && rnd(c.rotate, 1) !== 0) out.rotate = rnd(c.rotate, 1)
  if (c.x !== undefined && rnd(c.x, 10) !== 0) out.x = rnd(c.x, 10)
  if (c.y !== undefined && rnd(c.y, 10) !== 0) out.y = rnd(c.y, 10)
  if (c.sx !== undefined && rnd(c.sx, 100) !== 1) out.sx = rnd(c.sx, 100)
  if (c.sy !== undefined && rnd(c.sy, 100) !== 1) out.sy = rnd(c.sy, 100)
  if (c.layer && c.layer !== 'emblem') out.layer = c.layer
  return out
}

/**
 * Stored as text, one charge per `;`:
 *   shape:#A[/#B…][@scale,rotate,x,y[,sx,sy]][~field|~over]
 * e.g. "triangle:#CF2D36", "cannon:#F2B300@1,0,12,-2", "band:#009A8E@1,0,0,-28,1,0.5~over".
 */
export function chargesToText(list: Charge[]): string {
  return list.map(normalizeCharge).map(c => {
    const t = [c.scale ?? 1, c.rotate ?? 0, c.x ?? 0, c.y ?? 0]
    if (c.sx !== undefined || c.sy !== undefined) t.push(c.sx ?? 1, c.sy ?? 1)
    const transform = t.join() === '1,0,0,0' ? '' : `@${t.join(',')}`
    return `${c.shape}:${[c.colour, ...(c.colours ?? [])].join('/')}${transform}${c.layer ? `~${c.layer}` : ''}`
  }).join(';')
}
const NUM = '(-?\\d*\\.?\\d+)'
const CHARGE_RE = new RegExp(`^([a-z0-9-]+):(#[0-9A-Fa-f]{6}(?:/#[0-9A-Fa-f]{6})*)(?:@${NUM},${NUM},${NUM},${NUM}(?:,${NUM},${NUM})?)?(?:~(field|emblem|over))?$`)
/** Parses the stored text; anything malformed (an old emblem name, a bad number) gives []. */
export function chargesFromText(t: string | null | undefined): Charge[] {
  const parts = (t ?? '').split(';').map(s => s.trim()).filter(Boolean)
  const out: Charge[] = []
  for (const p of parts) {
    const m = p.match(CHARGE_RE)
    if (!m || !isChargeShape(m[1])) return []
    const [colour, ...colours] = m[2]!.split('/')
    const c: Charge = { shape: m[1], colour: colour!.toUpperCase() }
    if (colours.length) c.colours = colours.map(h => h.toUpperCase())
    if (m[3] !== undefined) Object.assign(c, { scale: Number(m[3]), rotate: Number(m[4]), x: Number(m[5]), y: Number(m[6]) })
    if (m[7] !== undefined) Object.assign(c, { sx: Number(m[7]), sy: Number(m[8]) })
    if (m[9]) c.layer = m[9] as ChargeLayer
    if (!isCharge(c)) return []
    out.push(normalizeCharge(c))
  }
  return out.length <= CHARGE_LIMITS.count ? out : []
}

/** The rim as text: "" = the default ring, "none" = no rim, else "#HEX@width;…" edge first. */
export function rimToText(rim: RimBand[] | undefined | null): string {
  if (!rim) return ''
  if (!rim.length) return 'none'
  return rim.map(b => `${b.colour.toUpperCase()}@${rnd(b.width, 100)}`).join(';')
}
export const isRim = (v: unknown): v is RimBand[] => Array.isArray(v) && v.length <= RIM_LIMITS.bands
  && v.every(b => b && typeof b === 'object' && typeof b.colour === 'string' && HEX.test(b.colour) && typeof b.width === 'number' && within(b.width, RIM_LIMITS.width))
/** Parses rim text; undefined = the default ring (also for anything malformed). */
export function rimFromText(t: string | null | undefined): RimBand[] | undefined {
  const s = (t ?? '').trim()
  if (!s) return undefined
  if (s === 'none') return []
  const bands = s.split(';').map(p => p.trim().match(/^(#[0-9A-Fa-f]{6})@(\d*\.?\d+)$/)).map(m => (m ? { colour: m[1]!.toUpperCase(), width: Number(m[2]) } : null))
  return bands.every(Boolean) && isRim(bands) ? (bands as RimBand[]) : undefined
}

/** A primitive's geometry centred on the origin, sized to an anchor of radius r. */
function primitiveMarkup(shape: PrimitiveShape, colour: string, r: number): string {
  const f = `fill="${colour}"`
  const pts = (list: [number, number][]) => list.map(([x, y]) => `${n(x * r)},${n(y * r)}`).join(' ')
  const poly = (list: [number, number][]) => `<polygon points="${pts(list)}" ${f}/>`
  switch (shape) {
    case 'circle': return `<circle r="${n(r * 0.52)}" ${f}/>`
    case 'square': return `<rect x="${n(-r * 0.47)}" y="${n(-r * 0.47)}" width="${n(r * 0.94)}" height="${n(r * 0.94)}" ${f}/>`
    case 'diamond': return poly([[0, -0.68], [0.68, 0], [0, 0.68], [-0.68, 0]])
    // Equilateral, centred on its centroid.
    case 'triangle': return poly([[0, -0.66], [0.57, 0.33], [-0.57, 0.33]])
    case 'triangle-down': return poly([[0, 0.66], [0.57, -0.33], [-0.57, -0.33]])
    case 'bar': return `<rect x="${n(-r * 0.66)}" y="${n(-r * 0.21)}" width="${n(r * 1.32)}" height="${n(r * 0.42)}" ${f}/>`
    case 'chevron': return poly([[-0.66, -0.4], [0, 0.18], [0.66, -0.4], [0.66, 0.02], [0, 0.6], [-0.66, 0.02]])
    case 'star': return poly(Array.from({ length: 10 }, (_, i): [number, number] => {
      const a = (Math.PI / 5) * i - Math.PI / 2, d = i % 2 ? 0.29 : 0.7
      return [Math.cos(a) * d, Math.sin(a) * d + 0.06]
    }))
    case 'cross': return poly([[-0.17, -0.62], [0.17, -0.62], [0.17, -0.17], [0.62, -0.17], [0.62, 0.17], [0.17, 0.17], [0.17, 0.62],
      [-0.17, 0.62], [-0.17, 0.17], [-0.62, 0.17], [-0.62, -0.17], [-0.17, -0.17]])
    case 'ring': return `<path d="M${n(-r * 0.58)} 0a${n(r * 0.58)} ${n(r * 0.58)} 0 1 0 ${n(r * 1.16)} 0a${n(r * 0.58)} ${n(r * 0.58)} 0 1 0 ${n(-r * 1.16)} 0Z`
      + `M${n(-r * 0.34)} 0a${n(r * 0.34)} ${n(r * 0.34)} 0 1 0 ${n(r * 0.68)} 0a${n(r * 0.34)} ${n(r * 0.34)} 0 1 0 ${n(-r * 0.68)} 0Z" fill-rule="evenodd" ${f}/>`
    // Flat side down, centred on its bounding box.
    case 'half': return `<path d="M${n(-r * 0.66)} ${n(r * 0.33)}A${n(r * 0.66)} ${n(r * 0.66)} 0 0 1 ${n(r * 0.66)} ${n(r * 0.33)}Z" ${f}/>`
    case 'hexagon': return poly(Array.from({ length: 6 }, (_, i): [number, number] => {
      const a = (Math.PI / 3) * i
      return [Math.cos(a) * 0.62, Math.sin(a) * 0.62]
    }))
  }
}

/** Emblems are drawn in a 120-unit box; marks are 100 across. */
const EMBLEM_UNIT = 100 / 120

/** One charge placed on the anchor (cx, cy, r): moved, rotated, scaled and stretched. */
export function chargeMarkup(c: Charge, cx: number, cy: number, r: number): string {
  const t = [`translate(${n(cx + (c.x ?? 0))} ${n(cy + (c.y ?? 0))})`]
  if (c.rotate) t.push(`rotate(${n(c.rotate)})`)
  const s = c.scale ?? 1
  if (isEmblem(c.shape)) {
    const e = EMBLEMS[c.shape]
    const colours = [c.colour, ...(c.colours ?? [])]
    const art = e.svg.replace(/\{([a-e])\}/g, (_, k: string) => colours['abcde'.indexOf(k)] ?? colours[0]!)
    t.push(`scale(${n(s * (c.sx ?? 1) * EMBLEM_UNIT)} ${n(s * (c.sy ?? 1) * EMBLEM_UNIT)})`, `translate(${n(-e.cx)} ${n(-e.cy)})`)
    return `<g transform="${t.join(' ')}">${art}</g>`
  }
  const sx = s * (c.sx ?? 1), sy = s * (c.sy ?? 1)
  if (sx !== 1 || sy !== 1) t.push(sx === sy ? `scale(${n(sx)})` : `scale(${n(sx)} ${n(sy)})`)
  return `<g transform="${t.join(' ')}">${primitiveMarkup(c.shape as PrimitiveShape, c.colour, r)}</g>`
}
