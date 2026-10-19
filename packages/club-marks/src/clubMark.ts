import { parseHex, toHex } from './color'
import { classifyFamily, crestMask, familyFeatures, type FamilyFeatures } from './classify'
import { codeCheck, collisionCheck, grayscaleCheck, patternCheck, printCheck, silhouetteCheck } from './checks'
import { isValidCode, standardCode } from './codes'
import { nearestPrintSwatch } from './palette'
import { renderClubMark } from './render'
import {
  BOOK_PAPER, CLUB_MARK_SPEC_VERSION, ClubMarkError, FAMILY_CONFIDENCE_GATE, KIT_PATTERNS,
  type ClubMarkInput, type ClubMarkResult, type ClubMarkRow, type CrestFamily,
} from './types'

/**
 * toClubMark(): a club's crest (read once, for its family) and home kit in; the
 * club-mark row, its dot / token / hero SVGs, the six checks and the review verdict
 * out (spec: Club Mark Generator, Oct 19 2026).
 *
 *   1 classify family → 2 confidence gate (< 0.75 or no crest → review) → 3 build row
 *   (code; pattern, c1, c2 from the kit only) → 4 snap c1 and c2 to the nearest print
 *   swatches (the row carries the swatches; a snap over ΔE 15 → review) → 5 checks
 *   → 6 auto-fix (c2 along its swatch ramp, keyline swap) → 7 render tiers. Storing the
 *   row is the caller's step 8.
 *
 * Node only when a crest is passed (sharp); the rest is pure.
 */

export type ClubMarkContext = {
  /** The surface the marks sit on; default the book's paper. */
  surface?: string
  /** Rows of the clubs this one meets, for the fixture-collision check. */
  opponents?: ClubMarkRow[]
  /** Codes other clubs in the same season book already hold. */
  takenCodes?: string[]
}

const hex = (v: string) => {
  try {
    return toHex(parseHex(v)).toUpperCase()
  } catch {
    throw new ClubMarkError('E_BAD_COLOUR', v)
  }
}

export async function toClubMark(input: ClubMarkInput, ctx: ClubMarkContext = {}): Promise<ClubMarkResult & { features: FamilyFeatures | null }> {
  if (!input.kit?.c1) throw new ClubMarkError('E_NO_KIT')
  if (!KIT_PATTERNS.includes(input.kit.pattern)) throw new ClubMarkError('E_NO_KIT', `unknown pattern ${input.kit.pattern}`)
  const reviewReasons: string[] = []

  // 1–2. Family: an override skips classification; national teams are always roundels.
  let family: CrestFamily, familyConfidence: number, features: FamilyFeatures | null = null
  if (input.overrides?.family) {
    family = input.overrides.family; familyConfidence = 1
  } else if (input.isNationalTeam) {
    family = 'roundel'; familyConfidence = 1
  } else if (input.crest) {
    features = familyFeatures(await crestMask(input.crest))
    const c = classifyFamily(features)
    family = c.family; familyConfidence = c.confidence
    if (familyConfidence < FAMILY_CONFIDENCE_GATE) reviewReasons.push(`Family guess ${family} at ${familyConfidence} confidence (under ${FAMILY_CONFIDENCE_GATE})`)
  } else {
    family = 'roundel'; familyConfidence = 0
    reviewReasons.push('No crest: the family needs an override')
  }

  // 3. Row: code from the override or the standard abbreviation; colours from the kit only.
  const code = (input.overrides?.code ?? standardCode(input.name)).toUpperCase()
  if (!isValidCode(code)) reviewReasons.push(`Code “${code}” is not 2–3 letters or digits`)
  if (ctx.takenCodes?.includes(code)) reviewReasons.push(`Code ${code} is already used in this season book`)
  const kitColours = { c1: hex(input.kit.c1), c2: input.kit.c2 && input.kit.pattern !== 'solid' ? hex(input.kit.c2) : null }

  // 4. Snap to the print palette: the row's colours are swatches, so screen and print agree.
  const print = printCheck(kitColours)
  const swatchHex = (s: { hex: string }) => s.hex.toUpperCase()
  let row: ClubMarkRow = {
    code, crest: family, pattern: kitColours.c2 ? input.kit.pattern : 'solid',
    c1: swatchHex(print.swatches.c1), c2: print.swatches.c2 ? swatchHex(print.swatches.c2) : null,
    league: input.isNationalTeam ? '' : input.league, from: input.era.from, to: input.era.to,
  }

  // 5–6. Checks with their auto-fixes (the grayscale fix moves c2 along its ramp; the keyline and code swap at render).
  const surface = ctx.surface ?? BOOK_PAPER
  const gray = grayscaleCheck(row)
  row = gray.row
  const checks = [gray.check, silhouetteCheck(surface), patternCheck(row), codeCheck(surface), print.check, collisionCheck(row, ctx.opponents)]
  for (const c of checks) if (c.status === 'fail' || c.status === 'review') reviewReasons.push(`${c.label}: ${c.detail}`)

  // 7. Render tiers.
  const renders = {
    dot: renderClubMark(row, 'dot', { surface }),
    token: renderClubMark(row, 'token', { surface }),
    hero: renderClubMark(row, 'hero', { surface }),
  }
  return {
    row,
    renders,
    print: { c1: nearestPrintSwatch(row.c1).cmyk, c2: row.c2 ? nearestPrintSwatch(row.c2).cmyk : null },
    printSwatches: print.swatches,
    kitColours,
    checks,
    familyConfidence,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    alt: `${input.name} (${code})`,
    specVersion: CLUB_MARK_SPEC_VERSION,
    features,
  }
}
