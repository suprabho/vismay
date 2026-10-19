// Run: pnpm --filter admin exec tsx lib/seasonBooks/seasonBooks.test.ts
import assert from 'node:assert/strict'
import { findBeats, goalsByMonth, monthEnd, pointsRace, resultsStrip, standings, type MatchRow } from './matches'
import {
  advanceStatus, beatIssues, cardIssues, chapterForMonth, emptySpread, isBookView, nextTemplate, pacingIssues,
  parseSeasonSlug, planSchema, seasonMonths, seasonSlug, sortSpreads, starterPlan,
} from './plan'
import {
  crestCounts, crestEra, crestSourceRef, crestStatus, crestUploadPath, duplicateCodes, groupCrests, leagueCode, markFingerprint,
  markKit, markState, matchesCrestFilter, sniffCrestType, unsafeSvg, type ClubMarkView, type CrestView,
} from './crests'

// A four-team league: Blues lead at September's end, Reds overtake in October
// on goal difference and finish unbeaten (checked by hand).
const m = (d: string, h: string, a: string, hg: number, ag: number): MatchRow => ({ d, s: 'League', h, a, hg, ag })
const league: MatchRow[] = [
  m('2003-08-16', 'Blues', 'Greens', 2, 0), m('2003-08-16', 'Reds', 'Whites', 1, 1),
  m('2003-09-13', 'Blues', 'Whites', 3, 0), m('2003-09-13', 'Reds', 'Greens', 0, 0),
  m('2003-09-27', 'Blues', 'Greens', 1, 0), m('2003-09-27', 'Whites', 'Reds', 1, 1),
  m('2003-10-04', 'Reds', 'Blues', 4, 0), m('2003-10-04', 'Greens', 'Whites', 1, 2),
  m('2003-10-25', 'Whites', 'Blues', 2, 1), m('2003-10-25', 'Greens', 'Reds', 0, 2),
  m('2003-11-08', 'Whites', 'Reds', 0, 3), m('2003-11-08', 'Greens', 'Blues', 7, 1),
  m('2003-12-06', 'Blues', 'Reds', 1, 1), m('2003-12-06', 'Whites', 'Greens', 0, 0),
]

const table = standings(league)
assert.deepEqual(table.map(r => [r.team, r.w, r.d, r.l, r.pts]), [['Reds', 3, 4, 0, 13], ['Blues', 3, 1, 3, 10], ['Whites', 2, 3, 2, 9], ['Greens', 1, 2, 4, 5]])
assert.deepEqual(standings(league, monthEnd('2003-09')).map(r => [r.team, r.pts]), [['Blues', 9], ['Reds', 3], ['Whites', 2], ['Greens', 1]])
assert.equal(monthEnd('2004-02'), '2004-02-29')
assert.deepEqual(pointsRace(league, ['Reds'])[0].points.map(p => p.pts), [1, 2, 3, 6, 9, 12, 13])
assert.deepEqual(resultsStrip(league, 'Blues').map(g => g.r), ['W', 'W', 'W', 'L', 'L', 'L', 'D'])
assert.equal(goalsByMonth(league).find(x => x.month === '2003-11')!.goals, 11)

const beats = findBeats(2003, 'Test League', league, true)
const texts = beats.map(b => b.text)
assert.ok(texts.includes('Reds took top spot from Blues in October 2003 on goal difference.'), texts.join('\n'))
assert.ok(texts.includes('Reds won the 2003–04 Test League by 3 points, after the lead changed hands once.'), texts.join('\n'))
assert.ok(texts.some(t => t.startsWith('Reds went the whole Test League season unbeaten')))
assert.ok(texts.some(t => t.startsWith('Greens beat Blues 7–1')))
assert.ok(beats.every(b => seasonMonths(2003).includes(b.month)))

// Seasons and chapters.
assert.equal(seasonSlug(2003), '2003-04')
assert.equal(seasonSlug(2099), '2099-00')
assert.equal(parseSeasonSlug('2099-00'), 2099)
assert.equal(parseSeasonSlug('2003-05'), null)
assert.deepEqual([seasonMonths(2003)[0], seasonMonths(2003)[11]], ['2003-08', '2004-07'])
assert.equal(chapterForMonth(2003, '2003-07'), '2003-08')
assert.ok(isBookView('flatplan') && !isBookView('nope'))
assert.ok(planSchema.safeParse(starterPlan()).success)
assert.ok(!planSchema.safeParse({ beats: [], spreads: [{ ...emptySpread('2003-10', 'hero'), chart: { form: 'hero', sketch: [], notes: '', data: null } }] }).success)
assert.ok(!planSchema.safeParse({ beats: [], spreads: [{ ...emptySpread('2003-10', 'hero'), chart: { form: 'bar', sketch: ['M0 0 <script>'], notes: '', data: null } }] }).success)

// Flatplan order and pacing: hero → dense → breather.
const [cover, intro] = starterPlan().spreads
const oct = [emptySpread('2003-10', 'comparison'), emptySpread('2003-10', 'table'), emptySpread('2003-10', 'timeline')]
const sep = [emptySpread('2003-09', 'breather'), emptySpread('2003-09', 'breather')]
const ordered = sortSpreads(2003, [...oct, ...sep, intro, cover])
assert.deepEqual(ordered.map(s => s.chapter), ['cover', 'intro', '2003-09', '2003-09', '2003-10', '2003-10', '2003-10'])
assert.deepEqual(ordered.slice(4).map(s => s.id), oct.map(s => s.id))
const pacing = pacingIssues(2003, ordered).map(i => i.message)
assert.ok(pacing.includes('Spreads 3–4: breathers back to back lose the rhythm.'))
assert.ok(pacing.includes('Spreads 5–7: 3 dense spreads in a row. Put a breather in.'))
assert.ok(pacing.some(p => p.startsWith('October 2003 opens on a comparison spread')))
assert.equal(nextTemplate(undefined), 'hero')
assert.equal(nextTemplate(emptySpread('2003-10', 'hero')), 'comparison')
assert.equal(nextTemplate(emptySpread('2003-10', 'table')), 'breather')

// Cards: headline and sketch go together; the status follows the content, never back.
const hero = { ...emptySpread('2003-10', 'hero'), headline: 'Reds never lost' }
assert.ok(cardIssues(hero).some(i => i.severity === 'warn' && i.message.includes('the claim is too vague')))
const sketched = { ...hero, chart: { ...hero.chart, sketch: ['M0 0 L10 10'] } }
assert.ok(!cardIssues(sketched).some(i => i.message.includes('too vague')))
assert.equal(advanceStatus(hero), 'beat')
assert.equal(advanceStatus(sketched), 'card')
assert.equal(advanceStatus({ ...sketched, chart: { ...sketched.chart, data: { preset: 'points-race', competition: 'Premier League', teams: [], month: null } } }), 'data')
assert.equal(advanceStatus({ ...hero, status: 'final' }), 'final')
assert.ok(cardIssues({ ...sketched, body: 'word '.repeat(160) }).some(i => i.message.includes('cut to 150')))
assert.ok(cardIssues({ ...sketched, chart: { ...sketched.chart, form: 'table' } }).some(i => i.message.startsWith('Hero spreads don’t take')))

// Beats: 15–25, one sentence each.
const one = beatIssues({ beats: [{ id: 'b-1', text: 'One. Two.', month: null, kind: 'other', strength: 2, teams: '', evidence: '' }], spreads: [] }).map(i => i.message)
assert.ok(one[0].startsWith('1 beat so far. Find 14 more'))
assert.ok(one.some(x => x.includes('is more than one sentence')))

// Crests: an upload wins, then a dated pick, then today's crest; nothing = missing.
const crest = (wiki: string, over: Partial<CrestView> = {}): CrestView => ({
  season: '2003-04', wiki, name: wiki, canonical_id: '', slug: '', top_flight: '', competitions: 'FA Cup', country: 'England',
  qid: '', source: 'logopedia', era: 'season', era_label: '1999–2007', file: 'x.svg', file_url: 'https://x/x.svg', thumb_url: '',
  logopedia_page: '', needs_review: false, review_note: '', upload_path: null, upload_type: null, uploaded_by: null, uploaded_at: null,
  image_url: null, mark: null, ...over,
})
const crests = [
  crest('Arsenal F.C.', { top_flight: 'Premier League' }),
  crest('Juventus FC', { top_flight: 'Serie A', needs_review: true }),
  crest('Real Zaragoza', { top_flight: 'LaLiga', era: 'current', needs_review: true }),
  crest('AS Moulins', { file_url: '', file: '', era: '', source: '' }),
  crest('Aire-sur-la-Lys', { file_url: '', era: '', upload_path: '2003-04/aire.png', needs_review: true }),
]
assert.deepEqual(crests.map(crestStatus), ['season', 'season', 'current', 'missing', 'uploaded'])
assert.deepEqual(crestCounts(crests), {
  total: 5, uploaded: 1, season: 2, current: 1, missing: 1, flagged: 2, unmarked: 5, 'mark-review': 0, marked: 0, toGenerate: 0,
})
assert.deepEqual(crests.filter(c => matchesCrestFilter(c, 'flagged', '')).map(c => c.wiki), ['Juventus FC', 'Real Zaragoza'])
assert.deepEqual(crests.filter(c => matchesCrestFilter(c, 'all', 'serie')).map(c => c.wiki), ['Juventus FC'])
assert.deepEqual(groupCrests(crests).map(g => g.group), ['Premier League', 'LaLiga', 'Serie A', 'Cup opponents'])
assert.deepEqual(groupCrests(crests).at(-1)!.crests.map(c => c.wiki), ['Aire-sur-la-Lys', 'AS Moulins'])
assert.match(crestUploadPath('2003-04', 'Real Unión', '', 'png'), /^2003-04\/real-union-[0-9a-f]{8}\.png$/)
assert.notEqual(crestUploadPath('2003-04', 'Real Unión', '', 'png'), crestUploadPath('2003-04', 'Real Union', '', 'png'))
assert.equal(crestUploadPath('2003-04', 'name:fr:Aire-sur-la-Lys', 'aire', 'svg').split('/')[1]!.startsWith('aire-'), true)

// Club marks: kit overrides win; a mark is stale when anything it was built from changes; duplicate codes go to review.
const mark = (over: Partial<ClubMarkView> = {}): ClubMarkView => ({
  kit_pattern: 'stripes', kit_c1: '#FF0000', kit_c2: '#0000FF', kit_confidence: 0.9, kit_source: 'season', kit_page: '', kit_needs_review: false,
  kit_note: '', override_family: null, override_code: null, override_pattern: null, override_c1: null, override_c2: null, reviewed_by: null,
  reviewed_at: null, status: null, error_code: null, error_message: null, code: null, crest: null, pattern: null, c1: null, c2: null,
  league: null, era_from: null, era_to: null, family_confidence: null, checks: null, print: null, needs_review: false, review_reasons: [],
  alt: null, spec_version: null, generated_from: null, generated_by: null, generated_at: null, ...over,
})
assert.deepEqual(markKit(mark()), { pattern: 'stripes', c1: '#FF0000', c2: '#0000FF' })
assert.deepEqual(markKit(mark({ override_c1: '#a50044', override_c2: '' })), { pattern: 'stripes', c1: '#A50044', c2: null })
assert.equal(markKit(mark({ kit_c1: '', kit_pattern: '' })), null)
assert.equal(crestSourceRef(crests[4]!), 'upload:2003-04/aire.png@')
assert.equal(leagueCode(crests[0]!), 'ENG')
assert.equal(leagueCode(crest('Celtic', { country: 'United Kingdom', competitions: 'Champions League' })), 'SCO')
assert.deepEqual(crestEra(crests[0]!), { from: 1999, to: 2007 })
assert.deepEqual(crestEra(crest('X', { era_label: '2002–present' })), { from: 2002, to: null })
assert.deepEqual(crestEra(crest('X', { era_label: 'today' })), { from: 2003, to: 2003 })
const noKit = crest('A', { mark: mark({ kit_c1: '', kit_pattern: '' }) })
assert.equal(markState(crest('A')), 'nokit')
assert.equal(markState(noKit), 'nokit')
assert.equal(markState(crest('A', { mark: mark() })), 'none')
const made = (over: Partial<ClubMarkView> = {}, c: Partial<CrestView> = {}) => {
  const base = crest('A', { mark: mark({ status: 'ok', code: 'ABC', crest: 'heater', pattern: 'stripes', c1: '#FF0000', c2: '#0000FF', ...over }), ...c })
  return { ...base, mark: { ...base.mark!, generated_from: markFingerprint(base) } }
}
assert.equal(markState(made()), 'ok')
assert.equal(markState(made({ needs_review: true })), 'review')
assert.equal(markState({ ...made(), file_url: 'https://x/other.svg' }), 'stale')
assert.equal(markState({ ...made(), mark: { ...made().mark, override_c1: '#00FF00' } }), 'stale')
const twins = [made(), { ...made(), wiki: 'B' }, made({ code: 'XYZ' })]
assert.deepEqual([...duplicateCodes(twins)], ['ABC'])
assert.equal(markState(twins[0]!, duplicateCodes(twins)), 'review')
assert.deepEqual(twins.filter(c => matchesCrestFilter(c, 'mark-review', '', duplicateCodes(twins))).map(c => c.wiki), ['A', 'B'])
assert.deepEqual([crest('C', { mark: mark() }), made()].filter(c => matchesCrestFilter(c, 'unmarked', '')).map(c => c.wiki), ['C'])

// Uploads are typed by their bytes; scripted SVGs are refused.
const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)])
assert.equal(sniffCrestType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'image/png')
assert.equal(sniffCrestType(bytes(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg')
assert.equal(sniffCrestType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')), 'image/webp')
assert.equal(sniffCrestType(new TextEncoder().encode('<?xml version="1.0"?>\n<!-- crest -->\n<svg xmlns="http://www.w3.org/2000/svg"/>')), 'image/svg+xml')
assert.equal(sniffCrestType(new TextEncoder().encode('<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd" [\n<!ENTITY ns_ai "http://ns.adobe.com/AdobeIllustrator/10.0/">\n]>\n<svg xmlns="http://www.w3.org/2000/svg"/>')), 'image/svg+xml')
assert.equal(sniffCrestType(new TextEncoder().encode('<html><svg></svg></html>')), null)
assert.equal(sniffCrestType(bytes(0x25, 0x50, 0x44, 0x46)), null)
assert.ok(unsafeSvg('<svg><script>alert(1)</script></svg>'))
assert.ok(unsafeSvg('<svg onload="x()"></svg>'))
assert.ok(unsafeSvg('<svg><a xlink:href="https://evil"/></svg>'))
assert.ok(!unsafeSvg('<svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#a"/><path d="M0 0"/></svg>'))

console.log('seasonBooks ok')
