import { contrastHex, lightness, withLightness } from './color'
import { nearestPrintSwatch, PRINT_SWATCHES, rampOf } from './palette'
import { fieldInset, narrowestBand, rimBands } from './render'
import {
  BOOK_PAPER, CHARGE_MIN_CONTRAST, CHIP_PX, GRAYSCALE_MIN_L, INK, MIN_CHIP_FEATURE_PX, PRINT_SNAP_REVIEW_DELTA_E, RING_MIN_CONTRAST, WHITE,
  type Charge, type ClubMarkCheck, type ClubMarkRow, type PrintSwatch,
} from './types'

/**
 * The checks every mark passes before it is accepted (greyscale and chart size, plus
 * the ring, charge and print rules), with their auto-fixes. Client-safe, so the admin
 * can re-run them live.
 */

const r1 = (v: number) => Math.round(v * 10) / 10
const swatchOf = (hex: string) => PRINT_SWATCHES.find(s => s.hex.toUpperCase() === hex.toUpperCase())
/** A swatch's own ramp, light to dark; black and white walk the neutral ramp. */
const ramp = (hex: string) => {
  const s = swatchOf(hex)
  return s && rampOf(s.token).length > 1 ? rampOf(s.token) : rampOf('neutral-500')
}

/** Move `colour` along its own hue (its swatch ramp) to the nearest step ≥ 20 L* from `against`. */
function separate(colour: string, against: string): string | null {
  const l1 = lightness(against), l2 = lightness(colour)
  if (swatchOf(colour)) {
    const ok = ramp(colour).filter(s => Math.abs(s.lab[0] - l1) >= GRAYSCALE_MIN_L).sort((a, b) => Math.abs(a.lab[0] - l2) - Math.abs(b.lab[0] - l2))
    return ok[0] ? ok[0].hex.toUpperCase() : null
  }
  const away = l2 >= l1 ? 1 : -1
  let target = l1 + away * (GRAYSCALE_MIN_L + 0.5)
  if (target > 100 || target < 0) target = l1 - away * (GRAYSCALE_MIN_L + 0.5)
  const shifted = withLightness(colour, target)
  return Math.abs(lightness(shifted) - l1) >= GRAYSCALE_MIN_L ? shifted : null
}

/** Greyscale, kit bands: on a patterned kit c1 and c2 sit ≥ 20 L* apart; otherwise c2 moves along its ramp. */
export function grayscaleCheck(row: ClubMarkRow): { check: ClubMarkCheck; row: ClubMarkRow } {
  const label = 'Greyscale'
  if (!row.c2 || row.pattern === 'solid') {
    return { check: { id: 'grayscale', label, status: 'pass', detail: 'Solid field; the white gap parts it from the ring.' }, row }
  }
  const gap = Math.abs(lightness(row.c1) - lightness(row.c2))
  if (gap >= GRAYSCALE_MIN_L) return { check: { id: 'grayscale', label, status: 'pass', detail: `Kit bands Δ L* ${r1(gap)}.` }, row }
  const c2 = separate(row.c2, row.c1)
  if (!c2) return { check: { id: 'grayscale', label, status: 'fail', detail: `Kit bands Δ L* ${r1(gap)}; no step of c2 clears ${GRAYSCALE_MIN_L}.` }, row }
  return {
    check: { id: 'grayscale', label, status: 'fixed', detail: `c2 ${row.c2} → ${c2} so the kit bands read in greyscale (Δ L* ${r1(gap)} → ${r1(Math.abs(lightness(row.c1) - lightness(c2)))}).` },
    row: { ...row, c2 },
  }
}

/** How much darker than c1 a ring taken from c1 must be, in L*, to read as a ring. */
const RING_DARKER_L = 15

/**
 * The ring colour: c2 if it is dark enough on the paper, otherwise c1 darkened along its
 * own ramp (the lightest step that is dark enough and clearly darker than c1; white and
 * very light kits land on a dark neutral), else ink.
 */
export function ringColour(c1: string, c2: string | null): { ring: string; source: 'c2' | 'c1' | 'ink' } {
  if (c2 && contrastHex(c2, BOOK_PAPER) >= RING_MIN_CONTRAST) return { ring: c2, source: 'c2' }
  const l1 = lightness(c1)
  const steps = ramp(c1).filter(s => contrastHex(s.hex, BOOK_PAPER) >= RING_MIN_CONTRAST && s.lab[0] <= l1 - RING_DARKER_L)
    .sort((a, b) => b.lab[0] - a.lab[0])
  return steps[0] ? { ring: steps[0].hex.toUpperCase(), source: 'c1' } : { ring: INK, source: 'ink' }
}

/** The mark's edge must hold on the paper: the rim's outer band, or the field when there is no rim. */
export function ringCheck(row: ClubMarkRow, source: 'c2' | 'c1' | 'ink' | 'rim'): ClubMarkCheck {
  const edge = row.rim && !row.rim.length ? row.c1 : row.ring
  const ratio = contrastHex(edge, BOOK_PAPER)
  const from = row.rim && !row.rim.length ? `the field (no rim), ${edge}` : source === 'rim' ? `the rim's outer band ${edge}` : source === 'c2' ? 'c2' : source === 'c1' ? `c1 darkened (${row.c1} → ${row.ring})` : 'ink'
  // A drawn rim (or none) is a design choice: it needs 3:1 (a graphic object), and a weak edge goes to review, not fail.
  const status = row.rim ? (ratio >= CHARGE_MIN_CONTRAST ? 'pass' : 'review') : ratio >= RING_MIN_CONTRAST ? 'pass' : 'fail'
  return { id: 'ring', label: 'Edge on paper', status, detail: `Edge from ${from}, ${r1(ratio)}:1 on the paper.` }
}

/**
 * The charges should read on the field's main colour (≥ 3:1). They are placed by hand and
 * often sit on c2, a band or another charge, so only a mark where none of its emblem-layer
 * charges reads on c1 goes to review; nothing is recoloured.
 */
export function chargeCheck(charges: Charge[], c1: string): ClubMarkCheck {
  const label = 'Charges'
  const main = charges.filter(c => (c.layer ?? 'emblem') === 'emblem')
  if (!main.length) return { id: 'charge', label, status: 'skipped', detail: charges.length ? 'Field and over-rim charges only.' : 'No charges yet.' }
  const ratios = main.map(c => ({ c, ratio: contrastHex(c.colour, c1) }))
  const best = ratios.reduce((a, b) => (b.ratio > a.ratio ? b : a))
  if (best.ratio >= CHARGE_MIN_CONTRAST) return { id: 'charge', label, status: 'pass', detail: `${main.length} charge${main.length > 1 ? 's' : ''}; ${best.c.shape} reads ${r1(best.ratio)}:1 on ${c1}.` }
  return { id: 'charge', label, status: 'review', detail: `No charge reads on ${c1}: the best is ${best.c.shape} ${best.c.colour} at ${r1(best.ratio)}:1.` }
}

/** Chart size: at 24 px each rim band and the narrowest kit band are ≥ 1 px. */
export function chartCheck(row: ClubMarkRow): ClubMarkCheck {
  const px = (units: number) => (units / 100) * CHIP_PX
  const band = row.c2 && row.pattern !== 'solid' ? narrowestBand(row.pattern, fieldInset(row, 'chip')) : null
  const parts: (readonly [string, number])[] = [
    ...rimBands(row, 'chip').map((b, i) => [i ? `rim band ${i + 1}` : 'rim', px(b.width)] as const),
    ...(band !== null ? [['band', px(band)] as const] : []),
  ]
  if (!parts.length) return { id: 'chart', label: 'Chart size (24 px)', status: 'pass', detail: 'No rim and a solid field.' }
  const thin = parts.filter(([, v]) => v < MIN_CHIP_FEATURE_PX)
  return {
    id: 'chart', label: 'Chart size (24 px)', status: thin.length ? 'fail' : 'pass',
    detail: parts.map(([k, v]) => `${k} ${r1(v)} px`).join(', ') + '.',
  }
}

/** Print: each kit colour snaps to the nearest swatch; a snap over ΔE 15 goes to review. */
export function printCheck(kit: { c1: string; c2: string | null }): { check: ClubMarkCheck; swatches: { c1: PrintSwatch; c2: PrintSwatch | null } } {
  const c1 = nearestPrintSwatch(kit.c1)
  const c2 = kit.c2 ? nearestPrintSwatch(kit.c2) : null
  const worst = Math.max(c1.deltaE, c2?.deltaE ?? 0)
  const detail = `c1 ${kit.c1} → ${c1.token} ${c1.cmyk} (ΔE ${c1.deltaE})${c2 ? `, c2 ${kit.c2} → ${c2.token} ${c2.cmyk} (ΔE ${c2.deltaE})` : ''}.`
  return {
    check: { id: 'print', label: 'Print (CMYK)', status: worst > PRINT_SNAP_REVIEW_DELTA_E ? 'review' : 'pass', detail: worst > PRINT_SNAP_REVIEW_DELTA_E ? `${detail} The palette has nothing close: pick the colour by hand.` : detail },
    swatches: { c1, c2 },
  }
}
