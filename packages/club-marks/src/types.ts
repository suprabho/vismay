/**
 * Club Mark Generator contract (spec "Club Mark Generator — Function Spec", Oct 19 2026).
 * Client-safe: types and constants only.
 */

/** Bump when the rules change, so every stored row is regenerated. */
export const CLUB_MARK_SPEC_VERSION = '1.1.0'

export const CREST_FAMILIES = ['roundel', 'heater', 'oval', 'plate'] as const
export const KIT_PATTERNS = ['solid', 'stripes', 'hoops', 'halves', 'sash', 'band', 'quarters'] as const
export type CrestFamily = (typeof CREST_FAMILIES)[number]
export type KitPattern = (typeof KIT_PATTERNS)[number]

export type ClubMarkInput = {
  clubId: string
  name: string
  /** ISO country code of the league, e.g. 'ESP'. */
  league: string
  /** Season start years; `to` null = still current. */
  era: { from: number; to: number | null }
  /** Read to classify the family, then discarded. `data` is an uploaded file's bytes. */
  crest?: { url: string } | { svg: string } | { data: Uint8Array }
  /** Home shirt, hex. Never sampled from the crest. */
  kit?: { pattern: KitPattern; c1: string; c2?: string | null }
  overrides?: { family?: CrestFamily; code?: string }
  isNationalTeam?: boolean
}

/** The stored row: one per club per crest era. Every render is a pure function of it. */
export type ClubMarkRow = {
  code: string
  crest: CrestFamily
  pattern: KitPattern
  c1: string
  c2: string | null
  league: string
  from: number
  to: number | null
}

export type ClubMarkTier = 'dot' | 'token' | 'hero'
export type CheckId = 'grayscale' | 'silhouette' | 'pattern' | 'code' | 'print' | 'collision'
/** `review` = sends the row to the review queue; `skipped` = the check does not apply (e.g. a solid kit). */
export type CheckStatus = 'pass' | 'fixed' | 'fail' | 'review' | 'skipped'
export type ClubMarkCheck = { id: CheckId; label: string; status: CheckStatus; detail: string }

export type PrintSwatch = { token: string; hex: string; cmyk: string; deltaE: number }

export type ClubMarkResult = {
  row: ClubMarkRow
  renders: Record<ClubMarkTier, string>
  /** The row's colours as print swatches (color-palette.json), CMYK. */
  print: { c1: string; c2: string | null }
  /** Each kit colour's snap: the swatch it landed on and how far it moved (CIEDE2000). */
  printSwatches: { c1: PrintSwatch; c2: PrintSwatch | null }
  /** The kit colours as given, before the snap. */
  kitColours: { c1: string; c2: string | null }
  checks: ClubMarkCheck[]
  familyConfidence: number
  needsReview: boolean
  reviewReasons: string[]
  alt: string
  specVersion: string
}

export type ClubMarkErrorCode = 'E_NO_KIT' | 'E_BAD_COLOUR' | 'E_FETCH' | 'E_FORMAT' | 'E_SVG_UNSAFE'

export const CLUB_MARK_ERROR_MESSAGES: Record<ClubMarkErrorCode, string> = {
  E_NO_KIT: 'Kit data missing; colours are never taken from the crest',
  E_BAD_COLOUR: 'A kit colour is not a hex colour',
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

/** Ink keyline, the paper keyline it swaps to on dark or club-colour surfaces, and the book's page. */
export const INK = '#15161A'
export const PAPER_KEYLINE = '#EDECE7'
export const BOOK_PAPER = '#F4F1EA'

export const FAMILY_CONFIDENCE_GATE = 0.75
export const GRAYSCALE_MIN_L = 20
/** Kit colours snap to the nearest print swatch; a snap further than this (CIEDE2000) goes to review. */
export const PRINT_SNAP_REVIEW_DELTA_E = 15
export const NON_TEXT_CONTRAST = 3
export const TEXT_CONTRAST = 4.5
/** Narrowest kit band a tier may print, in points. */
export const MIN_BAND_PT = 0.75
/** Keyline: 4% of the box, never under 0.5 pt. */
export const KEYLINE_SHARE = 0.04
export const MIN_KEYLINE_PT = 0.5

/** Size range of each tier in points (hero has no upper bound). */
export const TIER_SIZES: Record<ClubMarkTier, { min: number; max: number | null }> = {
  dot: { min: 12, max: 16 },
  token: { min: 12, max: 48 },
  hero: { min: 48, max: null },
}

/** Shapes as CSS clip-paths on the token box (the spec's table). The SVG renderer draws the same geometry. */
export const FAMILY_CLIP_PATH: Record<CrestFamily, string> = {
  roundel: 'circle(47% at 50% 50%)',
  heater: 'polygon(6% 4%, 94% 4%, 94% 40%, 91% 58%, 83% 74%, 68% 88%, 50% 97%, 32% 88%, 17% 74%, 9% 58%, 6% 40%)',
  oval: 'ellipse(39% 47% at 50% 50%)',
  plate: 'inset(10% 4% round 18%)',
}
