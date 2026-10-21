import { chargeCheck, chartCheck, grayscaleCheck, printCheck, ringCheck, ringColour } from './checks'
import { isChargeList, isRim, normalizeCharge } from './charges'
import { classifyFamily, crestMask, familyFeatures, type FamilyFeatures } from './classify'
import { parseHex, toHex } from './color'
import { isValidCode, standardCode } from './codes'
import { nearestPrintSwatch } from './palette'
import { renderClubMark } from './render'
import {
  CLUB_MARK_SPEC_VERSION, ClubMarkError, FAMILY_CONFIDENCE_GATE, KIT_PATTERNS,
  type ClubMarkInput, type ClubMarkResult, type ClubMarkRow, type CrestFamily,
} from './types'

/**
 * toClubMark(): a club's data row in, a flat layered mark out (a family shape, a rim of
 * 0–3 bands, the kit-pattern field, and primitive or emblem charges on it), checked in
 * greyscale and at chart size, with CMYK for print.
 *
 *   1 family (from overrides, else the badge looked at once, then set aside)
 *   2 kit colours snapped to the print palette
 *   3 ring colour: c2 if dark enough, else c1 darkened along its ramp
 *   4 checks with auto-fixes: greyscale bands, ring on paper, charges on the field,
 *     chart size, print snap
 *   5 renders: chip (24 px, ring and field), token (~120 px), hero
 *
 * Node only when a crest is passed (sharp); the rest is pure.
 */

export type ClubMarkContext = {
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
  if (input.charges != null && !isChargeList(input.charges)) throw new ClubMarkError('E_BAD_CHARGE', JSON.stringify(input.charges))
  if (input.rim != null && !isRim(input.rim)) throw new ClubMarkError('E_BAD_RIM', JSON.stringify(input.rim))
  const reviewReasons: string[] = []

  // 1. Family: an override, national teams as roundels, else the badge's silhouette.
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
    reviewReasons.push('No badge to read: the family needs setting by hand')
  }

  const code = (input.overrides?.code ?? standardCode(input.name)).toUpperCase()
  if (!isValidCode(code)) reviewReasons.push(`Code “${code}” is not 2–3 letters or digits`)
  if (ctx.takenCodes?.includes(code)) reviewReasons.push(`Code ${code} is already used in this season book`)

  // 2. Kit colours, snapped to the print palette.
  const kitColours = { c1: hex(input.kit.c1), c2: input.kit.c2 ? hex(input.kit.c2) : null }
  const print = printCheck(kitColours)
  const c1 = print.swatches.c1.hex.toUpperCase(), c2 = print.swatches.c2 ? print.swatches.c2.hex.toUpperCase() : null
  const pattern = c2 ? input.kit.pattern : 'solid'
  const snap = (h: string) => nearestPrintSwatch(hex(h)).hex.toUpperCase()
  const charges = (input.charges ?? []).map(c => normalizeCharge({ ...c, colour: snap(c.colour), colours: c.colours?.map(snap) }))
  const rim = input.rim ? input.rim.map(b => ({ colour: snap(b.colour), width: Math.round(b.width * 100) / 100 })) : undefined

  // 3–4. Greyscale first (it may move c2), then the ring from the final colours, then the charges.
  const gray = grayscaleCheck({ code, crest: family, pattern, c1, c2, ring: c1, charges, league: '', from: 0, to: null })
  const derived = ringColour(gray.row.c1, gray.row.c2)
  const ring = rim?.[0]?.colour ?? derived.ring
  const source = rim ? 'rim' as const : derived.source
  const row: ClubMarkRow = {
    code, crest: family, pattern, c1: gray.row.c1, c2: gray.row.c2, ring, ...(rim ? { rim } : {}), charges,
    league: input.isNationalTeam ? '' : input.league, from: input.era.from, to: input.era.to,
  }
  const checks = [gray.check, ringCheck(row, source), chargeCheck(charges, row.c1), chartCheck(row), print.check]
  for (const c of checks) if (c.status === 'fail' || c.status === 'review') reviewReasons.push(`${c.label}: ${c.detail}`)

  const alt = `${input.name} (${code})`
  return {
    row,
    renders: {
      chip: renderClubMark(row, 'chip', { title: alt }),
      token: renderClubMark(row, 'token', { title: alt }),
      hero: renderClubMark(row, 'hero', { title: alt }),
    },
    print: {
      c1: nearestPrintSwatch(row.c1).cmyk, c2: row.c2 ? nearestPrintSwatch(row.c2).cmyk : null,
      ring: nearestPrintSwatch(row.ring).cmyk, rim: (row.rim ?? []).map(b => nearestPrintSwatch(b.colour).cmyk),
      charges: row.charges.map(c => nearestPrintSwatch(c.colour).cmyk),
    },
    printSwatches: print.swatches,
    kitColours,
    checks,
    familyConfidence,
    needsReview: reviewReasons.length > 0,
    reviewReasons,
    alt,
    specVersion: CLUB_MARK_SPEC_VERSION,
    features,
  }
}
