/** Checks for the story assets endpoint: sniffing, address guard, names, and request validation.
 *  (run: npx tsx src/assetsApi.test.ts) — nothing here reaches storage or the network. */
import assert from 'node:assert/strict'
import { fileStem, handleHtmlStoryAssetList, handleHtmlStoryAssetPost, isPrivateAddress, sniffMediaType } from './assetsApi'

const bytes = (...parts: (number[] | string)[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)).concat(Array(16).fill(0)))

// Types come from the bytes.
assert.equal(sniffMediaType(bytes([0x89], 'PNG\r\n')), 'image/png')
assert.equal(sniffMediaType(bytes([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg')
assert.equal(sniffMediaType(bytes('GIF89a')), 'image/gif')
assert.equal(sniffMediaType(bytes('RIFF', [1, 2, 3, 4], 'WEBPVP8 ')), 'image/webp')
assert.equal(sniffMediaType(bytes([0, 0, 0, 0x1c], 'ftypavif')), 'image/avif')
assert.equal(sniffMediaType(bytes([0, 0, 0, 0x20], 'ftypisom')), 'video/mp4')
assert.equal(sniffMediaType(bytes([0, 0, 0, 0x18], 'ftypheic')), null)
assert.equal(sniffMediaType(bytes('<svg xmlns="http://www.w3.org/2000/svg">')), null)
assert.equal(sniffMediaType(bytes('<!doctype html><html>')), null)
assert.equal(sniffMediaType(new Uint8Array([0x89, 0x50])), null)

// Only public addresses are fetched.
for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', 'not-an-ip']) {
  assert.ok(isPrivateAddress(ip), ip)
}
for (const ip of ['208.80.154.240', '172.32.0.1', '2620:0:861:ed1a::1', '::ffff:8.8.8.8']) assert.ok(!isPrivateAddress(ip), ip)

// File stems: from a caller's name or the source URL's last segment.
assert.equal(fileStem('https://upload.wikimedia.org/wikipedia/commons/a/ab/Bhadla_Solar_Park%2C_2020.jpg?x=1'), 'bhadla-solar-park-2020')
assert.equal(fileStem('Café Économie.PNG'), 'cafe-economie')
assert.equal(fileStem('../../etc/passwd'), 'passwd')
assert.equal(fileStem(undefined), '')
assert.equal(fileStem('%E0%A4%A'), 'e0-a4-a')
assert.ok(fileStem('x'.repeat(200)).length <= 60)

// Requests: the token, the slug, and what the body may be.
async function requests() {
  const site = 'https://vizmaya.fyi/api/html-stories/assets'
  const auth = { authorization: 'Bearer test-token' }
  const post = (query: string, init: RequestInit = {}) =>
    handleHtmlStoryAssetPost(new Request(`${site}${query}`, { method: 'POST', ...init }), 'vizmaya-fyi')
  const status = async (p: Promise<Response>) => (await p).status
  const error = async (p: Promise<Response>) => ((await (await p).json()) as { error: string }).error

  delete process.env.HTML_STORIES_TOKEN
  assert.equal(await status(post('?slug=a')), 503)
  process.env.HTML_STORIES_TOKEN = 'test-token'
  assert.equal(await status(post('?slug=a', { headers: { authorization: 'Bearer nope' } })), 401)
  assert.equal(await status(handleHtmlStoryAssetList(new Request(`${site}?slug=a`), 'vizmaya-fyi')), 401)
  assert.equal(await status(handleHtmlStoryAssetList(new Request(`${site}?slug=Bad Slug`, { headers: auth }), 'vizmaya-fyi')), 400)
  assert.equal(await status(post('', { headers: auth })), 400)
  assert.equal(await status(post('?slug=a', { headers: { ...auth, 'content-type': 'text/html' }, body: '<html>' })), 415)
  const json = (body: unknown) => ({ headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify(body) })
  assert.match(await error(post('?slug=a', json({}))), /fromUrl/)
  assert.match(await error(post('?slug=a', json({ fromUrl: 'http://example.com/a.jpg' }))), /https/)
  assert.match(await error(post('?slug=a', json({ fromUrl: 'https://localhost/a.jpg' }))), /refusing/)
  assert.match(await error(post('?slug=a', json({ fromUrl: 'https://169.254.169.254/latest' }))), /not a public address/)
  assert.match(await error(post('?slug=a', json({ fromUrl: 'https://[::1]/a.jpg' }))), /not a public address/)
  assert.match(await error(post('?slug=a', json({ generate: { prompt: '  ' } }))), /prompt/)
  // Bytes that aren't a supported image are refused before anything is stored.
  assert.equal(await status(post('?slug=a', { headers: { ...auth, 'content-type': 'image/svg+xml' }, body: '<svg xmlns="http://www.w3.org/2000/svg"/>' })), 415)
}

requests().then(
  () => console.log('assetsApi: ok'),
  (e) => {
    console.error(e)
    process.exit(1)
  },
)
