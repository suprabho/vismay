/** Checks for siteFetch: same-origin redirects keep the token, cross-host ones never carry it.
 *  (run: pnpm --filter @vismay/mcp test) */
import assert from 'node:assert/strict'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import { siteFetch } from './siteFetch'

type Seen = { method: string; url: string; auth: string | null; body: string }
const seen: Seen[] = []

// The "site": records what arrives. Reached as http://127.0.0.1:<port>.
const site = http.createServer((req, res) => {
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    seen.push({ method: req.method!, url: req.url!, auth: req.headers.authorization ?? null, body })
    if (req.url === '/same-308') return res.writeHead(308, { location: '/final' }).end()
    if (req.url === '/same-302') return res.writeHead(302, { location: '/final' }).end()
    if (req.url === '/loop') return res.writeHead(307, { location: '/loop' }).end()
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
  })
})
await new Promise<void>((r) => site.listen(0, '127.0.0.1', r))
const sitePort = (site.address() as AddressInfo).port
const SITE = `http://127.0.0.1:${sitePort}`

// The "apex": a different host (localhost ≠ 127.0.0.1 as an origin) that redirects everything to the site.
const apex = http.createServer((req, res) => res.writeHead(308, { location: `${SITE}${req.url}` }).end())
await new Promise<void>((r) => apex.listen(0, '127.0.0.1', r))
const APEX = `http://localhost:${(apex.address() as AddressInfo).port}`

const auth = { authorization: 'Bearer publish-token' }

// A token never follows a redirect to another host: a clear error instead.
{
  seen.length = 0
  await assert.rejects(
    siteFetch(`${APEX}/api/randomizer/spins`, { method: 'POST', headers: auth, body: '{}' }, 'HTML_STORIES_URL'),
    (e: Error) => e.message.includes(`redirects to ${SITE}`) && e.message.includes('set HTML_STORIES_URL to'),
  )
  assert.equal(seen.length, 0, 'nothing reached the other host')
}

// Without a token, a cross-host redirect is followed (the public brief).
{
  seen.length = 0
  const res = await siteFetch(`${APEX}/api/html-stories/brief`)
  assert.equal(res.status, 200)
  assert.deepEqual(seen.map((s) => [s.url, s.auth]), [['/api/html-stories/brief', null]])
}

// On the same origin, a 308 is followed with the token, method and body intact.
{
  seen.length = 0
  const res = await siteFetch(`${SITE}/same-308`, { method: 'POST', headers: auth, body: '{"a":1}' })
  assert.equal(res.status, 200)
  assert.deepEqual(seen.at(-1), { method: 'POST', url: '/final', auth: 'Bearer publish-token', body: '{"a":1}' })
}

// A 302 turns a POST into a GET without the body, as browsers do.
{
  seen.length = 0
  await siteFetch(`${SITE}/same-302`, { method: 'POST', headers: auth, body: '{"a":1}' })
  assert.equal(seen.at(-1)!.method, 'GET')
  assert.equal(seen.at(-1)!.body, '')
}

// A redirect loop ends.
await assert.rejects(siteFetch(`${SITE}/loop`), /too many redirects/)

site.close()
apex.close()
console.log('siteFetch checks passed')
