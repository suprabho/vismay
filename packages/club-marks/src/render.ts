import { contrastHex } from './color'
import {
  BOOK_PAPER, INK, KEYLINE_SHARE, MIN_KEYLINE_PT, NON_TEXT_CONTRAST, PAPER_KEYLINE, TEXT_CONTRAST, TIER_SIZES,
  type ClubMarkRow, type ClubMarkTier, type CrestFamily, type KitPattern,
} from './types'

/**
 * Club mark SVGs — a pure function of the row, so any surface re-renders from the
 * row alone and the same row always yields byte-identical markup. Client-safe.
 *
 * Geometry is the spec's clip-paths drawn on a 100-unit box: the shape is filled
 * with the kit pattern and edged with an ink keyline that sits inside it (4% of the
 * box, ≥ 0.5 pt at the tier's smallest size). Token and hero set the code under the
 * shape in Archivo Narrow Bold.
 */

const SHAPE: Record<CrestFamily, string> = {
  roundel: '<circle cx="50" cy="50" r="47"/>',
  heater: '<polygon points="6,4 94,4 94,40 91,58 83,74 68,88 50,97 32,88 17,74 9,58 6,40"/>',
  oval: '<ellipse cx="50" cy="50" rx="39" ry="47"/>',
  plate: '<rect x="4" y="10" width="92" height="80" rx="18" ry="18"/>',
}

/** Band counts: the full pattern, and the dot tier's reduced one (half the bands; quarters as halves). */
export const PATTERN_BANDS = { stripes: { full: 8, reduced: 4 }, hoops: { full: 6, reduced: 3 } } as const

/** The narrowest band of a pattern as a share of the box (null for a solid kit). */
export function narrowestBand(pattern: KitPattern, reduced: boolean): number | null {
  switch (pattern) {
    case 'stripes': return 1 / PATTERN_BANDS.stripes[reduced ? 'reduced' : 'full']
    case 'hoops': return 1 / PATTERN_BANDS.hoops[reduced ? 'reduced' : 'full']
    case 'band': return 0.24
    case 'sash': return 0.24
    case 'halves': case 'quarters': return 0.5
    default: return null
  }
}

const n = (v: number) => String(Math.round(v * 1000) / 1000)

function patternMarkup(row: ClubMarkRow, reduced: boolean): string {
  const c1 = row.c1, c2 = row.c2 ?? row.c1
  const pattern: KitPattern = !row.c2 ? 'solid' : reduced && row.pattern === 'quarters' ? 'halves' : row.pattern
  const rect = (x: number, y: number, w: number, h: number, fill: string) => `<rect x="${n(x)}" y="${n(y)}" width="${n(w)}" height="${n(h)}" fill="${fill}"/>`
  switch (pattern) {
    case 'stripes':
    case 'hoops': {
      const count = PATTERN_BANDS[pattern][reduced ? 'reduced' : 'full']
      const step = 100 / count
      return Array.from({ length: count }, (_, i) =>
        pattern === 'stripes' ? rect(i * step, 0, step, 100, i % 2 ? c2 : c1) : rect(0, i * step, 100, step, i % 2 ? c2 : c1)).join('')
    }
    case 'halves': return rect(0, 0, 50, 100, c1) + rect(50, 0, 50, 100, c2)
    case 'band': return rect(0, 0, 100, 100, c2) + rect(38, 0, 24, 100, c1)
    // 135° band from 38% to 62% of the gradient line: 76 ≤ x + y ≤ 124 on the 100 box.
    case 'sash': return rect(0, 0, 100, 100, c2) + `<polygon points="76,0 100,0 100,24 24,100 0,100 0,76" fill="${c1}"/>`
    // Conic from 12 o'clock, clockwise: top-right c1, bottom-right c2, bottom-left c1, top-left c2.
    case 'quarters': return rect(0, 0, 100, 100, c2) + rect(50, 0, 50, 50, c1) + rect(0, 50, 50, 50, c1)
    default: return rect(0, 0, 100, 100, c1)
  }
}

/** FNV-1a: deterministic clip ids, so several marks inline in one document never share one by accident. */
function hash(s: string): string {
  let h = 0x811c9dc5
  for (const ch of new TextEncoder().encode(s)) { h ^= ch; h = Math.imul(h, 0x01000193) >>> 0 }
  return h.toString(36)
}

/** Ink on light surfaces; the paper keyline where ink would not reach 3:1 (dark or club-colour surfaces). */
export const keylineFor = (surface: string) => (contrastHex(INK, surface) >= NON_TEXT_CONTRAST ? INK : PAPER_KEYLINE)
/** The code in ink or paper, whichever reaches 4.5:1 on the surface (ink first). */
export const codeColourFor = (surface: string) => (contrastHex(INK, surface) >= TEXT_CONTRAST ? INK : PAPER_KEYLINE)

/** Keyline width in box units: 4% of the box, raised so it is ≥ 0.5 pt at the tier's smallest size. */
export const keylineUnits = (tier: ClubMarkTier) => Math.max(KEYLINE_SHARE * 100, (MIN_KEYLINE_PT / TIER_SIZES[tier].min) * 100)

export type RenderOptions = {
  /** The surface the mark sits on (default the book's paper). Picks the keyline and code colour. */
  surface?: string
  /** Rendered width in px/pt; default dot 16, token 48, hero 96. */
  size?: number
}

const DEFAULT_SIZE: Record<ClubMarkTier, number> = { dot: 16, token: 48, hero: 96 }

export function renderClubMark(row: ClubMarkRow, tier: ClubMarkTier, { surface = BOOK_PAPER, size = DEFAULT_SIZE[tier] }: RenderOptions = {}): string {
  const withCode = tier !== 'dot'
  const height = withCode ? 134 : 100
  const id = `cm${hash(JSON.stringify([row, tier, surface]))}`
  const k = keylineUnits(tier)
  const shape = SHAPE[row.crest]
  const code = withCode
    ? `<text x="50" y="127" text-anchor="middle" font-family="'Archivo Narrow','Arial Narrow',sans-serif" font-weight="700" font-size="28" letter-spacing="1" fill="${codeColourFor(surface)}">${row.code.replace(/[<>&"]/g, '')}</text>`
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 ${height}" width="${n(size)}" height="${n((size * height) / 100)}">`
    + `<defs><clipPath id="${id}">${shape}</clipPath></defs>`
    + `<g clip-path="url(#${id})">${patternMarkup(row, tier === 'dot')}`
    + shape.replace('/>', ` fill="none" stroke="${keylineFor(surface)}" stroke-width="${n(k * 2)}"/>`)
    + `</g>${code}</svg>`
}
