/** Checks for the vizmaya header/footer wrapper.
 *  (run: npx tsx src/branding.test.ts) */
import assert from 'node:assert/strict'
import { brandHtmlStory } from './branding'

const site = 'https://vizmaya.fyi/'
const doc = `<!doctype html><html lang="en"><head><title>T</title></head><BODY class="x"><h1>Story</h1></BODY></html>`
const out = brandHtmlStory(doc, { siteUrl: site })

// Header right after <body>, footer + script right before </body>.
assert.ok(out.includes('<BODY class="x"><vizmaya-header>'))
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
assert.equal(out.replace(/<vizmaya-header>[\s\S]*<\/vizmaya-header>/, '').replace(/<vizmaya-footer>[\s\S]*<\/script>/, ''), doc)

// Fragments without <body>/<html> still get both bars, in order.
const frag = brandHtmlStory('<head><title>x</title></head><p>hi</p>', { siteUrl: site })
assert.ok(frag.startsWith('<head><title>x</title></head><vizmaya-header>'))
assert.ok(/<p>hi<\/p><vizmaya-footer>[\s\S]*<\/script>$/.test(frag))
const bare = brandHtmlStory('<p>hi</p>', { siteUrl: site })
assert.ok(bare.startsWith('<vizmaya-header>'))

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

console.log('branding: ok')
