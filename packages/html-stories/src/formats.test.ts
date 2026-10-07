/** Checks for the hosted format runtimes: the bundle is in sync with ../formats,
 *  the runtimes parse, the route serves them, and the reference pages pass the lint.
 *  (run: npx tsx src/formats.test.ts) */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { buildFormatAssets, GENERATED_PATH, renderGeneratedModule } from '../scripts/gen-format-assets'
import { FORMAT_ASSETS } from './formatAssets.generated'
import {
  FORMAT_RUNTIME_MAJOR,
  PAGED_HTML_STORY_FORMATS,
  formatExampleUrl,
  formatRuntimeUrls,
  parseHtmlStoryFormat,
  suggestedFormatFor,
} from './formats'
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

// The reference pages: served sandboxed, each a clean example of its format.
for (const f of PAGED_HTML_STORY_FORMATS) {
  const path = `examples/odyssey-${f}.html`
  assert.equal(formatExampleUrl('vizmaya-fyi', f), `https://vizmaya.fyi/formats/${path}`)
  const res = serveFormatAsset(path)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-security-policy'), HTML_STORY_SANDBOX_CSP)
  const html = FORMAT_ASSETS[path]!
  assert.equal(extractFormatMeta(html), f)
  const { css, js } = formatRuntimeUrls('vizmaya-fyi', f)
  assert.ok(html.includes(`href="${css}"`) && html.includes(`src="${js}"`), `${path}: loads its runtime`)
  // The examples show the formats with charts alone, so the "no photographs"
  // nudge is the one warning they're allowed.
  const lint = lintHtml(html)
  assert.deepEqual(lint.errors, [], `${path}: lint errors`)
  assert.deepEqual(lint.warnings.filter((w) => !w.startsWith('No photographs or video')), [], `${path}: lint`)
}

assert.equal(parseHtmlStoryFormat(undefined), 'scroll')
assert.equal(parseHtmlStoryFormat(' Deck '), 'deck')
assert.equal(parseHtmlStoryFormat('slides'), null)
assert.equal(suggestedFormatFor('epics'), 'book')
assert.equal(suggestedFormatFor('footshorts'), 'deck')

console.log('formats: ok')
