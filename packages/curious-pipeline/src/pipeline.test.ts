/**
 * The pipeline's pure modules on fixtures and a fake clock
 * (run: npx tsx src/pipeline.test.ts). No network, no Supabase.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { assertAllowed, PolicyError, SOURCE_POLICIES, textStorageFor } from './policy'
import { createLimiter, fakeClock, fetchWithRetry, HttpError } from './http'
import { canonicalUrl, cosine, buildIdf, domainOf, normalizeText, parseDate, sentenceSplit, sha256, sharedSentences, tokens, clip } from './text'
import { gdeltDocumentsFromArticles, gdeltUrl, gdeltWindows, parseGdeltBody, type GdeltArticle } from './collectors/gdelt'
import { locDocumentsFromResults, locPartitions, locSearchUrl, type LocSearchResponse } from './collectors/loc'
import { collectGdelt, collectLoc } from './collectors/index'
import { curiousEnv } from './types'

const HERE = dirname(fileURLToPath(import.meta.url))
const fixture = <T>(name: string): T => JSON.parse(readFileSync(join(HERE, 'fixtures', name), 'utf8')) as T
const NOW = new Date('2026-11-04T12:00:00Z')
const env = curiousEnv({})
const pending: Promise<void>[] = []

// 1. The policy registry refuses before fetching.
{
  assert.equal(assertAllowed('gdelt', { method: 'api', now: NOW }).crawlDelayMs, 5000)
  assert.throws(() => assertAllowed('gdelt', { method: 'html', now: NOW }), PolicyError)
  assert.throws(() => assertAllowed('web', { method: 'api', now: NOW }), /allows "html"/)
  assert.doesNotThrow(() => assertAllowed('gallica', { method: 'iiif', now: NOW }), 'IIIF rides on the SRU policy')
  const disabled = { ...SOURCE_POLICIES, loc: { ...SOURCE_POLICIES.loc, enabled: false } }
  assert.throws(() => assertAllowed('loc', { method: 'api', now: NOW, policies: disabled }), /disabled/)
  assert.throws(() => assertAllowed('loc', { method: 'api', now: new Date('2028-06-01T00:00:00Z') }), /over a year ago/)
  assert.equal(textStorageFor('loc', { publicDomain: true }), 'full')
  assert.equal(textStorageFor('loc', { publicDomain: false }), 'snippet')
  assert.equal(textStorageFor('gdelt', { publicDomain: true }), 'none')
  for (const p of Object.values(SOURCE_POLICIES)) assert.ok(p.institutionalQuality >= 0 && p.institutionalQuality <= 1, p.id)
}

// 2. The limiter: a minimum gap, a cooldown that doubles and honours Retry-After, a reset on success.
pending.push(
  (async () => {
    const clock = fakeClock(1_000_000)
    const lim = createLimiter({ minGapMs: 5000, baseCooldownMs: 10_000, maxCooldownMs: 30_000, clock })
    await lim.gate()
    const t0 = clock.now()
    await lim.gate()
    assert.equal(clock.now() - t0, 5000, 'second request waits the gap')
    lim.hit(0)
    assert.equal(lim.cooldownMs, 10_000)
    lim.hit(0)
    assert.equal(lim.cooldownMs, 20_000, 'doubles')
    lim.hit(60_000)
    assert.equal(lim.cooldownMs, 30_000, 'Retry-After wins but is capped')
    const t1 = clock.now()
    await lim.gate()
    assert.ok(clock.now() - t1 >= 30_000, 'the gate waits the cooldown out')
    lim.settle()
    assert.equal(lim.cooldownMs, 0)
  })(),
)

// 3. fetchWithRetry: 5xx retries then succeeds; 429 escalates the limiter; gives up after the attempts; 404 is returned.
pending.push(
  (async () => {
    const clock = fakeClock(0)
    let calls = 0
    const flaky = (async () => {
      calls++
      return calls < 3 ? new Response('down', { status: 503 }) : new Response('{"ok":true}', { status: 200 })
    }) as typeof fetch
    const res = await fetchWithRetry('https://example.org/x', { fetch: flaky, clock, jitterMs: 0, attempts: 4 })
    assert.equal(res.status, 200)
    assert.equal(calls, 3)
    assert.equal(clock.t, 1500 + 3000, 'exponential backoff on the fake clock')

    const lim = createLimiter({ minGapMs: 0, baseCooldownMs: 10_000, clock })
    let n = 0
    const limited = (async () => (++n === 1 ? new Response('slow down', { status: 429, headers: { 'retry-after': '20' } }) : new Response('ok'))) as typeof fetch
    await fetchWithRetry('https://example.org/y', { fetch: limited, clock, limiter: lim, jitterMs: 0 })
    assert.equal(n, 2)
    assert.equal(lim.cooldownMs, 0, 'settled after the success')

    const dead = (async () => new Response('x', { status: 500 })) as typeof fetch
    await assert.rejects(fetchWithRetry('https://example.org/z', { fetch: dead, clock, jitterMs: 0, attempts: 2 }), (e: unknown) => e instanceof HttpError && e.status === 500)
    const missing = (async () => new Response('x', { status: 404 })) as typeof fetch
    assert.equal((await fetchWithRetry('https://example.org/m', { fetch: missing, clock })).status, 404)
  })(),
)

// 4. Text utilities.
{
  assert.equal(canonicalUrl('http://www.Rediff.com/a/b/?utm_source=rss&id=3&fbclid=x#top'), 'https://rediff.com/a/b?id=3')
  assert.equal(canonicalUrl('https://m.example.co.uk/story/amp/'), 'https://example.co.uk/story')
  assert.equal(canonicalUrl('https://example.org'), 'https://example.org')
  assert.equal(canonicalUrl('not a url'), 'not a url')
  assert.equal(domainOf('https://www.bbc.co.uk/news/x'), 'bbc.co.uk')
  assert.equal(domainOf('https://amp.rediff.com/x'), 'rediff.com')
  assert.equal(normalizeText('Mithun’s “Jimmy” 60,900,000 admissions!'), 'mithun\'s "jimmy" 60900000 admissions')
  assert.equal(sha256('a'), sha256('a'))
  const sents = sentenceSplit('Dr. Smith arrived at 2:20 a.m. yesterday. He said nothing! Was it true? The end')
  assert.deepEqual(
    sents.map((s) => s.text),
    ['Dr. Smith arrived at 2:20 a.m. yesterday.', 'He said nothing!', 'Was it true?', 'The end'],
  )
  assert.equal(sents[1].start, 'Dr. Smith arrived at 2:20 a.m. yesterday. '.length)
  assert.deepEqual(parseDate('20261103T143000Z'), { iso: '2026-11-03T14:30:00Z', precision: 'minute' })
  assert.deepEqual(parseDate('1912-04-16'), { iso: '1912-04-16T00:00:00Z', precision: 'day' })
  assert.deepEqual(parseDate('[1884]'), { iso: '1884-01-01T00:00:00Z', precision: 'year' })
  assert.deepEqual(parseDate('ca. 1900'), { iso: '1900-01-01T00:00:00Z', precision: 'year' })
  assert.deepEqual(parseDate(''), { iso: null, precision: 'unknown' })
  const a = tokens('Disco Dancer drew 60.9 million Soviet viewers in 1984')
  const b = tokens('In 1984, 60,900,000 Soviet viewers saw Disco Dancer')
  assert.ok(a.has('y:1984') && a.has('n:61000000') && b.has('n:61000000'), [...a].join(','))
  const idf = buildIdf([a, b, tokens('the KGB used the song to catch spies')])
  assert.ok(cosine(a, b, idf) > 0.7, `cosine ${cosine(a, b, idf)}`)
  assert.ok(cosine(a, tokens('the KGB used the song to catch spies'), idf) < 0.1)
  const shared = sharedSentences(
    'Intro. It is said that anyone who grew up in the Soviet Union would answer Aaja Aaja without thinking twice. Tail.',
    'Other. It is said that anyone who grew up in the Soviet Union would answer Aaja Aaja without thinking twice.',
  )
  assert.equal(shared.length, 1)
  assert.equal(clip('a'.repeat(10), 5).length, 5)
}

// 5. GDELT: URL shape, windows, mapping from the fixture, the plain-text error.
{
  const u = new URL(gdeltUrl('"disco dancer"', new Date('2026-11-01T00:00:00Z'), new Date('2026-11-02T00:00:00Z')))
  assert.equal(u.searchParams.get('startdatetime'), '20261101000000')
  assert.equal(u.searchParams.get('enddatetime'), '20261102000000')
  assert.equal(u.searchParams.get('query'), '"disco dancer" sourcelang:english')
  assert.equal(u.searchParams.get('maxrecords'), '250')
  const w = gdeltWindows(new Date('2026-11-01T00:00:00Z'), new Date('2026-11-03T12:00:00Z'))
  assert.equal(w.length, 3)
  assert.equal(w[0][1].toISOString(), '2026-11-03T12:00:00.000Z')
  assert.equal(w[2][0].toISOString(), '2026-11-01T00:00:00.000Z', 'clamped to since')
  assert.equal(gdeltWindows(new Date('2026-11-01T00:00:00Z'), new Date('2026-11-02T00:00:00Z'), 6).length, 4)

  const fx = fixture<{ articles: GdeltArticle[] }>('gdelt.json')
  const docs = gdeltDocumentsFromArticles(fx.articles, { query: '"disco dancer"', requestUrl: 'https://api.gdeltproject.org/x', retrievedAt: NOW.toISOString() })
  assert.equal(docs.length, 2, 'the http duplicate and the broken row drop out')
  const d = docs[0]
  assert.equal(d.canonical_url, 'https://rediff.com/movies/report/mithun-jimmy-jimmy-soviet-spies/20261103.htm')
  assert.equal(d.external_id, docs[0].external_id)
  assert.equal(d.published_at, '2026-11-03T14:30:00Z')
  assert.equal(d.published_precision, 'minute')
  assert.equal(d.publisher, 'rediff.com')
  assert.equal(d.lineage_hint, 'rediff.com')
  assert.equal(d.language, 'english')
  assert.equal(d.text, null, 'news text is never stored')
  assert.equal(d.extraction_method, 'api-json')
  assert.equal(d.source_id, 'gdelt')
  assert.equal(d.meta.country, 'India')
  assert.ok(d.collector_version.startsWith('curious-gdelt-'))
  assert.throws(() => parseGdeltBody('Please limit requests to one every 5 seconds'), /GDELT: Please limit/)
  assert.deepEqual(parseGdeltBody(''), [])
}

// 6. LOC: URL shape, partitions, mapping, public-domain text rule.
{
  const u = new URL(locSearchUrl({ query: 'zeppelin', collection: 'chronicling-america', page: 2, dates: '1900/1925' }))
  assert.equal(u.pathname, '/collections/chronicling-america/')
  assert.equal(u.searchParams.get('sp'), '2')
  assert.equal(u.searchParams.get('dates'), '1900/1925')
  assert.equal(u.searchParams.get('c'), '100')
  assert.equal(new URL(locSearchUrl({ query: 'x' })).searchParams.get('sp'), null)
  assert.deepEqual(locPartitions(1895, 1912), ['1895/1899', '1900/1909', '1910/1912'])

  const fx = fixture<LocSearchResponse>('loc.json')
  const docs = locDocumentsFromResults(fx.results, { query: 'zeppelin', requestUrl: 'https://www.loc.gov/search/?q=zeppelin&fo=json', retrievedAt: NOW.toISOString() })
  assert.equal(docs.length, fx.results.length)
  const video = docs[0]
  assert.equal(video.source_id, 'loc')
  assert.equal(video.canonical_url, 'https://www.loc.gov/item/2021688865/')
  assert.equal(video.external_id, '/item/2021688865/')
  assert.equal(video.published_precision, 'year')
  assert.equal(video.published_at, '2012-01-01T00:00:00Z')
  assert.equal(video.meta.public_domain, false)
  assert.equal(video.meta.text_storage, 'snippet')
  assert.ok(video.text && video.text.startsWith('In 2010 a Cooper'), 'catalogue descriptions are kept')
  assert.equal(video.extraction_method, 'api-json')
  assert.equal(video.publisher, 'event videos', 'the first partof that is not the catalogue')
  const page = docs[docs.length - 1]
  assert.equal(page.published_precision, 'day')
  assert.equal(page.meta.public_domain, true)
  assert.equal(page.meta.text_storage, 'full')
  assert.equal(page.extraction_method, 'ocr-alto')
  assert.ok(page.text?.includes('For the first time in the history of the sea'))
  assert.equal(page.rights_uri, 'public-domain')
  assert.equal(page.lineage_hint, 'chronicling america')
  assert.equal(page.meta.is_page, true)
  assert.equal(page.content_hash, page.text_hash)
}

// 7. The generators end to end on a fake fetch: policy, limiter, paging, limit.
pending.push(
  (async () => {
    const clock = fakeClock(0)
    const gd = fixture<{ articles: GdeltArticle[] }>('gdelt.json')
    const seen: string[] = []
    const fakeGdelt = (async (url: string) => {
      seen.push(String(url))
      return new Response(JSON.stringify(gd), { status: 200 })
    }) as typeof fetch
    const out = []
    for await (const d of collectGdelt({ query: '"disco dancer"', since: '2026-11-01', until: '2026-11-03', limit: 10, fetch: fakeGdelt, env, now: NOW, clock }))
      out.push(d)
    assert.equal(out.length, 2, 'the same two stories across windows are yielded once')
    assert.equal(seen.length, 2, 'two one-day windows')
    assert.ok(clock.t >= 5000, 'the second request waited the 5 s gap')

    const lc = fixture<LocSearchResponse>('loc.json')
    let locCalls = 0
    const fakeLoc = (async (url: string) => {
      locCalls++
      const u = new URL(String(url))
      const page = Number(u.searchParams.get('sp') ?? '1')
      const body: LocSearchResponse = { results: lc.results, pagination: { current: page, next: page < 3 ? `${u.origin}${u.pathname}?q=x&fo=json&sp=${page + 1}` : null, of: 12, total: 12, perpage: 4 } }
      return new Response(JSON.stringify(body), { status: 200 })
    }) as typeof fetch
    const got = []
    for await (const d of collectLoc({ query: 'zeppelin', limit: 3, fetch: fakeLoc, env, now: NOW, clock })) got.push(d)
    assert.equal(got.length, 3, 'stops at the limit')
    assert.equal(locCalls, 1)
    const all = []
    for await (const d of collectLoc({ query: 'zeppelin', limit: 50, fetch: fakeLoc, env, now: NOW, clock })) all.push(d)
    assert.equal(all.length, lc.results.length, 'repeated pages dedupe by canonical url')
    assert.equal(locCalls, 4, 'followed pagination.next to the end')

    // Deep paging: the first page says 150k results, so the collector partitions by decade.
    const deepUrls: string[] = []
    const fakeDeep = (async (url: string) => {
      deepUrls.push(String(url))
      const u = new URL(String(url))
      const body: LocSearchResponse = { results: u.searchParams.get('dates') ? lc.results.slice(0, 1) : [], pagination: { current: 1, next: null, of: u.searchParams.get('dates') ? 1 : 150_000, total: 1, perpage: 100 } }
      return new Response(JSON.stringify(body), { status: 200 })
    }) as typeof fetch
    const deep = []
    for await (const d of collectLoc({ query: 'war', since: '1900-01-01', until: '1919-12-31', limit: 50, fetch: fakeDeep, env, now: NOW, clock })) deep.push(d)
    assert.equal(deepUrls.length, 1, 'a dated query that is too deep is split by format, not decade')
  })(),
)

Promise.all(pending).then(
  () => console.log('curious-pipeline: ok'),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
