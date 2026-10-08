/** Checks for the daily trend snapshot: the Xpoz reads (with a fake fetch) and the brief section.
 *  (run: npx tsx src/trends.test.ts) */
import assert from 'node:assert/strict'
import { draw } from './draw'
import { hasEmDash } from './text'
import { TREND_BEATS, TREND_RULES, cleanTrendText, mentions, subjectTerms, trendBeatsFor, trendsSection, type TrendSnapshot } from './trends'
import { collectTrends } from './trendsServer'
import { RANDOMIZERS } from './types'

const NOW = new Date('2026-10-05T12:00:00Z')

// Every randomizer reads at least one beat, and every beat is read.
for (const r of RANDOMIZERS) assert.ok(trendBeatsFor(r).length, `${r} reads no beat`)
assert.equal(new Set(TREND_BEATS.map((b) => b.id)).size, TREND_BEATS.length)

// Text cleaning and matching.
assert.equal(cleanTrendText('Big news — markets\n fall https://t.co/x'), 'Big news, markets fall')
assert.ok(cleanTrendText('x'.repeat(400)).length <= 220)
assert.ok(mentions('Arsenal beat Chelsea', 'arsenal'))
assert.ok(!mentions('Arsenalista fan club', 'Arsenal'))
assert.ok(mentions('São Tomé and Príncipe votes', 'São Tomé and Príncipe'))

// collectTrends against a fake Xpoz: one subreddit fails, the X search is ranked by engagement.
const calls: string[] = []
const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input))
  calls.push(url.pathname)
  assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer test-key')
  if (url.pathname.includes('/subreddits/news/')) {
    return new Response(JSON.stringify({ success: false, message: 'Insufficient credits' }), { status: 402 })
  }
  if (url.pathname.includes('/reddit/')) {
    assert.equal(url.searchParams.get('sort'), 'top')
    assert.equal(url.searchParams.get('time'), 'day')
    const sub = url.pathname.split('/')[6]
    return Response.json({
      results: [
        { id: 'a', title: `Pinned rules for ${sub}`, permalink: `/r/${sub}/comments/a/`, score: 99999, commentsCount: 1, stickied: true },
        { id: 'b', title: `Arsenal and the ${sub} story — explained`, permalink: `/r/${sub}/comments/b/`, subredditName: sub, score: 5000, commentsCount: 300 },
        { id: 'c', title: `Second ${sub} story`, postUrl: `https://www.reddit.com/r/${sub}/comments/c/`, subredditName: sub, score: 9000, commentsCount: 20 },
      ],
      count: 3,
      dataSource: 'live',
      has_more: false,
      next_page_cursor: null,
    })
  }
  assert.equal(url.searchParams.get('since'), '2026-10-04')
  return Response.json({
    results: [
      { id: '1', authorUsername: 'quiet', text: 'quiet post', likeCount: 3, retweetCount: 0 },
      { id: '2', authorUsername: 'loud', text: 'Arsenal loud post', likeCount: 900, retweetCount: 100 },
      { id: '3', authorUsername: 'rt', text: 'RT', likeCount: 99999, isRetweet: true },
    ],
    count: 3,
    dataSource: 'live',
    has_more: false,
    next_page_cursor: null,
  })
}) as typeof fetch

async function main(): Promise<void> {
  const collected = await collectTrends({ apiKey: 'test-key', now: NOW, fetchImpl: fakeFetch })
  assert.equal(calls.length, TREND_BEATS.reduce((n, b) => n + b.sources.length, 0))
  assert.equal(collected.day, '2026-10-05')
  assert.equal(collected.status, 'partial')
  const world = collected.beats.find((b) => b.id === 'world')!
  assert.equal(world.errors.length, 1)
  assert.match(world.errors[0]!, /r\/news: Xpoz 402 \(out of credits\): Insufficient credits/)
  assert.ok(world.items.every((i) => i.where === 'r/worldnews'), 'the failed subreddit adds nothing')
  assert.ok(!world.items.some((i) => i.title.startsWith('Pinned')), 'stickied threads are dropped')
  assert.equal(world.items[0]!.score, 9000, 'top score first')
  assert.equal(world.items[1]!.url, 'https://www.reddit.com/r/worldnews/comments/b/')
  assert.ok(!world.items.some((i) => hasEmDash(i.title)))
  const football = collected.beats.find((b) => b.id === 'football')!
  assert.deepEqual(
    football.items.map((i) => i.where),
    ['r/soccer', '@loud', 'r/soccer', '@quiet'],
    'sources interleave, retweets are dropped, X ranked by engagement',
  )
  assert.equal(football.items[1]!.url, 'https://x.com/loud/status/2')
  for (const b of collected.beats) assert.ok(b.items.length <= TREND_RULES.perBeat)
  await assert.rejects(collectTrends({ apiKey: '', fetchImpl: fakeFetch }), /XPOZ_API_KEY/)

  // The brief section, for every randomizer.
  const snapshot: TrendSnapshot = { ...collected, refreshedBy: 'test' }
  const news = {
    asOf: NOW.toISOString(),
    windowDays: 14,
    competitions: [{ slug: 'premier-league', heat: 100, articles: 3, headlines: [], teams: 1 }],
    teams: [
      {
        id: 'e1',
        slug: 'arsenal',
        name: 'Arsenal',
        country: 'England',
        crestUrl: null,
        competitions: ['premier-league'],
        heat: 100,
        articles: 3,
        headlines: [],
        recent: [],
        upcoming: [],
      },
    ],
  }
  for (const randomizer of RANDOMIZERS) {
    const spin = draw({ randomizer, seed: 5, now: NOW, news })
    const section = trendsSection(snapshot, spin, NOW)
    assert.ok(section.startsWith('## Trending today'))
    assert.ok(!hasEmDash(section), `${randomizer}: em dash in the trends section`)
    assert.ok(section.includes('Social posts are signals, not sources'))
    for (const beat of trendBeatsFor(randomizer)) assert.ok(section.includes(`### ${beat.label}`), `${randomizer}: ${beat.label}`)
    for (const beat of TREND_BEATS.filter((b) => !b.randomizers.includes(randomizer))) {
      assert.ok(!section.includes(`### ${beat.label}`), `${randomizer} should not carry ${beat.label}`)
    }
    assert.ok(subjectTerms(spin.subject).length)
    if (randomizer === 'footshorts') {
      assert.ok(section.includes('### Mentions of Arsenal'), 'posts naming the drawn team come first')
      assert.ok(section.indexOf('### Mentions of') < section.indexOf('### Football'))
    }
    assert.ok(!section.includes('stale'))
    assert.ok(trendsSection(snapshot, spin, new Date(NOW.getTime() + 48 * 36e5)).includes('This snapshot is stale'))
  }
  assert.ok(trendsSection(null, draw({ randomizer: 'desk', seed: 1, now: NOW }), NOW).includes('No trend snapshot is on file'))

  console.log('trends: ok')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
