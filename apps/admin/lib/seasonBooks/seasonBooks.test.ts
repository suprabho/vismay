// Run: pnpm --filter admin exec tsx lib/seasonBooks/seasonBooks.test.ts
import assert from 'node:assert/strict'
import { findBeats, goalsByMonth, monthEnd, pointsRace, resultsStrip, standings, type MatchRow } from './matches'
import {
  advanceStatus, beatIssues, cardIssues, chapterForMonth, emptySpread, isBookView, nextTemplate, pacingIssues,
  parseSeasonSlug, planSchema, seasonMonths, seasonSlug, sortSpreads, starterPlan,
} from './plan'

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

console.log('seasonBooks ok')
