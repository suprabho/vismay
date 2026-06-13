/**
 * One-command dev launcher for the Vismay MCP server.
 *
 *   pnpm mcp:dev            # catalog (:3100) + MCP Inspector, wired together
 *   WITH_VIZMAYA=1 pnpm mcp:dev   # also start vizmaya-fyi (:3000) for the video tool
 *
 * The MCP server itself speaks stdio (an agent client spawns it in real use), so
 * the dev surface here is the MCP Inspector, which spawns the server and gives a
 * UI to call every tool. The catalog must be running for the embed_url /
 * render_module_image tools, so we start it on a dedicated port (3100) to avoid
 * colliding with vizmaya-fyi's default 3000.
 *
 * Children run in their own process groups so we can tear down the whole tree
 * (Next dev spawns workers) on Ctrl-C or when any child exits.
 */

import { spawn, type ChildProcess } from 'node:child_process'

interface Service {
  name: string
  args: string[]
  env: NodeJS.ProcessEnv
}

const catalogBaseUrl = process.env.CATALOG_BASE_URL ?? 'http://localhost:3100'

const services: Service[] = [
  {
    name: 'catalog',
    args: ['--filter', '@vismay/catalog', 'dev'],
    env: { ...process.env, PORT: '3100' },
  },
  {
    name: 'mcp',
    args: ['--filter', '@vismay/mcp', 'inspect'],
    env: { ...process.env, CATALOG_BASE_URL: catalogBaseUrl },
  },
]

if (process.env.WITH_VIZMAYA === '1') {
  services.push({ name: 'vizmaya', args: ['--filter', 'vizmaya-fyi', 'dev'], env: { ...process.env } })
}

const children: ChildProcess[] = []
let shuttingDown = false

function pipePrefixed(name: string, stream: NodeJS.ReadableStream | null, out: NodeJS.WriteStream) {
  if (!stream) return
  let buf = ''
  stream.on('data', (chunk: Buffer) => {
    buf += chunk.toString()
    const lines = buf.split('\n')
    buf = lines.pop() ?? ''
    for (const line of lines) out.write(`[${name}] ${line}\n`)
  })
  stream.on('end', () => {
    if (buf) out.write(`[${name}] ${buf}\n`)
  })
}

function killTree(child: ChildProcess, signal: NodeJS.Signals): void {
  if (child.pid === undefined) return
  try {
    // Negative pid → signal the whole process group (detached spawn).
    process.kill(-child.pid, signal)
  } catch {
    try {
      child.kill(signal)
    } catch {
      /* already gone */
    }
  }
}

function shutdown(code: number): void {
  if (shuttingDown) return
  shuttingDown = true
  for (const c of children) killTree(c, 'SIGTERM')
  setTimeout(() => {
    for (const c of children) killTree(c, 'SIGKILL')
    process.exit(code)
  }, 800).unref()
}

for (const svc of services) {
  const child = spawn('pnpm', svc.args, {
    env: svc.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })
  children.push(child)
  pipePrefixed(svc.name, child.stdout, process.stdout)
  pipePrefixed(svc.name, child.stderr, process.stderr)
  child.on('exit', (code, signal) => {
    if (!shuttingDown) {
      console.error(`[mcp-dev] ${svc.name} exited (code=${code} signal=${signal}); stopping the rest.`)
      shutdown(code ?? 1)
    }
  })
  child.on('error', (err) => {
    console.error(`[mcp-dev] failed to start ${svc.name}: ${err.message}`)
    shutdown(1)
  })
}

process.on('SIGINT', () => {
  console.error('\n[mcp-dev] SIGINT — stopping all services.')
  shutdown(0)
})
process.on('SIGTERM', () => shutdown(0))

console.error(
  `[mcp-dev] starting: ${services.map((s) => s.name).join(', ')} ` +
    `(catalog on ${catalogBaseUrl}; Ctrl-C to stop)`,
)
