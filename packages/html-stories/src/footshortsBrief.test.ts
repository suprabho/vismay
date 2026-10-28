/** A club brief's fixture pick. (run: npx tsx src/footshortsBrief.test.ts) */
import assert from 'node:assert/strict'
import { pickClubFixtures } from './footshortsBrief'

const now = new Date('2026-10-28T12:00:00Z')
// Newest first, as fetchFixturesForTeam returns them.
const fixtures = [
  { id: 'n3', kickoff_at: '2026-11-22T15:00:00Z', status: 'scheduled' },
  { id: 'n2', kickoff_at: '2026-11-05T20:00:00Z', status: 'scheduled' },
  { id: 'pp', kickoff_at: '2026-11-01T15:00:00Z', status: 'postponed' },
  { id: 'n1', kickoff_at: '2026-10-31T17:30:00Z', status: 'scheduled' },
  { id: 'live', kickoff_at: '2026-10-28T11:30:00Z', status: 'live' },
  { id: 'r1', kickoff_at: '2026-10-25T15:00:00Z', status: 'finished' },
  { id: 'cx', kickoff_at: '2026-10-22T20:00:00Z', status: 'cancelled' },
  { id: 'r2', kickoff_at: '2026-10-18T15:00:00Z', status: 'finished' },
  { id: 'r3', kickoff_at: '2026-10-04T15:00:00Z', status: 'finished' },
  { id: 'stale', kickoff_at: '2026-10-01T15:00:00Z', status: 'scheduled' },
]

assert.deepEqual(pickClubFixtures(fixtures, { now }), ['r3', 'r2', 'r1', 'live', 'n1', 'n2'])
assert.deepEqual(pickClubFixtures(fixtures, { last: 2, next: 1, now }), ['r2', 'r1', 'live'])
assert.deepEqual(pickClubFixtures(fixtures, { last: 0, next: 0, now }), [])
assert.deepEqual(pickClubFixtures([], { now }), [])

console.log('footshortsBrief: ok')
