/** Checks for the hosted MCP endpoint: which tools each caller gets, where tokens go, no local files.
 *  (run: pnpm --filter @vismay/mcp test) */
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { handleHostedMcpRequest } from './hosted'
import { createServer } from './server'

// The site's own token sits in the server env on the deployment: the hosted
// server must never use it on a caller's behalf.
process.env.HTML_STORIES_TOKEN = 'server-env-token'
delete process.env.CATALOG_BASE_URL

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
async function rpc(method: string, params: unknown, headers: Record<string, string> = {}) {
  const res = await handleHostedMcpRequest(
    new Request('https://vizmaya.fyi/api/mcp', {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
    }),
  )
  assert.equal(res.status, 200, `${method} → HTTP ${res.status}`)
  assert.equal(res.headers.get('access-control-allow-origin'), '*')
  return (await res.json()) as { result?: any; error?: { message: string } }
}
const toolNames = async (headers?: Record<string, string>) =>
  ((await rpc('tools/list', {}, headers)).result.tools as Array<{ name: string }>).map((t) => t.name).sort()
const callTool = (name: string, args: Record<string, unknown>, headers?: Record<string, string>) =>
  rpc('tools/call', { name, arguments: args }, headers)
const bearer = (t: string) => ({ authorization: `Bearer ${t}` })

// Preflight and the methods a stateless server refuses.
{
  const pre = await handleHostedMcpRequest(new Request('https://vizmaya.fyi/api/mcp', { method: 'OPTIONS' }))
  assert.equal(pre.status, 204)
  const allowed = pre.headers.get('access-control-allow-headers') ?? ''
  for (const h of ['authorization', 'mcp-protocol-version', 'x-footshorts-token']) assert.ok(allowed.includes(h), h)
  for (const method of ['GET', 'DELETE']) {
    const res = await handleHostedMcpRequest(new Request('https://vizmaya.fyi/api/mcp', { method }))
    assert.equal(res.status, 405, method)
    assert.equal(res.headers.get('allow'), 'POST, OPTIONS')
  }
}

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
  assert.equal(sent[0]!.url, 'https://vizmaya.fyi/api/html-stories/brief')
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
  assert.equal(sent[0]!.url, 'https://vizmaya.fyi/api/html-stories')
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
      ['https://footshorts.com/api/html-stories', 'Bearer footshorts-token'],
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

globalThis.fetch = realFetch
console.log('hosted MCP checks passed')
