/**
 * The LLM desk (llm.ts) on fakes: no model, no network, no Supabase
 * (run: npx tsx src/llm.test.ts).
 */
import assert from 'node:assert/strict'
import { collectSearchResults } from '@vismay/ai-gateway/search'
import { describeBrief, excerptFor, resolveCitations, runLlmDesk, type CheckResult, type GenerateFn, type ProposedClaim, type RunDeps } from './llm'
import { normalizeText, sha256 } from './text'

const RESULTS = [
  { url: 'https://archive.example.org/letters/1897', title: 'Letter, 1897', snippet: 'In 1897 the city council voted to ban bicycles from the cathedral square.', date: '2020-01-01', query: 'q' },
  { url: 'https://news.example.com/bikes', title: 'When bikes were banned', snippet: 'The council banned bicycles from the square in 1897, the paper reported.', date: '2021-05-02', query: 'q' },
  { url: 'https://listicle.example.net/10-facts', title: '10 facts', snippet: 'Bicycles were banned forever and riders were jailed.', date: null, query: 'q' },
]
const PAGES: Record<string, string> = {
  'https://archive.example.org/letters/1897': 'Minutes of the council.\n\nIn 1897 the city council voted to ban bicycles from the cathedral square, citing noise.\n\nThe ban was lifted in 1903.',
  'https://news.example.com/bikes': 'A history column.\n\nThe council banned bicycles from the square in 1897, the paper reported at the time, after complaints from the clergy.\n\nMore below.',
}

const claim = (over: Partial<ProposedClaim> = {}): ProposedClaim => ({
  text: 'In 1897 the city council banned bicycles from the cathedral square.',
  kind: 'fact',
  subject: 'the bicycle ban',
  theme: 'travel-transport',
  region: 'europe',
  entities: [{ name: 'Cathedral square', kind: 'place' }],
  year_from: 1897,
  year_to: null,
  place: null,
  country_code: null,
  is_quotation: false,
  sensitive: false,
  why_curious: 'A bicycle ban on holy ground.',
  sources: [
    { result: 1, relation: 'supports' },
    { result: 2, relation: 'supports' },
  ],
  ...over,
})

const check = (over: Partial<CheckResult> = {}): CheckResult => ({
  verdict: 'supported',
  grade: 'A',
  core: 'The council banned bicycles from the square in 1897.',
  embellishment: null,
  rewrite: null,
  sources: [
    { id: 'S1', relation: 'supports', is_primary: true, derived_from: null, quality: 1, quote: 'In 1897 the city council voted to ban bicycles from the cathedral square' },
    { id: 'S2', relation: 'supports', is_primary: false, derived_from: null, quality: 0.7, quote: 'The council banned bicycles from the square in 1897' },
  ],
  is_hearsay: false,
  is_anonymous: false,
  speaker: null,
  notes: ['Council minutes are the primary record.'],
  ...over,
})

function deps(proposals: ProposedClaim[], checks: CheckResult[] | ((prompt: string) => CheckResult), over: Partial<RunDeps> = {}): RunDeps {
  let n = 0
  const generate = (async (o: { system: string; prompt: string }) => {
    if (o.system.startsWith('You turn')) return { result: { claims: proposals }, modelUsed: 'fake/propose' }
    const c = typeof checks === 'function' ? checks(o.prompt) : checks[n++]
    return { result: c, modelUsed: 'fake/check' }
  }) as unknown as GenerateFn
  return {
    research: async () => ({ text: 'notes', results: RESULTS, queries: ['q'], modelUsed: 'fake/research' }),
    generate,
    readPage: async (url) => (PAGES[url] ? { text: PAGES[url], title: null, author: null, publishedAt: null } : null),
    concurrency: 1,
    ...over,
  }
}

const pending: Promise<void>[] = []

// The brief reads as plain lines.
assert.match(describeBrief({ era: 'long-19th', theme: 'travel-transport', count: 3 }), /long nineteenth century.*\n.*Travel and transport/i)
assert.equal(describeBrief({ count: 1 }), 'Any era, theme or region: surprise us.')

// Citations: numbers outside the list are dropped; a claim with only a contradicting source is left out.
{
  const r = resolveCitations([claim({ sources: [{ result: 9, relation: 'supports' }, { result: 2, relation: 'supports' }] }), claim({ text: 'x', sources: [{ result: 3, relation: 'contradicts' }] })], RESULTS)
  assert.equal(r.length, 1)
  assert.deepEqual(r[0].sources.map((s) => s.result.url), ['https://news.example.com/bikes'])
}

// Excerpts keep the paragraphs that share the claim's words.
{
  const page = ['Unrelated intro about weather.', 'The council banned bicycles in 1897.', 'Other news.'].join('\n\n').repeat(40)
  const ex = excerptFor('council banned bicycles 1897', page, 400)
  assert.ok(ex.length <= 400 && ex.includes('banned bicycles'))
}

// Search results are collected from the steps, first sighting wins.
{
  const { results, queries } = collectSearchResults([
    { toolResults: [{ toolName: 'web_search', input: { query: 'a' }, output: { results: [{ url: 'u1', title: 't', snippet: 's' }] } }] },
    { toolResults: [{ toolName: 'web_search', input: { query: ['b', 'c'] }, output: { results: [{ url: 'u1', title: 'dup', snippet: '' }, { url: 'u2', title: 't2', snippet: 's2', date: '2020' }] } }] },
    { toolResults: [{ toolName: 'web_search', input: { query: 'd' }, output: { error: 'rate_limit', message: 'slow down' } }] },
  ])
  assert.deepEqual(results.map((r) => [r.url, r.query]), [['u1', 'a'], ['u2', 'b | c']])
  assert.deepEqual(queries, ['a', 'b | c', 'd'])
}

pending.push(
  (async () => {
    // The happy path: two independent page-read lineages, a primary → A, evidence from the primary.
    const r = await runLlmDesk({ count: 3 }, deps([claim()], [check()]))
    assert.equal(r.kept.length, 1)
    const k = r.kept[0]
    assert.equal(k.grade, 'A')
    assert.equal(k.sources[k.evidence].url, RESULTS[0].url)
    assert.equal(k.sources.every((s) => s.quote_found && s.read === 'page'), true)
    assert.equal(k.era, 'long-19th')
    assert.ok(k.notes[0].startsWith('LLM check: supported'))
    assert.deepEqual(k.models, { research: 'fake/research', propose: 'fake/propose', check: 'fake/check' })
  })(),
  (async () => {
    // A quote the checker paraphrased (not in the page) does not count; with none left the claim is dropped.
    const bad = check({ sources: [{ id: 'S1', relation: 'supports', is_primary: true, derived_from: null, quality: 1, quote: 'Bicycles were outlawed by the council' }, { id: 'S2', relation: 'supports', is_primary: false, derived_from: null, quality: 0.7, quote: '' }] })
    const r = await runLlmDesk({ count: 3 }, deps([claim()], [bad]))
    assert.equal(r.kept.length, 0)
    assert.match(r.dropped[0].reason, /word for word/)
  })(),
  (async () => {
    // A retelling is one lineage with its parent: A is capped at B.
    const derived = check({ sources: [check().sources[0], { ...check().sources[1], derived_from: 'S1' }] })
    const r = await runLlmDesk({ count: 3 }, deps([claim()], [derived]))
    assert.equal(r.kept[0].grade, 'B')
    assert.equal(new Set(r.kept[0].sources.map((s) => s.independence_group)).size, 1)
  })(),
  (async () => {
    // Snippet-only support is C at most; unsupported is dropped; contradicted is kept as E.
    const snippetOnly = deps([claim()], [check({ grade: 'B' })], { readPage: async () => null })
    const r1 = await runLlmDesk({ count: 3 }, snippetOnly)
    assert.equal(r1.kept[0].grade, 'C')
    assert.equal(r1.kept[0].sources[0].read, 'snippet')

    const r2 = await runLlmDesk({ count: 3 }, deps([claim()], [check({ verdict: 'unsupported' })]))
    assert.equal(r2.kept.length, 0)
    assert.match(r2.dropped[0].reason, /unsupported/)

    const r3 = await runLlmDesk({ count: 3 }, deps([claim()], [check({ verdict: 'contradicted', grade: 'C' })]))
    assert.equal(r3.kept[0].grade, 'E')
    assert.ok(r3.kept[0].flags.includes('contradiction'))
  })(),
  (async () => {
    // Partly supported: the rewrite becomes the claim and the original is noted.
    const r = await runLlmDesk({ count: 3 }, deps([claim()], [check({ verdict: 'partly', grade: 'B', rewrite: 'In 1897 the council of the city banned bicycles from the square.' })]))
    assert.equal(r.kept[0].text, 'In 1897 the council of the city banned bicycles from the square.')
    assert.ok(r.kept[0].notes.some((n) => n.startsWith('Reworded from the proposal')))
  })(),
  (async () => {
    // A claim the desk already has is skipped before the check; count caps how many are checked.
    const known = new Set([sha256(normalizeText(claim().text))])
    const r = await runLlmDesk({ count: 1 }, deps([claim(), claim({ text: 'Another claim about the 1897 bicycle ban in the square.' }), claim({ text: 'A third claim.' })], () => check(), { knownHashes: known }))
    assert.equal(r.kept.length, 1)
    assert.ok(r.dropped.some((d) => d.reason === 'already on the desk'))
    // A check that throws drops that claim only.
    const r2 = await runLlmDesk({ count: 2 }, deps([claim(), claim({ text: 'Second claim about the 1897 ban.' })], (p) => {
      if (p.includes('Second claim')) throw new Error('boom')
      return check()
    }))
    assert.equal(r2.kept.length, 1)
    assert.ok(r2.dropped.some((d) => d.reason.includes('boom')))
  })(),
)

Promise.all(pending).then(
  () => console.log('curious-pipeline llm: ok'),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
