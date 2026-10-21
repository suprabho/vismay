import { chargeMarkup } from './charges'
import { TIER_PX, WHITE, type Charge, type ClubMarkRow, type ClubMarkTier, type CrestFamily, type KitPattern, type RimBand } from './types'

/**
 * Club mark SVGs — a pure function of the row, so any surface re-renders from the row
 * alone and the same row always gives byte-identical markup. Client-safe.
 *
 * Layers, on a 100-unit box, all clipped to the family shape: the FIELD (the kit pattern
 * in c1/c2) and its field-layer charges; at token and hero sizes the EMBLEM-layer charges;
 * the RIM (0–3 bands drawn as inner strokes of the shape, edge first, so they keep one
 * width round every family and trim anything moved to the edge); then OVER-layer charges.
 * The chip (24 px) is the field, its field-layer charges and the rim.
 */

/** The family outlines (the heater and plate as redrawn in Figma, Oct 2026). */
export const SHAPE: Record<CrestFamily, string> = {
  roundel: '<circle cx="50" cy="50" r="47"/>',
  heater: '<path d="M6 4.17H94V40.17C94 40.17 93.17 51.53 91 58.17C88.83 64.81 87.11 68.52 83 74.17C78.89 79.81 74.46 83.69 68 88.17C61.54 92.64 50 97.17 50 97.17C50 97.17 38.46 92.64 32 88.17C25.54 83.69 21.11 79.81 17 74.17C12.89 68.52 11.17 64.81 9 58.17C6.79 51.39 6 40.17 6 40.17V4.17Z"/>',
  oval: '<ellipse cx="50" cy="50" rx="39" ry="47"/>',
  plate: '<rect x="4" y="3.33" width="92" height="93.33" rx="18" ry="18"/>',
  hexagon: '<polygon points="96.67,50 73.33,90.41 26.67,90.41 3.33,50 26.67,9.59 73.33,9.59"/>',
}
/** Where charges sit by default, and the size scale 1 means for a primitive (the heater's anchor sits higher, where the shield is widest). */
export const ANCHOR: Record<CrestFamily, { cx: number; cy: number; r: number }> = {
  roundel: { cx: 50, cy: 50, r: 20 },
  heater: { cx: 50, cy: 43, r: 19 },
  oval: { cx: 50, cy: 50, r: 18 },
  plate: { cx: 50, cy: 50, r: 19 },
  hexagon: { cx: 50, cy: 50, r: 19 },
}
/** The default rim: the ring colour, then a white gap. */
export const DEFAULT_RIM = { ring: 9, gap: 3 } as const
/** At chip size every band is thickened, and never thinner than a pixel, so the rim holds at 24 px. */
export const CHIP_RIM_SCALE = 1.4
const CHIP_MIN_BAND = 100 / 24

/** The rim bands a tier draws, edge first. */
export function rimBands(row: ClubMarkRow, tier: ClubMarkTier): RimBand[] {
  const bands = row.rim ?? [{ colour: row.ring, width: DEFAULT_RIM.ring }, { colour: WHITE, width: DEFAULT_RIM.gap }]
  return tier === 'chip' ? bands.map(b => ({ ...b, width: Math.max(b.width * CHIP_RIM_SCALE, CHIP_MIN_BAND) })) : bands
}
/** The field's inset from the shape's edge: the whole rim. Kit patterns are laid out inside it. */
export const fieldInset = (row: ClubMarkRow, tier: ClubMarkTier) => rimBands(row, tier).reduce((t, b) => t + b.width, 0)

/** Sides (sleeves) run from the edge to here, as drawn: about a third of the box. */
const SIDE = 30.83
/** Stripes: an odd number of bands across the field, c1 at both edges. Hoops: bands down it. */
const STRIPE_BANDS = 9
const HOOP_BANDS = 6

/** The narrowest visible kit band of a pattern, in box units (null for a solid kit). */
export function narrowestBand(pattern: KitPattern, inset: number): number | null {
  const w = 100 - 2 * inset
  switch (pattern) {
    case 'stripes': return w / STRIPE_BANDS
    case 'hoops': return w / HOOP_BANDS
    case 'sleeves': return Math.max(0, SIDE - inset)
    case 'band': return w * 0.24
    case 'halves': return w / 2
    default: return null
  }
}

const n = (v: number) => String(Math.round(v * 1000) / 1000)

/** The kit pattern laid out across the field (the box inside the rim), so no band hides under it. */
function field(row: ClubMarkRow, inset: number): string {
  const c1 = row.c1, c2 = row.c2 ?? row.c1
  const a = inset, w = 100 - 2 * inset
  const rect = (x: number, y: number, rw: number, rh: number, fill: string) => `<rect x="${n(x)}" y="${n(y)}" width="${n(rw)}" height="${n(rh)}" fill="${fill}"/>`
  const base = rect(0, 0, 100, 100, c1)
  switch (row.c2 ? row.pattern : 'solid') {
    case 'stripes': return base + Array.from({ length: STRIPE_BANDS }, (_, i) => (i % 2 ? rect(a + (i * w) / STRIPE_BANDS, 0, w / STRIPE_BANDS, 100, c2) : '')).join('')
    case 'hoops': return base + Array.from({ length: HOOP_BANDS }, (_, i) => (i % 2 ? rect(0, a + (i * w) / HOOP_BANDS, 100, w / HOOP_BANDS, c2) : '')).join('')
    case 'halves': return base + rect(50, 0, 50, 100, c2)
    case 'sleeves': return base + rect(0, 0, SIDE, 100, c2) + rect(100 - SIDE, 0, SIDE, 100, c2)
    case 'band': return base + rect(a + w * 0.38, 0, w * 0.24, 100, c2)
    default: return base
  }
}

/** FNV-1a: deterministic clip ids, so several marks inline in one document never share one by accident. */
function hash(s: string): string {
  let h = 0x811c9dc5
  for (const ch of new TextEncoder().encode(s)) { h ^= ch; h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(36)
}

/**
 * `uid` makes the clip id unique to this copy. Pass one whenever the same mark can appear
 * more than once in a page: browsers resolve url(#id) to the first element with that id,
 * and if that copy sits in a hidden (display: none) subtree, every other copy loses its clip.
 */
export type RenderOptions = { size?: number; title?: string; uid?: string }

const safeUid = (uid: string) => uid.replace(/[^A-Za-z0-9_-]/g, '')
/** Re-key an already rendered mark's clip id (e.g. per React useId), for the same reason as `uid`. */
export function withClipUid(svg: string, uid: string): string {
  const u = safeUid(uid)
  return u ? svg.replace(/(id="|url\(#)(cm[0-9a-z]+)(?=[")])/g, `$1$2-${u}`) : svg
}

const inLayer = (c: Charge, layer: 'field' | 'emblem' | 'over') => (c.layer ?? 'emblem') === layer

export function renderClubMark(row: ClubMarkRow, tier: ClubMarkTier, { size = TIER_PX[tier], title, uid }: RenderOptions = {}): string {
  const id = `cm${hash(JSON.stringify([row, tier]))}${uid && safeUid(uid) ? `-${safeUid(uid)}` : ''}`
  const shape = SHAPE[row.crest]
  const stroke = (colour: string, width: number) => shape.replace('/>', ` fill="none" stroke="${colour}" stroke-width="${n(width)}"/>`)
  const a = ANCHOR[row.crest]
  const layer = (l: 'field' | 'emblem' | 'over') => row.charges.filter(c => inLayer(c, l)).map(c => chargeMarkup(c, a.cx, a.cy, a.r)).join('')
  const bands = rimBands(row, tier)
  // Inner strokes, widest (innermost edge) first, so each band shows its own width from the edge.
  let edge = bands.reduce((t, b) => t + b.width, 0)
  let rim = ''
  for (let i = bands.length - 1; i >= 0; i--) { rim += stroke(bands[i]!.colour, edge * 2); edge -= bands[i]!.width }
  const big = tier !== 'chip'
  const label = title ? `<title>${title.replace(/[<>&"]/g, '')}</title>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${n(size)}" height="${n(size)}" role="img">${label}`
    + `<defs><clipPath id="${id}">${shape}</clipPath></defs>`
    + `<g clip-path="url(#${id})">${field(row, fieldInset(row, tier))}${layer('field')}${big ? layer('emblem') : ''}${rim}${big ? layer('over') : ''}</g>`
    + `</svg>`
}
