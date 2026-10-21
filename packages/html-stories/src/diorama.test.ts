/** Checks for the diorama data contract and its lint (run: npx tsx src/diorama.test.ts) */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FORMAT_ASSETS } from './formatAssets.generated'
import { checkDioramaStory, evaluateDerivation, extractDioramaStory, haversineKm, type DioramaStory } from './diorama'
import { lintHtml } from './meta'

// Haversine: Troy (Hisarlik) to Ithaki is about 506 km, 273 nm.
const troy = { lat: 39.9575, lon: 26.2389 }
const ithaki = { lat: 38.42, lon: 20.71 }
assert.ok(Math.abs(haversineKm(troy, ithaki) - 506.1) < 0.5)

// The reference page's story: parses, and every computed figure matches its derivation.
const html = FORMAT_ASSETS['examples/odyssey-diorama.html']!
const { story, error } = extractDioramaStory(html)
assert.equal(error, null)
assert.deepEqual(checkDioramaStory(story!), [])
assert.equal(story!.beats.length, 8)
// The research folder's story.json is the same data the page embeds.
const data = JSON.parse(readFileSync(join(__dirname, '..', '..', '..', 'vizmaya-data', 'odyssey-voyage', 'diorama', 'story.json'), 'utf8'))
assert.deepEqual(data, story, 'vizmaya-data/odyssey-voyage/diorama/story.json differs from the example page')

const s = (): DioramaStory => JSON.parse(JSON.stringify(story))
const ev = (d: string, unit = 'nm') => evaluateDerivation(d, unit, story!).value
assert.equal(Math.round(ev('haversine(troy, ithaki)')!), 273)
assert.equal(Math.round(ev('route(troy, malea, ithaki)')!), 424)
assert.equal(Math.round(ev('haversine(troy, ithaki)', 'km')!), 506)
assert.equal(ev('sum(calypso-years, circe-years)', 'yr'), 8)
assert.equal(ev('share(circe-years, years-total)', '%'), 10)
assert.equal(ev('stops(trad)', 'stops'), 15)
assert.equal(ev('count(a, b, c)', 'routes'), 3)
assert.equal(ev('haversine(troy, atlantis)'), null)
assert.equal(ev('haversine(troy, ithaki)', 'yr'), null)
assert.equal(ev('guess(troy)'), null)

// The research's 565 nm, left in as "computed", is caught with the right number.
{
  const x = s()
  x.quantities.find((q) => q.id === 'troy-ithaca-gc')!.value = 565
  const w = checkDioramaStory(x)
  assert.equal(w.length, 1)
  assert.ok(w[0]!.includes('says 565 nm') && w[0]!.includes('gives 273.29 nm'))
}
// Rounded figures pass; a place with no certainty, a stop that isn't a place, a dangling source fail.
{
  const x = s()
  x.quantities.find((q) => q.id === 'troy-ithaca-sea')!.value = 424.1
  assert.deepEqual(checkDioramaStory(x), [])
  ;(x.places[0] as { certainty: string }).certainty = 'probably'
  x.routes[0]!.stops.push('atlantis')
  x.quantities.push({ id: 'z', label: 'z', value: 1, unit: 'x', status: 'sourced', sources: ['nowhere'] })
  x.beats = x.beats.slice(0, 5)
  const w = checkDioramaStory(x).join('\n')
  assert.ok(w.includes('Place "troy" needs a certainty'))
  assert.ok(w.includes('stops at "atlantis"'))
  assert.ok(w.includes('cites "nowhere"'))
  assert.ok(w.includes('6 to 10 beats'))
}

// The lint: sections and beats pair up, data-q points at quantities, every source is linked.
const warns = (h: string) => lintHtml(h).warnings.filter((w) => w.startsWith('Diorama') || w.includes('diorama-data'))
assert.deepEqual(warns(html), [])
assert.ok(warns(html.replace('data-beat="wine"', 'data-beat="wine2"')).some((w) => w.includes('beat "wine" has no <section')))
assert.ok(warns(html.replace('data-q="ithaki-paliki"', 'data-q="ithaki-paliki-km"')).some((w) => w.includes('data-q="ithaki-paliki-km"')))
assert.ok(warns(html.replace('<a href="https://odysseus-unbound.org/">', '<a href="#">')).some((w) => w.includes('"bittlestone"')))
assert.ok(warns(html.replace('class="diorama-data"', 'class="data"')).some((w) => w.includes('No <script type="application/json" class="diorama-data">')))
assert.ok(warns(html.replace('"type": "stepper"', '"type": "slideshow"')).some((w) => w.includes('unknown type "slideshow"')))

console.log('diorama: ok')
