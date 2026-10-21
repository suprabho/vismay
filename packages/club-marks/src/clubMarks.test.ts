// Run: pnpm --filter @vismay/club-marks test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chargesFromText, chargesToText, isCharge, rimFromText, rimToText } from './charges'
import { EMBLEM_IDS } from './emblems'
import { chargeCheck, chartCheck, grayscaleCheck, printCheck, ringColour } from './checks'
import { contrastHex, deltaE2000, lightness, withLightness } from './color'
import { standardCode } from './codes'
import { nearestPrintSwatch, PRINT_SWATCHES } from './palette'
import { renderClubMark, withClipUid } from './render'
import { BOOK_PAPER, CHARGE_SHAPES, ClubMarkError, type ClubMarkRow } from './types'
import { toClubMark } from './index'

const ROW: ClubMarkRow = {
  code: 'BAR', crest: 'heater', pattern: 'stripes', c1: '#A50044', c2: '#004D98', ring: '#15161A',
  charges: [{ shape: 'triangle', colour: '#A50044' }], league: 'ESP', from: 2003, to: 2003,
}

test('colour maths: CIEDE2000 reference pair, L*, hue-preserving lightness', () => {
  assert.equal(Math.round(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485]) * 10000) / 10000, 2.0425)
  assert.equal(Math.round(lightness('#ffffff')), 100)
  assert.equal(Math.round(lightness(withLightness('#004D98', 60))), 60)
})

test('print palette and codes', () => {
  assert.equal(PRINT_SWATCHES.length, 22 * 11 + 2)
  assert.equal(nearestPrintSwatch('#f7f7f7').deltaE, 0)
  assert.match(nearestPrintSwatch('#FF0000').token, /^red-/)
  assert.equal(standardCode('Manchester United'), 'MUN')
  assert.equal(standardCode('Arsenal'), 'ARS')
})

test('charges: primitives and emblems with a transform, stored as "shape:#a/#b@scale,rotate,x,y[,sx,sy][~layer];…"', () => {
  assert.equal(CHARGE_SHAPES.length, 12)
  assert.ok(EMBLEM_IDS.includes('lion-rampant') && EMBLEM_IDS.includes('cockerel'))
  assert.deepEqual(chargesFromText('chevron:#cf2d36'), [{ shape: 'chevron', colour: '#CF2D36' }])
  const list = [{ shape: 'bar' as const, colour: '#000000' }, { shape: 'star' as const, colour: '#CF2D36', scale: 0.5, rotate: 15, x: -12, y: 8.25 }]
  assert.equal(chargesToText(list), 'bar:#000000;star:#CF2D36@0.5,15,-12,8.3')
  assert.deepEqual(chargesFromText(chargesToText(list)), [list[0], { ...list[1], y: 8.3 }])
  // Emblems take several colours, a stretch and a layer.
  const band = { shape: 'band' as const, colour: '#009A8E', y: -28, sx: 1, sy: 0.5, layer: 'over' as const }
  assert.equal(chargesToText([band]), 'band:#009A8E@1,0,0,-28,1,0.5~over')
  assert.deepEqual(chargesFromText('band:#009a8e@1,0,0,-28,1,0.5~over'), [{ shape: 'band', colour: '#009A8E', y: -28, sy: 0.5, layer: 'over' }])
  assert.deepEqual(chargesFromText('tree:#000000/#2E8B57'), [{ shape: 'tree', colour: '#000000', colours: ['#2E8B57'] }])
  assert.deepEqual(chargesFromText('griffin:#CF2D36'), []) // not in the library
  assert.deepEqual(chargesFromText('circle:#000000@9,0,0,0'), []) // scale out of range
  assert.deepEqual(chargesFromText(''), [])
  assert.ok(!isCharge({ shape: 'lion', colour: '#000000' }))
})

test('renders: field, charges, white gap, ring; no disc; chip has no charges; pure and byte-identical', () => {
  const token = renderClubMark(ROW, 'token')
  assert.equal(token, renderClubMark({ ...ROW }, 'token'))
  // A uid re-keys the clip id so copies in one page never share it (a hidden first copy would unclip the rest).
  const id = token.match(/clipPath id="(cm[0-9a-z]+)"/)![1]
  const keyed = renderClubMark(ROW, 'token', { uid: ':r4:' })
  assert.match(keyed, new RegExp(`clipPath id="${id}-r4"`))
  assert.match(keyed, new RegExp(`clip-path="url\\(#${id}-r4\\)"`))
  assert.equal(withClipUid(token, ':r4:'), keyed)
  assert.match(token, /<path d="M6 4.17H94V40.17C/) // heater, as redrawn
  assert.match(token, /stroke="#FFFFFF" stroke-width="24"/) // gap: (ring 9 + gap 3) × 2
  assert.match(token, /stroke="#15161A" stroke-width="18"/) // ring 9 × 2
  assert.doesNotMatch(token, /fill="#FFFFFF"/) // no white disc
  assert.match(token, /<g transform="translate\(50 43\)"><polygon points="[^"]+" fill="#A50044"\/><\/g>/) // the charge on the heater's anchor
  // Charges sit under the gap and ring, so an edge charge is trimmed by them.
  assert.ok(token.indexOf('fill="#A50044"/>') < token.indexOf('stroke="#FFFFFF"'))
  const moved = renderClubMark({ ...ROW, charges: [{ shape: 'square', colour: '#000000', scale: 1.5, rotate: 45, x: -10, y: 5 }] }, 'token')
  assert.match(moved, /transform="translate\(40 48\) rotate\(45\) scale\(1.5\)"/)
  const chip = renderClubMark(ROW, 'chip')
  assert.doesNotMatch(chip, /transform=/)
  assert.match(chip, /width="24" height="24"/)
  assert.doesNotMatch(renderClubMark({ ...ROW, charges: [] }, 'hero'), /transform=/)
  // No text anywhere: the code is not drawn.
  assert.doesNotMatch(token, /<text/)
  // Emblems map their 120-unit drawing into the box; layers: field at every size, over above the rim.
  const lion = renderClubMark({ ...ROW, charges: [{ shape: 'lion-rampant', colour: '#F2B300', x: 2 }] }, 'token')
  assert.match(lion, /translate\(52 43\) scale\(0.833 0.833\) translate\(-59.5 -55.4\)/)
  const layered = { ...ROW, charges: [{ shape: 'band' as const, colour: '#111111', layer: 'field' as const }, { shape: 'band' as const, colour: '#222222', layer: 'over' as const }] }
  assert.match(renderClubMark(layered, 'chip'), /fill="#111111"/)
  assert.doesNotMatch(renderClubMark(layered, 'chip'), /fill="#222222"/)
  const t = renderClubMark(layered, 'token')
  assert.ok(t.indexOf('#111111') < t.indexOf('stroke="#15161A"') && t.indexOf('stroke="#15161A"') < t.indexOf('#222222'))
})

test('rims: 0–3 bands edge first; none; the default ring + gap; text round-trip; chip bands ≥ 1 px', () => {
  const gold = renderClubMark({ ...ROW, rim: [{ colour: '#F2B300', width: 9 }] }, 'token')
  assert.match(gold, /stroke="#F2B300" stroke-width="18"/)
  assert.doesNotMatch(gold, /stroke="#FFFFFF"/)
  const two = renderClubMark({ ...ROW, rim: [{ colour: '#014798', width: 2.5 }, { colour: '#FFFFFF', width: 9.5 }] }, 'token')
  assert.ok(two.indexOf('stroke="#FFFFFF" stroke-width="24"') < two.indexOf('stroke="#014798" stroke-width="5"'))
  assert.doesNotMatch(renderClubMark({ ...ROW, rim: [] }, 'token'), /stroke=/)
  assert.match(renderClubMark({ ...ROW, rim: [{ colour: '#000000', width: 0.83 }] }, 'chip'), /stroke-width="8.333"/)
  assert.equal(rimToText([{ colour: '#f2b300', width: 9 }]), '#F2B300@9')
  assert.deepEqual(rimFromText('#014798@2.5;#FFFFFF@9.5'), [{ colour: '#014798', width: 2.5 }, { colour: '#FFFFFF', width: 9.5 }])
  assert.deepEqual(rimFromText('none'), [])
  assert.equal(rimFromText(''), undefined)
  assert.equal(rimFromText('#GGGGGG@9'), undefined)
  assert.match(renderClubMark({ ...ROW, crest: 'hexagon' }, 'token'), /<polygon points="96.67,50 /)
})

test('ring: c2 when dark enough; else c1 darkened along its ramp; white kits get a dark ring', () => {
  assert.deepEqual(ringColour('#FFFFFF', '#000000'), { ring: '#000000', source: 'c2' })
  const red = ringColour('#CF2D36', '#FFFFFF')
  assert.equal(red.source, 'c1')
  assert.ok(lightness(red.ring) <= lightness('#CF2D36') - 15)
  assert.ok(contrastHex(red.ring, BOOK_PAPER) >= 4.5)
  const white = ringColour('#FFFFFF', '#F7F7F7')
  assert.ok(contrastHex(white.ring, BOOK_PAPER) >= 4.5, `white kit ring ${white.ring}`)
})

test('checks: greyscale bands, charge on the disc, chart size, print', () => {
  const g = grayscaleCheck({ ...ROW, c2: '#CF2D36' })
  assert.equal(g.check.status, 'fixed')
  assert.ok(Math.abs(lightness(g.row.c1) - lightness(g.row.c2!)) >= 20)
  assert.equal(grayscaleCheck({ ...ROW, pattern: 'solid' }).check.status, 'pass')
  assert.equal(chargeCheck([], '#CF2D36').status, 'skipped')
  assert.equal(chargeCheck([{ shape: 'circle', colour: '#FFFFFF' }], '#15161A').status, 'pass')
  assert.equal(chargeCheck([{ shape: 'circle', colour: '#F7F7F7' }], '#FFFFFF').status, 'review')
  assert.equal(chartCheck(ROW).status, 'pass')
  assert.equal(printCheck({ c1: '#0000FF', c2: null }).check.status, 'review')
})

const svg = (shape: string, w = 100, h = 100) => ({ svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${shape}</svg>` })
const base = { clubId: 'x', name: 'Juventus', league: 'ITA', era: { from: 2002, to: 2016 }, kit: { pattern: 'stripes' as const, c1: '#FFFFFF', c2: '#000000' } }

test('toClubMark: families from silhouettes; nothing of the badge reaches the mark', async () => {
  const families = {
    roundel: svg('<circle cx="50" cy="50" r="48" fill="#123456"/>'),
    oval: svg('<ellipse cx="40" cy="60" rx="38" ry="58" fill="#123456"/>', 80, 120),
    heater: svg('<path d="M5 5H95V45Q95 80 50 98Q5 80 5 45Z" fill="#123456"/>'),
    plate: svg('<rect x="2" y="15" width="96" height="70" fill="#123456"/>'),
  }
  for (const [family, crest] of Object.entries(families)) {
    const r = await toClubMark({ ...base, crest })
    assert.equal(r.row.crest, family)
    for (const markup of Object.values(r.renders)) assert.doesNotMatch(markup, /#123456/i)
  }
  // A round-based shield is a heater.
  assert.equal((await toClubMark({ ...base, crest: svg('<path d="M7 5H93V52A43 43 0 0 1 7 52Z" fill="#123456"/>') })).row.crest, 'heater')
})

test('toClubMark: snapped colours, ring rule, charge, CMYK, review gates, errors', async () => {
  const swatches = new Set(PRINT_SWATCHES.map(s => s.hex.toUpperCase()))
  const r = await toClubMark({ ...base, overrides: { family: 'oval', code: 'juv' }, charges: [{ shape: 'chevron', colour: '#000000', rotate: 180 }] })
  assert.equal(r.row.code, 'JUV')
  assert.ok(swatches.has(r.row.c1) && swatches.has(r.row.c2!))
  assert.equal(r.row.ring, r.row.c2) // black c2 is dark enough
  assert.deepEqual(r.row.charges, [{ shape: 'chevron', colour: '#000000', rotate: 180 }])
  assert.match(r.print.ring, /^cmyk\(/)
  assert.match(r.print.charges[0]!, /^cmyk\(/)
  assert.equal(r.alt, 'Juventus (JUV)')
  assert.equal(r.needsReview, false)
  const noBadge = await toClubMark({ ...base })
  assert.ok(noBadge.needsReview)
  await assert.rejects(toClubMark({ ...base, kit: undefined }), (e: unknown) => e instanceof ClubMarkError && e.code === 'E_NO_KIT')
  await assert.rejects(toClubMark({ ...base, charges: [{ shape: 'lion' as never, colour: '#000000' }] }), (e: unknown) => e instanceof ClubMarkError && e.code === 'E_BAD_CHARGE')
  await assert.rejects(toClubMark({ ...base, kit: { pattern: 'solid', c1: 'red' } }), (e: unknown) => e instanceof ClubMarkError && e.code === 'E_BAD_COLOUR')
})
