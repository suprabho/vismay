/** Checks for metadata extraction + the hosting lint.
 *  (run: npx tsx src/meta.test.ts) */
import assert from 'node:assert/strict'
import { extractHtmlMeta, extractThemeMeta, isSafeSlug, lintHtml, parseAuraSlug, slugify, themeMetaContent } from './meta'

const good = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>India&rsquo;s solar boom &amp; the grid</title>
<meta content="Capacity tripled in four years." name="description">
<meta property='og:image' content='https://cdn.example.com/og.png'>
<meta name="vizmaya:theme" content="background:#0a0e14; surface:#111820; text:#e0ddd5; muted:#5a6a70; accent:#D85A30; accent2:#534AB7; teal:#1D9E75">
<link rel="preconnect" href="https://fonts.googleapis.com">
<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>
</head><body><a href="/">home</a><a href="#sources">sources</a><h1>Ignored</h1></body></html>`

assert.deepEqual(extractHtmlMeta(good), {
  title: 'India’s solar boom & the grid',
  description: 'Capacity tripled in four years.',
  ogImageUrl: 'https://cdn.example.com/og.png',
})
assert.deepEqual(lintHtml(good), { errors: [], warnings: [] })

// Falls back to og:title, then <h1>.
assert.equal(extractHtmlMeta('<meta property="og:title" content="OG">').title, 'OG')
assert.equal(extractHtmlMeta('<h1>Big <em>news</em></h1>').title, 'Big news')

// Fragments are rejected; empty is rejected.
assert.equal(lintHtml('<div>hi</div>').errors.length, 1)
assert.equal(lintHtml('   ').errors.length, 1)

// Relative assets and storage use warn but don't block.
const risky = good.replace('</body>', '<img src="images/map.png"><script>localStorage.x=1</script></body>')
const r = lintHtml(risky)
assert.equal(r.errors.length, 0)
assert.ok(r.warnings.some((w) => w.includes('images/map.png')))
assert.ok(r.warnings.some((w) => w.includes('browser storage')))
// Guarded storage doesn't warn.
const guarded = good.replace('</body>', '<script>try { localStorage.x = 1 } catch (e) {}</script></body>')
assert.deepEqual(lintHtml(guarded).warnings, [])

// Missing head bits warn.
const bare = lintHtml('<html><body><p>x</p></body></html>')
assert.equal(bare.errors.length, 0)
assert.equal(bare.warnings.length, 6)

// Size cap.
assert.equal(lintHtml(good.replace('</body>', 'x'.repeat(4 * 1024 * 1024) + '</body>')).errors.length, 1)

assert.equal(slugify('  India’s Solar Boom — 2026! '), 'india-s-solar-boom-2026')
assert.equal(slugify('Café Économie'), 'cafe-economie')
assert.ok(isSafeSlug('india-solar-2026'))
assert.ok(!isSafeSlug('India'))
assert.ok(!isSafeSlug('a--b'))
assert.ok(!isSafeSlug('-a'))
assert.ok(!isSafeSlug('a'.repeat(81)))

// The theme tag round-trips, keeps only hex values, and needs its core slots.
const theme = { background: '#0a0e14', surface: '#111820', text: '#e0ddd5', muted: '#5a6a70', accent: '#D85A30', accent2: '#534AB7', teal: '#1D9E75' }
assert.deepEqual(extractThemeMeta(good), theme)
assert.equal(themeMetaContent(theme), 'background:#0a0e14; surface:#111820; text:#e0ddd5; muted:#5a6a70; accent:#D85A30; accent2:#534AB7; teal:#1D9E75')
assert.equal(extractThemeMeta(good.replace('accent:#D85A30', 'accent:red')), null)
assert.equal(extractThemeMeta('<p>no tag</p>'), null)
assert.ok(lintHtml(good.replace(/<meta name="vizmaya:theme"[^>]*>/, '')).warnings.some((w) => w.includes('vizmaya:theme')))

// Aura slugs: bare, or pulled out of a scene / embed URL.
assert.equal(parseAuraSlug('  minimalist-gold-background '), 'minimalist-gold-background')
assert.equal(parseAuraSlug('https://aura.promad.design/scenes/blue-lines/capture.png?w=1'), 'blue-lines')
assert.equal(parseAuraSlug('https://aura.promad.design/embed/Blue-Lines?hideText=true'), 'blue-lines')
assert.equal(parseAuraSlug('blue lines'), null)
assert.equal(parseAuraSlug('"><script>'), null)
assert.equal(parseAuraSlug('https://aura.promad.design/embed/%E0%A4%A'), null)

console.log('meta: ok')
