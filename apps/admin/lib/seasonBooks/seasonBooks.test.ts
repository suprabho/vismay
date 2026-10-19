// Run: pnpm --filter admin exec tsx lib/seasonBooks/seasonBooks.test.ts
import assert from 'node:assert/strict'
import { findBeats, goalsByMonth, monthEnd, pointsRace, resultsStrip, standings, type MatchRow } from './matches'
import {
  advanceStatus, beatIssues, cardIssues, chapterForMonth, emptySpread, isBookView, nextTemplate, pacingIssues,
  parseSeasonSlug, planSchema, seasonMonths, seasonSlug, sortSpreads, starterPlan,
} from './plan'
import {
  crestCounts, crestStatus, crestUploadPath, groupCrests, matchesCrestFilter, sniffCrestType, unsafeSvg,
} from './crests'
import type { HistoryCrest } from '@footshorts/shared/historicalCrests'

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
const crest = (wiki: string, over: Partial<HistoryCrest> = {}): HistoryCrest => ({
  season: '2003-04', wiki, name: wiki, canonical_id: '', slug: '', top_flight: '', competitions: 'FA Cup', country: 'England',
  qid: '', source: 'logopedia', era: 'season', era_label: '1999–2007', file: 'x.svg', file_url: 'https://x/x.svg', thumb_url: '',
  logopedia_page: '', needs_review: false, review_note: '', upload_path: null, upload_type: null, uploaded_by: null, uploaded_at: null, ...over,
})
const crests = [
  crest('Arsenal F.C.', { top_flight: 'Premier League' }),
  crest('Juventus FC', { top_flight: 'Serie A', needs_review: true }),
  crest('Real Zaragoza', { top_flight: 'LaLiga', era: 'current', needs_review: true }),
  crest('AS Moulins', { file_url: '', file: '', era: '', source: '' }),
  crest('Aire-sur-la-Lys', { file_url: '', era: '', upload_path: '2003-04/aire.png', needs_review: true }),
]
assert.deepEqual(crests.map(crestStatus), ['season', 'season', 'current', 'missing', 'uploaded'])
assert.deepEqual(crestCounts(crests), { total: 5, uploaded: 1, season: 2, current: 1, missing: 1, flagged: 2 })
assert.deepEqual(crests.filter(c => matchesCrestFilter(c, 'flagged', '')).map(c => c.wiki), ['Juventus FC', 'Real Zaragoza'])
assert.deepEqual(crests.filter(c => matchesCrestFilter(c, 'all', 'serie')).map(c => c.wiki), ['Juventus FC'])
assert.deepEqual(groupCrests(crests).map(g => g.group), ['Premier League', 'LaLiga', 'Serie A', 'Cup opponents'])
assert.deepEqual(groupCrests(crests).at(-1)!.crests.map(c => c.wiki), ['Aire-sur-la-Lys', 'AS Moulins'])
assert.match(crestUploadPath('2003-04', 'Real Unión', '', 'png'), /^2003-04\/real-union-[0-9a-f]{8}\.png$/)
assert.notEqual(crestUploadPath('2003-04', 'Real Unión', '', 'png'), crestUploadPath('2003-04', 'Real Union', '', 'png'))
assert.equal(crestUploadPath('2003-04', 'name:fr:Aire-sur-la-Lys', 'aire', 'svg').split('/')[1]!.startsWith('aire-'), true)

// Uploads are typed by their bytes; scripted SVGs are refused.
const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)])
assert.equal(sniffCrestType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)), 'image/png')
assert.equal(sniffCrestType(bytes(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg')
assert.equal(sniffCrestType(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ')), 'image/webp')
assert.equal(sniffCrestType(new TextEncoder().encode('<?xml version="1.0"?>\n<!-- crest -->\n<svg xmlns="http://www.w3.org/2000/svg"/>')), 'image/svg+xml')
assert.equal(sniffCrestType(new TextEncoder().encode('<html><svg></svg></html>')), null)
assert.equal(sniffCrestType(bytes(0x25, 0x50, 0x44, 0x46)), null)
assert.ok(unsafeSvg('<svg><script>alert(1)</script></svg>'))
assert.ok(unsafeSvg('<svg onload="x()"></svg>'))
assert.ok(unsafeSvg('<svg><a xlink:href="https://evil"/></svg>'))
assert.ok(!unsafeSvg('<svg xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="#a"/><path d="M0 0"/></svg>'))

console.log('seasonBooks ok')

// ---------------------------------------------------------------------------
// Season spreads (plan v2): conversion, the book's spreads, pages, tabs and checks.
import {
  bookIssues, bookSpreads, convertToSeasonSpreads, editorTabsFor, fillLeaguePart, headlineLines, isSeasonBookView, pageCount, parseAnyPlan,
  planV2Schema, proposeHonourable, sameClub, spreadIssues, spreadKeyFor, spreadRow, starterPlanV2, withScope, openBlockers, advanceBookStatus,
  type LeaguePart,
} from './seasonSpreads'

const v1 = {
  beats: [
    { id: 'b-1', text: 'Reds went unbeaten.', month: '2004-05', kind: 'record' as const, strength: 3 as const, teams: 'Reds', evidence: '' },
    { id: 'b-2', text: 'Reds took top spot from Blues.', month: '2003-10', kind: 'title-race' as const, strength: 2 as const, teams: 'Reds | Blues', evidence: '' },
  ],
  spreads: [emptySpread('cover', 'cover'), emptySpread('intro', 'intro'), emptySpread('2003-10', 'hero'), emptySpread('2003-11', 'breather')],
}
const v2 = convertToSeasonSpreads(v1, 2003)
assert.ok(planV2Schema.safeParse(v2).success)
assert.equal(v2.legacy!.length, 2)
assert.equal(v2.frame.cover.template, 'cover')
assert.deepEqual(v2.beats.map(b => b.spreadKey), ['team:reds', null])
assert.deepEqual(v2.scope.leagues, ['Premier League', 'LaLiga', 'Serie A', 'Bundesliga', 'Ligue 1'])
assert.deepEqual(v2.scope.european, ['Champions League', 'UEFA Cup'])
assert.deepEqual(v2.parts.map(p => p.kind), ['intro', 'league', 'league', 'league', 'league', 'league', 'european', 'domestic', 'honourable', 'outro'])
assert.equal(pageCount(v2), (3 + 5 + 2 + 7) * 2)
assert.ok(parseAnyPlan(v2).success && parseAnyPlan(v1).success && !parseAnyPlan({ version: 2 }).success)
assert.equal(parseAnyPlan({ version: 3, beats: [], spreads: [] }).success, false)

// The roster fills clubs by final position, keeps exclusions, and a manual order survives a rebuild.
const epl = v2.parts.find((p): p is LeaguePart => p.kind === 'league' && p.league === 'Premier League')!
const filled = fillLeaguePart({ ...epl, excluded: [{ teamId: 'Greens', reason: 'folded' }] }, ['Reds', 'Blues', 'Whites', 'Greens'])
assert.deepEqual(filled.teams, ['Reds', 'Blues', 'Whites'])
assert.deepEqual(fillLeaguePart({ ...filled, order: 'manual', teams: ['Whites', 'Reds'] }, ['Reds', 'Blues', 'Whites', 'Greens']).teams, ['Whites', 'Reds', 'Blues'])
const withClubs = { ...v2, parts: v2.parts.map(p => p === epl ? filled : p) }
const planned = bookSpreads(withClubs)
assert.deepEqual(planned.slice(0, 4).map(s => s.key), ['league:premier-league', 'team:reds', 'team:blues', 'team:whites'])
assert.equal(planned.filter(s => s.kind === 'competition').length, 9)
assert.equal(spreadKeyFor('team', 'Deportivo La Coruña'), 'team:deportivo-la-coruna')
assert.ok(bookIssues(withClubs, new Map([['Premier League', ['Reds', 'Blues', 'Whites', 'Greens', 'Pinks']]])).some(i => i.check === 'roster-complete' && i.message.includes('Pinks')))
assert.ok(!bookIssues(withClubs, new Map([['Premier League', ['Reds', 'Blues', 'Whites', 'Greens']]])).some(i => i.check === 'roster-complete'))
const narrowed = withScope(withClubs, { ...withClubs.scope, leagues: ['LaLiga', 'Premier League'] })
assert.deepEqual(narrowed.parts.filter((p): p is LeaguePart => p.kind === 'league').map(p => [p.league, p.teams.length]), [['LaLiga', 0], ['Premier League', 3]])

// Honourable mentions: clubs outside the leagues that won, reached the final or a Champions League semi-final.
const ucl: MatchRow[] = [
  { d: '2004-05-05', s: 'SF', h: 'Monaco', a: 'Chelsea', hg: 2, ag: 2 }, { d: '2004-05-05', s: 'SF', h: 'Porto', a: 'Deportivo', hg: 1, ag: 0 },
  { d: '2004-05-26', s: 'final', h: 'Monaco', a: 'Porto', hg: 0, ag: 3 },
]
assert.deepEqual(proposeHonourable('Champions League', ucl, ['Chelsea', 'AS Monaco', 'Deportivo La Coruna']).map(p => [p.teamId, p.reason]), [['Porto', 'Won the Champions League']])
assert.ok(sameClub('Man United', 'Manchester United FC') && sameClub('Porto', 'FC Porto') && !sameClub('Porto', 'Sporting'))

// Editor tabs per template, and the checks that run on the row alone.
assert.deepEqual(editorTabsFor('team').map(t => t.id), ['story', 'moments', 'cups', 'side', 'people', 'modules', 'colour-marks', 'checks'])
assert.deepEqual(editorTabsFor('league').map(t => t.id), ['story', 'moments', 'race-lead', 'players', 'modules', 'colour-marks', 'checks'])
assert.deepEqual(editorTabsFor('competition').map(t => t.id), ['story', 'moments', 'field-bracket', 'oddities', 'modules', 'colour-marks', 'checks'])
assert.ok(isSeasonBookView('roster') && isSeasonBookView('legacy') && !isSeasonBookView('cards'))
assert.equal(headlineLines('NOBODY BEAT ARSENAL'), 2)
assert.equal(headlineLines('THE OUTSIDERS'), 1)
assert.equal(headlineLines('TWENTY SIX WINS TWELVE DRAWS NO DEFEATS'), 3)
const reds = spreadRow(withClubs, planned[1])
assert.equal(reds.kind, 'team')
assert.equal(advanceBookStatus(reds), 'data')
const drafted = { ...reds, editorial: { ...reds.editorial, headline: 'TWENTY SIX WINS TWELVE DRAWS NO DEFEATS', story: 'word '.repeat(31) }, team: { ...reds.team!, coach: { ...reds.team!.coach, context: 'Second season in charge.' } } }
assert.equal(advanceBookStatus(drafted), 'draft')
const issues = spreadIssues(drafted, 2003)
assert.deepEqual(issues.map(i => i.check), ['headline-fit', 'copy-length', 'sourced'])
assert.equal(openBlockers(drafted, 2003).length, 1)
assert.equal(openBlockers({ ...drafted, checkOverrides: [{ check: 'sourced', reason: 'club programme, offline', by: '' }] }, 2003).length, 0)
assert.ok(spreadIssues({ ...reds, editorial: { ...reds.editorial, moments: [{ date: '2005-01-01', text: 'x', eventId: null }] } }, 2003).some(i => i.check === 'moments'))
assert.ok(spreadIssues({ ...reds, palette: { text: '#888888', page1Ground: '#999999' } }, 2003).some(i => i.check === 'contrast'))
assert.ok(planV2Schema.safeParse(starterPlanV2(2003)).success)
assert.ok(!planV2Schema.safeParse({ ...v2, spreads: { 'nope:x': reds } }).success)

console.log('seasonSpreads ok')
