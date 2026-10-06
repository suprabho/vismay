/** Checks for the vizmaya header/footer wrapper.
 *  (run: npx tsx src/branding.test.ts) */
import assert from 'node:assert/strict'
import { brandHtmlStory } from './branding'

const site = 'https://vizmaya.fyi/'
const doc = `<!doctype html><html lang="en"><head><title>T</title></head><BODY class="x"><h1>Story</h1></BODY></html>`
const out = brandHtmlStory(doc, { siteUrl: site })
const CHROME_H = '<style>:root{--vizmaya-chrome-h:65px}@media (max-width:480px){:root{--vizmaya-chrome-h:57px}}</style>'

// The header's height for paged formats, then the header, right after <body>;
// footer + script right before </body>.
assert.ok(out.includes(`<BODY class="x">${CHROME_H}<vizmaya-header>`))
assert.ok(/<\/vizmaya-footer><script>[\s\S]*<\/script><\/BODY><\/html>$/.test(out))
assert.ok(out.indexOf('<h1>Story</h1>') > out.indexOf('</vizmaya-header>'))
assert.ok(out.indexOf('<h1>Story</h1>') < out.indexOf('<vizmaya-footer>'))
// Assets are absolute (the page runs in an opaque origin) with no double slash.
assert.ok(out.includes('"https://vizmaya.fyi/vizmaya-logo.riv"'))
// The static mark is inline, in the home page's colours, so it never 404s/401s.
assert.ok(!out.includes('<img'))
assert.ok(out.includes('fill="#0BBFAB"') && out.includes('"textColor":"#111111"'))
assert.ok(!out.includes('vizmaya.fyi//'))
// The story itself is untouched.
assert.equal(
  out.replace(CHROME_H, '').replace(/<vizmaya-header>[\s\S]*<\/vizmaya-header>/, '').replace(/<vizmaya-footer>[\s\S]*<\/script>/, ''),
  doc,
)

// Fragments without <body>/<html> still get both bars, in order.
const frag = brandHtmlStory('<head><title>x</title></head><p>hi</p>', { siteUrl: site })
assert.ok(frag.startsWith(`<head><title>x</title></head>${CHROME_H}<vizmaya-header>`))
assert.ok(/<p>hi<\/p><vizmaya-footer>[\s\S]*<\/script>$/.test(frag))
const bare = brandHtmlStory('<p>hi</p>', { siteUrl: site })
assert.ok(bare.startsWith(`${CHROME_H}<vizmaya-header>`))

// A page that declares its palette gets bars and a logo in it.
const themed = brandHtmlStory(
  doc.replace('<title>T</title>', '<title>T</title><meta name="vizmaya:theme" content="background:#fffdf8; surface:#f1ece2; text:#222222; muted:#777777; accent:#c0392b; accent2:#2e5e8c; teal:#3a8f6b">'),
  { siteUrl: site },
)
assert.ok(themed.includes(':host{--bg:#fffdf8;--fg:#222222;--link:#777777;--line:#777777}'))
assert.ok(themed.includes(':host{--bg:#f1ece2;'))
assert.ok(themed.includes('"textColor":"#222222"') && themed.includes('fill="#3a8f6b"'))
assert.ok(!themed.includes('#F4F1EC'))
// Non-hex values are ignored, and an incomplete palette falls back to the home look.
const bad = brandHtmlStory(doc.replace('<title>T</title>', '<meta name="vizmaya:theme" content="background:red;}</style><script>; text:#000">'), { siteUrl: site })
assert.ok(bad.includes('--bg:#F4F1EC'))

// No aura unless one is set.
assert.ok(!out.includes('vizmaya-aura') && !out.includes('aura.promad.design'))
// An aura goes behind the page: still + live embed + a veil in the page background, body cleared.
const aura = brandHtmlStory(themed.length ? doc.replace('<title>T</title>', '<title>T</title><meta name="vizmaya:theme" content="background:#fffdf8; surface:#f1ece2; text:#222222; muted:#777777; accent:#c0392b; accent2:#2e5e8c; teal:#3a8f6b">') : doc, { siteUrl: site, aura: 'gold-lines' })
assert.ok(aura.includes(`<BODY class="x">${CHROME_H}<style>html,body{background:transparent!important}</style><vizmaya-aura`))
assert.ok(aura.indexOf('</vizmaya-aura>') < aura.indexOf('<vizmaya-header>'))
assert.ok(aura.includes('src="https://aura.promad.design/scenes/gold-lines/capture.png?w=1920&amp;h=1080&amp;dpr=1"'))
assert.ok(aura.includes('src="https://aura.promad.design/embed/gold-lines?hideText=true&amp;'))
assert.ok(aura.includes('.veil{position:absolute;inset:0;background:#fffdf8;opacity:0.35}'))
// Without a palette there's no veil colour to wash with.
assert.ok(brandHtmlStory(doc, { siteUrl: site, aura: 'gold-lines' }).includes('.veil{position:absolute;inset:0}'))

console.log('branding: ok')

// Footshorts chrome: its own bars and mark, no Rive, links into the app.
const fsOut = brandHtmlStory(doc, { siteUrl: 'https://footshorts.com/', app: 'footshorts' })
// Footshorts' bar is 60px (52px on phones) plus its border.
assert.ok(fsOut.includes('<BODY class="x"><style>:root{--vizmaya-chrome-h:61px}@media (max-width:480px){:root{--vizmaya-chrome-h:53px}}</style><footshorts-header>'))
assert.ok(/<\/footshorts-footer><\/BODY><\/html>$/.test(fsOut))
assert.ok(!fsOut.includes('vizmaya-header') && !fsOut.includes('rive'))
assert.ok(fsOut.includes('href="https://footshorts.com/feed"'))
assert.ok(fsOut.includes('href="https://footshorts.com/about-us"'))
// The classic-theme mark colour when the page declares no palette…
assert.ok(fsOut.includes('fill="#F26A3C"'))
assert.ok(!fsOut.includes('footshorts.com//'))
// …and the page's accent when it does.
const fsThemedDoc = `<!doctype html><html><head><meta name="vizmaya:theme" content="background:#FAF7F2; surface:#FFFFFF; text:#1B1A17; muted:#6B675E; accent:#C2410C; accent2:#1B1A17; teal:#2F855A"></head><body><p>x</p></body></html>`
const fsThemed = brandHtmlStory(fsThemedDoc, { siteUrl: 'https://footshorts.com', app: 'footshorts', aura: 'some-scene' })
assert.ok(fsThemed.includes('fill="#C2410C"'))
assert.ok(fsThemed.includes('--bg:#FAF7F2'))
assert.ok(fsThemed.includes('<vizmaya-aura'))
assert.ok(fsThemed.indexOf('<vizmaya-aura') < fsThemed.indexOf('<footshorts-header>'))
console.log('branding (footshorts): ok')

// Embedded (chrome: false, /s/<slug>?embed=1): no bars, the aura stays, the story untouched.
const embedded = brandHtmlStory(doc, { siteUrl: 'https://footshorts.com', app: 'footshorts', chrome: false })
assert.equal(embedded, doc)
const embeddedAura = brandHtmlStory(fsThemedDoc, { siteUrl: 'https://footshorts.com', app: 'footshorts', aura: 'some-scene', chrome: false })
assert.ok(embeddedAura.includes('<vizmaya-aura'))
assert.ok(!embeddedAura.includes('footshorts-header') && !embeddedAura.includes('footshorts-footer'))
console.log('branding (embed): ok')
