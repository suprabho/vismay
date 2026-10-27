/** Checks for section extraction, speech splitting and the player's markup.
 *  (run: npx tsx src/narration.test.ts) */
import assert from 'node:assert/strict'
import { audioPlayerHtml, audioPlayerLook } from './audioPlayer'
import { extractNarrationSections, htmlHash, narrationHash, splitForSpeech } from './narration'

// Paged format: outermost [data-unit], labels, skipped bits, overrides, silence.
const book = `<!doctype html><html><head><title>Odyssey</title></head><body>
<main class="stage"><div class="pages">
  <article class="page cover" data-unit data-label="Cover"><h1>The long way home</h1><p>Ten years at sea.</p></article>
  <article class="page" data-unit data-head="The distance">
    <h2>The distance</h2>
    <p>Odysseus sails  <b>a thousand</b> miles.</p>
    <figure><img src="x.jpg" alt="Map"><figcaption>Photo: Wikimedia, CC BY</figcaption></figure>
    <div class="chart" data-chart="route"><p>Chart alt text</p></div>
    <table><tr><td>42</td></tr></table>
    <ul><li><p>Troy</p></li><li>Ithaca</li></ul>
    <p aria-hidden="true">decoration</p><p data-no-narrate>not read</p>
    <section data-unit><p>nested unit is part of its page</p></section>
  </article>
  <article class="page" data-unit data-narration="Read this instead, word for word."><p>Ignored text here.</p></article>
  <article class="page" data-unit data-no-narrate><p>A silent page with words.</p></article>
  <article class="page endpaper" data-unit><p>Fin.</p></article>
</div></main>
<script>var x = 'never read'</script>
</body></html>`

const s = extractNarrationSections(book, 'Orus')
assert.equal(s.length, 5, 'outermost units only')
assert.deepEqual(s.map((x) => x.label), ['Cover', 'The distance', 'Section 3', 'Section 4', 'Section 5'])
assert.equal(s[0].text, 'The long way home. Ten years at sea.')
assert.equal(
  s[1].text,
  'The distance. Odysseus sails a thousand miles. Troy. Ithaca. nested unit is part of its page.',
  'figures, charts, tables, hidden and opted-out bits skipped; leaf blocks once',
)
assert.equal(s[2].text, 'Read this instead, word for word.')
assert.equal(s[3].text, '', 'data-no-narrate on the unit silences it')
assert.equal(s[3].hash, '')
assert.equal(s[4].text, '', 'under three words is silent')
assert.equal(s[1].hash, narrationHash(s[1].text, 'Orus'))
assert.notEqual(narrationHash('a b c', 'Orus'), narrationHash('a b c', 'Kore'), 'the voice is part of the hash')

// Scroll: [data-step] before <section>; plain <section> as the fallback.
const steps = `<body><section><div data-step><h2>One</h2><p>First chapter text.</p></div>
<div data-step><p>Second chapter, two words more.</p></div></section></body>`
assert.equal(extractNarrationSections(steps).length, 2)
const sections = `<body><header><h1>Title</h1></header><section><h2>Why</h2><p>Because of reasons, mostly.</p>
<section><p>inner</p></section></section><section><p>Another section entirely here.</p></section></body>`
const ss = extractNarrationSections(sections)
assert.equal(ss.length, 2)
assert.equal(ss[0].label, 'Why')
assert.equal(ss[0].text, 'Why. Because of reasons, mostly. inner.')
assert.equal(extractNarrationSections('<body><p>No sections at all.</p></body>').length, 0)

// Long text splits at sentence ends, within the limit, losing nothing.
const long = Array.from({ length: 60 }, (_, i) => `Sentence number ${i} is here.`).join(' ')
const parts = splitForSpeech(long, 200)
assert.ok(parts.length > 1 && parts.every((p) => p.length <= 200))
assert.equal(parts.join(' '), long)
assert.deepEqual(splitForSpeech('short.'), ['short.'])
assert.ok(splitForSpeech('x'.repeat(50) + ' ' + 'y'.repeat(50), 60).every((p) => p.length <= 60))

assert.equal(htmlHash(book), htmlHash(book))
assert.notEqual(htmlHash(book), htmlHash(book + ' '))

// The player: nothing without a clip; script-safe JSON; the theme's hex colours only.
assert.equal(audioPlayerHtml([{ index: 0, label: 'a', hash: null, url: null, durationMs: 0 }], { look: audioPlayerLook(null) }), '')
const player = audioPlayerHtml(
  [
    { index: 0, label: '</script><b>', hash: 'h', url: 'https://x.supabase.co/a.wav', durationMs: 61000 },
    { index: 1, label: 'Silent', hash: null, url: null, durationMs: 0 },
  ],
  { look: audioPlayerLook({ background: '#fff', text: 'red;}', accent: '#123456' }), title: 'T' },
)
assert.ok(!/<\/script><b>/.test(player), 'labels cannot close the script')
assert.ok(player.includes('"count":2'))
assert.ok(!player.includes('"Silent"'), 'silent sections are not shipped')
assert.ok(player.includes('"text":"#e0ddd5"'), 'a non-hex colour falls back')
assert.ok(player.includes('["[data-unit]","[data-step]","section"]'))
// The script itself parses.
const js = player.slice(player.lastIndexOf('<script>') + 8, player.lastIndexOf('</script>'))
assert.doesNotThrow(() => new Function(js))
assert.ok(/^[\x00-\x7f]*$/.test(js), 'ASCII only: a page without a charset still reads it right')

console.log('narration: ok')
