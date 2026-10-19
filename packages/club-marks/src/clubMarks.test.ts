// Run: pnpm --filter @vismay/club-marks test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { contrastHex, deltaE2000, hexToLab, lightness, withLightness } from './color'
import { codeCheck, collisionCheck, grayscaleCheck, marksCollide, patternCheck, printCheck, silhouetteCheck } from './checks'
import { standardCode } from './codes'
import { nearestPrintSwatch, PRINT_SWATCHES } from './palette'
import { renderClubMark } from './render'
import { ClubMarkError, INK, PAPER_KEYLINE, type ClubMarkRow } from './types'
import { toClubMark } from './index'

const BAR: ClubMarkRow = { code: 'BAR', crest: 'heater', pattern: 'stripes', c1: '#A50044', c2: '#004D98', league: 'ESP', from: 2003, to: 2003 }

test('colour maths: CIEDE2000 reference pair, L*, hue-preserving lightness', () => {
  // Sharma et al. test data, pair 1: ΔE00 = 2.0425.
  assert.equal(Math.round(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]) * 10000) / 10000, 2.0425)
  assert.equal(Math.round(lightness('#ffffff')), 100)
  assert.equal(Math.round(lightness('#000000')), 0)
  assert.equal(Math.round(lightness(withLightness('#004D98', 60))), 60)
})

test('print palette: 22 families × 11 steps plus black and white; snapping reports ΔE, near-ties keep the hue', () => {
  assert.match(nearestPrintSwatch('#FF0000').token, /^red-/)
  assert.equal(nearestPrintSwatch('#FFFFFF').token, 'white')
  assert.equal(PRINT_SWATCHES.length, 22 * 11 + 2)
  const s = nearestPrintSwatch('#f7f7f7')
  assert.equal(s.deltaE, 0)
  assert.match(s.cmyk, /^cmyk\(/)
  assert.ok(nearestPrintSwatch('#A50044').deltaE > 0)
})

test('codes: standard abbreviations, then the first distinctive word', () => {
  assert.equal(standardCode('Manchester United'), 'MUN')
  assert.equal(standardCode('Atlético Madrid'), 'ATM')
  assert.equal(standardCode('Arsenal'), 'ARS')
  assert.equal(standardCode('Newcastle United'), 'NEW')
  assert.equal(standardCode('FC Barcelona'), 'BAR')
  assert.equal(standardCode('1. FC Köln'), 'KOE')
})

test('renders: a pure function of the row, byte-identical, the spec geometry and colours', () => {
  const token = renderClubMark(BAR, 'token')
  assert.equal(token, renderClubMark({ ...BAR }, 'token'))
  assert.match(token, /<polygon points="6,4 94,4 94,40 91,58 83,74 68,88 50,97 32,88 17,74 9,58 6,40"/)
  assert.match(token, /#A50044/)
  assert.match(token, /#004D98/)
  assert.match(token, />BAR<\/text>/)
  assert.equal((token.match(/<rect /g) ?? []).length, 8) // full stripes: 8 bands
  const dot = renderClubMark(BAR, 'dot')
  assert.equal((dot.match(/<rect /g) ?? []).length, 4) // reduced: half the bands
  assert.doesNotMatch(dot, /<text/) // dots carry no code
  assert.match(renderClubMark(BAR, 'token', { surface: '#15161A' }), new RegExp(`stroke="${PAPER_KEYLINE}"`))
  assert.match(renderClubMark(BAR, 'token'), new RegExp(`stroke="${INK}"`))
  // Quarters drop to halves at the dot tier.
  const q = { ...BAR, pattern: 'quarters' as const }
  assert.equal((renderClubMark(q, 'token').match(/<rect /g) ?? []).length, 3)
  assert.equal((renderClubMark(q, 'dot').match(/<rect /g) ?? []).length, 2)
})

test('checks: grayscale fix, keyline and code swaps, pattern, print, collisions', () => {
  const g = grayscaleCheck(BAR)
  assert.equal(g.check.status, 'fixed') // the spec's BAR colours sit ~2.5 L* apart
  assert.ok(Math.abs(lightness(g.row.c2!) - lightness(BAR.c1)) >= 20)
  assert.ok(deltaE2000(hexToLab(g.row.c2!), hexToLab(BAR.c2!)) > 0)
  assert.equal(grayscaleCheck({ ...BAR, c1: '#FFFFFF', c2: '#000000' }).check.status, 'pass')
  assert.equal(grayscaleCheck({ ...BAR, pattern: 'solid', c2: null }).check.status, 'skipped')
  assert.equal(silhouetteCheck().status, 'pass')
  assert.equal(silhouetteCheck('#15161A').status, 'fixed')
  assert.equal(codeCheck('#15161A').status, 'fixed')
  assert.ok(contrastHex(PAPER_KEYLINE, '#15161A') >= 4.5)
  assert.equal(patternCheck(BAR).status, 'pass')
  assert.equal(printCheck({ c1: '#f7f7f7', c2: null }).check.status, 'pass')
  assert.equal(printCheck({ c1: '#DD0000', c2: '#FFFFFF' }).check.status, 'pass') // ΔE ~9: snaps, no review
  assert.equal(printCheck({ c1: '#0000FF', c2: null }).check.status, 'review') // nothing close in the palette
  const twin = { ...BAR, code: 'XYZ', c1: '#B00040' }
  assert.ok(marksCollide(BAR, twin))
  assert.equal(collisionCheck(BAR, [twin]).status, 'fixed')
  assert.equal(collisionCheck(BAR, [{ ...twin, crest: 'roundel' }]).status, 'pass')
  assert.equal(collisionCheck(BAR, undefined).status, 'skipped')
})

const svg = (shape: string, w = 100, h = 100) => ({ svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${shape}</svg>` })
const kit = { pattern: 'stripes' as const, c1: '#FFFFFF', c2: '#000000' }
const base = { clubId: 'x', name: 'Juventus', league: 'ITA', era: { from: 2002, to: 2016 }, kit }

test('toClubMark: families from silhouettes; the crest never reaches the output', async () => {
  const families = {
    roundel: svg('<circle cx="50" cy="50" r="48" fill="#123456"/>'),
    oval: svg('<ellipse cx="40" cy="60" rx="38" ry="58" fill="#123456"/>', 80, 120),
    heater: svg('<path d="M5 5H95V45Q95 80 50 98Q5 80 5 45Z" fill="#123456"/>'),
    plate: svg('<rect x="2" y="15" width="96" height="70" fill="#123456"/>'),
  }
  for (const [family, crest] of Object.entries(families)) {
    const r = await toClubMark({ ...base, crest })
    assert.equal(r.row.crest, family, `${family}: got ${r.row.crest} (${JSON.stringify(r.features)})`)
    assert.ok(r.familyConfidence >= 0.75, `${family} confidence ${r.familyConfidence}`)
    for (const markup of Object.values(r.renders)) assert.doesNotMatch(markup, /#123456/i)
  }
})

test('toClubMark: the review gates, overrides and E_NO_KIT', async () => {
  const noCrest = await toClubMark({ ...base })
  assert.ok(noCrest.needsReview)
  assert.equal(noCrest.familyConfidence, 0)
  const forced = await toClubMark({ ...base, overrides: { family: 'oval', code: 'juv' } })
  assert.equal(forced.row.crest, 'oval')
  assert.equal(forced.row.code, 'JUV')
  assert.equal(forced.alt, 'Juventus (JUV)')
  assert.equal(forced.needsReview, false)
  const taken = await toClubMark({ ...base, overrides: { family: 'oval' } }, { takenCodes: ['JUV'] })
  assert.ok(taken.reviewReasons.some(r => r.includes('already used')))
  const national = await toClubMark({ ...base, isNationalTeam: true })
  assert.equal(national.row.crest, 'roundel')
  assert.equal(national.row.league, '')
  const solid = await toClubMark({ ...base, overrides: { family: 'heater' }, kit: { pattern: 'stripes', c1: '#EF0107' } })
  assert.equal(solid.row.pattern, 'solid')
  assert.equal(solid.checks.find(c => c.id === 'grayscale')!.status, 'skipped')
  await assert.rejects(toClubMark({ ...base, kit: undefined }), (e: unknown) => e instanceof ClubMarkError && e.code === 'E_NO_KIT')
  await assert.rejects(toClubMark({ ...base, kit: { pattern: 'solid', c1: 'red' } }), (e: unknown) => e instanceof ClubMarkError && e.code === 'E_BAD_COLOUR')
})

test('toClubMark: kit colours snap to print swatches; the grayscale fix stays on the palette', async () => {
  const swatches = new Set(PRINT_SWATCHES.map(s => s.hex.toUpperCase()))
  const bar = await toClubMark({ clubId: 'barcelona', name: 'FC Barcelona', league: 'ESP', era: { from: 2003, to: 2003 },
    overrides: { family: 'heater' }, kit: { pattern: 'stripes', c1: '#A50044', c2: '#004D98' } })
  assert.equal(bar.row.crest, 'heater')
  assert.equal(bar.row.pattern, 'stripes')
  assert.ok(swatches.has(bar.row.c1) && swatches.has(bar.row.c2!), `${bar.row.c1} / ${bar.row.c2}`)
  assert.equal(bar.printSwatches.c1.token, 'pink-800')
  assert.equal(bar.kitColours.c1, '#A50044')
  assert.ok(Math.abs(lightness(bar.row.c1) - lightness(bar.row.c2!)) >= 20)
  assert.match(bar.row.c2!, /^#/)
  assert.ok(bar.printSwatches.c2!.token.startsWith('blue-'))
  assert.ok(!bar.needsReview, bar.reviewReasons.join('; '))
  const blue = await toClubMark({ ...base, overrides: { family: 'roundel' }, kit: { pattern: 'solid', c1: '#0000FF' } })
  assert.ok(swatches.has(blue.row.c1))
  assert.ok(blue.needsReview && blue.reviewReasons.some(r => r.startsWith('Print colour')))
})
