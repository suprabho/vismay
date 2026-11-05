/**
 * Source books as claims (book.ts), on the real Seriously Curious corpus:
 * no network, no Supabase (run: npx tsx src/book.test.ts).
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { bookPlan, whyNotAClaim, yearsIn, type BookArticle, type BookTaxonomy } from './book'
import { scoreClaim, scoreFeatures, gradeFor } from './grade'
import { ERAS } from './taxonomy'

assert.deepEqual(yearsIn('rose from 5% in 2006 to 17% by 2030, up from 1,500 people'), [2006, 2030])
assert.deepEqual(yearsIn('European witchcraft, 1300-1850'), [1300, 1850])
assert.deepEqual(yearsIn('a 2000m climb and 1900km of road'), [])
assert.deepEqual(yearsIn('founded in 300 BC'), [-299])
assert.equal(whyNotAClaim('But most of that water by far - around 97% - is salty.'), 'leans on the sentence before it')
assert.equal(whyNotAClaim('Capacity of wine glasses in England, ml; 1700-2016 Source: BMJ'), 'a chart caption the scrape ran into the text')
assert.equal(whyNotAClaim('In 1888 Cecil Rhodes founded De Beers to consolidate the area\'s mines.'), null)

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '../../../vizmaya-data/seriously-curious')
const articles = JSON.parse(readFileSync(resolve(DATA, 'articles.json'), 'utf8')) as BookArticle[]
const taxonomy = (JSON.parse(readFileSync(resolve(DATA, 'curious-desk.json'), 'utf8')) as { articles: BookTaxonomy }).articles
const plan = bookPlan(articles, taxonomy)

assert.equal(plan.documents.length, articles.length, 'one document per article')
assert.equal(new Set(plan.documents.map((d) => d.canonical_url)).size, plan.documents.length, 'canonical URLs are unique')
assert.ok(plan.claims.length > 250, `most facts become claims (${plan.claims.length})`)
assert.equal(new Set(plan.claims.map((c) => c.claim_hash)).size, plan.claims.length, 'no duplicate claims')
const eras = new Set([...ERAS.map((e) => e.id), 'undated'])
for (const c of plan.claims) {
  assert.ok(c.evidence_quote.length <= 300 && c.text.length <= 500, c.text)
  assert.equal(c.evidence_quote, c.text, 'the claim is the book\'s own sentence')
  assert.ok(eras.has(c.era), c.era)
  assert.ok(!/\bSources?:/.test(c.text), c.text)
}
const rhodes = plan.claims.find((c) => c.text.startsWith('In 1888 Cecil Rhodes'))!
assert.equal(rhodes.era, 'long-19th')
assert.equal(rhodes.theme, 'money-trade')
assert.throws(() => bookPlan(articles, {}), /no desk taxonomy/)

// One book is one lineage: the grader keeps a book fact below A and B until research finds a primary source.
const f = scoreFeatures({
  claim: { text: rhodes.text, kind: rhodes.kind, year_from: 1888, year_to: null, country_code: null, flags: [], evidence_quote: rhodes.text },
  sources: [{ relation: 'supports', independence_group: 'isbn:9781788161367', is_primary: false, is_contemporaneous: false, institutional_quality: 0.8, external_ref: 'isbn:9781788161367', verified_by: 'detector', document_id: null, source_year: 2018, work_type: 'book', quote_found: true }],
})
assert.ok(!['A', 'B'].includes(gradeFor(scoreClaim(f), f)))

console.log(`book: ok (${plan.claims.length} claims from ${plan.documents.length} articles, ${plan.skipped.length} sentences left out)`)
