/** Checks for the hosted format runtimes: the bundle is in sync with ../formats,
 *  the runtimes parse, the route serves them, and the reference pages pass the lint.
 *  (run: npx tsx src/formats.test.ts) */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildFormatAssets, GENERATED_PATH, renderGeneratedModule } from '../scripts/gen-format-assets'
import { FORMAT_ASSETS } from './formatAssets.generated'
import {
  FORMAT_EXAMPLES,
  FORMAT_RUNTIME_MAJOR,
  PAGED_HTML_STORY_FORMATS,
  formatsForApp,
  isFormatForApp,
  formatExampleUrl,
  formatRuntimeUrls,
  RETIRED_HTML_STORY_FORMATS,
  parseHtmlStoryFormat,
  suggestedFormatFor,
} from './formats'
import { TRAVEL_BOARD_EXAMPLE } from './formatBrief'
import { serveFormatAsset } from './formatsApi'
import { extractFormatMeta, HTML_STORY_SANDBOX_CSP, lintHtml } from './meta'

// The generated bundle matches the sources (else: pnpm --filter @vismay/html-stories gen:formats).
assert.equal(readFileSync(GENERATED_PATH, 'utf8'), renderGeneratedModule(buildFormatAssets()), 'formatAssets.generated.ts is stale')

// One story runtime, and a script + stylesheet per paged format, at the current major.
const paths = Object.keys(FORMAT_ASSETS)
assert.ok(paths.includes(`story@${FORMAT_RUNTIME_MAJOR}.js`))
for (const f of PAGED_HTML_STORY_FORMATS) {
  const js = FORMAT_ASSETS[`${f}@${FORMAT_RUNTIME_MAJOR}.js`]!
  const css = FORMAT_ASSETS[`${f}@${FORMAT_RUNTIME_MAJOR}.css`]!
  assert.ok(js && css, `${f}: runtime missing`)
  // Each format script carries the story runtime (window.Story) ahead of its own.
  assert.ok(js.indexOf('w.Story = {') < js.indexOf(`ui.boot('${f}'`), `${f}: bundle order`)
  assert.ok(css.includes('.vz-btn') && css.includes(`html.${f}-on .stage`), `${f}: stylesheet`)
  // URLs the brief hands out point at what the route serves.
  assert.equal(formatRuntimeUrls('vizmaya-fyi', f).js, `https://vizmaya.fyi/formats/${f}@${FORMAT_RUNTIME_MAJOR}.js`)
  assert.equal(formatRuntimeUrls('footshorts', f).css, `https://footshorts.com/formats/${f}@${FORMAT_RUNTIME_MAJOR}.css`)
}
// Every script parses (syntax only; the browser checks run them).
for (const p of paths.filter((p) => p.endsWith('.js'))) {
  assert.doesNotThrow(() => new Function(FORMAT_ASSETS[p]!), `${p} doesn't parse`)
}

// The route: types, CORS and caching; 404 for anything else, prototype keys included.
const js = serveFormatAsset('book@1.js')
assert.equal(js.status, 200)
assert.equal(js.headers.get('content-type'), 'text/javascript; charset=utf-8')
assert.equal(js.headers.get('access-control-allow-origin'), '*')
assert.ok(js.headers.get('cache-control')!.includes('max-age=3600'))
assert.equal(js.headers.get('content-security-policy'), null)
assert.equal(serveFormatAsset('deck@1.css').headers.get('content-type'), 'text/css; charset=utf-8')
for (const bad of ['book@2.js', 'book.js', 'nope', '', '__proto__', 'constructor', 'toString', '../package.json', 'examples/']) {
  assert.equal(serveFormatAsset(bad).status, 404, bad)
}

// The reference pages: served sandboxed, each a clean example of its format,
// loading its runtime from a site that can host it (recap: vizf1's).
for (const f of PAGED_HTML_STORY_FORMATS) {
  const path = `examples/${FORMAT_EXAMPLES[f]}`
  const app = isFormatForApp('vizmaya-fyi', f) ? 'vizmaya-fyi' : 'vizf1'
  assert.equal(formatExampleUrl('vizmaya-fyi', f), `https://vizmaya.fyi/formats/${path}`)
  const res = serveFormatAsset(path)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-security-policy'), HTML_STORY_SANDBOX_CSP)
  const html = FORMAT_ASSETS[path]!
  assert.equal(extractFormatMeta(html), f)
  const { css, js } = formatRuntimeUrls(app, f)
  assert.ok(html.includes(`href="${css}"`) && html.includes(`src="${js}"`), `${path}: loads its runtime`)
  // The examples show the formats with charts alone, so the "no photographs"
  // nudge is the one warning they're allowed.
  const lint = lintHtml(html)
  assert.deepEqual(lint.errors, [], `${path}: lint errors`)
  assert.deepEqual(lint.warnings.filter((w) => !w.startsWith('No photographs or video')), [], `${path}: lint`)
}

// Travel's board example is a trip's own story (private, so not under /formats):
// the git copy the brief points at. It names its trip, loads travel's runtime,
// lints clean, and every string and tour step points at something real.
{
  const ex = TRAVEL_BOARD_EXAMPLE
  const html = readFileSync(join(__dirname, '..', '..', '..', ex.path), 'utf8')
  assert.equal(extractFormatMeta(html), 'board')
  assert.ok(ex.slug.startsWith(`${ex.trip}-`))
  const { css, js } = formatRuntimeUrls('travel', 'board')
  assert.ok(html.includes(`href="${css}"`) && html.includes(`src="${js}"`), 'travel board: loads its runtime')
  const lint = lintHtml(html, { app: 'travel', slug: ex.slug })
  assert.deepEqual(lint.errors, [], 'travel board: lint errors')
  assert.deepEqual(lint.warnings, [], 'travel board: lint warnings')
  const ids = new Set([...html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]))
  for (const [, t] of html.matchAll(/data-target(?:-sm)?="([^"]+)"/g)) {
    for (const id of t.split(/\s+/)) assert.ok(id === 'board' || ids.has(id), `travel board: tour targets a missing item "${id}"`)
  }
  const pins = [...html.matchAll(/data-pin-to="map:(\d+)"/g)].map((m) => +m[1])
  assert.ok(pins.length >= 12 && pins.every((n) => n >= 1 && n <= 12), 'travel board: every stop card is strung to a stop')
  assert.deepEqual([...new Set(pins)].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])
  assert.ok(!html.includes('/formats/examples/'), 'travel board: not served as a public example')
}

assert.equal(parseHtmlStoryFormat(undefined), 'scroll')
assert.equal(parseHtmlStoryFormat(' Deck '), 'deck')
assert.equal(parseHtmlStoryFormat('slides'), null)
assert.equal(suggestedFormatFor('epics'), 'book')
assert.equal(suggestedFormatFor('footshorts'), 'deck')

// recap frames vizf1's race replay: vizf1 only.
assert.deepEqual(formatsForApp('vizf1'), ['scroll', 'book', 'board', 'deck', 'collage', 'recap'])
assert.deepEqual(formatsForApp('vizmaya-fyi'), ['scroll', 'book', 'board', 'deck', 'collage'])
assert.equal(isFormatForApp('footshorts', 'recap'), false)

// A retired format: no site offers it, a page declaring it still lists as it
// (with a warning), and its runtime is still served for the stories already up.
for (const f of RETIRED_HTML_STORY_FORMATS) {
  assert.equal(isFormatForApp('vizmaya-fyi', f), false)
  assert.equal(parseHtmlStoryFormat(f), f)
  assert.equal(extractFormatMeta(`<meta name="vizmaya:format" content="${f}">`), f)
  assert.ok(lintHtml(`<meta name="vizmaya:format" content="${f}">`).warnings.some((w) => w.includes(`The ${f} format is retired`)))
  assert.equal(serveFormatAsset(`${f}@${FORMAT_RUNTIME_MAJOR}.js`).status, 200)
  assert.equal(serveFormatAsset(`${f}@${FORMAT_RUNTIME_MAJOR}.css`).status, 200)
}

console.log('formats: ok')
