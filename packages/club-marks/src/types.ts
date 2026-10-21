/**
 * toClubMark() contract — the club mark generator (spec 2.2, Oct 21 2026).
 *
 * Turns a club's data row into a flat, print-ready mark for the season books: a shape
 * family, a rim of 0–2 bands, a field in the kit colours, and charges on it — plain
 * shapes or emblems from the house library (simplified crest motifs drawn in Figma).
 * The badge itself is never traced: it is read once to guess the family; emblems are
 * placed by hand. Client-safe: types and constants.
 */
import type { EmblemId } from './emblems'

/** Bump when the rules change, so every stored row is regenerated. */
export const CLUB_MARK_SPEC_VERSION = '2.2.0'

/** The generic silhouette closest to the club's badge in that era. */
export const CREST_FAMILIES = ['roundel', 'heater', 'oval', 'plate', 'hexagon'] as const
/** Home-kit pattern. */
export const KIT_PATTERNS = ['solid', 'stripes', 'hoops', 'halves', 'sleeves', 'band'] as const
/** Plain geometric charges, each in one colour. Emblems (EMBLEMS in ./emblems) are the other kind of charge. */
export const CHARGE_SHAPES = [
  'circle', 'triangle', 'triangle-down', 'square', 'diamond', 'bar', 'chevron', 'star', 'cross', 'ring', 'half', 'hexagon',
] as const
export type CrestFamily = (typeof CREST_FAMILIES)[number]
export type KitPattern = (typeof KIT_PATTERNS)[number]
export type PrimitiveShape = (typeof CHARGE_SHAPES)[number]
export type ChargeShape = PrimitiveShape | EmblemId
/** field: drawn at every size, just over the kit pattern · emblem (default): token and hero only · over: above the rim. */
export const CHARGE_LAYERS = ['field', 'emblem', 'over'] as const
export type ChargeLayer = (typeof CHARGE_LAYERS)[number]
/**
 * One shape on the field. Placed on the family's anchor (where the shield is widest) and
 * moved from there: `x`/`y` in box units (the mark is 100 across), `scale` × its natural
 * size (a primitive: the anchor; an emblem: as drawn), `sx`/`sy` stretch it, `rotate` in
 * degrees about its own centre. `colour` fills slot a; `colours` fill an emblem's slots b, c….
 */
export type Charge = {
  shape: ChargeShape
  colour: string
  colours?: string[]
  scale?: number
  rotate?: number
  x?: number
  y?: number
  sx?: number
  sy?: number
  layer?: ChargeLayer
}
/** Limits on a charge's transform, and how many a mark can carry. */
export const CHARGE_LIMITS = { scale: [0.1, 4], stretch: [0.1, 6], rotate: [-180, 180], offset: [-60, 60], count: 10, colours: 5 } as const

/** One band of the rim, from the edge inward: its colour and width in box units. */
export type RimBand = { colour: string; width: number }
export const RIM_LIMITS = { width: [0.2, 20], bands: 3 } as const

export type ClubMarkInput = {
  clubId: string
  name: string
  /** League or country code, e.g. 'ENG'. */
  league: string
  /** The season range the row applies to (start years; `to` null = still current). */
  era: { from: number; to: number | null }
  /** Looked at once to pick the family, then set aside. `data` is an uploaded file's bytes. */
  crest?: { url: string } | { svg: string } | { data: Uint8Array }
  /** Home kit, hex colours. */
  kit?: { pattern: KitPattern; c1: string; c2?: string | null }
  overrides?: { family?: CrestFamily; code?: string }
  /** The rim, edge first. Omitted = the default ring (ring colour 9 + white gap 3); [] = no rim. */
  rim?: RimBand[] | null
  /** Drawn in order, so later shapes sit on top. */
  charges?: Charge[]
  isNationalTeam?: boolean
}

/** The stored row: one per club per era. Every render is a pure function of it. */
export type ClubMarkRow = {
  code: string
  crest: CrestFamily
  pattern: KitPattern
  c1: string
  c2: string | null
  /** The ring colour: the rim's first band, else c2 if dark enough, else a darkened c1. */
  ring: string
  /** The rim, edge first; undefined = the default ring + white gap; [] = none. */
  rim?: RimBand[]
  /** Shapes on the field, bottom first. Empty = none yet. */
  charges: Charge[]
  league: string
  from: number
  to: number | null
}

/** chip = 24 px, ring and field only (charts, tables); token ≈ 120 px (team spreads); hero = chapter openers. */
export type ClubMarkTier = 'chip' | 'token' | 'hero'
export type CheckId = 'grayscale' | 'chart' | 'ring' | 'charge' | 'print'
/** `review` sends the row to the review queue; `skipped` = the check does not apply (e.g. a solid kit). */
export type CheckStatus = 'pass' | 'fixed' | 'fail' | 'review' | 'skipped'
export type ClubMarkCheck = { id: CheckId; label: string; status: CheckStatus; detail: string }

export type PrintSwatch = { token: string; hex: string; cmyk: string; deltaE: number }

export type ClubMarkResult = {
  row: ClubMarkRow
  renders: Record<ClubMarkTier, string>
  /** The mark's colours in CMYK for print: c1, c2, ring and each charge. */
  print: { c1: string; c2: string | null; ring: string; rim: string[]; charges: string[] }
  /** Each kit colour's snap to the print palette and how far it moved (CIEDE2000). */
  printSwatches: { c1: PrintSwatch; c2: PrintSwatch | null }
  kitColours: { c1: string; c2: string | null }
  checks: ClubMarkCheck[]
  familyConfidence: number
  needsReview: boolean
  reviewReasons: string[]
  alt: string
  specVersion: string
}

export type ClubMarkErrorCode = 'E_NO_KIT' | 'E_BAD_COLOUR' | 'E_BAD_CHARGE' | 'E_BAD_RIM' | 'E_FETCH' | 'E_FORMAT' | 'E_SVG_UNSAFE'

export const CLUB_MARK_ERROR_MESSAGES: Record<ClubMarkErrorCode, string> = {
  E_NO_KIT: 'Kit data missing; colours are never taken from the crest',
  E_BAD_COLOUR: 'A colour is not a hex colour',
  E_BAD_CHARGE: 'Charges are primitives or library emblems with hex colours, up to 10, scale 0.1–4, stretch 0.1–6, rotation ±180° and offsets ±60',
  E_BAD_RIM: 'A rim is up to 3 bands, each a hex colour and a width of 0.2–20',
  E_FETCH: 'Crest unreachable or not an image',
  E_FORMAT: 'Crest is not a PNG, JPEG, WebP, GIF or SVG',
  E_SVG_UNSAFE: 'Crest SVG could not be sanitised',
}

export class ClubMarkError extends Error {
  constructor(readonly code: ClubMarkErrorCode, detail?: string) {
    super(detail ? `${CLUB_MARK_ERROR_MESSAGES[code]}: ${detail}` : CLUB_MARK_ERROR_MESSAGES[code])
    this.name = 'ClubMarkError'
  }
}

export const INK = '#15161A'
export const WHITE = '#FFFFFF'
export const BOOK_PAPER = '#F4F1EA'

export const FAMILY_CONFIDENCE_GATE = 0.75
/** Greyscale: kit bands, ring and field, and charge and disc must sit this far apart in L*. */
export const GRAYSCALE_MIN_L = 20
/** A ring is "dark enough" when it reaches this contrast on the book's paper. */
export const RING_MIN_CONTRAST = 4.5
/** A charge should reach this contrast on the field's main colour (WCAG 1.4.11). */
export const CHARGE_MIN_CONTRAST = 3
/** Kit colours snap to the print palette; a snap further than this (CIEDE2000) goes to review. */
export const PRINT_SNAP_REVIEW_DELTA_E = 15
/** Chart size: at 24 px every ring, gap and kit band must stay at least this wide, in pixels. */
export const CHIP_PX = 24
export const MIN_CHIP_FEATURE_PX = 1

/** Default render widths in px. */
export const TIER_PX: Record<ClubMarkTier, number> = { chip: 24, token: 120, hero: 360 }
