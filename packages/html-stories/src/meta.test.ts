/** Checks for metadata extraction + the hosting lint.
 *  (run: npx tsx src/meta.test.ts) */
import assert from 'node:assert/strict'
import {
  extractFormatMeta,
  extractHtmlMeta,
  extractThemeMeta,
  expiringUrlReason,
  extractTripMeta,
  findExpiringUrls,
  isSafeSlug,
  isTripStorySlug,
  lintHtml,
  parseAuraSlug,
  slugify,
  themeMetaContent,
} from './meta'

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
</head><body><a href="/">home</a><a href="#sources">sources</a><h1>Ignored</h1>
<figure><img src="https://upload.wikimedia.org/a.jpg" alt="Panels at Bhadla"><figcaption>Photo: A. B. / Wikimedia Commons, CC BY-SA 4.0</figcaption></figure></body></html>`

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
assert.equal(bare.warnings.length, 7)

// Media: a photo figure is expected, every <img> needs alt, every photo figure a caption.
const noPhotos = good.replace(/<figure>[\s\S]*?<\/figure>/, '<figure><svg></svg><figcaption>Chart</figcaption></figure>')
assert.ok(lintHtml(noPhotos).warnings.some((w) => w.startsWith('No photographs or video')))
// A figure a script writes counts as media, but its markup isn't checked.
const scripted = noPhotos.replace('</body>', '<script>el.innerHTML = `<figure><img src="${u}"></figure>`</script></body>')
assert.deepEqual(lintHtml(scripted).warnings, [])
const sloppy = good.replace('</body>', '<figure><img src="https://x.org/b.jpg"><img src="https://x.org/c.jpg" alt=""></figure><img src="https://x.org/crest.png" alt=""></body>')
const sw = lintHtml(sloppy).warnings
assert.equal(sw.length, 2)
assert.ok(sw.some((w) => w.startsWith('1 <img> without an alt attribute')))
assert.ok(sw.some((w) => w.startsWith('1 photo or video figure has no <figcaption>')))
assert.ok(lintHtml(good.replace('<img src="https://upload.wikimedia.org/a.jpg"', '<video src="https://x.org/v.mp4"')).warnings.length === 0)

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

// Formats: the tag, the runtime it needs, its units.
assert.equal(extractFormatMeta(good), 'scroll')
const book = good
  .replace(
    '</head>',
    '<meta content=" Book " name="vizmaya:format"><link rel="stylesheet" href="https://vizmaya.fyi/formats/book@1.css"><script src="https://vizmaya.fyi/formats/book@1.js"></script></head>',
  )
  .replace('<body>', '<body><main class="stage"><div class="pages"><article class="page" data-unit>x</article></div></main>')
assert.equal(extractFormatMeta(book), 'book')
assert.deepEqual(lintHtml(book).warnings, [])
const warns = (html: string) => lintHtml(html).warnings
// No runtime (and no inline one setting html.book-on): it would read as one column.
assert.ok(warns(book.replace(/<script src="https:\/\/vizmaya\.fyi\/formats\/book@1\.js"><\/script>/, '')).some((w) => w.includes("doesn't load its runtime")))
assert.deepEqual(warns(book.replace(/<script src="[^"]*book@1\.js"><\/script>/, '<script>root.classList.add("book-on")</script>')), [])
// No units; scroll-format markers.
assert.ok(warns(book.replace(' data-unit', '')).some((w) => w.includes('No [data-unit]')))
assert.ok(warns(book.replace('<article class="page" data-unit>', '<article class="page" data-unit data-step>')).some((w) => w.includes('data-step')))
// A value that isn't a format: listed as scroll, and said so.
const odd = book.replace('content=" Book "', 'content="slides"')
assert.equal(extractFormatMeta(odd), 'scroll')
assert.ok(warns(odd).some((w) => w.includes('isn\'t a format')))
// A runtime without the tag.
assert.ok(warns(book.replace(/<meta content=" Book " name="vizmaya:format">/, '')).some((w) => w.includes('add <meta name="vizmaya:format" content="book">')))
// data-step is fine in a scroll story.
assert.deepEqual(warns(good.replace('<body>', '<body><section data-step>x</section>')), [])

// Travel: the page must name its trip, and the slug must sit under the trip's.
const trip = good.replace('<head>', '<head><meta name="travel:trip" content="new-york-2026">')
assert.equal(extractTripMeta(trip), 'new-york-2026')
assert.equal(extractTripMeta(good), null)
assert.equal(extractTripMeta(good.replace('<head>', '<head><meta name="travel:trip" content="../etc">')), null)
assert.ok(isTripStorySlug('new-york-2026', 'new-york-2026') && isTripStorySlug('new-york-2026-day-3', 'new-york-2026'))
assert.ok(!isTripStorySlug('new-york-20267', 'new-york-2026') && !isTripStorySlug('paris', 'new-york-2026'))
assert.deepEqual(lintHtml(trip, { app: 'travel', slug: 'new-york-2026-day-3' }).errors, [])
assert.equal(lintHtml(good, { app: 'travel', slug: 'new-york-2026-day-3' }).errors.length, 1)
assert.ok(lintHtml(trip, { app: 'travel', slug: 'paris-day-1' }).errors[0]?.includes('start with "new-york-2026-"'))
// Other apps don't care about the tag.
assert.deepEqual(lintHtml(good, { app: 'footshorts', slug: 'x' }).errors, [])

console.log('meta: ok')

// Expiring links: signed, time-limited URLs break the page days later.
{
  const withImg = (src: string) => good.replace('https://upload.wikimedia.org/a.jpg', src)
  const pikaso =
    'https://pikaso.cdnpk.net/private/production/5950756048/render.png?token=exp=1794182400~hmac=4e8d750775cb&amp;w=1024&amp;preview=1'
  const r = lintHtml(withImg(pikaso))
  assert.equal(r.errors.length, 1)
  assert.match(r.errors[0] ?? '', /private Freepik\/Magnific render link/)
  assert.match(r.errors[0] ?? '', /assets endpoint/)

  const expiring = [
    'https://bucket.s3.amazonaws.com/a.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=3600&X-Amz-Signature=abc',
    'https://storage.googleapis.com/b/a.png?X-Goog-Algorithm=GOOG4-RSA-SHA256&X-Goog-Expires=600&X-Goog-Signature=abc',
    'https://oaidalleapiprodscus.blob.core.windows.net/private/img.png?st=2026&se=2026-11-01&sig=abc',
    'https://acct.blob.core.windows.net/c/a.png?sv=2022&se=2026-11-01T00:00Z&sig=abc',
    'https://d111.cloudfront.net/a.png?Expires=1794182400&Signature=abc&Key-Pair-Id=K1',
    'https://replicate.delivery/pbxt/abc/out.png',
    'https://cdn.discordapp.com/attachments/1/2/a.png?ex=67&is=66&hm=abc',
    'https://xyz.supabase.co/storage/v1/object/sign/story-assets/a.png?token=eyJ',
    'https://cdn.example.com/a.png?exp=1794182400&sig=abc',
  ]
  for (const url of expiring) assert.ok(expiringUrlReason(url), url)
  // Lasting links pass, including the story-assets bucket and look-alike params.
  const lasting = [
    'https://upload.wikimedia.org/wikipedia/commons/5/56/Milton_Friedman_1976_by_Eddie_Adams.jpg',
    'https://xyz.supabase.co/storage/v1/object/public/story-assets/html-stories/s/abc.png',
    'https://img.freepik.com/free-photo/a.jpg?w=740',
    'https://example.com/search?q=signature&page=2',
    'https://example.com/a?expires=soon',
  ]
  for (const url of lasting) assert.equal(expiringUrlReason(url), null, url)

  // Found in scripts too, and counted once each.
  const scripted = withImg('https://upload.wikimedia.org/a.jpg').replace(
    '</body>',
    `<script>img.src = "${expiring[0]}"; other.src = "${expiring[0]}"</script></body>`,
  )
  assert.equal(findExpiringUrls(scripted).length, 1)
  assert.equal(lintHtml(scripted).errors.length, 1)
}
