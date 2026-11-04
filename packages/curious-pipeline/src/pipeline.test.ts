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
import { z } from 'zod'
import { collectEuropeana, europeanaDocumentsFromItems, europeanaIsPublicDomain, europeanaUrl, type EuropeanaResponse } from './collectors/europeana'
import { collectGallica, gallicaContentSearchUrl, gallicaDocumentFromRecord, gallicaSruUrl, parseGallicaContentSearch, parseGallicaSru } from './collectors/gallica'
import { fetchArticleText, htmlToArticle, robotsAllows } from './fetchText'
import { detectCandidates, rulesHit } from './detect'
import { AtomicClaimsSchema, extractClaims, locateQuote, type AtomicClaim, type Generate } from './extract'
import { claimHash, independenceGroup, lexicalClusters, provenanceDedupe } from './dedupe'
import { contradicts, findContradictions } from './contradict'
import { ERAS, eraOf, REGION_IDS, THEME_IDS, THEME_NAMES } from './taxonomy'
import { GRADE_LABELS, GRADE_WEIGHTS, gradeFlags, gradeFor, scoreClaim, scoreFeatures, type ScoreFeatures } from './grade'
import { bookFromVolume, entityFromWikidata, titleOverlap, verifyClaim, workFromCrossref } from './verify/index'
import type { CrossrefWork } from './verify/crossref'
import type { BooksVolume } from './verify/googleBooks'
import { waybackSnapshot } from './archive'
import type { ClaimKind, EntityKind, SourceRelation, VerifiedBy } from './types'

interface DiscoFixture {
  documents: Array<{ key: string; source_id: 'gdelt' | 'europeana'; published_at: string; language: string }>
  claims: Array<{
    key: string
    document: string
    text: string
    kind: ClaimKind
    year_from: number | null
    year_to: number | null
    country_code: string | null
    evidence_quote: string
    is_quotation: boolean
    is_anonymous: boolean
    is_hearsay: boolean
    extractor_confidence: number
    entities: Array<{ name: string; kind: EntityKind; birth_year?: number; year?: number; country_code?: string }>
    sources: Array<{ document: string | null; relation: SourceRelation; independence_group: string; is_primary: boolean; is_contemporaneous: boolean; institutional_quality: number; external_ref?: string; source_year?: number; work_type?: string; verified_by: VerifiedBy }>
    expect: string[]
  }>
}

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

// ── Phase 2 ──────────────────────────────────────────────────────────────────

// 8. Europeana: URL, public-domain rule, mapping, the key requirement, cursor paging.
{
  const u = new URL(europeanaUrl('K', 'zeppelin', '*'))
  assert.equal(u.searchParams.get('rows'), '100')
  assert.equal(u.searchParams.get('qf'), 'TYPE:TEXT')
  assert.ok(europeanaIsPublicDomain('http://creativecommons.org/publicdomain/mark/1.0/'))
  assert.ok(!europeanaIsPublicDomain('http://rightsstatements.org/vocab/InC/1.0/'))
  const fx = fixture<EuropeanaResponse>('europeana.json')
  const docs = europeanaDocumentsFromItems(fx.items ?? [], { query: 'zeppelin', requestUrl: 'https://api.europeana.eu/x', retrievedAt: NOW.toISOString() })
  assert.equal(docs.length, 3)
  assert.equal(docs[0].source_id, 'europeana')
  assert.equal(docs[0].canonical_url, 'https://europeana.eu/item/221/URN_NBN_SI_DOC_1NTFR15D', 'utm stripped')
  assert.equal(docs[0].external_id, '/221/URN_NBN_SI_DOC_1NTFR15D')
  assert.equal(docs[0].published_at, '1910-01-01T00:00:00Z')
  assert.equal(docs[0].published_precision, 'year')
  assert.equal(docs[0].language, null, '"mul" is not a language')
  assert.equal(docs[0].meta.public_domain, true)
  assert.equal(docs[0].meta.text_storage, 'full')
  assert.ok(docs[0].text && docs[0].text.length > 20, 'CC0 descriptions are kept')
  const inc = docs[2]
  assert.equal(inc.meta.public_domain, false)
  assert.equal(inc.meta.text_storage, 'snippet')
  assert.equal(inc.language, 'de')
  assert.equal(inc.lineage_hint, 'Deutsche Digitale Bibliothek')
  assert.equal(inc.rights_uri, 'http://rightsstatements.org/vocab/InC/1.0/')
  pending.push(
    (async () => {
      await assert.rejects(
        (async () => {
          for await (const _ of collectEuropeana({ query: 'x', limit: 1, env, now: NOW })) void _
        })(),
        /EUROPEANA_API_KEY/,
      )
      const clock = fakeClock(0)
      const urls: string[] = []
      const fake = (async (url: string) => {
        urls.push(String(url))
        const cursor = new URL(String(url)).searchParams.get('cursor')
        const body: EuropeanaResponse = cursor === '*' ? { ...fx, nextCursor: 'NEXT' } : { success: true, itemsCount: 0, totalResults: fx.totalResults, items: [] }
        return new Response(JSON.stringify(body), { status: 200 })
      }) as typeof fetch
      const got = []
      for await (const d of collectEuropeana({ query: 'zeppelin', since: '1900-01-01', until: '1920-12-31', limit: 10, fetch: fake, env: { ...env, europeanaKey: 'K' }, now: NOW, clock })) got.push(d)
      assert.equal(got.length, 3)
      assert.equal(urls.length, 2, 'followed the cursor once, stopped on the empty page')
      assert.ok(new URL(urls[0]).searchParams.get('query')?.includes('YEAR:[1900 TO 1920]'))
      assert.ok(!got[0].raw_uri.includes('wskey=K'), 'the key is not kept in raw_uri')
    })(),
  )
}

// 9. Gallica: SRU and ContentSearch parsing, the document, the per-run request budget.
{
  const sru = parseGallicaSru(readFileSync(join(HERE, 'fixtures', 'gallica-sru.xml'), 'utf8'))
  assert.equal(sru.total, 137)
  assert.equal(sru.next, 3)
  assert.equal(sru.records.length, 2)
  assert.equal(sru.records[0].ark, 'bpt6k5656490s')
  assert.equal(sru.records[0].publisher, 'Le Petit Parisien (Paris)')
  assert.equal(sru.records[0].ocrQuality, 0.923)
  assert.deepEqual(sru.records[0].types, ['text', 'publication en série imprimée'])
  const hits = parseGallicaContentSearch(readFileSync(join(HERE, 'fixtures', 'gallica-contentsearch.xml'), 'utf8'))
  assert.equal(hits.length, 2)
  assert.equal(hits[0].page, 2)
  assert.ok(hits[0].text.startsWith('Un fait curieux'), 'marks stripped, entities decoded')
  const doc = gallicaDocumentFromRecord(sru.records[0], hits, { query: 'fait curieux', requestUrl: 'https://gallica.bnf.fr/SRU?x', retrievedAt: NOW.toISOString() })
  assert.equal(doc.canonical_url, 'https://gallica.bnf.fr/ark:/12148/bpt6k5656490s')
  assert.equal(doc.published_at, '1912-04-17T00:00:00Z')
  assert.equal(doc.published_precision, 'day')
  assert.equal(doc.extraction_method, 'iiif-ocr')
  assert.ok(doc.text?.includes('[p.2]') && doc.text.includes('[p.5]'), 'page markers')
  assert.equal(doc.ocr_confidence, 0.923)
  assert.equal(doc.meta.public_domain, true)
  assert.equal(new URL(gallicaSruUrl('fait curieux', 51, { docType: 'fascicule' })).searchParams.get('query'), '(gallica all "fait curieux") and (dc.type all "fascicule")')
  assert.equal(gallicaContentSearchUrl('bpt6k1', 'a "b"'), 'https://gallica.bnf.fr/services/ContentSearch?ark=bpt6k1&query=a%20b')
  pending.push(
    (async () => {
      const clock = fakeClock(0)
      let calls = 0
      const fake = (async (url: string) => {
        calls++
        const s = String(url)
        return new Response(readFileSync(join(HERE, 'fixtures', s.includes('ContentSearch') ? 'gallica-contentsearch.xml' : 'gallica-sru.xml'), 'utf8'), { status: 200 })
      }) as typeof fetch
      const got = []
      for await (const d of collectGallica({ query: 'fait curieux', limit: 3, fetch: fake, env, now: NOW, clock })) got.push(d)
      assert.equal(got.length, 3, 'the SRU page repeats, so three records come from two pages')
      assert.equal(calls, 5, 'two SRU pages plus one ContentSearch per record')
      assert.ok(clock.t >= 4 * 12_000, 'twelve seconds between calls')
    })(),
  )
}

// 10. fetchText: HTML to article text, metadata, robots.txt.
{
  const html = readFileSync(join(HERE, 'fixtures', 'article.html'), 'utf8')
  const a = htmlToArticle(html)
  assert.equal(a.title, "How Mithun's Jimmy Jimmy became a Soviet spy test")
  assert.equal(a.author, 'A Correspondent')
  assert.equal(a.publishedAt, '2026-11-03T09:00:00.000Z')
  assert.equal(a.canonical, 'https://rediff.com/movies/report/mithun-jimmy-jimmy-soviet-spies/20261103.htm')
  assert.ok(a.text.startsWith('How Mithun’s Jimmy Jimmy'), a.text.slice(0, 60))
  assert.ok(a.text.includes('60.9 million admissions'))
  assert.ok(!a.text.includes('tracking') && !a.text.includes('Related stories') && !a.text.includes('Home'), 'script, aside and nav dropped')
  assert.ok(a.text.includes('\n\n'), 'paragraph breaks kept')
  const robots = 'User-agent: *\nDisallow: /private/\nDisallow: /search\nAllow: /private/ok\n\nUser-agent: badbot\nDisallow: /'
  assert.equal(robotsAllows(robots, '/movies/x'), true)
  assert.equal(robotsAllows(robots, '/private/x'), false)
  assert.equal(robotsAllows(robots, '/private/ok/1'), true)
  assert.equal(robotsAllows(robots, '/searching'), false)
  assert.equal(robotsAllows('User-agent: *\nDisallow:', '/anything'), true)
  assert.equal(robotsAllows('', '/anything'), true)
  pending.push(
    (async () => {
      const clock = fakeClock(0)
      const fake = (async (url: string) => {
        const s = String(url)
        if (s.endsWith('/robots.txt')) return new Response('User-agent: *\nDisallow: /blocked/', { status: 200, headers: { 'content-type': 'text/plain' } })
        return new Response(html, { status: 200, headers: { 'content-type': 'text/html' } })
      }) as typeof fetch
      const ok = await fetchArticleText('https://rediff.com/movies/report/x.htm', { fetch: fake, clock, now: NOW })
      assert.ok(ok && ok.text.includes('Aaja Aaja'))
      const blocked = await fetchArticleText('https://rediff.com/blocked/x.htm', { fetch: fake, clock, now: NOW })
      assert.equal(blocked, null)
    })(),
  )
}

// 11. The detector: rules, passages, ranking and the cap.
{
  const text = readFileSync(join(HERE, 'fixtures', 'article.html'), 'utf8')
  const article = htmlToArticle(text).text
  const cands = detectCandidates(article, { maxPassages: 3, window: 400 })
  assert.ok(cands.length >= 1 && cands.length <= 3)
  const all = cands.map((c) => c.rules).flat()
  assert.ok(all.includes('hearsay'), all.join(','))
  assert.ok(all.includes('number-unit') || all.includes('dated'))
  for (const c of cands) {
    assert.equal(article.slice(c.start, c.end), c.passage, 'offsets match the passage')
    assert.ok(c.passage.length <= 400 || !c.passage.includes(". "), `passage ${c.passage.length}`)
  }
  assert.deepEqual(detectCandidates('The weather was mild. Tea was served.'), [], 'nothing fires on plain prose')
  assert.deepEqual(detectCandidates(''), [])
  const hits = rulesHit('For the first time in history, a woman reportedly swam the strait in 1926, forty years later than planned.')
  assert.deepEqual(hits.map((h) => h.id).sort(), ['dated', 'first-last-only', 'hearsay', 'years-later'])
  const many = detectCandidates(Array.from({ length: 30 }, (_, i) => `In ${1900 + i} the only man who ever did it reportedly returned. Then nothing happened for a while.`).join(' '), { maxPassages: 3 })
  assert.equal(many.length, 3, 'capped')
  assert.ok(many[0].start < many[1].start && many[1].start < many[2].start, 'document order')
}

// 12. The extractor with a fake generate: quotes are located or the claim is dropped; offsets are document offsets.
pending.push(
  (async () => {
    const article = htmlToArticle(readFileSync(join(HERE, 'fixtures', 'article.html'), 'utf8')).text
    const [cand] = detectCandidates(article, { maxPassages: 1, window: 2000 })
    const seenPrompt: string[] = []
    const fake: Generate = async (o) => {
      seenPrompt.push(o.prompt)
      const claims: AtomicClaim[] = [
        { text: 'Disco Dancer drew about 60.9 million admissions in the Soviet Union.', kind: 'number', subject: 'Disco Dancer', theme: 'film-tv', region: 'europe', entities: [{ name: 'Disco Dancer', kind: 'work' }, { name: 'Soviet Union', kind: 'place' }], year_from: 1982, year_to: null, place: 'Soviet Union', country_code: 'ru', evidence_quote: 'drew about 60.9 million admissions in the Soviet Union', attribution: { speaker: 'Soviet distribution records', is_anonymous: false, is_hearsay: false }, is_quotation: false, sensitive: false, confidence: 0.9 },
        { text: 'The Soviet government used the song Jimmy Jimmy to identify spies.', kind: 'anecdote', subject: 'Jimmy Jimmy', theme: 'film-tv', region: 'europe', entities: [{ name: 'Jimmy Jimmy', kind: 'work' }], year_from: null, year_to: null, place: null, country_code: null, evidence_quote: 'the former Soviet government could identify spies with the song', attribution: { speaker: null, is_anonymous: true, is_hearsay: true }, is_quotation: false, sensitive: false, confidence: 0.6 },
        { text: 'Mithun Chakraborty invented the moonwalk.', kind: 'fact', subject: 'Mithun', theme: 'film-tv', region: 'south-asia', entities: [], year_from: 1983, year_to: null, place: null, country_code: 'IN', evidence_quote: 'invented the moonwalk', attribution: { speaker: null, is_anonymous: true, is_hearsay: false }, is_quotation: false, sensitive: false, confidence: 0.4 },
        { text: 'The Soviet government used the song Jimmy Jimmy to identify spies.', kind: 'anecdote', subject: 'dup', theme: 'film-tv', region: 'europe', entities: [], year_from: null, year_to: null, place: null, country_code: null, evidence_quote: 'identify spies with the song', attribution: { speaker: null, is_anonymous: true, is_hearsay: true }, is_quotation: false, sensitive: false, confidence: 0.6 },
      ]
      return { result: { claims } as z.infer<typeof o.schema>, modelUsed: 'fake/haiku' }
    }
    const claims = await extractClaims(cand, { source_id: 'gdelt', title: 'T', publisher: 'rediff.com', published_at: '2026-11-03T09:00:00Z', language: 'english' }, { generate: fake })
    assert.equal(claims.length, 2, 'the unlocatable quote and the duplicate drop out')
    assert.ok(seenPrompt[0].includes('Publisher: rediff.com') && seenPrompt[0].includes('Passage:'))
    const [pop, spy] = claims
    assert.equal(article.slice(pop.evidence_start, pop.evidence_end), 'drew about 60.9 million admissions in the Soviet Union')
    assert.equal(pop.era, 'late-20th')
    assert.equal(pop.country_code, 'RU')
    assert.equal(pop.claim_hash, sha256(normalizeText(pop.text)))
    assert.equal(spy.era, null)
    assert.equal(spy.attribution.is_hearsay, true)
    assert.equal(spy.extractor_model, 'fake/haiku')
    assert.deepEqual(locateQuote('He said “Jimmy  Jimmy” twice.', 'said "Jimmy Jimmy"')?.exact, 'said “Jimmy  Jimmy”', 'quote marks and spacing are forgiven')
    assert.equal(locateQuote('abc', 'xyz'), null)
    assert.equal(AtomicClaimsSchema.safeParse({ claims: [] }).success, true)
  })(),
)

// 13. Dedupe: lexical clusters, independence groups, provenance dedupe.
{
  const clusters = lexicalClusters([
    { id: 'a', text: 'Disco Dancer drew about 60.9 million admissions in the Soviet Union in 1984.', publishedAt: '2026-11-03' },
    { id: 'b', text: 'In 1984 some 60,900,000 Soviet viewers bought tickets to Disco Dancer.', publishedAt: '2026-11-02' },
    { id: 'c', text: 'The KGB used the song Jimmy Jimmy to identify foreign spies.', publishedAt: '2026-11-01' },
    { id: 'd', text: 'The KGB reportedly tested foreign spies with the song Jimmy Jimmy.', publishedAt: '2026-11-04' },
    { id: 'e', text: 'The Titanic carried only twenty lifeboats.', publishedAt: '1912-04-16' },
  ], { threshold: 0.4 })
  const of = (id: string) => clusters.find((c) => c.members.includes(id))!
  assert.equal(of('a'), of('b'), 'the two admissions claims cluster')
  assert.equal(of('a').representative, 'b', 'the earliest is the representative')
  assert.equal(of('c'), of('d'), 'the two spy claims cluster')
  assert.notEqual(of('a'), of('c'))
  assert.equal(of('e').members.length, 1)

  assert.equal(independenceGroup({ doi: 'https://doi.org/10.1080/19472498.2022.2101762', url: 'https://x.com' }), 'doi:10.1080/19472498.2022.2101762')
  assert.equal(independenceGroup({ isbn: '978-0-19-953556-9' }), 'isbn:9780199535569')
  assert.equal(independenceGroup({ sharedSentence: 'It is said that anyone who grew up in the Soviet Union would answer Aaja Aaja without thinking twice' }).slice(0, 6), 'quote:')
  assert.equal(independenceGroup({ byline: 'By Reuters staff', url: 'https://news.example.com/x' }), 'wire:reuters')
  assert.equal(independenceGroup({ text: 'MOSCOW (AP) — The song', url: 'https://news.example.com/x' }), 'wire:ap')
  assert.equal(independenceGroup({ speaker: 'Mithun Chakraborty', year: 2026, url: 'https://rediff.com/x' }), 'attr:mithun-chakraborty:2026')
  assert.equal(independenceGroup({ url: 'https://www.rediff.com/x' }), 'pub:rediff.com')
  assert.equal(independenceGroup({ url: 'https://www.loc.gov/item/1/', publisher: 'New-York tribune' }), 'pub:new-york-tribune', 'a library item is grouped by its publisher, not the library')
  assert.equal(independenceGroup({ sourceId: 'gallica' }), 'pub:gallica')
  const pd = provenanceDedupe([
    { relation: 'supports', independence_group: 'wire:ap' },
    { relation: 'supports', independence_group: 'wire:ap' },
    { relation: 'cites', independence_group: 'doi:10.1/x' },
    { relation: 'derived_from', independence_group: 'wire:ap' },
    { relation: 'contradicts', independence_group: 'pub:other' },
  ])
  assert.deepEqual(pd, { groups: ['wire:ap', 'doi:10.1/x'], nSources: 4, nDerived: 1 })
  assert.equal(claimHash('Jimmy  Jimmy!'), claimHash('jimmy jimmy'))
}

// 14. Contradictions: figures, years, negation; agreement within tolerance is not a contradiction.
{
  const a = { id: 'a', text: 'Disco Dancer drew 60.9 million admissions in the Soviet Union.' }
  const b = { id: 'b', text: 'Disco Dancer drew 120 million admissions in the Soviet Union.' }
  const c = { id: 'c', text: 'Disco Dancer drew about 61 million admissions in the Soviet Union.' }
  assert.equal(contradicts(a, b)?.reason, 'number')
  assert.equal(contradicts(a, c), null, 'within 10 percent')
  assert.equal(contradicts({ id: 'x', text: 'The film opened in the USSR in 1984.' }, { id: 'y', text: 'The film opened in the USSR in 1982.' })?.reason, 'year')
  assert.equal(contradicts({ id: 'x', text: 'The KGB used the song to catch spies.' }, { id: 'y', text: 'The KGB never used the song to catch spies.' })?.reason, 'negation')
  assert.equal(findContradictions([a, b, c]).length, 2)
}

// 15. The taxonomy.
{
  assert.equal(eraOf(1982), 'late-20th')
  assert.equal(eraOf(-383), 'antiquity')
  assert.equal(eraOf(1912), 'long-19th')
  assert.equal(eraOf(2026), 'recent')
  assert.equal(eraOf(null), null)
  assert.equal(THEME_IDS.length, 12)
  assert.equal(REGION_IDS.length, 9)
  assert.equal(ERAS.length, 8)
  for (const t of THEME_IDS) assert.ok(THEME_NAMES[t])
}

// ── Phase 3 ──────────────────────────────────────────────────────────────────

// 16. The grader on the worked example: weights, thresholds, the two expected grades, the notes.
{
  const w = Object.values(GRADE_WEIGHTS).reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(w - 1) < 1e-9, `weights sum to ${w}`)
  assert.equal(gradeFor(0.75), 'A')
  assert.equal(gradeFor(0.749), 'B')
  assert.equal(gradeFor(0.4), 'C')
  assert.equal(gradeFor(0.3), 'D')
  assert.equal(gradeFor(0.1), 'E')
  assert.equal(gradeFor(0.1, { nSources: 3, contradiction: 0, circular: 0, chronPlausible: 1 }), 'D', 'the repeated-anecdote floor')
  assert.equal(gradeFor(0.1, { nSources: 3, contradiction: 1, circular: 0, chronPlausible: 1 }), 'E', 'no floor when contradicted')
  assert.equal(gradeFor(0.1, { nSources: 1, contradiction: 0, circular: 0, chronPlausible: 1 }), 'E', 'no floor for one account')
  for (const g of ['A', 'B', 'C', 'D', 'E'] as const) assert.ok(GRADE_LABELS[g])

  const fx = fixture<DiscoFixture>('disco-dancer.json')
  const docs = new Map(fx.documents.map((d) => [d.key, { published_at: d.published_at, source_id: d.source_id, ocr_confidence: null, language: d.language }]))
  const grades: Record<string, { grade: string; f: ScoreFeatures }> = {}
  for (const c of fx.claims) {
    const f = scoreFeatures({
      claim: { text: c.text, kind: c.kind, year_from: c.year_from, year_to: c.year_to, country_code: c.country_code, flags: [], evidence_quote: c.evidence_quote, isQuotation: c.is_quotation, isAnonymous: c.is_anonymous, isHearsay: c.is_hearsay, extractorConfidence: c.extractor_confidence, language: 'english' },
      sources: c.sources.map((s) => ({ relation: s.relation, independence_group: s.independence_group, is_primary: s.is_primary, is_contemporaneous: s.is_contemporaneous, institutional_quality: s.institutional_quality, external_ref: s.external_ref ?? null, verified_by: s.verified_by, document_id: s.document, source_year: s.source_year ?? null, work_type: s.work_type ?? null, cites_cluster: false, quote_found: false })),
      documents: docs as never,
      entities: c.entities.map((e) => ({ name: e.name, kind: e.kind, birthYear: e.birth_year ?? null, deathYear: null, year: e.year ?? null, countryCode: e.country_code ?? null })),
    })
    const score = scoreClaim(f)
    const grade = gradeFor(score, f)
    grades[c.key] = { grade, f }
    assert.ok(c.expect.includes(grade), `${c.key}: expected ${c.expect.join('/')} got ${grade} (${score}) ${JSON.stringify(f.notes)}`)
  }
  const pop = grades.popularity.f
  assert.equal(pop.primary, 1)
  assert.equal(pop.secondaryScholarship, 1)
  assert.equal(pop.nGroups, 3)
  assert.equal(pop.nDerived, 1)
  assert.equal(pop.contradiction, 0)
  const spy = grades.spy.f
  assert.equal(spy.primary, 0)
  assert.equal(spy.nGroups, 1)
  assert.equal(spy.nSources, 3)
  assert.equal(spy.anonymousRepetition, 1, 'three retellings of one anonymous account')
  assert.ok(gradeFlags(spy).includes('anonymous-repetition') && gradeFlags(spy).includes('unverified-popular'))
  assert.ok(spy.notes.some((n) => /retellings of one anonymous account/.test(n)))

  // Penalties clamp at zero; a contradiction costs a quarter.
  const base = { ...spy, contradiction: 1 as const }
  assert.ok(scoreClaim(base) < scoreClaim(spy))
  assert.equal(scoreClaim({ ...spy, primary: 0, independentContemporaneous: 0, institutional: 0, chronPlausible: 0, geoConsistent: 0, textConfidence: 0, circular: 1, contradiction: 1 }), 0)
  // Chronology: a person born after the event.
  const impossible = scoreFeatures({ claim: { text: 'x', kind: 'fact', year_from: 1940, year_to: null, country_code: null, flags: [], evidence_quote: 'x' }, sources: [], entities: [{ name: 'Mithun', kind: 'person', birthYear: 1950 }] })
  assert.equal(impossible.chronPlausible, 0)
  assert.ok(impossible.notes.some((n) => /born in 1950/.test(n)))
  // Time gap: the only source is 40 years late and nothing primary.
  const late = scoreFeatures({ claim: { text: 'x', kind: 'fact', year_from: 1950, year_to: null, country_code: null, flags: [], evidence_quote: 'x' }, sources: [{ relation: 'supports', independence_group: 'pub:a', is_primary: false, is_contemporaneous: false, institutional_quality: 0.3, external_ref: null, verified_by: 'detector', document_id: null, source_year: 1990 }] })
  assert.equal(late.timeGap, 1)
}

// 17. Verification: Crossref, Google Books and Wikidata mappings, and verifyClaim on a fake fetch.
pending.push(
  (async () => {
    const cr = fixture<{ message: { items: CrossrefWork[] } }>('crossref.json')
    const w = workFromCrossref(cr.message.items[0])
    assert.equal(w.doi, '10.1080/19472498.2022.2101762')
    assert.equal(w.year, 2022)
    assert.equal(w.type, 'journal-article')
    assert.deepEqual(w.referenceDois, ['10.1017/s0026749x0700256x'])
    assert.equal(w.authors[0], 'Spandan Bhattacharya')
    const bk = fixture<{ items: BooksVolume[] }>('books.json')
    const b = bookFromVolume(bk.items[0])
    assert.equal(b.isbn13, '9780253220998')
    assert.equal(b.year, 2008)
    assert.ok(b.snippet && !b.snippet.includes('<b>'))
    const wd = fixture<{ search: Record<string, unknown>; entities: Record<string, never> }>('wikidata.json')
    const mithun = entityFromWikidata('Q2616', wd.entities.Q2616)
    assert.equal(mithun.birthYear, 1950)
    assert.equal(mithun.isHuman, true)
    assert.equal(mithun.countryCode, 'IN')
    assert.equal(mithun.isLivingPrivate, false, 'five editions: a public figure')
    const film = entityFromWikidata('Q1226594', wd.entities.Q1226594)
    assert.equal(film.year, 1982)
    assert.equal(film.isHuman, false)
    const priv = entityFromWikidata('Q99999999', wd.entities.Q99999999)
    assert.equal(priv.isLivingPrivate, true)

    const clock = fakeClock(0)
    const calls: string[] = []
    const fake = (async (url: string) => {
      const s = String(url)
      calls.push(s)
      if (s.startsWith('https://api.crossref.org/works/')) return new Response(JSON.stringify({ message: cr.message.items[0] }), { status: 200 })
      if (s.startsWith('https://api.crossref.org/works?')) return new Response(JSON.stringify(cr), { status: 200 })
      if (s.startsWith('https://www.googleapis.com/books')) return new Response(JSON.stringify(bk), { status: 200 })
      if (s.includes('wbsearchentities')) {
        const name = new URL(s).searchParams.get('search') ?? ''
        return new Response(JSON.stringify(wd.search[name] ?? { search: [] }), { status: 200 })
      }
      if (s.includes('wbgetentities')) return new Response(JSON.stringify({ entities: wd.entities }), { status: 200 })
      return new Response('x', { status: 404 })
    }) as typeof fetch
    const r = await verifyClaim(
      { claimId: 'c1', text: 'Disco Dancer drew 60.9 million', isQuotation: true, evidenceQuote: 'Disco Dancer drew sixty million viewers in its first year of Soviet release', entities: [{ name: 'Indian Films in Soviet Cinemas', kind: 'work' }, { name: 'Disco Dancer', kind: 'work' }, { name: 'Mithun Chakraborty', kind: 'person' }], dois: ['10.1080/19472498.2022.2101762'], clusterDois: ['10.1017/s0026749x0700256x'] },
      { fetch: fake, env: { ...env, crossrefMailto: 'x@example.org' }, clock, now: NOW },
    )
    assert.deepEqual(r.errors, [])
    const cites = r.sources.filter((s) => s.relation === 'cites')
    assert.ok(cites.some((s) => s.external_ref === 'doi:10.1080/19472498.2022.2101762' && s.work_type === 'journal-article' && s.cites_cluster === true), JSON.stringify(cites))
    assert.ok(cites.some((s) => s.external_ref === 'isbn:9780253220998' && s.work_type === 'book'), JSON.stringify(cites))
    assert.equal(cites.filter((s) => s.external_ref?.startsWith('doi:')).length, 1, 'the DOI found twice is kept once')
    assert.ok(r.sources.some((s) => s.relation === 'supports' && s.quote_found && s.verified_by === 'verify-books'), 'the quotation was found in print')
    assert.equal(r.entities.find((e) => e.name === 'Mithun Chakraborty')?.birthYear, 1950)
    assert.equal(r.entities.find((e) => e.name === 'Disco Dancer')?.year, 1982)
    assert.ok(calls.some((c) => c.includes('mailto=x%40example.org')), 'polite pool')
    // Title overlap refuses a wrong match.
    assert.equal(titleOverlap('Indian Films in Soviet Cinemas', 'Indian films in Soviet cinemas: the culture of movie-going'), 1)
    assert.ok(titleOverlap('A completely different title here', 'Indian Films in Soviet Cinemas') < 0.2)
    // A failing source is an error, not a throw.
    const dead = (async () => new Response('x', { status: 500 })) as typeof fetch
    const r2 = await verifyClaim({ claimId: 'c2', text: 'x', isQuotation: false, evidenceQuote: 'x', entities: [{ name: 'Disco Dancer', kind: 'work' }] }, { fetch: dead, env, clock, now: NOW })
    assert.ok(r2.errors.length >= 2)
    assert.equal(r2.sources.length, 0)
    assert.equal(await waybackSnapshot('https://example.org/x', { fetch: (async () => new Response(JSON.stringify({ archived_snapshots: { closest: { available: true, url: 'http://web.archive.org/web/2026/https://example.org/x' } } }))) as typeof fetch }), 'https://web.archive.org/web/2026/https://example.org/x')
  })(),
)

Promise.all(pending).then(
  () => console.log('curious-pipeline: ok'),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
