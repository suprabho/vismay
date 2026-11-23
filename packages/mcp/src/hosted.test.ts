/** Checks for the hosted MCP endpoints: which tools each caller gets, where tokens go, sign-in, no local files.
 *  (run: pnpm --filter @vismay/mcp test) */
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { handleHostedMcpRequest, handlePublicMcpRequest } from './hosted'
import { createServer } from './server'
import { signIn } from './testOAuth'

// The site's own token sits in the server env on the deployment: the hosted
// server must never use it on a caller's behalf.
// Collect the [mcp] log lines the run writes, to check them at the end (and keep the output quiet).
const logged: string[] = []
const realLog = console.log
const realWarn = console.warn
console.log = (...args: unknown[]) => (String(args[0]).startsWith('[mcp] ') ? logged.push(args.map(String).join(' ')) : realLog(...args)) && undefined
console.warn = (...args: unknown[]) => (String(args[0]).startsWith('[mcp] ') ? logged.push(args.map(String).join(' ')) : realWarn(...args)) && undefined
const events = () => logged.map((l) => JSON.parse(l.slice('[mcp] '.length)) as Record<string, any>)
const SECRET_SHAPES = [/mcp[ckar]_[A-Za-z0-9_-]{8,}/, /v1\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/]

process.env.HTML_STORIES_TOKEN = 'server-env-token'
process.env.ADMIN_SESSION_SECRET = 'hosted-test-secret'
delete process.env.CATALOG_BASE_URL
delete process.env.MCP_TOKEN_GENERATION

type Sent = { url: string; auth: string | null; body: string | null }
const sent: Sent[] = []
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  const headers = new Headers(init?.headers)
  sent.push({ url, auth: headers.get('authorization'), body: typeof init?.body === 'string' ? init.body : null })
  if (url.endsWith('/api/html-stories/brief') || url.includes('/api/html-stories/brief?')) return new Response('THE BRIEF')
  if (url.endsWith('/api/html-stories')) return Response.json({ url: 'https://vizmaya.fyi/s/x', warnings: [] })
  if (url.endsWith('/api/modules')) return Response.json({ modules: [{ type: 'bar', label: 'Bar', vertical: 'core', slots: ['foreground'] }] })
  return new Response('not stubbed', { status: 500 })
}) as typeof fetch

let nextId = 1
type Endpoint = 'public' | 'signin'
function post(method: string, params: unknown, headers: Record<string, string>, endpoint: Endpoint) {
  const handler = endpoint === 'public' ? handlePublicMcpRequest : handleHostedMcpRequest
  return handler(
    new Request(`https://vizmaya.fyi/api/mcp${endpoint === 'public' ? '/public' : ''}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    }),
  )
}
async function rpc(method: string, params: unknown, headers: Record<string, string> = {}, endpoint: Endpoint = 'public') {
  const res = await post(method, params, headers, endpoint)
  assert.equal(res.status, 200, `${method} → HTTP ${res.status}`)
  assert.equal(res.headers.get('access-control-allow-origin'), '*')
  return (await res.json()) as { result?: any; error?: { message: string } }
}
const toolNames = async (headers?: Record<string, string>, endpoint: Endpoint = 'public') =>
  ((await rpc('tools/list', {}, headers, endpoint)).result.tools as Array<{ name: string }>).map((t) => t.name).sort()
const callTool = (name: string, args: Record<string, unknown>, headers?: Record<string, string>, endpoint: Endpoint = 'public') =>
  rpc('tools/call', { name, arguments: args }, headers, endpoint)
const bearer = (t: string) => ({ authorization: `Bearer ${t}` })

// Preflight and the methods a stateless server refuses, on both endpoints.
for (const handler of [handleHostedMcpRequest, handlePublicMcpRequest]) {
  const pre = await handler(new Request('https://vizmaya.fyi/api/mcp', { method: 'OPTIONS' }))
  assert.equal(pre.status, 204)
  const allowed = pre.headers.get('access-control-allow-headers') ?? ''
  for (const h of ['authorization', 'mcp-protocol-version', 'x-footshorts-token']) assert.ok(allowed.includes(h), h)
  for (const method of ['GET', 'DELETE']) {
    const res = await handler(new Request('https://vizmaya.fyi/api/mcp', { method }))
    assert.equal(res.status, 405, method)
    assert.equal(res.headers.get('allow'), 'POST, OPTIONS')
  }
}

// The public endpoint (/api/mcp/public) is #667's behaviour: anonymous gets the open tools.
// Anonymous: initialize works and says how to get the rest.
{
  const init = await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'test', version: '0' },
  })
  assert.equal(init.result.serverInfo.name, 'vismay')
  assert.match(init.result.instructions, /Authorization: Bearer/)
}

// Anonymous, no catalog configured: only the brief.
assert.deepEqual(await toolNames(), ['get_html_story_brief'])

// The plain brief is fetched without any token, the server env's included.
{
  sent.length = 0
  const r = await callTool('get_html_story_brief', {})
  assert.equal(r.result.content[0].text, 'THE BRIEF')
  assert.equal(sent.length, 1)
  assert.equal(sent[0]!.url, 'https://www.vizmaya.fyi/api/html-stories/brief')
  assert.equal(sent[0]!.auth, null, 'anonymous brief carries no token')
}

// A context brief needs the caller's token, and says which header.
{
  const r = await callTool('get_html_story_brief', { app: 'footshorts', fixtureIds: ['abc'] })
  assert.equal(r.result.isError, true)
  assert.match(r.result.content[0].text, /x-footshorts-token/)
}

// Anonymous callers can't reach the gated tools at all.
{
  const r = await callTool('publish_html_story', { html: '<html></html>' })
  assert.ok(r.error || r.result?.isError, 'publish without a token fails')
}

// With the catalog configured, its tools join the open set.
{
  process.env.CATALOG_BASE_URL = 'https://catalog.example.test'
  assert.deepEqual(await toolNames(), ['embed_url', 'get_html_story_brief', 'list_modules', 'list_verticals'])
  const tools = (await rpc('tools/list', {})).result.tools as Array<{ name: string; description: string }>
  for (const t of tools) assert.ok(!t.description.includes('render_module_image'), `${t.name} points at a local tool`)
  delete process.env.CATALOG_BASE_URL
}

// With a token: the publishing, media and randomizer tools; never the local-only ones, never filePath.
{
  const names = await toolNames(bearer('caller-token'))
  for (const n of ['publish_html_story', 'save_story_image', 'generate_story_image', 'spin_randomizer', 'save_spin_research', 'get_randomizer_spin', 'get_ocw_pool']) {
    assert.ok(names.includes(n), `${n} offered with a token`)
  }
  for (const n of ['render_module_image', 'render_story_video', 'list_heygen_templates', 'generate_heygen_video']) {
    assert.ok(!names.includes(n), `${n} is local only`)
  }
  const tools = (await rpc('tools/list', {}, bearer('caller-token'))).result.tools as Array<{
    name: string
    description: string
    inputSchema: { properties?: Record<string, unknown> }
  }>
  for (const t of tools) {
    assert.ok(!('filePath' in (t.inputSchema.properties ?? {})), `${t.name} has no filePath`)
    assert.ok(!t.description.includes('filePath'), `${t.name} doesn't mention filePath`)
  }
}

// Publishing forwards the caller's token, not the server's, to the site.
{
  sent.length = 0
  const r = await callTool('publish_html_story', { html: '<html><title>x</title></html>', slug: 'x' }, bearer('caller-token'))
  assert.ok(!r.result.isError, r.result.content?.[0]?.text)
  assert.equal(sent.length, 1)
  assert.equal(sent[0]!.url, 'https://www.vizmaya.fyi/api/html-stories')
  assert.equal(sent[0]!.auth, 'Bearer caller-token')
}

// A filePath sent anyway is dropped by the schema, so nothing is read from disk.
{
  sent.length = 0
  const r = await callTool('publish_html_story', { filePath: '/etc/passwd' }, bearer('caller-token'))
  assert.ok(r.error || r.result?.isError, 'filePath alone is refused')
  assert.equal(sent.length, 0, 'nothing posted')
}

// Each site takes its own header, falling back to the bearer.
{
  sent.length = 0
  await callTool('publish_html_story', { app: 'footshorts', html: '<html></html>', slug: 'y' }, {
    ...bearer('caller-token'),
    'x-footshorts-token': 'footshorts-token',
  })
  await callTool('publish_html_story', { app: 'vizf1', html: '<html></html>', slug: 'z' }, bearer('caller-token'))
  assert.deepEqual(
    sent.map((s) => [s.url, s.auth]),
    [
      ['https://www.footshorts.com/api/html-stories', 'Bearer footshorts-token'],
      ['https://www.vizf1.com/api/html-stories', 'Bearer caller-token'],
    ],
  )
}

// A site header alone unlocks the tools but not another site's.
{
  const r = await callTool('publish_html_story', { html: '<html></html>' }, { 'x-viznba-token': 'nba-only' })
  assert.equal(r.result.isError, true)
  assert.match(r.result.content[0].text, /Authorization: Bearer/)
}

// The sign-in endpoint (/api/mcp): no credentials → the 401 that starts an MCP client's sign-in.
{
  const res = await post('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } }, {}, 'signin')
  assert.equal(res.status, 401)
  const challenge = res.headers.get('www-authenticate') ?? ''
  assert.match(challenge, /^Bearer /)
  assert.match(challenge, /resource_metadata="https:\/\/vizmaya\.fyi\/\.well-known\/oauth-protected-resource\/api\/mcp"/)
  assert.ok(!challenge.includes('invalid_token'), 'a first visit is not an error')
  assert.match(res.headers.get('access-control-expose-headers') ?? '', /www-authenticate/)
  const body = (await res.json()) as { error: { message: string } }
  assert.match(body.error.message, /\/api\/mcp\/public/, 'points at the open endpoint')
}

// A caller's own publish token still works on /api/mcp, exactly as on /public.
{
  sent.length = 0
  assert.ok((await toolNames(bearer('caller-token'), 'signin')).includes('publish_html_story'))
  await callTool('publish_html_story', { html: '<html></html>', slug: 'x' }, bearer('caller-token'), 'signin')
  assert.equal(sent[0]!.auth, 'Bearer caller-token')
}

// Signed in: every hosted tool, acting with the deployment's own tokens.
{
  const { access } = await signIn()
  const names = await toolNames(bearer(access), 'signin')
  for (const n of ['get_html_story_brief', 'publish_html_story', 'save_story_image', 'spin_randomizer', 'get_ocw_pool']) assert.ok(names.includes(n), n)
  for (const n of ['render_module_image', 'render_story_video', 'generate_heygen_video']) assert.ok(!names.includes(n), `${n} is local only`)
  const init = await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '0' } }, bearer(access), 'signin')
  assert.match(init.result.instructions, /signed in/)

  sent.length = 0
  const r = await callTool('publish_html_story', { html: '<html><title>x</title></html>', slug: 'x' }, bearer(access), 'signin')
  assert.ok(!r.result.isError, r.result.content?.[0]?.text)
  assert.equal(sent[0]!.auth, 'Bearer server-env-token', "a signed-in call uses the deployment's token")
  assert.ok(!sent.some((s) => s.auth?.includes('mcpa_')), 'the access token never leaves the endpoint')

  // Other sites fall back to HTML_STORIES_TOKEN unless their own env var is set, as locally.
  process.env.FOOTSHORTS_HTML_STORIES_TOKEN = 'footshorts-env-token'
  sent.length = 0
  await callTool('publish_html_story', { app: 'footshorts', html: '<html></html>', slug: 'y' }, bearer(access), 'signin')
  await callTool('publish_html_story', { app: 'vizf1', html: '<html></html>', slug: 'z' }, bearer(access), 'signin')
  assert.deepEqual(sent.map((s) => s.auth), ['Bearer footshorts-env-token', 'Bearer server-env-token'])
  delete process.env.FOOTSHORTS_HTML_STORIES_TOKEN

  // filePath stays out for a signed-in caller too.
  const tools = (await rpc('tools/list', {}, bearer(access), 'signin')).result.tools as Array<{ inputSchema: { properties?: object } }>
  assert.ok(tools.every((t) => !('filePath' in (t.inputSchema.properties ?? {}))))
}

// A forged, expired or revoked access token gets 401 invalid_token, so the client refreshes or signs in again.
{
  const { access } = await signIn()
  const forged = `${access.slice(0, -4)}AAAA`
  for (const bad of [forged]) {
    const res = await post('tools/list', {}, bearer(bad), 'signin')
    assert.equal(res.status, 401)
    assert.match(res.headers.get('www-authenticate') ?? '', /error="invalid_token"/)
  }
  process.env.MCP_TOKEN_GENERATION = '2'
  const revoked = await post('tools/list', {}, bearer(access), 'signin')
  assert.equal(revoked.status, 401, 'MCP_TOKEN_GENERATION signs it out')
  delete process.env.MCP_TOKEN_GENERATION
}

// On /public an access token is ignored: anonymous tools, and it is never forwarded.
{
  const { access } = await signIn()
  assert.deepEqual(await toolNames(bearer(access)), ['get_html_story_brief'])
  sent.length = 0
  await callTool('get_html_story_brief', {}, bearer(access))
  assert.equal(sent[0]!.auth, null)
}

// The local stdio server is unchanged: every tool, filePath included.
{
  const [a, b] = InMemoryTransport.createLinkedPair()
  const server = createServer()
  await server.connect(a)
  const client = new Client({ name: 'test', version: '0' })
  await client.connect(b)
  const { tools } = await client.listTools()
  const byName = new Map(tools.map((t) => [t.name, t]))
  for (const n of ['render_module_image', 'render_story_video', 'generate_heygen_video', 'publish_html_story']) assert.ok(byName.has(n), n)
  assert.ok('filePath' in (byName.get('publish_html_story')!.inputSchema.properties ?? {}))
  assert.ok('filePath' in (byName.get('save_spin_research')!.inputSchema.properties ?? {}))
  await client.close()
  await server.close()
}

// A site URL that redirects to another host (the old apex default) fails clearly instead of as "unauthorized",
// and the token is never sent to the redirect target.
{
  const { access } = await signIn()
  process.env.HTML_STORIES_URL = 'https://vizmaya.fyi'
  const stubbed = globalThis.fetch
  const hits: Array<{ url: string; auth: string | null }> = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    hits.push({ url, auth: new Headers(init?.headers).get('authorization') })
    if (url.startsWith('https://vizmaya.fyi/')) {
      return new Response(null, { status: 308, headers: { location: url.replace('https://vizmaya.fyi/', 'https://www.vizmaya.fyi/') } })
    }
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }) as typeof fetch
  const r = await callTool('spin_randomizer', { randomizer: 'atlas' }, bearer(access), 'signin')
  globalThis.fetch = stubbed
  delete process.env.HTML_STORIES_URL
  const text = JSON.stringify(r)
  assert.match(text, /redirects to https:\/\/www\.vizmaya\.fyi/, 'the error names the redirect')
  assert.match(text, /set HTML_STORIES_URL to https:\/\/www\.vizmaya\.fyi/)
  assert.deepEqual(hits.map((h) => h.url), ['https://vizmaya.fyi/api/randomizer/spins'], 'nothing was sent to the www host')
}

// The request log: where a call came from, what it asked for, who was calling, and why a refusal happened.
{
  const res = await handleHostedMcpRequest(
    new Request('https://vizmaya.fyi/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'x-forwarded-for': '160.79.105.20, 10.0.0.1' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'Anthropic', version: '1.0.0' } } }),
    }),
  )
  assert.equal(res.status, 401)
  const last = events().at(-1)!
  assert.equal(last.from, 'anthropic', '160.79.104.0/21 is flagged as Anthropic')
  assert.equal(last.reason, 'no_credentials')
  assert.equal(last.clientInfo, 'Anthropic/1.0.0')
  assert.deepEqual(last.rpc, ['initialize'])

  const { access } = await signIn()
  const bad = await handleHostedMcpRequest(
    new Request('https://vizmaya.fyi/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', authorization: `Bearer ${access}`, 'x-forwarded-for': '1.2.3.4' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    }),
  )
  assert.equal(bad.status, 406, 'Accept without text/event-stream is refused by the transport')
  const rejected = events().at(-1)!
  assert.equal(rejected.from, 'other')
  assert.equal(rejected.reason, 'transport_rejected')
  assert.equal(rejected.caller, 'signed-in')
  assert.match(rejected.error, /Not Acceptable/)

  const seen = events()
  const reasons = new Set(seen.filter((e) => e.outcome === 'refused').map((e) => e.reason))
  for (const r of ['no_credentials', 'token_forged_or_malformed', 'token_revoked', 'method_not_allowed']) assert.ok(reasons.has(r), `logged ${r}`)
  assert.ok(
    seen.some((e) => e.outcome === 'ok' && e.caller === 'signed-in' && e.tool === 'publish_html_story' && typeof e.ms === 'number'),
    'a signed-in tool call is logged with the tool name',
  )
  for (const line of logged) {
    for (const shape of SECRET_SHAPES) assert.ok(!shape.test(line), `no token in: ${line.slice(0, 120)}`)
    for (const secret of ['server-env-token', 'caller-token', 'footshorts-token', 'footshorts-env-token', 'nba-only', 'hosted-test-secret', '<html']) {
      assert.ok(!line.includes(secret), `no "${secret}" in: ${line.slice(0, 120)}`)
    }
  }
}

console.log = realLog
console.warn = realWarn
globalThis.fetch = realFetch
console.log('hosted MCP checks passed')
