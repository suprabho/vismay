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
assert.ok(out.includes('src="https://vizmaya.fyi/vizmaya-logo-01.svg"'))
assert.ok(!out.includes('vizmaya.fyi//'))
// The story itself is untouched.
assert.equal(out.replace(/<vizmaya-header>[\s\S]*<\/vizmaya-header>/, '').replace(/<vizmaya-footer>[\s\S]*<\/script>/, ''), doc)

// Fragments without <body>/<html> still get both bars, in order.
const frag = brandHtmlStory('<head><title>x</title></head><p>hi</p>', { siteUrl: site })
assert.ok(frag.startsWith('<head><title>x</title></head><vizmaya-header>'))
assert.ok(/<p>hi<\/p><vizmaya-footer>[\s\S]*<\/script>$/.test(frag))
const bare = brandHtmlStory('<p>hi</p>', { siteUrl: site })
assert.ok(bare.startsWith('<vizmaya-header>'))

console.log('branding: ok')
