/** The viznba game context, against a canned ESPN summary. (run: npx tsx src/viznbaBrief.test.ts) */
import assert from 'node:assert/strict'
import { buildGameContext, isGameId, spinGameIds } from './viznbaBrief'

const SUMMARY = {
  header: {
    competitions: [
      {
        date: '2026-10-04T23:30Z',
        status: { type: { state: 'post', detail: 'Final' } },
        competitors: [
          {
            homeAway: 'home',
            score: '108',
            team: { id: '18', displayName: 'New York Knicks', logos: [{ href: 'https://a.espncdn.com/i/teamlogos/nba/500/ny.png' }] },
            record: [{ type: 'total', summary: '3-1' }],
            linescores: [{ displayValue: '30' }, { displayValue: '20' }, { displayValue: '28' }, { displayValue: '30' }],
          },
          {
            homeAway: 'away',
            score: '112',
            team: { id: '2', displayName: 'Boston Celtics' },
            record: [{ type: 'total', summary: '4-0' }],
            linescores: [{ displayValue: '25' }, { displayValue: '35' }, { displayValue: '22' }, { displayValue: '30' }],
          },
        ],
      },
    ],
  },
  gameInfo: { venue: { fullName: 'Madison Square Garden', address: { city: 'New York', state: 'NY' } }, attendance: 19812 },
  boxscore: {
    teams: [
      { team: { id: '2' }, statistics: [{ name: 'fieldGoalsMade-fieldGoalsAttempted', displayValue: '41-88' }, { name: 'leadChanges', displayValue: '9' }] },
      { team: { id: '18' }, statistics: [{ name: 'fieldGoalsMade-fieldGoalsAttempted', displayValue: '39-90' }, { name: 'leadChanges', displayValue: '9' }] },
    ],
    players: [
      {
        team: { id: '2' },
        statistics: [
          {
            labels: ['MIN', 'PTS'],
            athletes: [
              { athlete: { displayName: 'Jayson Tatum', position: { abbreviation: 'F' } }, starter: true, stats: ['38', '31'] },
              { athlete: { displayName: 'Bench Guy' }, didNotPlay: true, reason: 'COACH\'S DECISION' },
            ],
          },
        ],
      },
    ],
  },
  plays: [
    { period: { number: 1 }, clock: { displayValue: '11:40' }, homeScore: 2, awayScore: 0 },
    { period: { number: 2 }, clock: { displayValue: '9:00' }, homeScore: 2, awayScore: 3 },
    { period: { number: 2 }, clock: { displayValue: '8:30' }, homeScore: 2, awayScore: 6 },
    { period: { number: 2 }, clock: { displayValue: '7:50' }, homeScore: 2, awayScore: 10 },
    { period: { number: 2 }, clock: { displayValue: '7:10' }, homeScore: 4, awayScore: 10 },
  ],
  leaders: [{ team: { id: '2' }, leaders: [{ name: 'points', displayName: 'Points', leaders: [{ displayValue: '31', athlete: { displayName: 'Jayson Tatum', headshot: { href: 'https://example.com/jt.png' } } }] }] }],
  seasonseries: [{ type: 'season', summary: 'BOS leads series 1-0' }],
  article: { headline: 'Tatum scores 31', links: { web: { href: 'http://espn.com/recap' } } },
}

const realFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input)
  if (url.includes('event=401000001')) return new Response(JSON.stringify(SUMMARY), { status: 200 })
  return new Response('nope', { status: 404 })
}) as typeof fetch

async function main() {
  assert.ok(isGameId('401000001') && !isGameId('abc') && !isGameId('12'))
  assert.deepEqual(spinGameIds(null), [])
  const ctx = await buildGameContext(['401000001', '401000002', 'junk'], { siteUrl: 'https://viznba.com/', prompt: 'The Celtics run' })
  assert.ok(ctx.startsWith('## Game context'))
  assert.ok(ctx.includes('Angle: The Celtics run'))
  assert.ok(ctx.includes('### Boston Celtics 112 @ New York Knicks 108 (2026-10-04, Final)'))
  assert.ok(ctx.includes('- Game page: https://viznba.com/game/401000001'))
  assert.ok(ctx.includes('Madison Square Garden, New York, NY (attendance 19,812)'))
  assert.ok(ctx.includes('| Boston Celtics | 4-0 | #1f9d55 |'), 'the dataset colour')
  assert.ok(ctx.includes('| Boston Celtics | 25 | 35 | 22 | 30 | 112 |'))
  assert.ok(ctx.includes('| FG | 41-88 | 39-90 |'))
  assert.ok(ctx.includes('Boston Celtics 10-0 run, Q2 9:00 to Q2 7:50'))
  assert.ok(ctx.includes('| Jayson Tatum (F), starter | 38 | 31 |'))
  assert.ok(ctx.includes("Did not play: Bench Guy (coach's decision)."))
  assert.ok(ctx.includes('| Boston Celtics | Points | Jayson Tatum | 31 | https://example.com/jt.png |'))
  assert.ok(ctx.includes('Season series: BOS leads series 1-0.'))
  assert.ok(ctx.includes('[Tatum scores 31](https://espn.com/recap)'))
  assert.ok(ctx.includes("### Game 401000002\n\nESPN's box score could not be read (HTTP 404)"))
  assert.ok(!ctx.includes('junk'))
  assert.ok(!ctx.includes('—'), 'no em dashes')
  console.log('viznbaBrief: ok')
}

main()
  .finally(() => {
    globalThis.fetch = realFetch
  })
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
