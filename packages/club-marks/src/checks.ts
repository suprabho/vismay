import { contrastHex, lightness, withLightness } from './color'
import { nearestPrintSwatch, PRINT_SWATCHES, rampOf } from './palette'
import { codeColourFor, keylineFor, narrowestBand } from './render'
import {
  BOOK_PAPER, GRAYSCALE_MIN_L, INK, MIN_BAND_PT, NON_TEXT_CONTRAST, PRINT_SNAP_REVIEW_DELTA_E, TEXT_CONTRAST, TIER_SIZES,
  type ClubMarkCheck, type ClubMarkRow, type PrintSwatch,
} from './types'

/**
 * The six accessibility checks (spec: Accessibility checks) and their auto-fixes.
 * Each reports pass, fixed, fail, review or skipped. Client-safe, so the admin can
 * re-run them live as editors override a row.
 */

const r1 = (v: number) => Math.round(v * 10) / 10

/**
 * Kit bands in grayscale: c1 and c2 ≥ 20 apart in L*. Otherwise c2 moves along its own
 * hue until they are — for a palette swatch, to the nearest step of its own ramp that
 * clears the gap (black and white use the neutral ramp), so the row stays on the palette.
 */
export function grayscaleCheck(row: ClubMarkRow): { check: ClubMarkCheck; row: ClubMarkRow } {
  const label = 'Kit bands in grayscale'
  if (!row.c2 || row.pattern === 'solid') return { check: { id: 'grayscale', label, status: 'skipped', detail: 'Solid kit: one colour.' }, row }
  const l1 = lightness(row.c1), l2 = lightness(row.c2)
  if (Math.abs(l1 - l2) >= GRAYSCALE_MIN_L) {
    return { check: { id: 'grayscale', label, status: 'pass', detail: `L* ${r1(l1)} vs ${r1(l2)} (Δ ${r1(Math.abs(l1 - l2))}).` }, row }
  }
  let c2: string | null = null
  const swatch = PRINT_SWATCHES.find(s => s.hex.toUpperCase() === row.c2!.toUpperCase())
  if (swatch) {
    const ramp = rampOf(swatch.token).length > 1 ? rampOf(swatch.token) : rampOf('neutral-500')
    const ok = ramp.filter(s => Math.abs(s.lab[0] - l1) >= GRAYSCALE_MIN_L).sort((a, b) => Math.abs(a.lab[0] - l2) - Math.abs(b.lab[0] - l2))
    if (ok[0]) c2 = ok[0].hex.toUpperCase()
  } else {
    const away = l2 >= l1 ? 1 : -1
    let target = l1 + away * (GRAYSCALE_MIN_L + 0.5)
    if (target > 100 || target < 0) target = l1 - away * (GRAYSCALE_MIN_L + 0.5)
    const shifted = withLightness(row.c2, target)
    if (Math.abs(lightness(shifted) - l1) >= GRAYSCALE_MIN_L) c2 = shifted
  }
  return {
    check: {
      id: 'grayscale', label, status: c2 ? 'fixed' : 'fail',
      detail: c2 ? `c2 ${row.c2} → ${c2} (L* ${r1(l2)} → ${r1(lightness(c2))}) to clear Δ ${GRAYSCALE_MIN_L} from c1.` : `L* Δ ${r1(Math.abs(l1 - l2))}; no lightness of c2 clears ${GRAYSCALE_MIN_L}.`,
    },
    row: c2 ? { ...row, c2 } : row,
  }
}

/** Silhouette vs page: the keyline reaches 3:1 on the surface (the paper keyline replaces ink where ink cannot). */
export function silhouetteCheck(surface = BOOK_PAPER): ClubMarkCheck {
  const keyline = keylineFor(surface)
  const ratio = contrastHex(keyline, surface)
  const label = 'Silhouette vs page'
  if (ratio < NON_TEXT_CONTRAST) return { id: 'silhouette', label, status: 'fail', detail: `Neither keyline reaches 3:1 on ${surface}.` }
  return {
    id: 'silhouette', label, status: keyline === INK ? 'pass' : 'fixed',
    detail: keyline === INK ? `Ink keyline ${r1(ratio)}:1 on ${surface}.` : `Paper keyline on ${surface} (${r1(ratio)}:1); ink would not reach 3:1.`,
  }
}

/** Pattern legibility: the narrowest band ≥ 0.75 pt at each tier's smallest size (the dot tier uses its reduced pattern). */
export function patternCheck(row: ClubMarkRow): ClubMarkCheck {
  const label = 'Pattern legibility'
  const full = narrowestBand(row.pattern, false)
  if (!row.c2 || full === null) return { id: 'pattern', label, status: 'skipped', detail: 'Solid kit: no bands.' }
  const at = (tier: 'dot' | 'token' | 'hero', reduced: boolean) => narrowestBand(row.pattern, reduced)! * TIER_SIZES[tier].min
  const dot = at('dot', true), token = at('token', false)
  const ok = dot >= MIN_BAND_PT && token >= MIN_BAND_PT
  return {
    id: 'pattern', label, status: ok ? 'pass' : 'fail',
    detail: `Narrowest band ${r1(token)} pt on a 12 pt token, ${r1(dot)} pt on a 12 pt dot (reduced pattern).`,
  }
}

/** Code legibility: the code reaches 4.5:1 on its background (ink or paper, whichever passes). */
export function codeCheck(surface = BOOK_PAPER): ClubMarkCheck {
  const colour = codeColourFor(surface)
  const ratio = contrastHex(colour, surface)
  const label = 'Code legibility'
  if (ratio < TEXT_CONTRAST) return { id: 'code', label, status: 'fail', detail: `Neither ink nor paper reaches 4.5:1 on ${surface}.` }
  return { id: 'code', label, status: colour === INK ? 'pass' : 'fixed', detail: `Code in ${colour === INK ? 'ink' : 'paper'}, ${r1(ratio)}:1 on ${surface}.` }
}

/** Print colour: each kit colour snaps to the nearest swatch; a snap further than ΔE 15 goes to review. */
export function printCheck(kit: { c1: string; c2: string | null }): { check: ClubMarkCheck; swatches: { c1: PrintSwatch; c2: PrintSwatch | null } } {
  const c1 = nearestPrintSwatch(kit.c1)
  const c2 = kit.c2 ? nearestPrintSwatch(kit.c2) : null
  const worst = Math.max(c1.deltaE, c2?.deltaE ?? 0)
  const detail = `Snapped c1 ${kit.c1} → ${c1.token} (ΔE ${c1.deltaE})${c2 ? `, c2 ${kit.c2} → ${c2.token} (ΔE ${c2.deltaE})` : ''}.`
  return {
    check: { id: 'print', label: 'Print colour', status: worst > PRINT_SNAP_REVIEW_DELTA_E ? 'review' : 'pass', detail: worst > PRINT_SNAP_REVIEW_DELTA_E ? `${detail} The palette has nothing close: pick the colour by hand.` : detail },
    swatches: { c1, c2 },
  }
}

/** Two marks side by side read apart: a different family, pattern, or ≥ 20 L* in c1. */
export function marksCollide(a: ClubMarkRow, b: ClubMarkRow): boolean {
  return a.crest === b.crest && a.pattern === b.pattern && Math.abs(lightness(a.c1) - lightness(b.c1)) < GRAYSCALE_MIN_L
}

/** Collision in one fixture, against the clubs this one meets. Codes always sit beside the tokens, so a clash is mitigated. */
export function collisionCheck(row: ClubMarkRow, opponents: ClubMarkRow[] | undefined): ClubMarkCheck {
  const label = 'Collision in one fixture'
  if (!opponents) return { id: 'collision', label, status: 'skipped', detail: 'No fixtures given.' }
  const clash = opponents.filter(o => o.code !== row.code && marksCollide(row, o)).map(o => o.code)
  if (!clash.length) return { id: 'collision', label, status: 'pass', detail: `Reads apart from all ${opponents.length} opponents.` }
  return { id: 'collision', label, status: 'fixed', detail: `Close to ${[...new Set(clash)].sort().join(', ')}: show both codes beside the tokens.` }
}
